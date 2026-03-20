package main

import (
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/satellite-tracker/backend/internal/api"
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

	// Load TLE data from file
	tleDataPath := "data/stations.tle"
	if envPath := os.Getenv("TLE_DATA_PATH"); envPath != "" {
		tleDataPath = envPath
	}

	tleData, err := tle.ParseTLEFile(tleDataPath)
	if err != nil {
		log.Warn().Err(err).Str("path", tleDataPath).Msg("Failed to load TLE file, trying presets")
		// Fall back to loading presets
		tleData, err = tle.GetPresetTLE("stations")
		if err != nil {
			log.Fatal().Err(err).Msg("Failed to load any TLE data")
		}
	}

	if err := service.LoadFromTLE(tleData); err != nil {
		log.Fatal().Err(err).Msg("Failed to initialize satellites from TLE data")
	}

	log.Info().Int("satellites", len(tleData)).Msg("Initial TLE data loaded")

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

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Info().Msg("Shutting down server...")
		close(stopWorker)

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
