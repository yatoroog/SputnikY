package satellite

import (
	"math"
	"time"

	sat "github.com/joshuaferrara/go-satellite"
	"github.com/satellite-tracker/backend/internal/models"
)

// eciDistance computes the Euclidean distance in km between two ECI position vectors.
func eciDistance(a, b sat.Vector3) float64 {
	dx := a.X - b.X
	dy := a.Y - b.Y
	dz := a.Z - b.Z
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}

// CalculateConjunctions finds close approaches between a target satellite and
// a list of candidates within the given time window.
// Pre-filters candidates by orbital altitude (±altFilterKm) to reduce computation.
func CalculateConjunctions(
	target models.Satellite,
	candidates []*models.Satellite,
	start time.Time,
	hours int,
	thresholdKm float64,
	altFilterKm float64,
) []models.Conjunction {
	if hours <= 0 {
		hours = 24
	}
	if hours > 48 {
		hours = 48
	}
	if thresholdKm <= 0 {
		thresholdKm = 50
	}
	if altFilterKm <= 0 {
		altFilterKm = 100
	}

	targetAlt := target.Altitude

	// Pre-filter: only consider satellites within altitude range
	filtered := make([]*models.Satellite, 0, len(candidates)/4)
	for _, c := range candidates {
		if c.ID == target.ID {
			continue
		}
		if math.Abs(c.Altitude-targetAlt) <= altFilterKm {
			filtered = append(filtered, c)
		}
	}

	if len(filtered) == 0 {
		return []models.Conjunction{}
	}

	targetSat := sat.TLEToSat(target.TLE.Line1, target.TLE.Line2, sat.GravityWGS84)

	type candidateSat struct {
		model  *models.Satellite
		satObj sat.Satellite
	}

	candSats := make([]candidateSat, 0, len(filtered))
	for _, c := range filtered {
		func() {
			defer func() { recover() }()
			obj := sat.TLEToSat(c.TLE.Line1, c.TLE.Line2, sat.GravityWGS84)
			candSats = append(candSats, candidateSat{model: c, satObj: obj})
		}()
	}

	step := 60 * time.Second
	end := start.Add(time.Duration(hours) * time.Hour)

	type conjState struct {
		active     bool
		minDist    float64
		closestAt  time.Time
		sat1Pos    sat.Vector3
		sat2Pos    sat.Vector3
	}

	states := make([]conjState, len(candSats))
	var results []models.Conjunction

	for t := start; t.Before(end); t = t.Add(step) {
		year := t.Year()
		month := int(t.Month())
		day := t.Day()
		hour := t.Hour()
		minute := t.Minute()
		second := t.Second()

		targetPos, _ := sat.Propagate(targetSat, year, month, day, hour, minute, second)
		if math.IsNaN(targetPos.X) {
			continue
		}

		for i, cs := range candSats {
			func() {
				defer func() { recover() }()

				candPos, _ := sat.Propagate(cs.satObj, year, month, day, hour, minute, second)
				if math.IsNaN(candPos.X) {
					return
				}

				dist := eciDistance(targetPos, candPos)

				if dist <= thresholdKm {
					if !states[i].active {
						states[i].active = true
						states[i].minDist = dist
						states[i].closestAt = t
						states[i].sat1Pos = targetPos
						states[i].sat2Pos = candPos
					} else if dist < states[i].minDist {
						states[i].minDist = dist
						states[i].closestAt = t
						states[i].sat1Pos = targetPos
						states[i].sat2Pos = candPos
					}
				} else if states[i].active {
					// End of conjunction event
					states[i].active = false
					ct := states[i].closestAt

					gmst := sat.GSTimeFromDate(ct.Year(), int(ct.Month()), ct.Day(), ct.Hour(), ct.Minute(), ct.Second())
					_, _, geo1 := sat.ECIToLLA(states[i].sat1Pos, gmst)
					_, _, geo2 := sat.ECIToLLA(states[i].sat2Pos, gmst)

					lat1 := geo1.Latitude * rad2deg
					lng1 := geo1.Longitude * rad2deg
					alt1, _, _ := sat.ECIToLLA(states[i].sat1Pos, gmst)
					lat2 := geo2.Latitude * rad2deg
					lng2 := geo2.Longitude * rad2deg
					alt2, _, _ := sat.ECIToLLA(states[i].sat2Pos, gmst)

					results = append(results, models.Conjunction{
						Satellite1ID:   target.ID,
						Satellite1Name: target.Name,
						Satellite2ID:   cs.model.ID,
						Satellite2Name: cs.model.Name,
						ClosestAt:      ct.Unix(),
						MinDistanceKm:  roundFloat(states[i].minDist, 2),
						Sat1Lat:        roundFloat(lat1, 4),
						Sat1Lng:        roundFloat(lng1, 4),
						Sat1Alt:        roundFloat(alt1, 2),
						Sat2Lat:        roundFloat(lat2, 4),
						Sat2Lng:        roundFloat(lng2, 4),
						Sat2Alt:        roundFloat(alt2, 2),
					})
				}
			}()
		}
	}

	// Close any active conjunctions
	for i, cs := range candSats {
		if !states[i].active {
			continue
		}

		ct := states[i].closestAt
		gmst := sat.GSTimeFromDate(ct.Year(), int(ct.Month()), ct.Day(), ct.Hour(), ct.Minute(), ct.Second())
		_, _, geo1 := sat.ECIToLLA(states[i].sat1Pos, gmst)
		_, _, geo2 := sat.ECIToLLA(states[i].sat2Pos, gmst)

		lat1 := geo1.Latitude * rad2deg
		lng1 := geo1.Longitude * rad2deg
		alt1, _, _ := sat.ECIToLLA(states[i].sat1Pos, gmst)
		lat2 := geo2.Latitude * rad2deg
		lng2 := geo2.Longitude * rad2deg
		alt2, _, _ := sat.ECIToLLA(states[i].sat2Pos, gmst)

		results = append(results, models.Conjunction{
			Satellite1ID:   target.ID,
			Satellite1Name: target.Name,
			Satellite2ID:   cs.model.ID,
			Satellite2Name: cs.model.Name,
			ClosestAt:      ct.Unix(),
			MinDistanceKm:  roundFloat(states[i].minDist, 2),
			Sat1Lat:        roundFloat(lat1, 4),
			Sat1Lng:        roundFloat(lng1, 4),
			Sat1Alt:        roundFloat(alt1, 2),
			Sat2Lat:        roundFloat(lat2, 4),
			Sat2Lng:        roundFloat(lng2, 4),
			Sat2Alt:        roundFloat(alt2, 2),
		})
	}

	return results
}
