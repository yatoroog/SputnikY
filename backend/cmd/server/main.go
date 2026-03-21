package main

import (
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
	"github.com/satellite-tracker/backend/internal/models"
	"github.com/satellite-tracker/backend/internal/n2yo"
	"github.com/satellite-tracker/backend/internal/satellite"
	"github.com/satellite-tracker/backend/internal/tle"
	"github.com/satellite-tracker/backend/internal/ws"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})

	log.Info().Msg("Starting SputnikX satellite tracking server")

	// Determine port
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize satellite service
	service := satellite.NewService()

	// --- Load satellites: try N2YO API first, fall back to local TLE (~500 sats) ---
	n2yoKey := strings.TrimSpace(os.Getenv("N2YO_API_KEY"))
	var n2yoClient *n2yo.Client

	if n2yoKey == "" {
		log.Warn().Msg("N2YO_API_KEY is not configured, using local TLE catalog")
		loadLocalTLE(service, "N2YO startup fetch skipped: N2YO_API_KEY is not configured.")
	} else {
		n2yoClient = n2yo.NewClient(n2yoKey)
		log.Info().Msg("Trying N2YO API for real-time satellite data...")
		tleData, err := n2yoClient.FetchGlobalTLEs(n2yo.DefaultCategories)
		if err != nil {
			log.Warn().Err(err).Msg("N2YO fetch failed (likely rate limit), using local TLE file")
			loadLocalTLE(service, fmt.Sprintf("N2YO startup fetch failed: %v", err))
		} else {
			if err := service.LoadFromTLE(tleData); err != nil {
				log.Fatal().Err(err).Msg("Failed to initialize satellites from N2YO data")
			}
			service.SetCatalogStatus(models.CatalogSourceN2YO, time.Now().UTC(), "")
			log.Info().Int("satellites", len(tleData)).Msg("Initial satellite data loaded from N2YO")
		}
	}

	// Initialize WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Initialize Fiber app
	app := fiber.New(fiber.Config{
		AppName:               "SputnikX",
		DisableStartupMessage: false,
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          10 * time.Second,
		IdleTimeout:           120 * time.Second,
	})

	// Apply middleware
	app.Use(api.CORSMiddleware())
	app.Use(api.RequestLogger())

	// Health check
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status": "ok",
			"time":   time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Setup routes
	api.SetupRoutes(app, service, hub)

	// Start background position update worker
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

	// Start background N2YO refresh worker (every 2 hours — within rate limits)
	var stopRefresh chan struct{}
	if n2yoClient != nil {
		stopRefresh = make(chan struct{})
		go func() {
			ticker := time.NewTicker(2 * time.Hour)
			defer ticker.Stop()

			log.Info().Msg("N2YO refresh worker started (2h interval)")

			for {
				select {
				case <-ticker.C:
					log.Info().Msg("Refreshing satellite data from N2YO...")
					freshData, err := n2yoClient.FetchGlobalTLEs(n2yo.DefaultCategories)
					if err != nil {
						service.UpdateCatalogNote(fmt.Sprintf(
							"N2YO refresh failed at %s: %v",
							time.Now().UTC().Format(time.RFC3339),
							err,
						))
						log.Warn().Err(err).Msg("N2YO refresh failed, keeping current data")
						continue
					}
					if err := service.ReplaceFromTLE(freshData); err != nil {
						log.Warn().Err(err).Msg("Failed to replace satellites after N2YO refresh")
						service.UpdateCatalogNote(fmt.Sprintf(
							"N2YO refresh replace failed at %s: %v",
							time.Now().UTC().Format(time.RFC3339),
							err,
						))
						continue
					}
					service.SetCatalogStatus(models.CatalogSourceN2YO, time.Now().UTC(), "")
				case <-stopRefresh:
					log.Info().Msg("N2YO refresh worker stopped")
					return
				}
			}
		}()
	}

	// Graceful shutdown
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

	// Start server
	log.Info().Str("port", port).Msg("Server listening")
	if err := app.Listen(":" + port); err != nil {
		log.Fatal().Err(err).Msg("Server failed to start")
	}
}

// loadLocalTLE loads satellites from a local TLE file (fallback).
func loadLocalTLE(service *satellite.SatelliteService, note string) {
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

	if err := service.LoadFromTLE(tleData); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize satellites from TLE data")
	}
	service.SetCatalogStatus(models.CatalogSourceLocalTLE, time.Now().UTC(), note)

	log.Info().Int("satellites", len(tleData)).Msg("Initial TLE data loaded from local file")
}
