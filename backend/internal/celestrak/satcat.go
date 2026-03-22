package celestrak

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"

	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/tle"
)

const satcatBaseURL = "https://celestrak.org/satcat/records.php"

const satcatMaxConcurrent = 8

type satcatRecord struct {
	ObjectID   string `json:"OBJECT_ID"`
	NoradCatID int    `json:"NORAD_CAT_ID"`
	ObjectType string `json:"OBJECT_TYPE"`
	Owner      string `json:"OWNER"`
	LaunchDate string `json:"LAUNCH_DATE"`
}

var ownerDisplayNames = map[string]string{
	"AB":   "Arabsat",
	"ABS":  "ABS",
	"AC":   "AsiaSat",
	"ARGN": "Argentina",
	"AUS":  "Australia",
	"BRAZ": "Brazil",
	"CA":   "Canada",
	"CHBZ": "China/Brazil",
	"CHTU": "China/Turkiye",
	"CIS":  "Russia/CIS",
	"EUTE": "EUTELSAT",
	"EUME": "EUMETSAT",
	"ESA":  "ESA",
	"FR":   "France",
	"GER":  "Germany",
	"GLOB": "Globalstar",
	"IM":   "Inmarsat",
	"IND":  "India",
	"INDO": "Indonesia",
	"IRAN": "Iran",
	"IRID": "Iridium",
	"ISRA": "Israel",
	"ISRO": "India",
	"ISS":  "International",
	"IT":   "Italy",
	"ITSO": "Intelsat",
	"JPN":  "Japan",
	"KAZ":  "Kazakhstan",
	"LUXE": "Luxembourg",
	"MALA": "Malaysia",
	"NATO": "NATO",
	"NETH": "Netherlands",
	"NICO": "ICO",
	"NOR":  "Norway",
	"NZ":   "New Zealand",
	"O3B":  "O3b",
	"ORB":  "ORBCOMM",
	"PAKI": "Pakistan",
	"PRC":  "China",
	"PRES": "China/ESA",
	"ROC":  "Taiwan",
	"SAFR": "South Africa",
	"SAUD": "Saudi Arabia",
	"SES":  "SES",
	"SGJP": "Singapore/Japan",
	"SING": "Singapore",
	"SKOR": "South Korea",
	"SPN":  "Spain",
	"SWED": "Sweden",
	"SWTZ": "Switzerland",
	"TBD":  "To Be Determined",
	"TMMC": "Turkmenistan/Monaco",
	"TURK": "Turkiye",
	"UAE":  "UAE",
	"UK":   "United Kingdom",
	"UKR":  "Ukraine",
	"UNK":  "Unknown",
	"US":   "USA",
	"USBZ": "USA/Brazil",
}

func cloneMetadataMap(value map[int]models.CatalogMetadata) map[int]models.CatalogMetadata {
	if len(value) == 0 {
		return nil
	}

	cloned := make(map[int]models.CatalogMetadata, len(value))
	for key, metadata := range value {
		cloned[key] = metadata
	}
	return cloned
}

func normalizeIntlLaunchID(intlDesignator string) string {
	raw := strings.ToUpper(strings.TrimSpace(intlDesignator))
	if len(raw) < 5 {
		return ""
	}

	yearValue, err := strconv.Atoi(raw[:2])
	if err != nil {
		return ""
	}

	launchValue, err := strconv.Atoi(raw[2:5])
	if err != nil {
		return ""
	}

	year := 2000 + yearValue
	if yearValue >= 57 {
		year = 1900 + yearValue
	}

	return fmt.Sprintf("%04d-%03d", year, launchValue)
}

func ownerDisplayName(code string) string {
	normalized := strings.ToUpper(strings.TrimSpace(code))
	if normalized == "" {
		return ""
	}

	if value, ok := ownerDisplayNames[normalized]; ok {
		return value
	}

	return normalized
}

func mapRecordToMetadata(record satcatRecord) models.CatalogMetadata {
	ownerCode := strings.ToUpper(strings.TrimSpace(record.Owner))
	return models.CatalogMetadata{
		NoradID:    record.NoradCatID,
		ObjectType: strings.TrimSpace(record.ObjectType),
		OwnerCode:  ownerCode,
		OwnerName:  ownerDisplayName(ownerCode),
		LaunchDate: strings.TrimSpace(record.LaunchDate),
	}
}

func (c *Client) getCachedLaunchMetadata(launchID string) (map[int]models.CatalogMetadata, bool) {
	c.cacheMu.RLock()
	defer c.cacheMu.RUnlock()

	metadata, ok := c.launchCache[launchID]
	if !ok {
		return nil, false
	}

	return cloneMetadataMap(metadata), true
}

func (c *Client) getCachedMetadata(noradID int) (models.CatalogMetadata, bool) {
	c.cacheMu.RLock()
	defer c.cacheMu.RUnlock()

	metadata, ok := c.metadataByID[noradID]
	return metadata, ok
}

func (c *Client) storeLaunchMetadata(launchID string, metadata map[int]models.CatalogMetadata) {
	if len(metadata) == 0 {
		return
	}

	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()

	c.launchCache[launchID] = cloneMetadataMap(metadata)
	for noradID, value := range metadata {
		c.metadataByID[noradID] = value
	}
}

func (c *Client) storeMetadata(metadata models.CatalogMetadata) {
	if metadata.NoradID == 0 {
		return
	}

	c.cacheMu.Lock()
	defer c.cacheMu.Unlock()

	c.metadataByID[metadata.NoradID] = metadata
}

func (c *Client) fetchSatcatRecords(queryKey, queryValue string) ([]satcatRecord, error) {
	requestURL := fmt.Sprintf(
		"%s?%s=%s&FORMAT=JSON",
		satcatBaseURL,
		url.QueryEscape(queryKey),
		url.QueryEscape(queryValue),
	)

	resp, err := c.httpClient.Get(requestURL)
	if err != nil {
		return nil, fmt.Errorf("celestrak SATCAT request for %s=%s: %w", queryKey, queryValue, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading celestrak SATCAT response for %s=%s: %w", queryKey, queryValue, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("celestrak SATCAT returned %d for %s=%s: %s", resp.StatusCode, queryKey, queryValue, string(body))
	}

	var records []satcatRecord
	if err := json.Unmarshal(body, &records); err != nil {
		return nil, fmt.Errorf("parsing celestrak SATCAT response for %s=%s: %w", queryKey, queryValue, err)
	}

	return records, nil
}

func (c *Client) fetchLaunchMetadata(launchID string) (map[int]models.CatalogMetadata, error) {
	records, err := c.fetchSatcatRecords("INTDES", launchID)
	if err != nil {
		return nil, err
	}

	metadata := make(map[int]models.CatalogMetadata, len(records))
	for _, record := range records {
		if record.NoradCatID == 0 {
			continue
		}
		metadata[record.NoradCatID] = mapRecordToMetadata(record)
	}

	return metadata, nil
}

func (c *Client) fetchCatalogMetadataByNorad(noradID int) (models.CatalogMetadata, error) {
	records, err := c.fetchSatcatRecords("CATNR", strconv.Itoa(noradID))
	if err != nil {
		return models.CatalogMetadata{}, err
	}

	for _, record := range records {
		if record.NoradCatID == noradID {
			return mapRecordToMetadata(record), nil
		}
	}

	return models.CatalogMetadata{}, fmt.Errorf("no SATCAT record found for NORAD %d", noradID)
}

// ResolveCatalogMetadata enriches TLE data with owner metadata resolved from CelesTrak SATCAT.
func (c *Client) ResolveCatalogMetadata(tleData []models.TLEData) (map[int]models.CatalogMetadata, error) {
	resolved := make(map[int]models.CatalogMetadata, len(tleData))
	launchesToFetch := make(map[string]struct{})

	for _, td := range tleData {
		noradID, err := tle.ExtractNoradID(td.Line1)
		if err != nil {
			continue
		}

		if metadata, ok := c.getCachedMetadata(noradID); ok {
			resolved[noradID] = metadata
			continue
		}

		launchID := normalizeIntlLaunchID(tle.ExtractIntlDesignator(td.Line1))
		if launchID == "" {
			continue
		}

		if cachedLaunch, ok := c.getCachedLaunchMetadata(launchID); ok {
			if metadata, ok := cachedLaunch[noradID]; ok {
				resolved[noradID] = metadata
			}
			continue
		}

		launchesToFetch[launchID] = struct{}{}
	}

	var (
		mu            sync.Mutex
		wg            sync.WaitGroup
		launchErrors  int
		catalogErrors int
	)

	sem := make(chan struct{}, satcatMaxConcurrent)

	launchIDs := make([]string, 0, len(launchesToFetch))
	for launchID := range launchesToFetch {
		launchIDs = append(launchIDs, launchID)
	}
	slices.Sort(launchIDs)

	for _, launchID := range launchIDs {
		wg.Add(1)
		go func(currentLaunchID string) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			metadata, err := c.fetchLaunchMetadata(currentLaunchID)
			if err != nil {
				mu.Lock()
				launchErrors++
				mu.Unlock()
				return
			}

			c.storeLaunchMetadata(currentLaunchID, metadata)

			mu.Lock()
			for noradID, value := range metadata {
				resolved[noradID] = value
			}
			mu.Unlock()
		}(launchID)
	}

	wg.Wait()

	noradsToFetch := make(map[int]struct{})
	for _, td := range tleData {
		noradID, err := tle.ExtractNoradID(td.Line1)
		if err != nil {
			continue
		}
		if _, ok := resolved[noradID]; ok {
			continue
		}
		noradsToFetch[noradID] = struct{}{}
	}

	noradIDs := make([]int, 0, len(noradsToFetch))
	for noradID := range noradsToFetch {
		noradIDs = append(noradIDs, noradID)
	}
	slices.Sort(noradIDs)

	for _, noradID := range noradIDs {
		wg.Add(1)
		go func(currentNoradID int) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			metadata, err := c.fetchCatalogMetadataByNorad(currentNoradID)
			if err != nil {
				mu.Lock()
				catalogErrors++
				mu.Unlock()
				return
			}

			c.storeMetadata(metadata)

			mu.Lock()
			resolved[currentNoradID] = metadata
			mu.Unlock()
		}(noradID)
	}

	wg.Wait()

	if launchErrors == 0 && catalogErrors == 0 {
		return resolved, nil
	}

	return resolved, fmt.Errorf(
		"SATCAT metadata partially unresolved: %d launch lookups failed, %d NORAD lookups failed",
		launchErrors,
		catalogErrors,
	)
}
