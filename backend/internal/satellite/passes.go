package satellite

import (
	"fmt"
	"math"
	"time"

	sat "github.com/joshuaferrara/go-satellite"
	"github.com/satellite-tracker/backend/internal/models"
)

// CalculatePasses predicts satellite passes over an observer location.
// It iterates in 30-second steps, detecting AOS (acquisition of signal) when
// elevation > 0 and LOS (loss of signal) when elevation drops back to < 0.
func CalculatePasses(tleData models.TLEData, observerLat, observerLng, observerAlt float64, start time.Time, hours int) ([]models.Pass, error) {
	defer func() {
		if r := recover(); r != nil {
			// Recover from any panics in the satellite library
		}
	}()

	if hours <= 0 {
		hours = 24
	}
	if hours > 168 {
		hours = 168 // Max one week
	}

	satObj := sat.TLEToSat(tleData.Line1, tleData.Line2, sat.GravityWGS84)

	observer := sat.LatLong{
		Latitude:  observerLat * deg2rad,
		Longitude: observerLng * deg2rad,
	}

	stepDuration := 30 * time.Second
	end := start.Add(time.Duration(hours) * time.Hour)

	var passes []models.Pass
	inPass := false
	var currentPass models.Pass
	var maxElev float64
	var tcaTime time.Time
	var tcaAzimuth float64
	var aosAzimuth float64

	for t := start; t.Before(end); t = t.Add(stepDuration) {
		year := t.Year()
		month := int(t.Month())
		day := t.Day()
		hour := t.Hour()
		minute := t.Minute()
		second := t.Second()

		position, _ := sat.Propagate(satObj, year, month, day, hour, minute, second)

		if math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsNaN(position.Z) {
			continue
		}

		jday := sat.JDay(year, month, day, hour, minute, second)
		lookAngles := sat.ECIToLookAngles(position, observer, observerAlt/1000.0, jday)

		elevation := lookAngles.El * rad2deg
		azimuth := math.Mod(lookAngles.Az*rad2deg+360, 360)

		if elevation > 0 {
			if !inPass {
				// AOS - start of a new pass
				inPass = true
				aosAzimuth = azimuth
				currentPass = models.Pass{
					SatelliteID:   "",
					SatelliteName: tleData.Name,
					AOS:           t.Unix(),
					AOSAzimuth:    math.Round(azimuth*10) / 10,
				}
				maxElev = elevation
				tcaTime = t
				tcaAzimuth = azimuth
			}
			if elevation > maxElev {
				maxElev = elevation
				tcaTime = t
				tcaAzimuth = azimuth
			}
		} else {
			if inPass {
				// LOS - end of the current pass
				inPass = false
				currentPass.LOS = t.Unix()
				currentPass.LOSAzimuth = math.Round(azimuth*10) / 10
				currentPass.MaxElevation = math.Round(maxElev*100) / 100
				currentPass.Duration = int(currentPass.LOS - currentPass.AOS)
				currentPass.TCA = tcaTime.Unix()
				currentPass.TCAAzimuth = math.Round(tcaAzimuth*10) / 10
				currentPass.TCAElevation = math.Round(maxElev*100) / 100
				passes = append(passes, currentPass)
				maxElev = 0
			}
		}
		_ = aosAzimuth
	}

	// Close any pass that's still open at the end of the window
	if inPass {
		currentPass.LOS = end.Unix()
		currentPass.LOSAzimuth = 0
		currentPass.MaxElevation = math.Round(maxElev*100) / 100
		currentPass.Duration = int(currentPass.LOS - currentPass.AOS)
		currentPass.TCA = tcaTime.Unix()
		currentPass.TCAAzimuth = math.Round(tcaAzimuth*10) / 10
		currentPass.TCAElevation = math.Round(maxElev*100) / 100
		passes = append(passes, currentPass)
	}

	if len(passes) == 0 {
		return []models.Pass{}, nil
	}

	return passes, nil
}

// CalculatePassTrack computes the detailed look-angle track for a single pass.
func CalculatePassTrack(tleData models.TLEData, observerLat, observerLng, observerAlt float64, aosUnix, losUnix int64) ([]models.PassTrackPoint, error) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	satObj := sat.TLEToSat(tleData.Line1, tleData.Line2, sat.GravityWGS84)
	observer := sat.LatLong{
		Latitude:  observerLat * deg2rad,
		Longitude: observerLng * deg2rad,
	}

	aosTime := time.Unix(aosUnix, 0).UTC()
	losTime := time.Unix(losUnix, 0).UTC()
	step := 10 * time.Second
	points := make([]models.PassTrackPoint, 0, int(losTime.Sub(aosTime)/step)+1)

	for t := aosTime; !t.After(losTime); t = t.Add(step) {
		year := t.Year()
		month := int(t.Month())
		day := t.Day()
		hour := t.Hour()
		minute := t.Minute()
		second := t.Second()

		position, _ := sat.Propagate(satObj, year, month, day, hour, minute, second)
		if math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsNaN(position.Z) {
			continue
		}

		jday := sat.JDay(year, month, day, hour, minute, second)
		lookAngles := sat.ECIToLookAngles(position, observer, observerAlt/1000.0, jday)

		elevation := lookAngles.El * rad2deg
		azimuth := math.Mod(lookAngles.Az*rad2deg+360, 360)

		points = append(points, models.PassTrackPoint{
			Time:      t.Unix(),
			Azimuth:   math.Round(azimuth*10) / 10,
			Elevation: math.Round(elevation*100) / 100,
		})
	}

	return points, nil
}

// CalculateElevation computes the elevation angle (in degrees) of a satellite from an observer position.
func CalculateElevation(tleData models.TLEData, observerLat, observerLng, observerAlt float64, t time.Time) (float64, error) {
	defer func() {
		if r := recover(); r != nil {
		}
	}()

	satObj := sat.TLEToSat(tleData.Line1, tleData.Line2, sat.GravityWGS84)

	observer := sat.LatLong{
		Latitude:  observerLat * deg2rad,
		Longitude: observerLng * deg2rad,
	}

	year := t.Year()
	month := int(t.Month())
	day := t.Day()
	hour := t.Hour()
	minute := t.Minute()
	second := t.Second()

	position, _ := sat.Propagate(satObj, year, month, day, hour, minute, second)

	if math.IsNaN(position.X) || math.IsNaN(position.Y) || math.IsNaN(position.Z) {
		return 0, fmt.Errorf("propagation returned NaN")
	}

	gmst := sat.GSTimeFromDate(year, month, day, hour, minute, second)
	lookAngles := sat.ECIToLookAngles(position, observer, observerAlt/1000.0, gmst)

	return lookAngles.El * rad2deg, nil
}
