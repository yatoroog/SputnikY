package satellite

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
)

// CatalogStore persists the active catalog and its runtime state.
type CatalogStore interface {
	LoadCatalog(ctx context.Context) ([]*models.Satellite, models.CatalogStatus, error)
	ListSatellites(ctx context.Context, filters models.FilterParams) ([]*models.Satellite, error)
	GetSatellite(ctx context.Context, id string) (*models.Satellite, error)
	GetFilterFacets(ctx context.Context) (models.FilterFacets, error)
	GetCatalogStatus(ctx context.Context) (models.CatalogStatus, error)
	SaveCatalog(ctx context.Context, satellites []*models.Satellite, status models.CatalogStatus, mode string) error
	UpdateCatalogNote(ctx context.Context, note string) error
	UpdateSatellitePositions(
		ctx context.Context,
		updates []models.SatellitePositionUpdate,
		updatedAt time.Time,
	) error
}

// SatelliteService manages all tracked satellites and their state.
type SatelliteService struct {
	mu               sync.RWMutex
	satellites       map[string]*models.Satellite
	catalogStatus    models.CatalogStatus
	metadataResolver MetadataResolver
	store            CatalogStore
}

// NewService creates a new SatelliteService.
func NewService(metadataResolver MetadataResolver, catalogStore CatalogStore) *SatelliteService {
	return &SatelliteService{
		satellites: make(map[string]*models.Satellite),
		catalogStatus: models.CatalogStatus{
			Source: models.CatalogSourceUnknown,
		},
		metadataResolver: metadataResolver,
		store:            catalogStore,
	}
}

func cloneTimePtr(ts *time.Time) *time.Time {
	if ts == nil {
		return nil
	}

	value := ts.UTC()
	return &value
}

// HydrateFromStore restores the latest persisted catalog into the in-memory worker state.
func (s *SatelliteService) HydrateFromStore(ctx context.Context) (bool, error) {
	if s.store == nil {
		return false, nil
	}

	satellites, status, err := s.store.LoadCatalog(ctx)
	if err != nil {
		return false, fmt.Errorf("load catalog from store: %w", err)
	}
	if len(satellites) == 0 {
		return false, nil
	}

	loaded := make(map[string]*models.Satellite, len(satellites))
	for _, satellite := range satellites {
		loaded[satellite.ID] = satellite
	}

	s.mu.Lock()
	s.satellites = loaded
	s.catalogStatus = status
	s.mu.Unlock()

	log.Info().
		Int("count", len(satellites)).
		Str("source", status.Source).
		Msg("Active catalog restored from PostgreSQL")

	return true, nil
}

// ImportCatalog builds satellites from TLE data, persists them, and updates the live in-memory catalog.
func (s *SatelliteService) ImportCatalog(
	ctx context.Context,
	tleData []models.TLEData,
	source string,
	mode string,
	note string,
	syncedAt time.Time,
) error {
	if mode != models.CatalogImportModeMerge && mode != models.CatalogImportModeReplace {
		return fmt.Errorf("unsupported catalog import mode: %s", mode)
	}

	if syncedAt.IsZero() {
		syncedAt = time.Now().UTC()
	} else {
		syncedAt = syncedAt.UTC()
	}

	loadedSatellites, loaded := s.buildSatellites(tleData, syncedAt)
	if loaded == 0 {
		return fmt.Errorf("no valid satellites could be imported from TLE data")
	}

	satellites := make([]*models.Satellite, 0, len(loadedSatellites))
	for _, satellite := range loadedSatellites {
		satellites = append(satellites, satellite)
	}

	status := models.CatalogStatus{
		Source:     source,
		LastSyncAt: cloneTimePtr(&syncedAt),
		Note:       note,
	}

	if s.store != nil {
		if err := s.store.SaveCatalog(ctx, satellites, status, mode); err != nil {
			return fmt.Errorf("persist catalog: %w", err)
		}
	}

	s.mu.Lock()
	switch mode {
	case models.CatalogImportModeReplace:
		s.satellites = loadedSatellites
	case models.CatalogImportModeMerge:
		if s.satellites == nil {
			s.satellites = make(map[string]*models.Satellite)
		}
		for id, satellite := range loadedSatellites {
			s.satellites[id] = satellite
		}
	}
	s.catalogStatus = status
	s.mu.Unlock()

	log.Info().
		Int("count", loaded).
		Str("source", source).
		Str("mode", mode).
		Msg("Satellites imported into active catalog")

	return nil
}

// GetAll returns all satellites matching the given filters.
func (s *SatelliteService) GetAll(ctx context.Context, filters models.FilterParams) []*models.Satellite {
	if s.store != nil {
		satellites, err := s.store.ListSatellites(ctx, filters)
		if err == nil {
			return satellites
		}

		log.Warn().Err(err).Msg("Failed to read satellites from PostgreSQL, falling back to memory")
	}

	return s.getAllFromMemory(filters)
}

func (s *SatelliteService) getAllFromMemory(filters models.FilterParams) []*models.Satellite {
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

// GetFilterFacets returns unique filter values for the whole active catalog.
func (s *SatelliteService) GetFilterFacets(ctx context.Context) models.FilterFacets {
	if s.store != nil {
		facets, err := s.store.GetFilterFacets(ctx)
		if err == nil {
			return facets
		}

		log.Warn().Err(err).Msg("Failed to read filter facets from PostgreSQL, falling back to memory")
	}

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

// GetByID returns a single satellite by its ID.
func (s *SatelliteService) GetByID(ctx context.Context, id string) (*models.Satellite, error) {
	if s.store != nil {
		satellite, err := s.store.GetSatellite(ctx, id)
		if err == nil {
			return satellite, nil
		}
		if strings.Contains(err.Error(), "satellite not found:") {
			s.mu.RLock()
			defer s.mu.RUnlock()

			sat, ok := s.satellites[id]
			if !ok {
				return nil, err
			}
			return sat, nil
		}

		log.Warn().
			Err(err).
			Str("satellite_id", id).
			Msg("Failed to read satellite from PostgreSQL, falling back to memory")
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	sat, ok := s.satellites[id]
	if !ok {
		return nil, fmt.Errorf("satellite not found: %s", id)
	}
	return sat, nil
}

// GetOrbit computes the orbital track for a satellite.
func (s *SatelliteService) GetOrbit(ctx context.Context, id string, duration time.Duration) ([]models.OrbitPoint, error) {
	sat, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	start := now.Add(-duration / 2)
	steps := int(duration.Minutes()) * 2
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
	updates := make([]models.SatellitePositionUpdate, 0, len(s.satellites))
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

		updates = append(updates, models.SatellitePositionUpdate{
			ID:        sat.ID,
			Latitude:  sat.Latitude,
			Longitude: sat.Longitude,
			Altitude:  sat.Altitude,
			Velocity:  sat.Velocity,
		})
	}
	s.mu.Unlock()

	if s.store != nil {
		if err := s.store.UpdateSatellitePositions(context.Background(), updates, t.UTC()); err != nil {
			log.Warn().Err(err).Msg("Failed to persist live satellite positions to PostgreSQL")
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

// GetPositionsAtTime propagates all tracked satellites to the provided moment without mutating live state.
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

// UpdateCatalogNote updates the catalog note while preserving the source and last sync timestamp.
func (s *SatelliteService) UpdateCatalogNote(ctx context.Context, note string) {
	s.mu.Lock()
	s.catalogStatus.Note = note
	s.mu.Unlock()

	if s.store != nil {
		if err := s.store.UpdateCatalogNote(ctx, note); err != nil {
			log.Warn().Err(err).Msg("Failed to persist catalog note to PostgreSQL")
		}
	}
}

// GetCatalogStatus returns a snapshot of the current catalog metadata.
func (s *SatelliteService) GetCatalogStatus(ctx context.Context) models.CatalogStatus {
	if s.store != nil {
		status, err := s.store.GetCatalogStatus(ctx)
		if err == nil {
			return status
		}

		log.Warn().Err(err).Msg("Failed to read catalog status from PostgreSQL, falling back to memory")
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	return models.CatalogStatus{
		Source:     s.catalogStatus.Source,
		LastSyncAt: cloneTimePtr(s.catalogStatus.LastSyncAt),
		Note:       s.catalogStatus.Note,
	}
}

// Count returns the number of satellites currently loaded into memory for live propagation.
func (s *SatelliteService) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.satellites)
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
