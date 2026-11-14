package config

import (
	"fmt"
	"reflect"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config stores all configuration of the application.
// The values are read by viper from app.env or from environment variables.
type Config struct {
	Environment       string   `mapstructure:"ENVIRONMENT"`
	AllowedOrigins    []string `mapstructure:"ALLOWED_ORIGINS"`
	DBSource          string   `mapstructure:"DB_SOURCE"`
	MigrationURL      string   `mapstructure:"MIGRATION_URL"`
	HTTPServerAddress string   `mapstructure:"HTTP_SERVER_ADDRESS"`

	TokenSymmetricKey    string        `mapstructure:"TOKEN_SYMMETRIC_KEY"`
	AccessTokenDuration  time.Duration `mapstructure:"ACCESS_TOKEN_DURATION"`
	RefreshTokenDuration time.Duration `mapstructure:"REFRESH_TOKEN_DURATION"`
	// CookieSecure marks auth cookies Secure. Must be true anywhere served over HTTPS.
	CookieSecure bool `mapstructure:"COOKIE_SECURE"`
	// DevOTPEcho returns the one-time code in the API response so local dev and
	// the end-to-end tests can sign in without a phone. Refused outside local.
	DevOTPEcho bool `mapstructure:"DEV_OTP_ECHO"`

	// S3Endpoint is how the API reaches MinIO/S3 (e.g. minio:9000).
	// S3PublicEndpoint is the host browsers use for signed photo URLs; locally
	// nginx proxies /flow-photos/ on the web origin to MinIO.
	S3Endpoint       string        `mapstructure:"S3_ENDPOINT"`
	S3PublicEndpoint string        `mapstructure:"S3_PUBLIC_ENDPOINT"`
	S3PublicSecure   bool          `mapstructure:"S3_PUBLIC_SECURE"`
	S3AccessKey      string        `mapstructure:"S3_ACCESS_KEY"`
	S3SecretKey      string        `mapstructure:"S3_SECRET_KEY"`
	S3Bucket         string        `mapstructure:"S3_BUCKET"`
	S3Secure         bool          `mapstructure:"S3_SECURE"`
	S3Region         string        `mapstructure:"S3_REGION"`
	PhotoURLDuration time.Duration `mapstructure:"PHOTO_URL_DURATION"`

	// SmsProvider is "console" (log only, the default) or "africastalking".
	SmsProvider            string `mapstructure:"SMS_PROVIDER"`
	ApiUrl                 string `mapstructure:"API_URL"`
	AfricasTalkingUsername string `mapstructure:"AFRICASTALKING_USERNAME"`
	SenderApiKey           string `mapstructure:"SMS_SENDER_API_KEY"`
	SenderID               string `mapstructure:"SMS_SENDER_ID"`

	// AIImageClassifier is "stub" (default), "claude" or "off".
	// AITextClassifier is "keyword" (default), "claude" or "off".
	AIImageClassifier string `mapstructure:"AI_IMAGE_CLASSIFIER"`
	AITextClassifier  string `mapstructure:"AI_TEXT_CLASSIFIER"`
	AnthropicAPIKey   string `mapstructure:"ANTHROPIC_API_KEY"`
	AnthropicModel    string `mapstructure:"ANTHROPIC_MODEL"`

	// Geocoder is "nominatim" (OpenStreetMap, the default) or "off".
	Geocoder      string `mapstructure:"GEOCODER"`
	NominatimURL  string `mapstructure:"NOMINATIM_URL"`
	GeocoderEmail string `mapstructure:"GEOCODER_EMAIL"`

	// SeedDemo loads the Nairobi demo data when the database is empty.
	SeedDemo          bool          `mapstructure:"SEED_DEMO"`
	WorkerConcurrency int           `mapstructure:"WORKER_CONCURRENCY"`
	RescoreInterval   time.Duration `mapstructure:"RESCORE_INTERVAL"`
}

// LoadConfig reads configuration from file or environment variables.
func LoadConfig(path string) (config Config, err error) {
	viper.AddConfigPath(path)
	viper.SetConfigName("app")
	viper.SetConfigType("env")

	viper.AutomaticEnv()

	// viper.AutomaticEnv() alone does not make Unmarshal populate the struct from
	// the environment: Unmarshal only walks keys viper already knows about. Bind
	// each field's env var so an env-only setup (docker compose) works.
	bindEnvVars()

	viper.SetDefault("ENVIRONMENT", localEnv)
	viper.SetDefault("ALLOWED_ORIGINS", "http://localhost:8080,http://localhost:5173")
	viper.SetDefault("DB_SOURCE", "postgresql://flow:flow@localhost:5433/flow?sslmode=disable")
	viper.SetDefault("MIGRATION_URL", "file://db/migrations")
	viper.SetDefault("HTTP_SERVER_ADDRESS", "0.0.0.0:8081")
	viper.SetDefault("ACCESS_TOKEN_DURATION", "15m")
	viper.SetDefault("REFRESH_TOKEN_DURATION", "720h")
	viper.SetDefault("S3_ENDPOINT", "localhost:9000")
	viper.SetDefault("S3_PUBLIC_ENDPOINT", "localhost:8080")
	viper.SetDefault("S3_ACCESS_KEY", "flowminio")
	viper.SetDefault("S3_SECRET_KEY", "flowminio-secret")
	viper.SetDefault("S3_BUCKET", "flow-photos")
	viper.SetDefault("S3_REGION", "us-east-1")
	viper.SetDefault("PHOTO_URL_DURATION", "15m")
	viper.SetDefault("SMS_PROVIDER", "console")
	viper.SetDefault("API_URL", "https://api.sandbox.africastalking.com/version1/messaging")
	viper.SetDefault("AI_IMAGE_CLASSIFIER", "stub")
	viper.SetDefault("AI_TEXT_CLASSIFIER", "keyword")
	viper.SetDefault("ANTHROPIC_MODEL", "claude-opus-5-5")
	viper.SetDefault("GEOCODER", "nominatim")
	viper.SetDefault("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
	viper.SetDefault("WORKER_CONCURRENCY", 4)
	viper.SetDefault("RESCORE_INTERVAL", "1h")

	// app.env is optional. Read it when present, but treat "file not found" as a
	// non-error so env vars still apply. Any other read error is real.
	if err = viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return config, err
		}
		err = nil
	}

	if err = viper.Unmarshal(&config); err != nil {
		return config, err
	}
	// A comma-separated env var arrives as a single element.
	if len(config.AllowedOrigins) == 1 {
		config.AllowedOrigins = strings.Split(config.AllowedOrigins[0], ",")
	}
	return config, config.validate()
}

func bindEnvVars() {
	t := reflect.TypeOf(Config{})
	for i := 0; i < t.NumField(); i++ {
		if key := t.Field(i).Tag.Get("mapstructure"); key != "" {
			_ = viper.BindEnv(key)
		}
	}
}

// localEnv is the ENVIRONMENT value for local development, where a throwaway
// token key is acceptable.
const localEnv = "local"

// devTokenKey ships in this repo, so it is public by definition.
const devTokenKey = "flow-local-dev-key-change-me-0123456789"

func (c Config) IsLocalEnv() bool { return c.Environment == localEnv }

func (c *Config) validate() error {
	if c.TokenSymmetricKey == "" {
		if !c.IsLocalEnv() {
			return fmt.Errorf("TOKEN_SYMMETRIC_KEY must be set outside local")
		}
		c.TokenSymmetricKey = devTokenKey
	}
	if !c.IsLocalEnv() && c.TokenSymmetricKey == devTokenKey {
		return fmt.Errorf("TOKEN_SYMMETRIC_KEY is the public dev key; set a unique secret")
	}
	if len(c.TokenSymmetricKey) < 32 {
		return fmt.Errorf("TOKEN_SYMMETRIC_KEY must be at least 32 characters")
	}
	if !c.IsLocalEnv() && c.DevOTPEcho {
		return fmt.Errorf("DEV_OTP_ECHO must not be enabled outside local")
	}
	return nil
}

// MigrateDBSource is DBSource with the scheme golang-migrate's pgx/v5 driver expects.
func (c Config) MigrateDBSource() string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if strings.HasPrefix(c.DBSource, prefix) {
			return "pgx5://" + strings.TrimPrefix(c.DBSource, prefix)
		}
	}
	return c.DBSource
}
