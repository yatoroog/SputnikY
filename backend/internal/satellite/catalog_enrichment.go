package satellite

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/tle"
)

// MetadataResolver resolves non-orbital catalog metadata for a batch of TLE entries.
type MetadataResolver interface {
	ResolveCatalogMetadata(tleData []models.TLEData) (map[int]models.CatalogMetadata, error)
}

func determineCountryWithMetadata(
	name string,
	intlDesignator string,
	metadata models.CatalogMetadata,
) (country string, usedMetadata bool) {
	metadataCountry := strings.TrimSpace(metadata.OwnerName)
	if metadataCountry != "" && !strings.EqualFold(metadataCountry, "Unknown") {
		return metadataCountry, true
	}

	heuristicCountry := DetermineCountry(name, intlDesignator)
	if heuristicCountry != "Unknown" {
		return heuristicCountry, false
	}

	if metadataCountry != "" {
		return metadataCountry, true
	}

	if metadata.OwnerCode != "" {
		return strings.TrimSpace(metadata.OwnerCode), true
	}

	return "Unknown", false
}

func (s *SatelliteService) resolveCatalogMetadata(
	tleData []models.TLEData,
) map[int]models.CatalogMetadata {
	if s.metadataResolver == nil || len(tleData) == 0 {
		return nil
	}

	metadataByNorad, err := s.metadataResolver.ResolveCatalogMetadata(tleData)
	if err != nil {
		log.Warn().Err(err).Msg(
			"SATCAT enrichment partially failed, using heuristic country detection for unresolved satellites",
		)
	}

	return metadataByNorad
}

func (s *SatelliteService) buildSatellites(
	tleData []models.TLEData,
	now time.Time,
) (map[string]*models.Satellite, int) {
	metadataByNorad := s.resolveCatalogMetadata(tleData)
	satellites := make(map[string]*models.Satellite, len(tleData))
	loaded := 0
	metadataCountries := 0
	heuristicCountries := 0
	unknownCountries := 0

	for _, td := range tleData {
		noradID, err := tle.ExtractNoradID(td.Line1)
		if err != nil {
			log.Warn().Err(err).Str("name", td.Name).Msg("Failed to extract NORAD ID, skipping")
			continue
		}

		intlDesig := tle.ExtractIntlDesignator(td.Line1)
		periodMinutes, inclination, eccentricity := ExtractOrbitalParams(td)
		orbitType := DetermineOrbitType(periodMinutes, eccentricity)
		metadata := metadataByNorad[noradID]
		country, usedMetadata := determineCountryWithMetadata(td.Name, intlDesig, metadata)
		purpose := determinePurpose(td.Name)

		switch {
		case usedMetadata && country != "Unknown":
			metadataCountries++
		case country != "Unknown":
			heuristicCountries++
		default:
			unknownCountries++
		}

		epoch := ""
		if len(td.Line1) >= 32 {
			epoch = strings.TrimSpace(td.Line1[18:32])
		}

		sat := &models.Satellite{
			ID:          stableSatelliteID(noradID),
			Name:        td.Name,
			NoradID:     noradID,
			Country:     country,
			OwnerCode:   metadata.OwnerCode,
			OwnerName:   metadata.OwnerName,
			OrbitType:   orbitType,
			Purpose:     purpose,
			Period:      periodMinutes,
			Inclination: inclination,
			Epoch:       epoch,
			TLE:         td,
		}

		lat, lng, alt, err := Propagate(td, now)
		if err != nil {
			log.Warn().Err(err).Str("name", td.Name).Msg("Failed to propagate initial position, skipping satellite")
			continue
		}
		sat.Latitude = lat
		sat.Longitude = lng
		sat.Altitude = alt

		vel, err := CalculateVelocity(td, now)
		if err == nil {
			sat.Velocity = vel
		}

		satellites[sat.ID] = sat
		loaded++
	}

	log.Info().
		Int("owner_enriched", metadataCountries).
		Int("heuristic_country", heuristicCountries).
		Int("unknown_country", unknownCountries).
		Msg("Satellite country enrichment applied")

	return satellites, loaded
}

func stableSatelliteID(noradID int) string {
	return uuid.NewSHA1(
		uuid.NameSpaceOID,
		[]byte(fmt.Sprintf("sputnikx:norad:%d", noradID)),
	).String()
}
