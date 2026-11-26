package nettools

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

type tlsTestCA struct {
	cert *x509.Certificate
	key  *ecdsa.PrivateKey
}

func tlsNewCA(t *testing.T) *tlsTestCA {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Test Root CA"},
		NotBefore:             time.Now().Add(-48 * time.Hour),
		NotAfter:              time.Now().Add(48 * time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	require.NoError(t, err)
	cert, err := x509.ParseCertificate(der)
	require.NoError(t, err)
	return &tlsTestCA{cert, key}
}

// leaf issues a server certificate. When ca is nil the certificate is self-signed.
func (ca *tlsTestCA) leaf(t *testing.T, notBefore, notAfter time.Time, dns []string, ips []net.IP) tls.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	require.NoError(t, err)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: "leaf"},
		NotBefore:    notBefore,
		NotAfter:     notAfter,
		DNSNames:     dns,
		IPAddresses:  ips,
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	parent, signer := tmpl, key
	if ca != nil {
		parent, signer = ca.cert, ca.key
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent, &key.PublicKey, signer)
	require.NoError(t, err)
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}
}

// tlsServe starts a TLS listener that completes handshakes and closes.
func tlsServe(t *testing.T, cert tls.Certificate, mutate func(*tls.Config)) int {
	t.Helper()
	cfg := &tls.Config{Certificates: []tls.Certificate{cert}, NextProtos: []string{"http/1.1"}}
	if mutate != nil {
		mutate(cfg)
	}
	ln, err := tls.Listen("tcp", "127.0.0.1:0", cfg)
	require.NoError(t, err)
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				_ = c.(*tls.Conn).Handshake()
				_ = c.Close()
			}()
		}
	}()
	return ln.Addr().(*net.TCPAddr).Port
}

func tlsPost(t *testing.T, allowPrivate bool, body any) (int, map[string]any) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	conf := config.NetworkToolsConfig{AllowPrivate: allowPrivate, RequestTimeout: 5 * time.Second}
	d := Deps{Guard: netguard.NewGuard(conf), Config: conf}
	r := gin.New()
	tlsRoutes(r.Group("/api/net"), d)
	b, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/api/net/tls", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var out map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &out))
	return w.Code, out
}

func tlsReasonCodes(out map[string]any) []string {
	var codes []string
	v := out["verdict"].(map[string]any)
	for _, r := range v["reasons"].([]any) {
		codes = append(codes, r.(map[string]any)["code"].(string))
	}
	return codes
}

func tlsUseRoots(t *testing.T, ca *tlsTestCA) {
	t.Helper()
	pool := x509.NewCertPool()
	pool.AddCert(ca.cert)
	tlsSystemRoots = pool
	t.Cleanup(func() { tlsSystemRoots = nil })
}

var tlsLoopback = []net.IP{net.ParseIP("127.0.0.1")}

func TestTLSCheck_Valid(t *testing.T) {
	ca := tlsNewCA(t)
	tlsUseRoots(t, ca)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-time.Hour), now.Add(30*24*time.Hour), []string{"example.test"}, tlsLoopback), nil)

	code, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port, "probe_versions": true})
	require.Equal(t, 200, code, out)
	assert.True(t, out["verdict"].(map[string]any)["valid"].(bool), out["verdict"])
	conn := out["connection"].(map[string]any)
	assert.Equal(t, "TLS 1.3", conn["version"])
	assert.Equal(t, "http/1.1", conn["alpn"])
	assert.False(t, conn["ocsp_stapled"].(bool))
	chain := out["chain"].([]any)
	require.Len(t, chain, 1)
	c0 := chain[0].(map[string]any)
	assert.Equal(t, "ECDSA", c0["key_algorithm"])
	assert.Equal(t, "P-256", c0["curve"])
	assert.Contains(t, c0["pem"], "BEGIN CERTIFICATE")
	assert.Len(t, c0["sha256"], 32*3-1)
	assert.InDelta(t, 29, c0["days_remaining"], 1)
	assert.Contains(t, c0["ip_addresses"], "127.0.0.1")

	probes := out["probes"].([]any)
	require.Len(t, probes, 4)
	sup := map[string]bool{}
	for _, p := range probes {
		m := p.(map[string]any)
		sup[m["version"].(string)] = m["supported"].(bool)
	}
	assert.True(t, sup["TLS 1.2"])
	assert.True(t, sup["TLS 1.3"])
}

func TestTLSCheck_ProbeOnlyTLS12(t *testing.T) {
	ca := tlsNewCA(t)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), nil, tlsLoopback), func(c *tls.Config) {
		c.MinVersion, c.MaxVersion = tls.VersionTLS12, tls.VersionTLS12
	})
	_, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port, "probe_versions": true})
	assert.Equal(t, "TLS 1.2", out["connection"].(map[string]any)["version"])
	sup := map[string]bool{}
	for _, p := range out["probes"].([]any) {
		m := p.(map[string]any)
		sup[m["version"].(string)] = m["supported"].(bool)
	}
	assert.Equal(t, map[string]bool{"TLS 1.0": false, "TLS 1.1": false, "TLS 1.2": true, "TLS 1.3": false}, sup)
}

func TestTLSCheck_Expired(t *testing.T) {
	ca := tlsNewCA(t)
	tlsUseRoots(t, ca)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-10*24*time.Hour), now.Add(-24*time.Hour), nil, tlsLoopback), nil)
	code, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	require.Equal(t, 200, code)
	assert.False(t, out["verdict"].(map[string]any)["valid"].(bool))
	assert.Equal(t, []string{"expired"}, tlsReasonCodes(out))
	assert.Less(t, out["chain"].([]any)[0].(map[string]any)["days_remaining"].(float64), 0.0)
}

func TestTLSCheck_NotYetValid(t *testing.T) {
	ca := tlsNewCA(t)
	tlsUseRoots(t, ca)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(24*time.Hour), now.Add(48*time.Hour), nil, tlsLoopback), nil)
	_, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, []string{"not_yet_valid"}, tlsReasonCodes(out))
}

func TestTLSCheck_HostnameMismatch(t *testing.T) {
	ca := tlsNewCA(t)
	tlsUseRoots(t, ca)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), []string{"other.test"}, nil), nil)
	_, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, []string{"hostname_mismatch"}, tlsReasonCodes(out))

	// An SNI override naming a covered host turns it valid.
	_, out = tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port, "sni": "other.test"})
	assert.True(t, out["verdict"].(map[string]any)["valid"].(bool), out["verdict"])
	assert.Equal(t, "other.test", out["sni"])
}

func TestTLSCheck_SelfSigned(t *testing.T) {
	now := time.Now()
	var none *tlsTestCA
	port := tlsServe(t, none.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), nil, tlsLoopback), nil)
	_, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, []string{"self_signed"}, tlsReasonCodes(out))
	assert.True(t, out["chain"].([]any)[0].(map[string]any)["self_signed"].(bool))
}

func TestTLSCheck_UnknownAuthorityAndIncompleteChain(t *testing.T) {
	ca := tlsNewCA(t) // not added to the trust store
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), nil, tlsLoopback), nil)
	_, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, []string{"incomplete_chain"}, tlsReasonCodes(out))

	// With the untrusted root included in the chain the reason is an unknown authority.
	leaf := ca.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), nil, tlsLoopback)
	leaf.Certificate = append(leaf.Certificate, ca.cert.Raw)
	port = tlsServe(t, leaf, nil)
	_, out = tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, []string{"unknown_authority"}, tlsReasonCodes(out))
	assert.Len(t, out["chain"], 2)
	assert.True(t, out["chain"].([]any)[1].(map[string]any)["is_ca"].(bool))
}

func TestTLSCheck_MultipleReasons(t *testing.T) {
	ca := tlsNewCA(t)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-48*time.Hour), now.Add(-time.Hour), []string{"x.test"}, nil), nil)
	_, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, []string{"expired", "incomplete_chain", "hostname_mismatch"}, tlsReasonCodes(out))
}

func TestTLSCheck_BlockedWhenPrivateNotAllowed(t *testing.T) {
	ca := tlsNewCA(t)
	now := time.Now()
	port := tlsServe(t, ca.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), nil, tlsLoopback), nil)
	code, out := tlsPost(t, false, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, http.StatusForbidden, code)
	assert.Contains(t, out["error"], "not allowed")
}

func TestTLSCheck_ConnectionRefused(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	code, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port})
	assert.Equal(t, http.StatusBadGateway, code)
	assert.Contains(t, out["error"], "connection failed")
}

func TestTLSCheck_BadInput(t *testing.T) {
	for name, body := range map[string]map[string]any{
		"empty host":   {"host": ""},
		"url host":     {"host": "https://x.test"},
		"bad port":     {"host": "x.test", "port": 70000},
		"bad starttls": {"host": "x.test", "starttls": "ftp"},
	} {
		t.Run(name, func(t *testing.T) {
			code, _ := tlsPost(t, true, body)
			assert.Equal(t, http.StatusBadRequest, code)
		})
	}
}

func TestTLSCheck_STARTTLS(t *testing.T) {
	ca := tlsNewCA(t)
	tlsUseRoots(t, ca)
	now := time.Now()
	cert := ca.leaf(t, now.Add(-time.Hour), now.Add(time.Hour), nil, tlsLoopback)
	cfg := &tls.Config{Certificates: []tls.Certificate{cert}}

	serve := func(handle func(net.Conn)) int {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		require.NoError(t, err)
		t.Cleanup(func() { _ = ln.Close() })
		go func() {
			for {
				c, err := ln.Accept()
				if err != nil {
					return
				}
				go func() {
					defer func() { _ = c.Close() }()
					handle(c)
				}()
			}
		}()
		return ln.Addr().(*net.TCPAddr).Port
	}
	readLine := func(c net.Conn) {
		buf := make([]byte, 1)
		for {
			if _, err := c.Read(buf); err != nil || buf[0] == '\n' {
				return
			}
		}
	}
	upgrade := func(c net.Conn) { _ = tls.Server(c, cfg).Handshake() }

	smtp := serve(func(c net.Conn) {
		_, _ = c.Write([]byte("220 hi\r\n"))
		readLine(c)
		_, _ = c.Write([]byte("250-mail\r\n250 STARTTLS\r\n"))
		readLine(c)
		_, _ = c.Write([]byte("220 go\r\n"))
		upgrade(c)
	})
	imap := serve(func(c net.Conn) {
		_, _ = c.Write([]byte("* OK ready\r\n"))
		readLine(c)
		_, _ = c.Write([]byte("a1 OK begin\r\n"))
		upgrade(c)
	})
	pg := serve(func(c net.Conn) {
		buf := make([]byte, 8)
		_, _ = c.Read(buf)
		_, _ = c.Write([]byte("S"))
		upgrade(c)
	})
	for proto, port := range map[string]int{"smtp": smtp, "imap": imap, "postgres": pg} {
		t.Run(proto, func(t *testing.T) {
			code, out := tlsPost(t, true, map[string]any{"host": "127.0.0.1", "port": port, "starttls": proto})
			require.Equal(t, 200, code, out)
			assert.True(t, out["verdict"].(map[string]any)["valid"].(bool), out["verdict"])
		})
	}
}
