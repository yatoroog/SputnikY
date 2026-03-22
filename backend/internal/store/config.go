package store

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const (
	defaultDatabaseHost     = "127.0.0.1"
	defaultDatabasePort     = "5432"
	defaultDatabaseName     = "sputnikx"
	defaultDatabaseUser     = "sputnikx"
	defaultDatabasePassword = "sputnikx"
	defaultDatabaseSSLMode  = "disable"
)

// Config describes how the backend connects to PostgreSQL.
type Config struct {
	URL      string
	Host     string
	Port     string
	Database string
	User     string
	Password string
	SSLMode  string
	MaxConns int32
	MinConns int32
}

// LoadConfigFromEnv builds database configuration from environment variables.
func LoadConfigFromEnv() Config {
	return Config{
		URL:      stringsTrimSpace(os.Getenv("DATABASE_URL")),
		Host:     envOrDefault("POSTGRES_HOST", defaultDatabaseHost),
		Port:     envOrDefault("POSTGRES_PORT", defaultDatabasePort),
		Database: envOrDefault("POSTGRES_DB", defaultDatabaseName),
		User:     envOrDefault("POSTGRES_USER", defaultDatabaseUser),
		Password: envOrDefault("POSTGRES_PASSWORD", defaultDatabasePassword),
		SSLMode:  envOrDefault("POSTGRES_SSLMODE", defaultDatabaseSSLMode),
		MaxConns: envInt32OrDefault("DATABASE_MAX_CONNS", 10),
		MinConns: envInt32OrDefault("DATABASE_MIN_CONNS", 1),
	}
}

// ConnectionString returns a pgx-compatible DSN.
func (c Config) ConnectionString() string {
	if c.URL != "" {
		return c.URL
	}

	query := url.Values{}
	query.Set("sslmode", c.SSLMode)

	dsn := &url.URL{
		Scheme:   "postgres",
		Host:     fmt.Sprintf("%s:%s", c.Host, c.Port),
		Path:     c.Database,
		RawQuery: query.Encode(),
	}

	if c.User != "" {
		if c.Password != "" {
			dsn.User = url.UserPassword(c.User, c.Password)
		} else {
			dsn.User = url.User(c.User)
		}
	}

	return dsn.String()
}

func envOrDefault(key, fallback string) string {
	value := stringsTrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func envInt32OrDefault(key string, fallback int32) int32 {
	value := stringsTrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	parsed, err := strconv.ParseInt(value, 10, 32)
	if err != nil {
		return fallback
	}

	if parsed < 0 {
		return fallback
	}

	return int32(parsed)
}

func stringsTrimSpace(value string) string {
	return strings.TrimSpace(value)
}
