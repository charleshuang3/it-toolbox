package config

import (
	"errors"
	"os"

	"github.com/goccy/go-yaml"
)

type JWKSConfig struct {
	Issuer string `yaml:"issuer"`
}

type Config struct {
	Port             int        `yaml:"port"`
	Debug            bool       `yaml:"debug"`
	FrontendFilePath string     `yaml:"frontend_file_path"`
	JWKS             JWKSConfig `yaml:"jwks"`
}

func LoadConfig(path string) (*Config, error) {
	configBytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	config := &Config{}
	err = yaml.Unmarshal(configBytes, config)
	return config, err
}

func Simple() *Config {
	return &Config{
		Port:             80,
		Debug:            false,
		FrontendFilePath: "/app/frontend",
		JWKS: JWKSConfig{
			Issuer: os.Getenv("JWKS_ISSUER"),
		},
	}
}

func (c *Config) Validate() error {
	if c.Port == 0 {
		return errors.New("port must not be 0")
	}
	if c.JWKS.Issuer == "" {
		return errors.New("jwks issuer must not be empty")
	}
	return nil
}
