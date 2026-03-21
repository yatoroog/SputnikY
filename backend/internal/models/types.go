package models

import "time"

const (
	CatalogSourceUnknown     = "unknown"
	CatalogSourceN2YO        = "n2yo"
	CatalogSourceLocalTLE    = "local_tle"
	CatalogSourceUploadedTLE = "uploaded_tle"
	CatalogSourcePreset      = "preset"
)

// TLEData holds the raw two-line element set for a satellite.
type TLEData struct {
	Name  string `json:"name"`
	Line1 string `json:"line1"`
	Line2 string `json:"line2"`
}

// Satellite represents a tracked satellite with its current computed state.
type Satellite struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	NoradID     int     `json:"norad_id"`
	Country     string  `json:"country"`
	OrbitType   string  `json:"orbit_type"`
	Purpose     string  `json:"purpose"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Altitude    float64 `json:"altitude"`
	Velocity    float64 `json:"velocity"`
	Period      float64 `json:"period"`
	Inclination float64 `json:"inclination"`
	Epoch       string  `json:"epoch"`
	TLE         TLEData `json:"tle,omitempty"`
}

// CatalogStatus describes how the in-memory satellite catalog was last populated.
type CatalogStatus struct {
	Source     string     `json:"source"`
	LastSyncAt *time.Time `json:"last_sync_at,omitempty"`
	Note       string     `json:"note,omitempty"`
}

// FilterFacets describes available filter values for the whole in-memory catalog.
type FilterFacets struct {
	Countries []string `json:"countries"`
	Purposes  []string `json:"purposes"`
}

// SatellitePosition is a lightweight position snapshot for WebSocket broadcasts.
type SatellitePosition struct {
	ID        string  `json:"id"`
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lng"`
	Altitude  float64 `json:"alt"`
}

// OrbitPoint is a single point along an orbital track.
type OrbitPoint struct {
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lng"`
	Altitude  float64 `json:"alt"`
	Timestamp int64   `json:"ts"`
}

// Pass describes a single satellite pass over an observer location.
type Pass struct {
	SatelliteID   string  `json:"satellite_id"`
	SatelliteName string  `json:"satellite_name"`
	AOS           int64   `json:"aos"`
	LOS           int64   `json:"los"`
	MaxElevation  float64 `json:"max_elevation"`
	Duration      int     `json:"duration"`
}

// WSMessage is the envelope for all WebSocket messages.
type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// FilterParams carries query-string filters for satellite listing.
type FilterParams struct {
	Country   string `query:"country"`
	OrbitType string `query:"orbit_type"`
	Purpose   string `query:"purpose"`
	Search    string `query:"search"`
}

// SubscribeMessage is sent by a WebSocket client to select which satellites to track.
type SubscribeMessage struct {
	Type string   `json:"type"`
	IDs  []string `json:"ids"`
}
