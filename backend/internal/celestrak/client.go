package celestrak

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/tle"
)

const baseURL = "https://celestrak.org/NORAD/elements/gp.php"

// DefaultGroups — curated set of satellite groups giving a diverse, interesting view.
// Intentionally excludes "active" (~15k sats) and full "starlink" (~10k) to keep rendering fast.
var DefaultGroups = []string{
	"stations",     // Space stations (ISS, CSS, etc.)
	"visual",       // Brightest satellites
	"weather",      // Weather satellites
	"gps-ops",      // GPS operational
	"resource",     // Earth resources
	"science",      // Science satellites
	"geodetic",     // Geodetic
	"amateur",      // Amateur radio
	"globalstar",   // Globalstar
	"iridium",      // Iridium
	"iridium-NEXT", // Iridium NEXT
	"oneweb",       // OneWeb
	"orbcomm",      // Orbcomm
	"sarsat",       // SARSAT
	"geo",          // Geostationary
	"military",     // Military
	"noaa",         // NOAA
	"goes",         // GOES
	"planet",       // Planet Labs
	"spire",        // Spire
	"last-30-days", // Recently launched
}

// Client fetches bulk TLE data from CelesTrak (no API key, no rate limits).
type Client struct {
	httpClient   *http.Client
	cacheMu      sync.RWMutex
	launchCache  map[string]map[int]models.CatalogMetadata
	metadataByID map[int]models.CatalogMetadata
}

// NewClient creates a new CelesTrak client.
func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		launchCache:  make(map[string]map[int]models.CatalogMetadata),
		metadataByID: make(map[int]models.CatalogMetadata),
	}
}

// FetchGroup downloads TLE data for a single CelesTrak group.
func (c *Client) FetchGroup(group string) ([]models.TLEData, error) {
	url := fmt.Sprintf("%s?GROUP=%s&FORMAT=tle", baseURL, group)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("celestrak request for %s: %w", group, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading celestrak response for %s: %w", group, err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("celestrak returned %d for group %s: %s", resp.StatusCode, group, string(body))
	}

	content := string(body)
	if strings.TrimSpace(content) == "No GP data found" {
		return nil, fmt.Errorf("celestrak: no data for group %s", group)
	}

	return tle.ParseTLEString(content)
}

// FetchGroups downloads TLE data for multiple groups and deduplicates by NORAD ID.
func (c *Client) FetchGroups(groups []string) ([]models.TLEData, error) {
	seen := make(map[string]bool) // NORAD ID string from line1[2:7]
	var all []models.TLEData

	for _, group := range groups {
		data, err := c.FetchGroup(group)
		if err != nil {
			log.Warn().Err(err).Str("group", group).Msg("CelesTrak group fetch failed, skipping")
			continue
		}

		added := 0
		for _, td := range data {
			if len(td.Line1) < 7 {
				continue
			}
			key := strings.TrimSpace(td.Line1[2:7])
			if !seen[key] {
				seen[key] = true
				all = append(all, td)
				added++
			}
		}

		log.Info().Str("group", group).Int("satellites", len(data)).Int("new", added).Msg("CelesTrak group loaded")
	}

	if len(all) == 0 {
		return nil, fmt.Errorf("no satellites fetched from CelesTrak")
	}

	log.Info().Int("total_unique", len(all)).Msg("CelesTrak TLE data fetched")
	return all, nil
}
