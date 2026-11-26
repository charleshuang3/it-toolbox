package config

import (
	"errors"
	"fmt"
	"net/netip"
	"os"
	"time"

	"github.com/goccy/go-yaml"
)

type JWKSConfig struct {
	Issuer string `yaml:"issuer"`
}

// NetworkToolsConfig controls outbound connections made on behalf of users
// by network diagnostic tools (see package netguard).
type NetworkToolsConfig struct {
	// AllowPrivate disables the address policy (loopback, private, link-local,
	// metadata ranges, ...). Only enable for self-hosted intranet use.
	AllowPrivate bool `yaml:"allow_private"`
	// RequestTimeout bounds a whole outbound request.
	RequestTimeout time.Duration `yaml:"request_timeout"`
	// MaxConcurrent is the max number of network tool requests in flight (0 = unlimited).
	MaxConcurrent int `yaml:"max_concurrent"`
	// RateLimitPerMinute is the sustained requests/minute per client IP (0 = unlimited).
	RateLimitPerMinute int `yaml:"rate_limit_per_minute"`
	// RateLimitBurst is the burst size per client IP (0 = same as RateLimitPerMinute, min 1).
	RateLimitBurst int `yaml:"rate_limit_burst"`
	// BehindProxy makes the client IP come from X-Forwarded-For instead of the
	// TCP peer. Never enable unless a reverse proxy sets/overwrites that header.
	BehindProxy bool `yaml:"behind_proxy"`
	// TrustedProxies (IPs or CIDRs) restricts which peers may supply
	// X-Forwarded-For when BehindProxy is set. Empty means any peer is trusted.
	TrustedProxies []string `yaml:"trusted_proxies"`
}

// DefaultNetworkTools returns the defaults used when the section is absent.
func DefaultNetworkTools() NetworkToolsConfig {
	return NetworkToolsConfig{
		RequestTimeout:     10 * time.Second,
		MaxConcurrent:      20,
		RateLimitPerMinute: 30,
	}
}

func (n NetworkToolsConfig) validate() error {
	if n.RequestTimeout <= 0 {
		return errors.New("network_tools.request_timeout must be positive")
	}
	if n.MaxConcurrent < 0 || n.RateLimitPerMinute < 0 || n.RateLimitBurst < 0 {
		return errors.New("network_tools limits must not be negative")
	}
	for _, p := range n.TrustedProxies {
		if _, err := netip.ParsePrefix(p); err == nil {
			continue
		}
		if _, err := netip.ParseAddr(p); err != nil {
			return fmt.Errorf("network_tools.trusted_proxies: %q is not an IP or CIDR", p)
		}
	}
	return nil
}

type Config struct {
	Port             int                `yaml:"port"`
	Debug            bool               `yaml:"debug"`
	FrontendFilePath string             `yaml:"frontend_file_path"`
	JWKS             JWKSConfig         `yaml:"jwks"`
	NetworkTools     NetworkToolsConfig `yaml:"network_tools"`
}

func LoadConfig(path string) (*Config, error) {
	configBytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	config := &Config{NetworkTools: DefaultNetworkTools()}
	err = yaml.Unmarshal(configBytes, config)
	return config, err
}

func Simple() *Config {
	return &Config{
		Port:             8080,
		Debug:            false,
		FrontendFilePath: "/app/frontend",
		JWKS: JWKSConfig{
			Issuer: os.Getenv("JWKS_ISSUER"),
		},
		NetworkTools: DefaultNetworkTools(),
	}
}

func (c *Config) Validate() error {
	if c.Port == 0 {
		return errors.New("port must not be 0")
	}
	if c.JWKS.Issuer == "" {
		return errors.New("jwks issuer must not be empty")
	}
	return c.NetworkTools.validate()
}
