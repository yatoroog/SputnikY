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
	OwnerCode   string  `json:"owner_code,omitempty"`
	OwnerName   string  `json:"owner_name,omitempty"`
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
	AOSAzimuth    float64 `json:"aos_azimuth"`
	LOSAzimuth    float64 `json:"los_azimuth"`
	TCA           int64   `json:"tca"`
	TCAAzimuth    float64 `json:"tca_azimuth"`
	TCAElevation  float64 `json:"tca_elevation"`
}

// PassTrackPoint describes a single look-angle sample during a satellite pass.
type PassTrackPoint struct {
	Time      int64   `json:"time"`
	Azimuth   float64 `json:"azimuth"`
	Elevation float64 `json:"elevation"`
}

// ObserverArea describes a circular observation area on the ground.
type ObserverArea struct {
	Name      string  `json:"name,omitempty"`
	Latitude  float64 `json:"lat"`
	Longitude float64 `json:"lng"`
	RadiusKm  float64 `json:"radius_km"`
}

// Approach describes a satellite ground-track approach within a given observer radius.
type Approach struct {
	SatelliteID        string  `json:"satellite_id"`
	SatelliteName      string  `json:"satellite_name"`
	StartAt            int64   `json:"start_at"`
	EndAt              int64   `json:"end_at"`
	ClosestAt          int64   `json:"closest_at"`
	NotifyAt           int64   `json:"notify_at"`
	MinDistanceKm      float64 `json:"min_distance_km"`
	RadiusKm           float64 `json:"radius_km"`
	Duration           int     `json:"duration"`
	ClosestLatitude    float64 `json:"closest_lat"`
	ClosestLongitude   float64 `json:"closest_lng"`
	ClosestAltitudeKm  float64 `json:"closest_altitude_km"`
	ClosestVelocityKmS float64 `json:"closest_velocity_km_s"`
}

// Conjunction describes a predicted close approach between two satellites.
type Conjunction struct {
	Satellite1ID   string  `json:"satellite1_id"`
	Satellite1Name string  `json:"satellite1_name"`
	Satellite2ID   string  `json:"satellite2_id"`
	Satellite2Name string  `json:"satellite2_name"`
	ClosestAt      int64   `json:"closest_at"`
	MinDistanceKm  float64 `json:"min_distance_km"`
	Sat1Lat        float64 `json:"sat1_lat"`
	Sat1Lng        float64 `json:"sat1_lng"`
	Sat1Alt        float64 `json:"sat1_alt"`
	Sat2Lat        float64 `json:"sat2_lat"`
	Sat2Lng        float64 `json:"sat2_lng"`
	Sat2Alt        float64 `json:"sat2_alt"`
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

// CatalogMetadata contains non-orbital catalog metadata resolved from external registries.
type CatalogMetadata struct {
	NoradID    int
	ObjectType string
	OwnerCode  string
	OwnerName  string
	LaunchDate string
}

// SubscribeMessage is sent by a WebSocket client to select which satellites to track.
type SubscribeMessage struct {
	Type string   `json:"type"`
	IDs  []string `json:"ids"`
}
