package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadConfigNetworkToolsDefaults(t *testing.T) {
	p := filepath.Join(t.TempDir(), "c.yaml")
	require.NoError(t, os.WriteFile(p, []byte("port: 1\njwks:\n  issuer: x\n"), 0o600))
	c, err := LoadConfig(p)
	require.NoError(t, err)
	assert.Equal(t, DefaultNetworkTools(), c.NetworkTools)
	assert.False(t, c.NetworkTools.AllowPrivate)
	require.NoError(t, c.Validate())
}

func TestLoadConfigRepoFile(t *testing.T) {
	c, err := LoadConfig("../config.yaml")
	require.NoError(t, err)
	assert.Equal(t, 10*time.Second, c.NetworkTools.RequestTimeout)
	assert.Equal(t, 20, c.NetworkTools.MaxConcurrent)
	assert.Equal(t, 30, c.NetworkTools.RateLimitPerMinute)
	require.NoError(t, c.Validate())
}

func TestNetworkToolsValidate(t *testing.T) {
	ok := DefaultNetworkTools()
	ok.TrustedProxies = []string{"10.0.0.0/8", "::1"}
	assert.NoError(t, ok.validate())

	bad := ok
	bad.TrustedProxies = []string{"nope"}
	assert.Error(t, bad.validate())

	bad = ok
	bad.RequestTimeout = 0
	assert.Error(t, bad.validate())

	bad = ok
	bad.MaxConcurrent = -1
	assert.Error(t, bad.validate())
}
