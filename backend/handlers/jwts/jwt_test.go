package jwts

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/gin-gonic/gin"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestOpenidConfiguration(t *testing.T) {
	// Setup
	r := gin.New()
	routerGroup := r.Group("/")

	cfg := config.JWKSConfig{
		Issuer: "https://test.example.com",
	}

	err := SetupHandlers(routerGroup, cfg)
	require.NoError(t, err)

	// Create request
	req := httptest.NewRequest(http.MethodGet, "/.well-known/openid-configuration", nil)
	w := httptest.NewRecorder()

	// Execute
	r.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusOK, w.Code)

	var result map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &result)
	require.NoError(t, err)

	assert.Equal(t, "https://test.example.com", result["issuer"])
	assert.Equal(t, "https://test.example.com/.well-known/jwks.json", result["jwks_uri"])

	algorithms, ok := result["id_token_signing_alg_values_supported"].([]interface{})
	require.True(t, ok)
	assert.Len(t, algorithms, len(supportedAlgortihms))
}

func TestJWKS(t *testing.T) {
	// Setup
	r := gin.New()
	routerGroup := r.Group("/")

	cfg := config.JWKSConfig{
		Issuer: "https://test.example.com",
	}

	err := SetupHandlers(routerGroup, cfg)
	require.NoError(t, err)

	// Create request
	req := httptest.NewRequest(http.MethodGet, "/.well-known/jwks.json", nil)
	w := httptest.NewRecorder()

	// Execute
	r.ServeHTTP(w, req)

	// Assert
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))

	// Parse JWKS
	keySet, err := jwk.Parse(w.Body.Bytes())
	require.NoError(t, err)

	// Expected algorithms (all except HS*)
	expectedAlgorithms := []string{
		"RS256", "RS384", "RS512",
		"PS256", "PS384", "PS512",
		"ES256", "ES384", "ES512",
		"EdDSA",
	}

	// Verify we have the correct number of keys
	assert.Equal(t, len(expectedAlgorithms), keySet.Len(), "JWKS should contain keys for all non-HS* algorithms")

	// Verify each expected algorithm has a key
	keyIDs := make(map[string]bool)
	for i := 0; i < keySet.Len(); i++ {
		key, ok := keySet.Key(i)
		require.True(t, ok)
		keyID, ok := key.KeyID()
		require.True(t, ok)
		keyIDs[keyID] = true
	}

	for _, alg := range expectedAlgorithms {
		assert.True(t, keyIDs[alg], "JWKS should contain key for algorithm %s", alg)
	}

	// Verify HS* algorithms are NOT present
	for _, hsAlg := range []string{"HS256", "HS384", "HS512"} {
		assert.False(t, keyIDs[hsAlg], "JWKS should NOT contain key for HS* algorithm %s", hsAlg)
	}
}
