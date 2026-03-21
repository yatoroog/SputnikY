package satellite

import (
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/tle"
)

// SatelliteService manages all tracked satellites and their state.
type SatelliteService struct {
	mu            sync.RWMutex
	satellites    map[string]*models.Satellite
	catalogStatus models.CatalogStatus
}

// NewService creates a new SatelliteService.
func NewService() *SatelliteService {
	return &SatelliteService{
		satellites: make(map[string]*models.Satellite),
		catalogStatus: models.CatalogStatus{
			Source: models.CatalogSourceUnknown,
		},
	}
}

func cloneTimePtr(ts *time.Time) *time.Time {
	if ts == nil {
		return nil
	}

	value := ts.UTC()
	return &value
}

// LoadFromTLE creates Satellite objects from parsed TLE data and propagates initial positions.
func (s *SatelliteService) LoadFromTLE(tleData []models.TLEData) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	loaded := 0

	for _, td := range tleData {
		noradID, err := tle.ExtractNoradID(td.Line1)
		if err != nil {
			log.Warn().Err(err).Str("name", td.Name).Msg("Failed to extract NORAD ID, skipping")
			continue
		}

		intlDesig := tle.ExtractIntlDesignator(td.Line1)
		periodMinutes, inclination, eccentricity := ExtractOrbitalParams(td)
		orbitType := DetermineOrbitType(periodMinutes, eccentricity)
		country := DetermineCountry(td.Name, intlDesig)
		purpose := determinePurpose(td.Name)

		epoch := ""
		if len(td.Line1) >= 32 {
			epoch = strings.TrimSpace(td.Line1[18:32])
		}

		sat := &models.Satellite{
			ID:          uuid.New().String(),
			Name:        td.Name,
			NoradID:     noradID,
			Country:     country,
			OrbitType:   orbitType,
			Purpose:     purpose,
			Period:      periodMinutes,
			Inclination: inclination,
			Epoch:       epoch,
			TLE:         td,
		}

		// Propagate initial position
		lat, lng, alt, err := Propagate(td, now)
		if err != nil {
			log.Warn().Err(err).Str("name", td.Name).Msg("Failed to propagate initial position, skipping satellite")
			continue
		}
		sat.Latitude = lat
		sat.Longitude = lng
		sat.Altitude = alt

		// Calculate velocity
		vel, err := CalculateVelocity(td, now)
		if err != nil {
			sat.Velocity = 0
		} else {
			sat.Velocity = vel
		}

		s.satellites[sat.ID] = sat
		loaded++
	}

	log.Info().Int("count", loaded).Msg("Satellites loaded from TLE data")
	return nil
}

// ReplaceFromTLE atomically replaces all satellites with freshly parsed TLE data.
// Unlike LoadFromTLE this doesn't accumulate — it swaps the whole map at once.
func (s *SatelliteService) ReplaceFromTLE(tleData []models.TLEData) error {
	now := time.Now().UTC()
	newMap := make(map[string]*models.Satellite)
	loaded := 0

	for _, td := range tleData {
		noradID, err := tle.ExtractNoradID(td.Line1)
		if err != nil {
			continue
		}

		intlDesig := tle.ExtractIntlDesignator(td.Line1)
		periodMinutes, inclination, eccentricity := ExtractOrbitalParams(td)
		orbitType := DetermineOrbitType(periodMinutes, eccentricity)
		country := DetermineCountry(td.Name, intlDesig)
		purpose := determinePurpose(td.Name)

		epoch := ""
		if len(td.Line1) >= 32 {
			epoch = strings.TrimSpace(td.Line1[18:32])
		}

		sat := &models.Satellite{
			ID:          uuid.New().String(),
			Name:        td.Name,
			NoradID:     noradID,
			Country:     country,
			OrbitType:   orbitType,
			Purpose:     purpose,
			Period:      periodMinutes,
			Inclination: inclination,
			Epoch:       epoch,
			TLE:         td,
		}

		lat, lng, alt, err := Propagate(td, now)
		if err != nil {
			continue
		}
		sat.Latitude = lat
		sat.Longitude = lng
		sat.Altitude = alt

		vel, err := CalculateVelocity(td, now)
		if err == nil {
			sat.Velocity = vel
		}

		newMap[sat.ID] = sat
		loaded++
	}

	s.mu.Lock()
	s.satellites = newMap
	s.mu.Unlock()

	log.Info().Int("count", loaded).Msg("Satellites replaced from TLE data")
	return nil
}

// GetAll returns all satellites matching the given filters.
func (s *SatelliteService) GetAll(filters models.FilterParams) []*models.Satellite {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*models.Satellite, 0, len(s.satellites))
	for _, sat := range s.satellites {
		if !matchesFilters(sat, filters) {
			continue
		}
		result = append(result, sat)
	}
	return result
}

// GetFilterFacets returns unique filter values for the whole in-memory catalog.
func (s *SatelliteService) GetFilterFacets() models.FilterFacets {
	s.mu.RLock()
	defer s.mu.RUnlock()

	countries := make(map[string]struct{})
	purposes := make(map[string]struct{})

	for _, sat := range s.satellites {
		if sat.Country != "" {
			countries[sat.Country] = struct{}{}
		}
		if sat.Purpose != "" {
			purposes[sat.Purpose] = struct{}{}
		}
	}

	countryList := make([]string, 0, len(countries))
	for value := range countries {
		countryList = append(countryList, value)
	}
	slices.Sort(countryList)

	purposeList := make([]string, 0, len(purposes))
	for value := range purposes {
		purposeList = append(purposeList, value)
	}
	slices.Sort(purposeList)

	return models.FilterFacets{
		Countries: countryList,
		Purposes:  purposeList,
	}
}

// GetByID returns a single satellite by its UUID.
func (s *SatelliteService) GetByID(id string) (*models.Satellite, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sat, ok := s.satellites[id]
	if !ok {
		return nil, fmt.Errorf("satellite not found: %s", id)
	}
	return sat, nil
}

// GetOrbit computes the orbital track for a satellite.
func (s *SatelliteService) GetOrbit(id string, duration time.Duration) ([]models.OrbitPoint, error) {
	s.mu.RLock()
	sat, ok := s.satellites[id]
	s.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("satellite not found: %s", id)
	}

	now := time.Now().UTC()
	// Use half duration before and half after now
	start := now.Add(-duration / 2)
	steps := int(duration.Minutes()) * 2 // ~30 second resolution
	if steps < 10 {
		steps = 10
	}
	if steps > 1000 {
		steps = 1000
	}

	return PropagateOrbit(sat.TLE, start, duration, steps)
}

// UpdatePositions re-propagates all satellites to the given time.
func (s *SatelliteService) UpdatePositions(t time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, sat := range s.satellites {
		lat, lng, alt, err := Propagate(sat.TLE, t)
		if err != nil {
			continue
		}
		sat.Latitude = lat
		sat.Longitude = lng
		sat.Altitude = alt

		vel, err := CalculateVelocity(sat.TLE, t)
		if err == nil {
			sat.Velocity = vel
		}
	}
}

// GetPositions returns a lightweight slice of all satellite positions.
func (s *SatelliteService) GetPositions() []models.SatellitePosition {
	s.mu.RLock()
	defer s.mu.RUnlock()

	positions := make([]models.SatellitePosition, 0, len(s.satellites))
	for _, sat := range s.satellites {
		positions = append(positions, models.SatellitePosition{
			ID:        sat.ID,
			Latitude:  sat.Latitude,
			Longitude: sat.Longitude,
			Altitude:  sat.Altitude,
		})
	}
	return positions
}

// GetPositionsAtTime propagates all tracked satellites to the provided moment
// without mutating the live in-memory state used by the realtime worker.
func (s *SatelliteService) GetPositionsAtTime(t time.Time) []models.SatellitePosition {
	s.mu.RLock()
	defer s.mu.RUnlock()

	positions := make([]models.SatellitePosition, 0, len(s.satellites))
	for _, sat := range s.satellites {
		lat, lng, alt, err := Propagate(sat.TLE, t)
		if err != nil {
			continue
		}

		positions = append(positions, models.SatellitePosition{
			ID:        sat.ID,
			Latitude:  lat,
			Longitude: lng,
			Altitude:  alt,
		})
	}

	return positions
}

// SetCatalogStatus updates metadata about the last successful catalog load.
func (s *SatelliteService) SetCatalogStatus(source string, syncedAt time.Time, note string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	timestamp := syncedAt.UTC()
	s.catalogStatus = models.CatalogStatus{
		Source:     source,
		LastSyncAt: &timestamp,
		Note:       note,
	}
}

// UpdateCatalogNote updates the catalog note while preserving the source and last sync timestamp.
func (s *SatelliteService) UpdateCatalogNote(note string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.catalogStatus.Note = note
}

// GetCatalogStatus returns a snapshot of the current catalog metadata.
func (s *SatelliteService) GetCatalogStatus() models.CatalogStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return models.CatalogStatus{
		Source:     s.catalogStatus.Source,
		LastSyncAt: cloneTimePtr(s.catalogStatus.LastSyncAt),
		Note:       s.catalogStatus.Note,
	}
}

// matchesFilters checks if a satellite matches all non-empty filter criteria.
func matchesFilters(sat *models.Satellite, f models.FilterParams) bool {
	if f.Country != "" && !strings.EqualFold(sat.Country, f.Country) {
		return false
	}
	if f.OrbitType != "" && !strings.EqualFold(sat.OrbitType, f.OrbitType) {
		return false
	}
	if f.Purpose != "" && !strings.EqualFold(sat.Purpose, f.Purpose) {
		return false
	}
	if f.Search != "" {
		search := strings.ToLower(f.Search)
		name := strings.ToLower(sat.Name)
		if !strings.Contains(name, search) {
			return false
		}
	}
	return true
}

// determinePurpose guesses the satellite purpose from its name.
func determinePurpose(name string) string {
	upper := strings.ToUpper(name)
	switch {
	case strings.Contains(upper, "STARLINK"):
		return "Communications"
	case strings.Contains(upper, "GPS") || strings.Contains(upper, "NAVSTAR"):
		return "Navigation"
	case strings.Contains(upper, "NOAA") || strings.Contains(upper, "METEOR") || strings.Contains(upper, "GOES"):
		return "Weather"
	case strings.Contains(upper, "ISS") || strings.Contains(upper, "ZARYA") || strings.Contains(upper, "TIANHE") || strings.Contains(upper, "CSS"):
		return "Space Station"
	case strings.Contains(upper, "HUBBLE") || strings.Contains(upper, "HST"):
		return "Science"
	case strings.Contains(upper, "IRIDIUM"):
		return "Communications"
	case strings.Contains(upper, "AO-") || strings.Contains(upper, "OSCAR") || strings.Contains(upper, "FOX"):
		return "Amateur Radio"
	case strings.Contains(upper, "COSMOS") || strings.Contains(upper, "USA "):
		return "Military"
	default:
		return "Other"
	}
}
