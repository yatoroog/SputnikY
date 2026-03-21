package n2yo

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
)

const baseURL = "https://api.n2yo.com/rest/v1/satellite"

// Client communicates with the N2YO REST API.
type Client struct {
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new N2YO API client.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// --- response types ---

type aboveResponse struct {
	Info struct {
		SatCount          int `json:"satcount"`
		TransactionsCount int `json:"transactionscount"`
	} `json:"info"`
	Above []AboveSatellite `json:"above"`
}

// AboveSatellite is a single satellite returned by the /above/ endpoint.
type AboveSatellite struct {
	SatID         int     `json:"satid"`
	SatName       string  `json:"satname"`
	IntDesignator string  `json:"intDesignator"`
	LaunchDate    string  `json:"launchDate"`
	SatLat        float64 `json:"satlat"`
	SatLng        float64 `json:"satlng"`
	SatAlt        float64 `json:"satalt"`
}

type tleResponse struct {
	Info struct {
		SatID             int    `json:"satid"`
		SatName           string `json:"satname"`
		TransactionsCount int    `json:"transactionscount"`
	} `json:"info"`
	TLE string `json:"tle"`
}

// --- API methods ---

// FetchAbove returns satellites visible above the given observer position.
func (c *Client) FetchAbove(lat, lng float64, radius, categoryID int) ([]AboveSatellite, error) {
	url := fmt.Sprintf("%s/above/%.4f/%.4f/0/%d/%d?apiKey=%s",
		baseURL, lat, lng, radius, categoryID, c.apiKey)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("n2yo /above request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading n2yo response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("n2yo /above returned %d: %s", resp.StatusCode, string(body))
	}

	var result aboveResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parsing n2yo /above: %w", err)
	}

	return result.Above, nil
}

// FetchTLE returns the TLE data for a single satellite by NORAD ID.
func (c *Client) FetchTLE(noradID int) (*models.TLEData, error) {
	url := fmt.Sprintf("%s/tle/%d?apiKey=%s", baseURL, noradID, c.apiKey)

	resp, err := c.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("n2yo /tle request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading n2yo tle response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("n2yo /tle returned %d: %s", resp.StatusCode, string(body))
	}

	var result tleResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parsing n2yo /tle: %w", err)
	}

	if result.TLE == "" {
		return nil, fmt.Errorf("empty TLE for NORAD %d", noradID)
	}

	// TLE comes as two lines separated by \r\n
	lines := strings.Split(result.TLE, "\r\n")
	if len(lines) < 2 {
		// try plain \n
		lines = strings.Split(result.TLE, "\n")
	}
	if len(lines) < 2 {
		return nil, fmt.Errorf("invalid TLE format for NORAD %d", noradID)
	}

	return &models.TLEData{
		Name:  strings.TrimSpace(result.Info.SatName),
		Line1: strings.TrimSpace(lines[0]),
		Line2: strings.TrimSpace(lines[1]),
	}, nil
}

// --- high-level orchestration ---

// observationPoint for global coverage.
type observationPoint struct {
	lat, lng float64
}

// Default observation points — 3 equidistant points give near-global coverage with radius 90.
var defaultObservationPoints = []observationPoint{
	{30, 0},    // Europe / Africa
	{30, 120},  // East Asia / Australia
	{-30, -60}, // Americas
}

// Default satellite categories to fetch.
// 0=ALL is too broad; these give a curated, interesting set.
var DefaultCategories = []int{
	1,  // Brightest
	2,  // ISS
	3,  // Weather
	15, // Iridium
	20, // GPS Operational
	52, // Starlink
}

// FetchGlobalTLEs discovers satellites from multiple vantage points,
// deduplicates by NORAD ID, fetches their TLEs, and returns them
// ready for LoadFromTLE.
func (c *Client) FetchGlobalTLEs(categories []int) ([]models.TLEData, error) {
	// Phase 1 — discovery via /above/
	seen := make(map[int]string) // noradID → name

	for _, cat := range categories {
		for _, pt := range defaultObservationPoints {
			sats, err := c.FetchAbove(pt.lat, pt.lng, 90, cat)
			if err != nil {
				log.Warn().Err(err).
					Float64("lat", pt.lat).Float64("lng", pt.lng).
					Int("category", cat).
					Msg("N2YO /above failed for point, skipping")
				continue
			}
			for _, s := range sats {
				if _, exists := seen[s.SatID]; !exists {
					seen[s.SatID] = s.SatName
				}
			}
			// brief pause to be kind to rate limits
			time.Sleep(500 * time.Millisecond)
		}
	}

	if len(seen) == 0 {
		return nil, fmt.Errorf("no satellites discovered from N2YO")
	}

	log.Info().Int("unique", len(seen)).Msg("Satellites discovered via N2YO /above")

	// Phase 2 — concurrent TLE fetch with bounded concurrency
	type tleResult struct {
		data models.TLEData
		err  error
	}

	const maxConcurrent = 10
	sem := make(chan struct{}, maxConcurrent)
	results := make(chan tleResult, len(seen))

	var wg sync.WaitGroup
	for noradID, name := range seen {
		wg.Add(1)
		go func(id int, n string) {
			defer wg.Done()
			sem <- struct{}{}        // acquire
			defer func() { <-sem }() // release

			td, err := c.FetchTLE(id)
			if err != nil {
				results <- tleResult{err: err}
				return
			}
			results <- tleResult{data: *td}
		}(noradID, name)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var tleData []models.TLEData
	for r := range results {
		if r.err == nil {
			tleData = append(tleData, r.data)
		}
	}

	log.Info().Int("fetched", len(tleData)).Int("failed", len(seen)-len(tleData)).
		Msg("TLE data fetched from N2YO")

	return tleData, nil
}
