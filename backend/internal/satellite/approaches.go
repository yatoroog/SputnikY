package satellite

import (
	"fmt"
	"math"
	"time"

	"github.com/satellite-tracker/backend/internal/models"
)

const earthRadiusKm = 6371.0

func roundFloat(value float64, precision int) float64 {
	if precision < 0 {
		return value
	}

	factor := math.Pow(10, float64(precision))
	return math.Round(value*factor) / factor
}

func haversineKm(lat1, lng1, lat2, lng2 float64) float64 {
	lat1Rad := lat1 * deg2rad
	lat2Rad := lat2 * deg2rad
	deltaLat := (lat2 - lat1) * deg2rad
	deltaLng := (lng2 - lng1) * deg2rad

	sinLat := math.Sin(deltaLat / 2)
	sinLng := math.Sin(deltaLng / 2)

	a := sinLat*sinLat + math.Cos(lat1Rad)*math.Cos(lat2Rad)*sinLng*sinLng
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadiusKm * c
}

// CalculateApproaches predicts intervals when the satellite's ground track comes
// within the given radius from the observer point.
func CalculateApproaches(
	tleData models.TLEData,
	observerLat, observerLng, radiusKm float64,
	start time.Time,
	hours int,
	notifyBefore time.Duration,
) ([]models.Approach, error) {
	if radiusKm <= 0 {
		return nil, fmt.Errorf("radius must be positive")
	}

	if hours <= 0 {
		hours = 4
	}
	if hours > 168 {
		hours = 168
	}

	if notifyBefore < 0 {
		notifyBefore = 0
	}

	start = start.UTC()
	stepDuration := 30 * time.Second
	end := start.Add(time.Duration(hours) * time.Hour)

	var approaches []models.Approach
	var currentApproach models.Approach
	var closestDistance float64
	inApproach := false

	for t := start; !t.After(end); t = t.Add(stepDuration) {
		lat, lng, alt, err := Propagate(tleData, t)
		if err != nil {
			continue
		}

		distanceKm := haversineKm(observerLat, observerLng, lat, lng)
		isInsideRadius := distanceKm <= radiusKm

		if isInsideRadius {
			if !inApproach {
				inApproach = true
				closestDistance = distanceKm
				currentApproach = models.Approach{
					SatelliteName:     tleData.Name,
					StartAt:           t.Unix(),
					ClosestAt:         t.Unix(),
					NotifyAt:          t.Add(-notifyBefore).Unix(),
					MinDistanceKm:     roundFloat(distanceKm, 2),
					RadiusKm:          roundFloat(radiusKm, 2),
					ClosestLatitude:   roundFloat(lat, 4),
					ClosestLongitude:  roundFloat(lng, 4),
					ClosestAltitudeKm: roundFloat(alt, 2),
				}
			}

			if distanceKm <= closestDistance {
				closestDistance = distanceKm
				currentApproach.ClosestAt = t.Unix()
				currentApproach.MinDistanceKm = roundFloat(distanceKm, 2)
				currentApproach.ClosestLatitude = roundFloat(lat, 4)
				currentApproach.ClosestLongitude = roundFloat(lng, 4)
				currentApproach.ClosestAltitudeKm = roundFloat(alt, 2)
			}

			continue
		}

		if !inApproach {
			continue
		}

		inApproach = false
		currentApproach.EndAt = t.Unix()
		currentApproach.Duration = int(time.Unix(currentApproach.EndAt, 0).Sub(time.Unix(currentApproach.StartAt, 0)).Seconds())

		if velocity, err := CalculateVelocity(tleData, time.Unix(currentApproach.ClosestAt, 0).UTC()); err == nil {
			currentApproach.ClosestVelocityKmS = roundFloat(velocity, 2)
		}

		approaches = append(approaches, currentApproach)
	}

	if inApproach {
		currentApproach.EndAt = end.Unix()
		currentApproach.Duration = int(time.Unix(currentApproach.EndAt, 0).Sub(time.Unix(currentApproach.StartAt, 0)).Seconds())

		if velocity, err := CalculateVelocity(tleData, time.Unix(currentApproach.ClosestAt, 0).UTC()); err == nil {
			currentApproach.ClosestVelocityKmS = roundFloat(velocity, 2)
		}

		approaches = append(approaches, currentApproach)
	}

	if len(approaches) == 0 {
		return []models.Approach{}, nil
	}

	return approaches, nil
}
