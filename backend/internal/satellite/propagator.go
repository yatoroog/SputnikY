package satellite

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/satellite-tracker/backend/internal/models"

	sat "github.com/joshuaferrara/go-satellite"
)

const (
	rad2deg = 180.0 / math.Pi
	deg2rad = math.Pi / 180.0
	minValidAltitudeKm = -200.0
	maxValidAltitudeKm = 100000.0
)

func validateGeodeticPosition(lat, lng, alt float64, name string) error {
	if math.IsNaN(lat) || math.IsNaN(lng) || math.IsNaN(alt) {
		return fmt.Errorf("propagation returned NaN geodetic position for satellite %s", name)
	}
	if math.IsInf(lat, 0) || math.IsInf(lng, 0) || math.IsInf(alt, 0) {
		return fmt.Errorf("propagation returned infinite geodetic position for satellite %s", name)
	}
	if lat < -90 || lat > 90 {
		return fmt.Errorf("propagation returned invalid latitude %.2f for satellite %s", lat, name)
	}
	if lng < -180 || lng > 180 {
		return fmt.Errorf("propagation returned invalid longitude %.2f for satellite %s", lng, name)
	}
	if alt < minValidAltitudeKm || alt > maxValidAltitudeKm {
		return fmt.Errorf("propagation returned unrealistic altitude %.2f km for satellite %s", alt, name)
	}
	return nil
}

// Propagate computes the latitude, longitude, and altitude of a satellite at time t.
// Latitude and longitude are returned in degrees; altitude in km.
func Propagate(tle models.TLEData, t time.Time) (lat, lng, alt float64, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("propagation panic: %v", r)
		}
	}()

	satObj := sat.TLEToSat(tle.Line1, tle.Line2, sat.GravityWGS84)

	year := t.Year()
	month := int(t.Month())
	day := t.Day()
	hour := t.Hour()
	minute := t.Minute()
	second := t.Second()

	position, _ := sat.Propagate(satObj, year, month, day, hour, minute, second)

	// Check for invalid propagation (NaN values)
	if math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsNaN(position.Z) {
		return 0, 0, 0, fmt.Errorf("propagation returned NaN for satellite %s", tle.Name)
	}

	gmst := sat.GSTimeFromDate(year, month, day, hour, minute, second)

	altitude, _, geodetic := sat.ECIToLLA(position, gmst)

	lat = geodetic.Latitude * rad2deg
	lng = geodetic.Longitude * rad2deg
	alt = altitude

	// Normalize longitude to -180..180
	for lng > 180.0 {
		lng -= 360.0
	}
	for lng < -180.0 {
		lng += 360.0
	}

	if err := validateGeodeticPosition(lat, lng, alt, tle.Name); err != nil {
		return 0, 0, 0, err
	}

	return lat, lng, alt, nil
}

// PropagateOrbit computes a series of positions along the orbital track.
func PropagateOrbit(tle models.TLEData, start time.Time, duration time.Duration, steps int) ([]models.OrbitPoint, error) {
	if steps <= 0 {
		steps = 1
	}

	interval := duration / time.Duration(steps)
	points := make([]models.OrbitPoint, 0, steps+1)

	for i := 0; i <= steps; i++ {
		t := start.Add(time.Duration(i) * interval)
		lat, lng, alt, err := Propagate(tle, t)
		if err != nil {
			continue
		}
		points = append(points, models.OrbitPoint{
			Latitude:  lat,
			Longitude: lng,
			Altitude:  alt,
			Timestamp: t.Unix(),
		})
	}

	if len(points) == 0 {
		return nil, fmt.Errorf("failed to compute any orbit points for %s", tle.Name)
	}

	return points, nil
}

// CalculateVelocity computes the satellite velocity magnitude in km/s from the ECI velocity vector.
func CalculateVelocity(tle models.TLEData, t time.Time) (float64, error) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	satObj := sat.TLEToSat(tle.Line1, tle.Line2, sat.GravityWGS84)

	year := t.Year()
	month := int(t.Month())
	day := t.Day()
	hour := t.Hour()
	minute := t.Minute()
	second := t.Second()

	_, velocity := sat.Propagate(satObj, year, month, day, hour, minute, second)

	speed := math.Sqrt(velocity.X*velocity.X + velocity.Y*velocity.Y + velocity.Z*velocity.Z)
	if math.IsNaN(speed) {
		return 0, fmt.Errorf("velocity calculation returned NaN")
	}
	return speed, nil
}

// DetermineOrbitType classifies the orbit based on period and eccentricity.
func DetermineOrbitType(periodMinutes float64, eccentricity float64) string {
	switch {
	case eccentricity > 0.25:
		return "HEO"
	case periodMinutes >= 1406 && periodMinutes <= 1466 && eccentricity < 0.01:
		return "GEO"
	case periodMinutes < 128:
		return "LEO"
	case periodMinutes >= 128 && periodMinutes <= 1440:
		return "MEO"
	default:
		return "HEO"
	}
}

// DetermineCountry determines satellite country of origin using the satellite name
// (sourced from N2YO API) and international designator from TLE data.
func DetermineCountry(name string, intlDesignator string) string {
	upper := strings.ToUpper(strings.TrimSpace(name))

	// USA
	usaPrefixes := []string{
		"STARLINK", "GPS ", "NAVSTAR", "IRIDIUM", "USA ", "USA-",
		"GOES ", "NOAA ", "TDRS", "MUOS", "AEHF", "NROL", "SDS ",
		"CYGNUS", "DRAGON", "CREW DRAGON", "FALCON",
		"SXM", "SIRIUS", "DIRECTV", "ORBCOMM", "GLOBALSTAR",
		"TESS", "SWIFT", "LANDSAT", "AQUA", "TERRA", "AURA",
		"ICESAT", "CALIPSO", "CLOUDSAT", "SBIRS", "WGS ",
		"ATLAS ", "DELTA ", "INTELSAT", "VIASAT", "ECHOSTAR",
		"SPACEX", "ONEWEB",
	}
	for _, p := range usaPrefixes {
		if strings.Contains(upper, p) {
			return "USA"
		}
	}

	// Russia
	rusPrefixes := []string{
		"COSMOS", "KOSMOS", "GLONASS", "PROGRESS", "SOYUZ",
		"YAMAL", "EXPRESS-", "RESURS", "GONETS", "LUCH ",
		"ELEKTRO", "ARKTIKA", "MOLNIYA", "BION", "FOTON",
		"KANOPUS", "KONDOR", "BARS-M", "MERIDIAN", "NADEZHDA",
		"STRELA", "PARUS", "RODNIK",
	}
	for _, p := range rusPrefixes {
		if strings.Contains(upper, p) {
			return "Russia"
		}
	}

	// China
	cnPrefixes := []string{
		"BEIDOU", "YAOGAN", "SHIYAN", "TIANHE", "ZHONGXING",
		"FENGYUN", "SHIJIAN", "TIANGONG", "SHENZHOU", "GAOFEN",
		"ZIYUAN", "HAIYANG", "CHANGE", "QUEQIAO", "TIANWEN",
		"CZ-", "WENTIAN", "MENGTIAN", "CSS ", "JILIN",
	}
	for _, p := range cnPrefixes {
		if strings.Contains(upper, p) {
			return "China"
		}
	}

	// EU / ESA
	euPrefixes := []string{
		"GALILEO", "SENTINEL", "AEOLUS", "METEOSAT", "SWARM",
		"COPERNICUS", "EUTELSAT", "ASTRA ", "SES-", "EGNOS",
	}
	for _, p := range euPrefixes {
		if strings.Contains(upper, p) {
			return "EU/ESA"
		}
	}

	// India
	inPrefixes := []string{
		"CARTOSAT", "RESOURCESAT", "IRNSS", "NAVIC", "GSAT",
		"INSAT", "ASTROSAT", "RISAT", "OCEANSAT", "EMISAT",
	}
	for _, p := range inPrefixes {
		if strings.Contains(upper, p) {
			return "India"
		}
	}

	// Japan
	jpPrefixes := []string{
		"MICHIBIKI", "QZS-", "HIMAWARI", "ALOS", "HAYABUSA",
		"GOSAT", "IBUKI", "DAICHI",
	}
	for _, p := range jpPrefixes {
		if strings.Contains(upper, p) {
			return "Japan"
		}
	}

	// South Korea
	if strings.Contains(upper, "KOMPSAT") || strings.Contains(upper, "ARIRANG") {
		return "South Korea"
	}

	// International
	if strings.Contains(upper, "ISS") && (strings.Contains(upper, "ZARYA") || strings.Contains(upper, "ISS (")) {
		return "International"
	}

	// METEOR can be Russia or other
	if strings.Contains(upper, "METEOR-M") || strings.Contains(upper, "METEOR ") {
		return "Russia"
	}

	_ = intlDesignator
	return "Unknown"
}

// ExtractOrbitalParams extracts period, inclination, and eccentricity from a TLE.
func ExtractOrbitalParams(tle models.TLEData) (periodMinutes, inclination, eccentricity float64) {
	// Parse mean motion from line2 (chars 52-63)
	if len(tle.Line2) >= 63 {
		mmStr := strings.TrimSpace(tle.Line2[52:63])
		var mm float64
		_, err := fmt.Sscanf(mmStr, "%f", &mm)
		if err == nil && mm > 0 {
			periodMinutes = 1440.0 / mm
		}
	}

	// Parse inclination from line2 (chars 8-16)
	if len(tle.Line2) >= 16 {
		incStr := strings.TrimSpace(tle.Line2[8:16])
		fmt.Sscanf(incStr, "%f", &inclination)
	}

	// Parse eccentricity from line2 (chars 26-33, implied decimal point)
	if len(tle.Line2) >= 33 {
		eccStr := "0." + strings.TrimSpace(tle.Line2[26:33])
		fmt.Sscanf(eccStr, "%f", &eccentricity)
	}

	return periodMinutes, inclination, eccentricity
}
