package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/satellite-tracker/backend/internal/models"
)

const (
	activeCatalogStateKey = "active_catalog"
	readTimeout           = 5 * time.Second
	writeTimeout          = 20 * time.Second
)

// PostgresStore persists the active catalog and its runtime state in PostgreSQL.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore opens a PostgreSQL connection pool.
func NewPostgresStore(ctx context.Context, config Config) (*PostgresStore, error) {
	poolConfig, err := pgxpool.ParseConfig(config.ConnectionString())
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}

	if config.MaxConns > 0 {
		poolConfig.MaxConns = config.MaxConns
	}
	if config.MinConns > 0 {
		poolConfig.MinConns = config.MinConns
	}

	connectCtx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()

	pool, err := pgxpool.NewWithConfig(connectCtx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("connect to postgres: %w", err)
	}

	store := &PostgresStore{pool: pool}
	if err := store.Ping(connectCtx); err != nil {
		pool.Close()
		return nil, err
	}

	return store, nil
}

// Close closes the underlying pgx pool.
func (s *PostgresStore) Close() {
	if s == nil || s.pool == nil {
		return
	}
	s.pool.Close()
}

// Ping verifies connectivity to PostgreSQL.
func (s *PostgresStore) Ping(ctx context.Context) error {
	pingCtx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	if err := s.pool.Ping(pingCtx); err != nil {
		return fmt.Errorf("ping postgres: %w", err)
	}

	return nil
}

// LoadCatalog returns the last persisted active catalog and its status.
func (s *PostgresStore) LoadCatalog(ctx context.Context) ([]*models.Satellite, models.CatalogStatus, error) {
	satellites, err := s.ListSatellites(ctx, models.FilterParams{})
	if err != nil {
		return nil, models.CatalogStatus{}, err
	}

	status, err := s.GetCatalogStatus(ctx)
	if err != nil {
		return nil, models.CatalogStatus{}, err
	}

	return satellites, status, nil
}

// ListSatellites returns satellites matching filters from PostgreSQL.
func (s *PostgresStore) ListSatellites(ctx context.Context, filters models.FilterParams) ([]*models.Satellite, error) {
	queryCtx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	query := `
		SELECT
			id,
			name,
			norad_id,
			country,
			owner_code,
			owner_name,
			orbit_type,
			purpose,
			latitude,
			longitude,
			altitude,
			velocity,
			period,
			inclination,
			epoch,
			tle_name,
			tle_line1,
			tle_line2
		FROM satellites
	`

	conditions := make([]string, 0, 4)
	args := make([]any, 0, 4)
	argPos := 1

	if filters.Country != "" {
		conditions = append(conditions, fmt.Sprintf("country ILIKE $%d", argPos))
		args = append(args, filters.Country)
		argPos++
	}
	if filters.OrbitType != "" {
		conditions = append(conditions, fmt.Sprintf("orbit_type ILIKE $%d", argPos))
		args = append(args, filters.OrbitType)
		argPos++
	}
	if filters.Purpose != "" {
		conditions = append(conditions, fmt.Sprintf("purpose ILIKE $%d", argPos))
		args = append(args, filters.Purpose)
		argPos++
	}
	if filters.Search != "" {
		conditions = append(
			conditions,
			fmt.Sprintf("name ILIKE '%%' || $%d || '%%'", argPos),
		)
		args = append(args, filters.Search)
		argPos++
	}

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY LOWER(name), norad_id"

	rows, err := s.pool.Query(queryCtx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query satellites: %w", err)
	}
	defer rows.Close()

	satellites := make([]*models.Satellite, 0)
	for rows.Next() {
		satellite, err := scanSatellite(rows)
		if err != nil {
			return nil, err
		}
		satellites = append(satellites, satellite)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate satellites: %w", err)
	}

	return satellites, nil
}

// GetSatellite returns a single satellite by ID from PostgreSQL.
func (s *PostgresStore) GetSatellite(ctx context.Context, id string) (*models.Satellite, error) {
	queryCtx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	row := s.pool.QueryRow(queryCtx, `
		SELECT
			id,
			name,
			norad_id,
			country,
			owner_code,
			owner_name,
			orbit_type,
			purpose,
			latitude,
			longitude,
			altitude,
			velocity,
			period,
			inclination,
			epoch,
			tle_name,
			tle_line1,
			tle_line2
		FROM satellites
		WHERE id = $1
	`, id)

	satellite, err := scanSatellite(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("satellite not found: %s", id)
		}
		return nil, err
	}

	return satellite, nil
}

// GetFilterFacets returns distinct countries and purposes from PostgreSQL.
func (s *PostgresStore) GetFilterFacets(ctx context.Context) (models.FilterFacets, error) {
	countries, err := s.queryDistinctStrings(
		ctx,
		`SELECT DISTINCT country FROM satellites WHERE country <> '' ORDER BY country`,
	)
	if err != nil {
		return models.FilterFacets{}, err
	}

	purposes, err := s.queryDistinctStrings(
		ctx,
		`SELECT DISTINCT purpose FROM satellites WHERE purpose <> '' ORDER BY purpose`,
	)
	if err != nil {
		return models.FilterFacets{}, err
	}

	return models.FilterFacets{
		Countries: countries,
		Purposes:  purposes,
	}, nil
}

// GetCatalogStatus returns the latest persisted catalog status.
func (s *PostgresStore) GetCatalogStatus(ctx context.Context) (models.CatalogStatus, error) {
	queryCtx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	var status models.CatalogStatus
	var lastSyncAt *time.Time

	err := s.pool.QueryRow(queryCtx, `
		SELECT source, last_sync_at, note
		FROM catalog_state
		WHERE state_key = $1
	`, activeCatalogStateKey).Scan(&status.Source, &lastSyncAt, &status.Note)
	if err != nil {
		if err == pgx.ErrNoRows {
			return models.CatalogStatus{Source: models.CatalogSourceUnknown}, nil
		}
		return models.CatalogStatus{}, fmt.Errorf("query catalog status: %w", err)
	}

	status.LastSyncAt = cloneTimePtr(lastSyncAt)
	return status, nil
}

// SaveCatalog persists the current catalog and updates the active catalog status.
func (s *PostgresStore) SaveCatalog(
	ctx context.Context,
	satellites []*models.Satellite,
	status models.CatalogStatus,
	mode string,
) error {
	writeCtx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()

	tx, err := s.pool.Begin(writeCtx)
	if err != nil {
		return fmt.Errorf("begin save catalog transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback(writeCtx)
	}()

	if err := s.upsertSatellites(writeCtx, tx, satellites, status.Source); err != nil {
		return err
	}

	if mode == models.CatalogImportModeReplace {
		if err := deleteMissingSatellites(writeCtx, tx, satellites); err != nil {
			return err
		}
	}

	totalSatellites, err := countSatellites(writeCtx, tx)
	if err != nil {
		return err
	}

	if _, err := tx.Exec(writeCtx, `
		INSERT INTO catalog_state (
			state_key,
			source,
			last_sync_at,
			note,
			satellite_count,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (state_key) DO UPDATE
		SET
			source = EXCLUDED.source,
			last_sync_at = EXCLUDED.last_sync_at,
			note = EXCLUDED.note,
			satellite_count = EXCLUDED.satellite_count,
			updated_at = NOW()
	`,
		activeCatalogStateKey,
		status.Source,
		status.LastSyncAt,
		normalizedNote(status.Note),
		totalSatellites,
	); err != nil {
		return fmt.Errorf("upsert catalog state: %w", err)
	}

	if _, err := tx.Exec(writeCtx, `
		INSERT INTO catalog_imports (
			source,
			mode,
			note,
			imported_count,
			total_satellites
		)
		VALUES ($1, $2, $3, $4, $5)
	`,
		status.Source,
		mode,
		normalizedNote(status.Note),
		len(satellites),
		totalSatellites,
	); err != nil {
		return fmt.Errorf("insert catalog import history: %w", err)
	}

	if err := tx.Commit(writeCtx); err != nil {
		return fmt.Errorf("commit save catalog transaction: %w", err)
	}

	return nil
}

// UpdateCatalogNote updates the note for the active catalog status row.
func (s *PostgresStore) UpdateCatalogNote(ctx context.Context, note string) error {
	writeCtx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()

	if _, err := s.pool.Exec(writeCtx, `
		INSERT INTO catalog_state (state_key, source, note, satellite_count, updated_at)
		VALUES ($1, $2, $3, 0, NOW())
		ON CONFLICT (state_key) DO UPDATE
		SET
			note = EXCLUDED.note,
			updated_at = NOW()
	`,
		activeCatalogStateKey,
		models.CatalogSourceUnknown,
		normalizedNote(note),
	); err != nil {
		return fmt.Errorf("update catalog note: %w", err)
	}

	return nil
}

// UpdateSatellitePositions persists live satellite positions in a single batch query.
func (s *PostgresStore) UpdateSatellitePositions(
	ctx context.Context,
	updates []models.SatellitePositionUpdate,
	updatedAt time.Time,
) error {
	if len(updates) == 0 {
		return nil
	}

	writeCtx, cancel := withTimeout(ctx, writeTimeout)
	defer cancel()

	ids := make([]string, 0, len(updates))
	latitudes := make([]float64, 0, len(updates))
	longitudes := make([]float64, 0, len(updates))
	altitudes := make([]float64, 0, len(updates))
	velocities := make([]float64, 0, len(updates))

	for _, update := range updates {
		ids = append(ids, update.ID)
		latitudes = append(latitudes, update.Latitude)
		longitudes = append(longitudes, update.Longitude)
		altitudes = append(altitudes, update.Altitude)
		velocities = append(velocities, update.Velocity)
	}

	if _, err := s.pool.Exec(writeCtx, `
		UPDATE satellites AS s
		SET
			latitude = payload.latitude,
			longitude = payload.longitude,
			altitude = payload.altitude,
			velocity = payload.velocity,
			position_updated_at = $6,
			updated_at = NOW()
		FROM (
			SELECT
				UNNEST($1::text[]) AS id,
				UNNEST($2::double precision[]) AS latitude,
				UNNEST($3::double precision[]) AS longitude,
				UNNEST($4::double precision[]) AS altitude,
				UNNEST($5::double precision[]) AS velocity
		) AS payload
		WHERE s.id = payload.id
	`,
		ids,
		latitudes,
		longitudes,
		altitudes,
		velocities,
		updatedAt.UTC(),
	); err != nil {
		return fmt.Errorf("update satellite positions: %w", err)
	}

	return nil
}

func (s *PostgresStore) upsertSatellites(
	ctx context.Context,
	tx pgx.Tx,
	satellites []*models.Satellite,
	source string,
) error {
	if len(satellites) == 0 {
		return nil
	}

	positionUpdatedAt := time.Now().UTC()
	batch := &pgx.Batch{}
	for _, satellite := range satellites {
		batch.Queue(`
			INSERT INTO satellites (
				id,
				norad_id,
				name,
				country,
				owner_code,
				owner_name,
				orbit_type,
				purpose,
				latitude,
				longitude,
				altitude,
				velocity,
				period,
				inclination,
				epoch,
				tle_name,
				tle_line1,
				tle_line2,
				source,
				position_updated_at,
				updated_at
			)
			VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
				$11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()
			)
			ON CONFLICT (norad_id) DO UPDATE
			SET
				id = EXCLUDED.id,
				name = EXCLUDED.name,
				country = EXCLUDED.country,
				owner_code = EXCLUDED.owner_code,
				owner_name = EXCLUDED.owner_name,
				orbit_type = EXCLUDED.orbit_type,
				purpose = EXCLUDED.purpose,
				latitude = EXCLUDED.latitude,
				longitude = EXCLUDED.longitude,
				altitude = EXCLUDED.altitude,
				velocity = EXCLUDED.velocity,
				period = EXCLUDED.period,
				inclination = EXCLUDED.inclination,
				epoch = EXCLUDED.epoch,
				tle_name = EXCLUDED.tle_name,
				tle_line1 = EXCLUDED.tle_line1,
				tle_line2 = EXCLUDED.tle_line2,
				source = EXCLUDED.source,
				position_updated_at = EXCLUDED.position_updated_at,
				updated_at = NOW()
		`,
			satellite.ID,
			satellite.NoradID,
			satellite.Name,
			satellite.Country,
			satellite.OwnerCode,
			satellite.OwnerName,
			satellite.OrbitType,
			satellite.Purpose,
			satellite.Latitude,
			satellite.Longitude,
			satellite.Altitude,
			satellite.Velocity,
			satellite.Period,
			satellite.Inclination,
			satellite.Epoch,
			satellite.TLE.Name,
			satellite.TLE.Line1,
			satellite.TLE.Line2,
			source,
			positionUpdatedAt,
		)
	}

	results := tx.SendBatch(ctx, batch)
	for range satellites {
		if _, err := results.Exec(); err != nil {
			_ = results.Close()
			return fmt.Errorf("upsert satellite: %w", err)
		}
	}

	if err := results.Close(); err != nil {
		return fmt.Errorf("close upsert batch: %w", err)
	}

	return nil
}

func (s *PostgresStore) queryDistinctStrings(ctx context.Context, query string) ([]string, error) {
	queryCtx, cancel := withTimeout(ctx, readTimeout)
	defer cancel()

	rows, err := s.pool.Query(queryCtx, query)
	if err != nil {
		return nil, fmt.Errorf("query distinct values: %w", err)
	}
	defer rows.Close()

	values := make([]string, 0)
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, fmt.Errorf("scan distinct value: %w", err)
		}
		if value == "" {
			continue
		}
		values = append(values, value)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate distinct values: %w", err)
	}

	return values, nil
}

func deleteMissingSatellites(ctx context.Context, tx pgx.Tx, satellites []*models.Satellite) error {
	if len(satellites) == 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM satellites`); err != nil {
			return fmt.Errorf("clear satellites on replace: %w", err)
		}
		return nil
	}

	noradIDs := make([]int32, 0, len(satellites))
	for _, satellite := range satellites {
		noradIDs = append(noradIDs, int32(satellite.NoradID))
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM satellites
		WHERE NOT (norad_id = ANY($1::integer[]))
	`, noradIDs); err != nil {
		return fmt.Errorf("delete missing satellites on replace: %w", err)
	}

	return nil
}

func countSatellites(ctx context.Context, tx pgx.Tx) (int, error) {
	var total int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM satellites`).Scan(&total); err != nil {
		return 0, fmt.Errorf("count satellites: %w", err)
	}
	return total, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSatellite(value scanner) (*models.Satellite, error) {
	satellite := &models.Satellite{}
	var tleName string
	var tleLine1 string
	var tleLine2 string

	if err := value.Scan(
		&satellite.ID,
		&satellite.Name,
		&satellite.NoradID,
		&satellite.Country,
		&satellite.OwnerCode,
		&satellite.OwnerName,
		&satellite.OrbitType,
		&satellite.Purpose,
		&satellite.Latitude,
		&satellite.Longitude,
		&satellite.Altitude,
		&satellite.Velocity,
		&satellite.Period,
		&satellite.Inclination,
		&satellite.Epoch,
		&tleName,
		&tleLine1,
		&tleLine2,
	); err != nil {
		return nil, fmt.Errorf("scan satellite row: %w", err)
	}

	satellite.TLE = models.TLEData{
		Name:  tleName,
		Line1: tleLine1,
		Line2: tleLine2,
	}

	return satellite, nil
}

func withTimeout(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if ctx == nil {
		return context.WithTimeout(context.Background(), timeout)
	}
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return ctx, func() {}
	}
	return context.WithTimeout(ctx, timeout)
}

func normalizedNote(note string) string {
	return strings.TrimSpace(note)
}

func cloneTimePtr(ts *time.Time) *time.Time {
	if ts == nil {
		return nil
	}

	value := ts.UTC()
	return &value
}
