package config

import (
	"os"

	"github.com/goccy/go-yaml"
)

type JWKSConfig struct {
	Issuer string `yaml:"issuer"`
}

type Config struct {
	Port  int        `yaml:"port"`
	Debug bool       `yaml:"debug"`
	JWKS  JWKSConfig `yaml:"jwks"`
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
