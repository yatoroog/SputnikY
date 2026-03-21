package cache

import (
	"sync"

	"github.com/satellite-tracker/backend/internal/models"
)

// PositionCache provides thread-safe storage for the latest satellite positions.
type PositionCache struct {
	mu        sync.RWMutex
	positions map[string]models.SatellitePosition
}

// NewPositionCache creates a new empty PositionCache.
func NewPositionCache() *PositionCache {
	return &PositionCache{
		positions: make(map[string]models.SatellitePosition),
	}
}

// Update replaces all cached positions with the given slice.
func (c *PositionCache) Update(positions []models.SatellitePosition) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.positions = make(map[string]models.SatellitePosition, len(positions))
	for _, p := range positions {
		c.positions[p.ID] = p
	}
}

// GetAll returns all cached positions.
func (c *PositionCache) GetAll() []models.SatellitePosition {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]models.SatellitePosition, 0, len(c.positions))
	for _, p := range c.positions {
		result = append(result, p)
	}
	return result
}

// GetByIDs returns positions for the specified satellite IDs.
// IDs not found in the cache are silently skipped.
func (c *PositionCache) GetByIDs(ids []string) []models.SatellitePosition {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make([]models.SatellitePosition, 0, len(ids))
	for _, id := range ids {
		if p, ok := c.positions[id]; ok {
			result = append(result, p)
		}
	}
	return result
}
