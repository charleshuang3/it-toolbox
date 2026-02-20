package jwts

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/gin-gonic/gin"
	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"
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

func TestNormalizeClaims(t *testing.T) {
	tests := []struct {
		name           string
		claims         map[string]any
		expectedClaims []string // claims that should be set
		checkTimeRange bool     // whether to check time range for iat/nbf/exp
	}{
		{
			name:           "empty claims gets all defaults",
			claims:         map[string]any{},
			expectedClaims: []string{"iss", "iat", "nbf", "exp"},
			checkTimeRange: true,
		},
		{
			name: "preserves existing iat",
			claims: map[string]any{
				"iat": int64(1234567890),
			},
			expectedClaims: []string{"iss", "iat", "nbf", "exp"},
			checkTimeRange: false,
		},
		{
			name: "preserves existing nbf",
			claims: map[string]any{
				"nbf": int64(1234567890),
			},
			expectedClaims: []string{"iss", "iat", "nbf", "exp"},
			checkTimeRange: false,
		},
		{
			name: "preserves existing exp",
			claims: map[string]any{
				"exp": int64(1234567890),
			},
			expectedClaims: []string{"iss", "iat", "nbf", "exp"},
			checkTimeRange: false,
		},
		{
			name: "overwrites existing iss",
			claims: map[string]any{
				"iss": "https://old-issuer.example.com",
			},
			expectedClaims: []string{"iss", "iat", "nbf", "exp"},
			checkTimeRange: true,
		},
		{
			name: "preserves custom claims",
			claims: map[string]any{
				"sub":   "user123",
				"email": "test@example.com",
			},
			expectedClaims: []string{"iss", "iat", "nbf", "exp", "sub", "email"},
			checkTimeRange: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conf := &config.JWKSConfig{
				Issuer: "https://test.example.com",
			}

			req := &signJWTRequest{
				Claims: tt.claims,
			}

			req.normalizeClaims(conf)

			// Check all expected claims are present
			for _, claim := range tt.expectedClaims {
				_, ok := req.Claims[claim]
				assert.True(t, ok, "claim %s should be present", claim)
			}

			// Verify iss is always set to config issuer
			assert.Equal(t, "https://test.example.com", req.Claims["iss"])

			// Only check time range for tests that don't have preset time values
			if tt.checkTimeRange {
				now := time.Now().Unix()
				if iat, ok := req.Claims["iat"].(int64); ok {
					assert.GreaterOrEqual(t, iat, now-60)
					assert.LessOrEqual(t, iat, now+60)
				}
				if nbf, ok := req.Claims["nbf"].(int64); ok {
					assert.GreaterOrEqual(t, nbf, now-60)
					assert.LessOrEqual(t, nbf, now+60)
				}
				if exp, ok := req.Claims["exp"].(int64); ok {
					// exp should be around 10 minutes from now
					assert.GreaterOrEqual(t, exp, now+540) // 9 min
					assert.LessOrEqual(t, exp, now+660)    // 11 min
				}
			}
		})
	}
}

func TestSignJWT(t *testing.T) {
	// Setup
	r := gin.New()
	routerGroup := r.Group("/")

	cfg := config.JWKSConfig{
		Issuer: "https://test.example.com",
	}

	err := SetupHandlers(routerGroup, cfg)
	require.NoError(t, err)

	tests := []struct {
		name       string
		hmacKey    string
		claims     map[string]any
		wantStatus int
	}{
		{
			name:    "simple claims",
			hmacKey: "test-secret-key",
			claims: map[string]any{
				"sub": "user123",
			},
			wantStatus: http.StatusOK,
		},
		{
			name:    "with custom claims",
			hmacKey: "another-secret",
			claims: map[string]any{
				"sub":   "user456",
				"email": "test@example.com",
				"role":  "admin",
			},
			wantStatus: http.StatusOK,
		},
		{
			name:       "empty claims",
			hmacKey:    "secret",
			claims:     map[string]any{},
			wantStatus: http.StatusOK,
		},
		{
			name:    "complex nested claims",
			hmacKey: "complex-secret",
			claims: map[string]any{
				"sub": "user789",
				"user": map[string]any{
					"firstname": "joe",
					"lastname":  "doe",
				},
			},
			wantStatus: http.StatusOK,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create request body
			reqBody := map[string]any{
				"hmacKey": tt.hmacKey,
				"claims":  tt.claims,
			}
			bodyBytes, err := json.Marshal(reqBody)
			require.NoError(t, err)

			// Create request
			req := httptest.NewRequest(http.MethodPost, "/sign-jwt", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			// Execute
			r.ServeHTTP(w, req)

			// Debug output
			t.Logf("Response status: %d, body: %s", w.Code, w.Body.String())

			// Assert status
			assert.Equal(t, tt.wantStatus, w.Code)

			if tt.wantStatus == http.StatusOK {
				var result map[string]any
				err = json.Unmarshal(w.Body.Bytes(), &result)
				require.NoError(t, err)

				tokens, ok := result["tokens"].(map[string]any)
				require.True(t, ok, "response should contain tokens map")

				// Check all supported alg token are generated
				for _, alg := range supportedAlgortihms {
					_, ok := tokens[alg].(string)
					assert.True(t, ok, "tokens should contain %s", alg)
				}
				assert.Equal(t, len(supportedAlgortihms), len(tokens), "tokens should contain all supported algorithms")

				// Check HS256 token is present
				hs256Token, ok := tokens["HS256"].(string)
				require.True(t, ok, "tokens should contain HS256")
				assert.NotEmpty(t, hs256Token, "HS256 token should not be empty")

				// Verify the token header contains HS256 algorithm
				// JWT format: header.payload.signature, header is base64 encoded JSON
				parts := bytes.Split([]byte(hs256Token), []byte("."))
				require.Len(t, parts, 3, "JWT should have 3 parts")
				headerBytes, err := base64.RawURLEncoding.DecodeString(string(parts[0]))
				require.NoError(t, err, "should decode JWT header")
				var header map[string]any
				err = json.Unmarshal(headerBytes, &header)
				require.NoError(t, err, "should parse JWT header")
				assert.Equal(t, "HS256", header["alg"], "token should use HS256 algorithm")

				// Parse and verify the JWT signature (HMAC key must be []byte)
				verifiedToken, err := jwt.Parse([]byte(hs256Token), jwt.WithVerify(true), jwt.WithKey(jwa.HS256(), []byte(tt.hmacKey)))
				require.NoError(t, err, "token should be verifiable with the same HMAC key")

				// Verify claims in the token
				iss, ok := verifiedToken.Issuer()
				require.True(t, ok)
				assert.Equal(t, cfg.Issuer, iss)

				// Verify custom claims are preserved
				for k, v := range tt.claims {
					var claimValue any
					err := verifiedToken.Get(k, &claimValue)
					require.NoError(t, err, "claim %s should be present", k)
					// For nested maps, compare as maps since types may differ
					switch expected := v.(type) {
					case map[string]any:
						actual, ok := claimValue.(map[string]any)
						require.True(t, ok, "claim %s should be a map", k)
						assert.Equal(t, expected, actual, "claim %s should match", k)
					default:
						assert.Equal(t, v, claimValue, "claim %s should match", k)
					}
				}
			}
		})
	}
}
