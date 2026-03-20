package api

import (
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/satellite-tracker/backend/internal/satellite"
	"github.com/satellite-tracker/backend/internal/ws"
)

// SetupRoutes configures all HTTP and WebSocket routes on the Fiber app.
func SetupRoutes(app *fiber.App, service *satellite.SatelliteService, hub *ws.Hub) {
	handlers := NewHandlers(service)

	// API routes
	api := app.Group("/api")

	// Satellite endpoints
	api.Get("/satellites", handlers.GetSatellites)
	api.Get("/satellites/:id", handlers.GetSatelliteByID)
	api.Get("/satellites/:id/orbit", handlers.GetSatelliteOrbit)

	// Pass predictions
	api.Get("/passes", handlers.GetPasses)
	api.Get("/passes/area", handlers.GetAreaPasses)

	// TLE management
	api.Post("/tle/upload", handlers.UploadTLE)
	api.Get("/tle/presets", handlers.GetPresets)
	api.Post("/tle/presets/:name", handlers.LoadPreset)

	// WebSocket endpoint for real-time position updates
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws/positions", websocket.New(func(conn *websocket.Conn) {
		client := ws.NewClient(hub, conn)
		hub.Register(client)

		go client.WritePump()
		client.ReadPump()
	}))
}
