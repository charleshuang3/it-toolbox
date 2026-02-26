package jwts

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/gin-gonic/gin"
	"github.com/lestrrat-go/jwx/v3/jwa"
	"github.com/lestrrat-go/jwx/v3/jwk"
	"github.com/lestrrat-go/jwx/v3/jwt"
)

var supportedAlgortihms = []string{
	"HS256",
	"HS384",
	"HS512",
	"RS256",
	"RS384",
	"RS512",
	"ES256",
	"ES384",
	"ES512",
	"PS256",
	"PS384",
	"PS512",
	"EdDSA",
}

var hmacSHAAlgortihms = []jwa.SignatureAlgorithm{
	jwa.HS256(),
	jwa.HS384(),
	jwa.HS512(),
}

func SetupHandlers(r *gin.RouterGroup, config config.JWKSConfig) error {
	handler, err := newJWKSHandler(config)
	if err != nil {
		return err
	}

	jwtGroup := r.Group("/jwt")
	jwtGroup.GET("/.well-known/openid-configuration", handler.openidConfiguration)
	jwtGroup.GET("/.well-known/jwks.json", handler.jwks)
	jwtGroup.POST("/sign", handler.signJWT)
	return nil
}

type key struct {
	keyID      string
	privateKey jwk.Key
	publicKey  jwk.Key
	algorithm  jwa.SignatureAlgorithm
}

type jwksHandler struct {
	config       config.JWKSConfig
	keys         map[string]key
	publicKeySet jwk.Set
}

// newKey creates a key struct from a raw private key, using the algorithm name as key ID.
func newKey(alg jwa.SignatureAlgorithm, privKey any, pubKey any) (key, error) {
	keyID := alg.String()
	privJWK, err := jwk.Import(privKey)
	if err != nil {
		return key{}, err
	}
	pubJWK, err := jwk.Import(pubKey)
	if err != nil {
		return key{}, err
	}
	if err := privJWK.Set(jwk.KeyIDKey, keyID); err != nil {
		return key{}, err
	}
	if err := pubJWK.Set(jwk.KeyIDKey, keyID); err != nil {
		return key{}, err
	}
	if err := pubJWK.Set(jwk.AlgorithmKey, keyID); err != nil {
		return key{}, err
	}
	return key{
		keyID:      keyID,
		privateKey: privJWK,
		publicKey:  pubJWK,
		algorithm:  alg,
	}, nil
}

func newJWKSHandler(config config.JWKSConfig) (*jwksHandler, error) {
	keys := make(map[string]key)
	publicKeySet := jwk.NewSet()

	// Generate RSA key for RS* and PS* algorithms
	rsaPriv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}

	// Add RSA keys for RS* and PS* algorithms
	for _, alg := range []jwa.SignatureAlgorithm{
		jwa.RS256(), jwa.RS384(), jwa.RS512(),
		jwa.PS256(), jwa.PS384(), jwa.PS512(),
	} {
		k, err := newKey(alg, rsaPriv, &rsaPriv.PublicKey)
		if err != nil {
			return nil, err
		}
		keys[k.keyID] = k
	}

	// Generate ES256 key (P-256 curve)
	es256Priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	k, err := newKey(jwa.ES256(), es256Priv, &es256Priv.PublicKey)
	if err != nil {
		return nil, err
	}
	keys[k.keyID] = k

	// Generate ES384 key (P-384 curve)
	es384Priv, err := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if err != nil {
		return nil, err
	}
	k, err = newKey(jwa.ES384(), es384Priv, &es384Priv.PublicKey)
	if err != nil {
		return nil, err
	}
	keys[k.keyID] = k

	// Generate ES512 key (P-521 curve)
	es512Priv, err := ecdsa.GenerateKey(elliptic.P521(), rand.Reader)
	if err != nil {
		return nil, err
	}
	k, err = newKey(jwa.ES512(), es512Priv, &es512Priv.PublicKey)
	if err != nil {
		return nil, err
	}
	keys[k.keyID] = k

	// Generate Ed25519 key for EdDSA
	ed25519Pub, ed25519Priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	k, err = newKey(jwa.EdDSA(), ed25519Priv, ed25519Pub)
	if err != nil {
		return nil, err
	}
	keys[k.keyID] = k

	// Build publicKeySet from keys map, sorted by kid for stable order
	kids := make([]string, 0, len(keys))
	for kid := range keys {
		kids = append(kids, kid)
	}
	sort.Strings(kids)
	for _, kid := range kids {
		publicKeySet.AddKey(keys[kid].publicKey)
	}

	h := &jwksHandler{
		config:       config,
		keys:         keys,
		publicKeySet: publicKeySet,
	}

	return h, nil
}

func (s *jwksHandler) openidConfiguration(c *gin.Context) {
	c.JSON(200, gin.H{
		"issuer":                                s.config.Issuer,
		"jwks_uri":                              s.config.Issuer + "/.well-known/jwks.json",
		"id_token_signing_alg_values_supported": supportedAlgortihms,
	})
}

func (s *jwksHandler) jwks(c *gin.Context) {
	// Serialize the key set to JSON
	jsonBytes, err := json.MarshalIndent(s.publicKeySet, "", "  ")
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to export JWKS"})
	}

	c.Data(200, "application/json", jsonBytes)
}

type signJWTRequest struct {
	HMACKey string         `json:"hmacKey"`
	Claims  map[string]any `json:"claims"`
}

func (s *signJWTRequest) normalizeClaims(conf *config.JWKSConfig) {
	now := time.Now()

	// if "iss" set, overwrite it to conf.Issuer
	s.Claims["iss"] = conf.Issuer

	// if "iat" not set, set as now
	if _, ok := s.Claims["iat"]; !ok {
		s.Claims["iat"] = now.Unix()
	}

	// if "nbf" not set, set as now
	if _, ok := s.Claims["nbf"]; !ok {
		s.Claims["nbf"] = now.Unix()
	}

	// if "exp" not set, set as now + 10 min
	if _, ok := s.Claims["exp"]; !ok {
		s.Claims["exp"] = now.Add(10 * time.Minute).Unix()
	}
}

func (s *jwksHandler) signJWT(c *gin.Context) {
	var req signJWTRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	hmacKey, err := jwk.Import([]byte(req.HMACKey))
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("failed to import HMAC key: %v", err)})
		return
	}

	req.normalizeClaims(&s.config)

	b := jwt.NewBuilder()
	for k, v := range req.Claims {
		b.Claim(k, v)
	}
	tok, err := b.Build()
	if err != nil {
		c.JSON(500, gin.H{"error": fmt.Sprintf("failed to build token: %v", err)})
		return
	}

	tokens := map[string]string{}

	// sign HS*
	for _, alg := range hmacSHAAlgortihms {
		signed, err := jwt.Sign(tok, jwt.WithKey(alg, hmacKey))
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("failed to sign token: %v", err)})
			return
		}
		tokens[alg.String()] = string(signed)
	}

	// sign RS* PS* ES* with cached keys
	for _, key := range s.keys {
		signed, err := jwt.Sign(tok, jwt.WithKey(key.algorithm, key.privateKey))
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("failed to sign token: %v", err)})
			return
		}
		tokens[key.keyID] = string(signed)
	}

	c.JSON(200, gin.H{
		"tokens": tokens,
	})
}
