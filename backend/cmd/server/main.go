package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/satellite-tracker/backend/internal/api"
	"github.com/satellite-tracker/backend/internal/celestrak"
	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/n2yo"
	"github.com/satellite-tracker/backend/internal/satellite"
	"github.com/satellite-tracker/backend/internal/store"
	"github.com/satellite-tracker/backend/internal/tle"
	"github.com/satellite-tracker/backend/internal/ws"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	log.Info().Msg("Starting SputnikX satellite tracking server")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	bootstrapCtx := context.Background()

	databaseConfig := store.LoadConfigFromEnv()
	catalogStore, err := store.NewPostgresStore(bootstrapCtx, databaseConfig)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer catalogStore.Close()

	if err := catalogStore.RunMigrations(bootstrapCtx); err != nil {
		log.Fatal().Err(err).Msg("Failed to apply PostgreSQL migrations")
	}

	service := satellite.NewService(celestrak.NewClient(), catalogStore)

	hydratedFromStore, err := service.HydrateFromStore(bootstrapCtx)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to restore catalog from PostgreSQL")
	}

	n2yoKey := strings.TrimSpace(os.Getenv("N2YO_API_KEY"))
	var n2yoClient *n2yo.Client
	if n2yoKey != "" {
		n2yoClient = n2yo.NewClient(n2yoKey)
	}

	if !hydratedFromStore {
		if n2yoClient == nil {
			log.Warn().Msg("N2YO_API_KEY is not configured, using local TLE catalog bootstrap")
			loadLocalTLE(bootstrapCtx, service, "N2YO startup fetch skipped: N2YO_API_KEY is not configured.")
		} else {
			log.Info().Msg("Trying N2YO API for initial satellite catalog bootstrap...")
			if err := refreshCatalogFromN2YO(bootstrapCtx, service, n2yoClient); err != nil {
				log.Warn().Err(err).Msg("N2YO bootstrap failed, using local TLE file")
				loadLocalTLE(bootstrapCtx, service, fmt.Sprintf("N2YO startup fetch failed: %v", err))
			}
		}
	} else {
		log.Info().Msg("Using PostgreSQL catalog snapshot as startup source")
	}

	hub := ws.NewHub()
	go hub.Run()

	app := fiber.New(fiber.Config{
		AppName:               "SputnikX",
		DisableStartupMessage: false,
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          10 * time.Second,
		IdleTimeout:           120 * time.Second,
	})

	app.Use(api.CORSMiddleware())
	app.Use(api.RequestLogger())

	app.Get("/health", func(c *fiber.Ctx) error {
		healthCtx, cancel := context.WithTimeout(c.UserContext(), 2*time.Second)
		defer cancel()

		healthStatus := "ok"
		dbStatus := "ok"
		statusCode := fiber.StatusOK
		if err := catalogStore.Ping(healthCtx); err != nil {
			healthStatus = "degraded"
			dbStatus = err.Error()
			statusCode = fiber.StatusServiceUnavailable
		}

		return c.Status(statusCode).JSON(fiber.Map{
			"status":               healthStatus,
			"time":                 time.Now().UTC().Format(time.RFC3339),
			"database":             dbStatus,
			"satellites_in_memory": service.Count(),
		})
	})

	api.SetupRoutes(app, service, hub)

	stopWorker := make(chan struct{})
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()

		log.Info().Msg("Background position update worker started (2s interval)")

		for {
			select {
			case <-ticker.C:
				now := time.Now().UTC()
				service.UpdatePositions(now)
				positions := service.GetPositions()
				hub.BroadcastPositions(positions)
			case <-stopWorker:
				log.Info().Msg("Background worker stopped")
				return
			}
		}
	}()

	var stopRefresh chan struct{}
	if n2yoClient != nil {
		stopRefresh = make(chan struct{})
		go func() {
			ticker := time.NewTicker(2 * time.Hour)
			defer ticker.Stop()

			log.Info().Msg("N2YO refresh worker started (2h interval)")

			runRefresh := func(reason string) {
				log.Info().Str("reason", reason).Msg("Refreshing satellite data from N2YO")
				if err := refreshCatalogFromN2YO(context.Background(), service, n2yoClient); err != nil {
					service.UpdateCatalogNote(
						context.Background(),
						fmt.Sprintf(
							"N2YO refresh failed at %s: %v",
							time.Now().UTC().Format(time.RFC3339),
							err,
						),
					)
					log.Warn().Err(err).Msg("N2YO refresh failed, keeping current catalog")
				}
			}

			if hydratedFromStore {
				runRefresh("startup_db_hydrate")
			}

			for {
				select {
				case <-ticker.C:
					runRefresh("scheduled")
				case <-stopRefresh:
					log.Info().Msg("N2YO refresh worker stopped")
					return
				}
			}
		}()
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Info().Msg("Shutting down server...")
		close(stopWorker)
		if stopRefresh != nil {
			close(stopRefresh)
		}

		if err := app.ShutdownWithTimeout(5 * time.Second); err != nil {
			log.Error().Err(err).Msg("Server forced to shutdown")
		}
	}()

	log.Info().Str("port", port).Msg("Server listening")
	if err := app.Listen(":" + port); err != nil {
		log.Fatal().Err(err).Msg("Server failed to start")
	}
}

func refreshCatalogFromN2YO(
	ctx context.Context,
	service *satellite.SatelliteService,
	n2yoClient *n2yo.Client,
) error {
	tleData, err := n2yoClient.FetchGlobalTLEs(n2yo.DefaultCategories)
	if err != nil {
		return err
	}

	if err := service.ImportCatalog(
		ctx,
		tleData,
		models.CatalogSourceN2YO,
		models.CatalogImportModeReplace,
		"",
		time.Now().UTC(),
	); err != nil {
		return fmt.Errorf("replace catalog from N2YO: %w", err)
	}

	log.Info().Int("satellites", len(tleData)).Msg("Satellite catalog refreshed from N2YO")
	return nil
}

// loadLocalTLE loads satellites from a local TLE file as the initial persisted catalog.
func loadLocalTLE(ctx context.Context, service *satellite.SatelliteService, note string) {
	tleDataPath := "data/stations.tle"
	if envPath := os.Getenv("TLE_DATA_PATH"); envPath != "" {
		tleDataPath = envPath
	}

	tleData, err := tle.ParseTLEFile(tleDataPath)
	if err != nil {
		log.Warn().Err(err).Str("path", tleDataPath).Msg("Failed to load TLE file, trying presets")
		tleData, err = tle.GetPresetTLE("stations")
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to load any TLE data")
		}
	}

	if err := service.ImportCatalog(
		ctx,
		tleData,
		models.CatalogSourceLocalTLE,
		models.CatalogImportModeReplace,
		note,
		time.Now().UTC(),
	); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize satellites from local TLE data")
	}

	log.Info().Int("satellites", len(tleData)).Msg("Initial TLE data loaded from local file")
}
