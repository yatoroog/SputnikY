package api

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/satellite"
	"github.com/satellite-tracker/backend/internal/tle"
)

func parseOptionalTimeParam(raw string) (time.Time, error) {
	if raw == "" {
		return time.Time{}, nil
	}

	if unixMillis, err := strconv.ParseInt(raw, 10, 64); err == nil {
		switch {
		case unixMillis > 1_000_000_000_000:
			return time.UnixMilli(unixMillis).UTC(), nil
		case unixMillis > 1_000_000_000:
			return time.Unix(unixMillis, 0).UTC(), nil
		}
	}

	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed.UTC(), nil
		}
	}

	return time.Time{}, fiber.ErrBadRequest
}

// Handlers holds the dependencies for all HTTP handlers.
type Handlers struct {
	service *satellite.SatelliteService
}

// NewHandlers creates a new Handlers instance.
func NewHandlers(service *satellite.SatelliteService) *Handlers {
	return &Handlers{service: service}
}

// GetSatellites returns all satellites matching optional query filters.
// GET /api/satellites
func (h *Handlers) GetSatellites(c *fiber.Ctx) error {
	var filters models.FilterParams
	if err := c.QueryParser(&filters); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid query parameters",
		})
	}

	satellites := h.service.GetAll(filters)
	return c.JSON(fiber.Map{
		"count":      len(satellites),
		"satellites": satellites,
	})
}

// GetPositions returns lightweight position snapshots for all tracked satellites.
// GET /api/positions
// Optional query param: time (RFC3339 / RFC3339Nano / unix seconds / unix millis)
func (h *Handlers) GetPositions(c *fiber.Ctx) error {
	requestedTime, err := parseOptionalTimeParam(c.Query("time"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid time parameter",
		})
	}

	var positions []models.SatellitePosition
	responseTime := time.Now().UTC()
	if requestedTime.IsZero() {
		positions = h.service.GetPositions()
	} else {
		responseTime = requestedTime
		positions = h.service.GetPositionsAtTime(requestedTime)
	}

	return c.JSON(fiber.Map{
		"time":      responseTime.Format(time.RFC3339Nano),
		"count":     len(positions),
		"positions": positions,
	})
}

// GetSatelliteByID returns a single satellite by its UUID.
// GET /api/satellites/:id
func (h *Handlers) GetSatelliteByID(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing satellite ID",
		})
	}

	sat, err := h.service.GetByID(id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(sat)
}

// GetSatelliteOrbit returns the orbital track for a satellite.
// GET /api/satellites/:id/orbit
// Query params: duration (minutes, default 90)
func (h *Handlers) GetSatelliteOrbit(c *fiber.Ctx) error {
	id := c.Params("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing satellite ID",
		})
	}

	durationMinutes := c.QueryInt("duration", 90)
	if durationMinutes < 1 || durationMinutes > 1440 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Duration must be between 1 and 1440 minutes",
		})
	}

	duration := time.Duration(durationMinutes) * time.Minute

	orbit, err := h.service.GetOrbit(id, duration)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"satellite_id": id,
		"duration_min": durationMinutes,
		"points":       orbit,
	})
}

// GetPasses predicts satellite passes over an observer location.
// GET /api/passes
// Required query params: id, lat, lng
// Optional query params: alt (default 0), hours (default 24)
func (h *Handlers) GetPasses(c *fiber.Ctx) error {
	id := c.Query("id")
	if id == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing satellite ID (id parameter)",
		})
	}

	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	if latStr == "" || lngStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing observer coordinates (lat, lng parameters)",
		})
	}

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat < -90 || lat > 90 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid latitude: must be between -90 and 90",
		})
	}

	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng < -180 || lng > 180 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid longitude: must be between -180 and 180",
		})
	}

	alt := 0.0
	if altStr := c.Query("alt"); altStr != "" {
		alt, err = strconv.ParseFloat(altStr, 64)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid altitude",
			})
		}
	}

	hours := c.QueryInt("hours", 24)
	if hours < 1 || hours > 168 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Hours must be between 1 and 168",
		})
	}

	sat, err := h.service.GetByID(id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	now := time.Now().UTC()
	passes, err := satellite.CalculatePasses(sat.TLE, lat, lng, alt, now, hours)
	if err != nil {
		log.Error().Err(err).Str("satellite_id", id).Msg("Failed to calculate passes")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to calculate passes",
		})
	}

	// Set satellite ID on each pass
	for i := range passes {
		passes[i].SatelliteID = id
	}

	return c.JSON(fiber.Map{
		"satellite_id":   id,
		"satellite_name": sat.Name,
		"observer": fiber.Map{
			"lat": lat,
			"lng": lng,
			"alt": alt,
		},
		"hours":  hours,
		"passes": passes,
	})
}

// GetAreaPasses predicts satellite passes over a map location for ALL satellites.
// GET /api/passes/area
// Required query params: lat, lng
// Optional query params: hours (default 6, max 24)
func (h *Handlers) GetAreaPasses(c *fiber.Ctx) error {
	latStr := c.Query("lat")
	lngStr := c.Query("lng")
	if latStr == "" || lngStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing coordinates (lat, lng parameters)",
		})
	}

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil || lat < -90 || lat > 90 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid latitude: must be between -90 and 90",
		})
	}

	lng, err := strconv.ParseFloat(lngStr, 64)
	if err != nil || lng < -180 || lng > 180 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid longitude: must be between -180 and 180",
		})
	}

	hours := c.QueryInt("hours", 6)
	if hours < 1 || hours > 24 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Hours must be between 1 and 24",
		})
	}

	allSats := h.service.GetAll(models.FilterParams{})
	now := time.Now().UTC()

	type passResult struct {
		SatID   string
		SatName string
		OrbitType string
		Passes  []models.Pass
	}

	results := make(chan passResult, len(allSats))
	sem := make(chan struct{}, 20) // limit concurrency

	for _, s := range allSats {
		go func(sat *models.Satellite) {
			sem <- struct{}{}
			defer func() { <-sem }()

			defer func() {
				if r := recover(); r != nil {
					results <- passResult{SatID: sat.ID, SatName: sat.Name, OrbitType: sat.OrbitType}
				}
			}()

			passes, err := satellite.CalculatePasses(sat.TLE, lat, lng, 0, now, hours)
			if err != nil || len(passes) == 0 {
				results <- passResult{SatID: sat.ID, SatName: sat.Name, OrbitType: sat.OrbitType}
				return
			}
			for i := range passes {
				passes[i].SatelliteID = sat.ID
				passes[i].SatelliteName = sat.Name
			}
			results <- passResult{SatID: sat.ID, SatName: sat.Name, OrbitType: sat.OrbitType, Passes: passes}
		}(s)
	}

	var allPasses []fiber.Map
	for i := 0; i < len(allSats); i++ {
		r := <-results
		for _, p := range r.Passes {
			allPasses = append(allPasses, fiber.Map{
				"satellite_id":   p.SatelliteID,
				"satellite_name": p.SatelliteName,
				"orbit_type":     r.OrbitType,
				"aos":            p.AOS,
				"los":            p.LOS,
				"max_elevation":  p.MaxElevation,
				"duration":       p.Duration,
			})
		}
	}

	// Sort by AOS
	for i := 0; i < len(allPasses); i++ {
		for j := i + 1; j < len(allPasses); j++ {
			if allPasses[i]["aos"].(int64) > allPasses[j]["aos"].(int64) {
				allPasses[i], allPasses[j] = allPasses[j], allPasses[i]
			}
		}
	}

	// Limit to 50 results
	if len(allPasses) > 50 {
		allPasses = allPasses[:50]
	}

	return c.JSON(fiber.Map{
		"observer": fiber.Map{
			"lat": lat,
			"lng": lng,
		},
		"hours":  hours,
		"passes": allPasses,
	})
}
// UploadTLE handles TLE data upload (raw text body).
// POST /api/tle/upload
func (h *Handlers) UploadTLE(c *fiber.Ctx) error {
	body := string(c.Body())
	if len(body) == 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Empty TLE data",
		})
	}

	tleData, err := tle.ParseTLEString(body)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Failed to parse TLE data: " + err.Error(),
		})
	}

	if err := h.service.LoadFromTLE(tleData); err != nil {
		log.Error().Err(err).Msg("Failed to load TLE data")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to load satellites from TLE data",
		})
	}

	log.Info().Int("count", len(tleData)).Msg("TLE data uploaded and loaded")

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "TLE data loaded successfully",
		"count":   len(tleData),
	})
}

// GetPresets returns a list of available TLE preset names.
// GET /api/tle/presets
func (h *Handlers) GetPresets(c *fiber.Ctx) error {
	names := tle.GetPresetNames()
	return c.JSON(fiber.Map{
		"presets": names,
	})
}

// LoadPreset loads a named TLE preset.
// POST /api/tle/presets/:name
func (h *Handlers) LoadPreset(c *fiber.Ctx) error {
	name := c.Params("name")
	if name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing preset name",
		})
	}

	tleData, err := tle.GetPresetTLE(name)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	if err := h.service.LoadFromTLE(tleData); err != nil {
		log.Error().Err(err).Str("preset", name).Msg("Failed to load preset")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to load preset",
		})
	}

	log.Info().Str("preset", name).Int("count", len(tleData)).Msg("Preset loaded")

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"message": "Preset loaded successfully",
		"preset":  name,
		"count":   len(tleData),
	})
}
