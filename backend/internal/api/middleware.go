package api

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/rs/zerolog/log"
)

// CORSMiddleware returns a CORS middleware configured for the application.
func CORSMiddleware() fiber.Handler {
	return cors.New(cors.Config{
		AllowOriginsFunc: func(origin string) bool {
			return true
		},
		AllowMethods:     "GET,POST,PUT,DELETE,OPTIONS",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		ExposeHeaders:    "Content-Length",
		AllowCredentials: false,
		MaxAge:           3600,
	})
}

// RequestLogger is a middleware that logs every HTTP request using zerolog.
func RequestLogger() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()

		err := c.Next()

		duration := time.Since(start)
		status := c.Response().StatusCode()

		logEvent := log.Info()
		if status >= 400 && status < 500 {
			logEvent = log.Warn()
		} else if status >= 500 {
			logEvent = log.Error()
		}

		logEvent.
			Str("method", c.Method()).
			Str("path", c.Path()).
			Int("status", status).
			Dur("duration", duration).
			Str("ip", c.IP()).
			Str("user_agent", c.Get("User-Agent")).
			Msg("HTTP request")

		return err
	}
}
