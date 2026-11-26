package netguard

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeEnv wires a Guard to a fake resolver and to a local test server so that
// "connections" to public IPs actually land on the test server.
type fakeEnv struct {
	g       *Guard
	mu      sync.Mutex
	dialed  []string
	lookups atomic.Int32
}

func newFakeEnv(t *testing.T, records map[string][]string, backend string) *fakeEnv {
	t.Helper()
	e := &fakeEnv{}
	e.g = &Guard{
		Lookup: func(_ context.Context, host string) ([]netip.Addr, error) {
			e.lookups.Add(1)
			rs, ok := records[host]
			if !ok {
				return nil, fmt.Errorf("no such host %s", host)
			}
			var out []netip.Addr
			for _, r := range rs {
				out = append(out, netip.MustParseAddr(r))
			}
			return out, nil
		},
		dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			e.mu.Lock()
			e.dialed = append(e.dialed, addr)
			e.mu.Unlock()
			var d net.Dialer
			return d.DialContext(ctx, network, backend)
		},
	}
	return e
}

func (e *fakeEnv) dialedAddrs() []string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]string(nil), e.dialed...)
}

func TestDialerRefusesPrivateLiterals(t *testing.T) {
	e := newFakeEnv(t, nil, "127.0.0.1:1")
	for _, addr := range []string{
		"127.0.0.1:80", "10.1.2.3:80", "169.254.169.254:80", "[::1]:80",
		"[::ffff:10.0.0.1]:80", "[fd00::1]:443", "100.64.0.1:80", "0.0.0.0:80",
	} {
		t.Run(addr, func(t *testing.T) {
			_, err := e.g.DialContext(context.Background(), "tcp", addr)
			require.ErrorIs(t, err, ErrBlockedAddress)
		})
	}
	assert.Empty(t, e.dialedAddrs(), "nothing may be dialed for denied targets")
}

func TestDialerRefusesHostnameResolvingPrivate(t *testing.T) {
	e := newFakeEnv(t, map[string][]string{
		"internal.example": {"10.0.0.5"},
		"metadata.example": {"169.254.169.254"},
		"mapped.example":   {"::ffff:192.168.1.1"},
		"mixed.example":    {"8.8.8.8", "127.0.0.1"},
		"v6.example":       {"fd00::1"},
	}, "127.0.0.1:1")
	for _, host := range []string{"internal.example", "metadata.example", "mapped.example", "mixed.example", "v6.example"} {
		t.Run(host, func(t *testing.T) {
			_, err := e.g.DialContext(context.Background(), "tcp", host+":80")
			require.ErrorIs(t, err, ErrBlockedAddress)
		})
	}
	assert.Empty(t, e.dialedAddrs())
}

func TestDialerAllowPrivate(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer ln.Close()
	go func() {
		c, err := ln.Accept()
		if err == nil {
			c.Close()
		}
	}()

	g := &Guard{AllowPrivate: true}
	c, err := g.DialContext(context.Background(), "tcp", ln.Addr().String())
	require.NoError(t, err)
	c.Close()

	// and with the policy on, the real socket path refuses loopback
	g = &Guard{}
	_, err = g.DialContext(context.Background(), "tcp", ln.Addr().String())
	require.ErrorIs(t, err, ErrBlockedAddress)
}

func TestDialerResolvesOnceAndDialsCheckedIP(t *testing.T) {
	// A rebinding resolver: first answer is public, any later answer is private.
	var calls atomic.Int32
	var dialed []string
	g := &Guard{
		Lookup: func(context.Context, string) ([]netip.Addr, error) {
			if calls.Add(1) == 1 {
				return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
			}
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		},
		dial: func(_ context.Context, _, addr string) (net.Conn, error) {
			dialed = append(dialed, addr)
			c, s := net.Pipe()
			s.Close()
			return c, nil
		},
	}
	c, err := g.DialContext(context.Background(), "tcp", "rebind.example:8080")
	require.NoError(t, err)
	c.Close()
	assert.EqualValues(t, 1, calls.Load(), "hostname must be resolved exactly once")
	assert.Equal(t, []string{"93.184.216.34:8080"}, dialed, "must connect to the checked IP literal, not the name")
}

func TestDialerFamilyAndNetwork(t *testing.T) {
	var dialed []string
	g := &Guard{
		Lookup: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("2606:4700::1111"), netip.MustParseAddr("1.1.1.1")}, nil
		},
		dial: func(_ context.Context, _, addr string) (net.Conn, error) {
			dialed = append(dialed, addr)
			c, s := net.Pipe()
			s.Close()
			return c, nil
		},
	}
	c, err := g.DialContext(context.Background(), "tcp4", "dual.example:443")
	require.NoError(t, err)
	c.Close()
	assert.Equal(t, []string{"1.1.1.1:443"}, dialed)

	_, err = g.DialContext(context.Background(), "unix", "/tmp/sock")
	assert.Error(t, err)
	_, err = g.DialContext(context.Background(), "tcp", "no-port")
	assert.Error(t, err)
}

func TestControlRechecksSocketAddress(t *testing.T) {
	g := &Guard{}
	assert.ErrorIs(t, g.control("tcp", "127.0.0.1:80", nil), ErrBlockedAddress)
	assert.ErrorIs(t, g.control("tcp", "[::ffff:10.0.0.1]:80", nil), ErrBlockedAddress)
	assert.ErrorIs(t, g.control("tcp", "garbage", nil), ErrBlockedAddress)
	assert.NoError(t, g.control("tcp", "8.8.8.8:53", nil))
	assert.NoError(t, (&Guard{AllowPrivate: true}).control("tcp", "127.0.0.1:80", nil))
}

func TestHTTPClientFetchesPublicHost(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("hello"))
	}))
	defer srv.Close()
	e := newFakeEnv(t, map[string][]string{"ok.example": {"8.8.8.8"}}, srv.Listener.Addr().String())

	resp, err := e.g.HTTPClient(5*time.Second, 3).Get("http://ok.example/")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, 200, resp.StatusCode)
	assert.Equal(t, []string{"8.8.8.8:80"}, e.dialedAddrs())
}

func TestHTTPClientBlocksDirectPrivateAndNoProxy(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://127.0.0.1:1")
	t.Setenv("http_proxy", "http://127.0.0.1:1")
	e := newFakeEnv(t, map[string][]string{"internal.example": {"192.168.0.10"}}, "127.0.0.1:1")
	c := e.g.HTTPClient(5*time.Second, 3)
	for _, u := range []string{"http://internal.example/", "http://127.0.0.1:9/", "http://169.254.169.254/latest/meta-data/"} {
		_, err := c.Get(u)
		require.ErrorIs(t, err, ErrBlockedAddress, u)
	}
	assert.Empty(t, e.dialedAddrs())
}

func TestRedirectToPrivateBlocked(t *testing.T) {
	var target atomic.Value
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/final" {
			_, _ = w.Write([]byte("final"))
			return
		}
		http.Redirect(w, r, target.Load().(string), http.StatusFound)
	}))
	defer srv.Close()
	e := newFakeEnv(t, map[string][]string{
		"good.example": {"8.8.8.8"},
		"evil.example": {"10.0.0.1"},
		"also.example": {"1.1.1.1"},
	}, srv.Listener.Addr().String())
	c := e.g.HTTPClient(5*time.Second, 3)

	tests := []struct {
		name, location string
		wantErr        string
	}{
		{"hostname resolving private", "http://evil.example/x", ErrBlockedAddress.Error()},
		{"loopback literal", "http://127.0.0.1:8080/x", ErrBlockedAddress.Error()},
		{"metadata literal", "http://169.254.169.254/latest/", ErrBlockedAddress.Error()},
		{"mapped literal", "http://[::ffff:10.0.0.1]/", ErrBlockedAddress.Error()},
		{"file scheme", "file:///etc/passwd", "not allowed"},
		{"ftp scheme", "ftp://good.example/x", "not allowed"},
		{"gopher scheme", "gopher://good.example/", "not allowed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			target.Store(tt.location)
			before := len(e.dialedAddrs())
			resp, err := c.Get("http://good.example/start")
			if resp != nil {
				resp.Body.Close()
			}
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantErr)
			// only the first (public) hop may have been dialed
			assert.LessOrEqual(t, len(e.dialedAddrs())-before, 1)
			for _, a := range e.dialedAddrs() {
				assert.Equal(t, "8.8.8.8:80", a)
			}
		})
	}

	t.Run("allowed redirect to another public host", func(t *testing.T) {
		target.Store("http://also.example/final")
		resp, err := c.Get("http://good.example/start")
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, "http://also.example/final", resp.Request.URL.String())
	})
}

func TestRedirectHopCap(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/loop", http.StatusFound)
	}))
	defer srv.Close()
	e := newFakeEnv(t, map[string][]string{"loop.example": {"8.8.8.8"}}, srv.Listener.Addr().String())

	_, err := e.g.HTTPClient(5*time.Second, 2).Get("http://loop.example/")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "stopped after 2 redirects")
	assert.NotEmpty(t, e.dialedAddrs())
}

func TestCheckURL(t *testing.T) {
	g := &Guard{}
	tests := []struct {
		url string
		ok  bool
	}{
		{"http://example.com/", true},
		{"HTTPS://example.com:8443/x", true},
		{"https://8.8.8.8/", true},
		{"http://10.0.0.1/", false},
		{"http://[::1]:80/", false},
		{"ftp://example.com/", false},
		{"javascript:alert(1)", false},
		{"http:///nohost", false},
	}
	for _, tt := range tests {
		t.Run(tt.url, func(t *testing.T) {
			u, err := url.Parse(tt.url)
			require.NoError(t, err)
			if tt.ok {
				assert.NoError(t, g.CheckURL(u))
			} else {
				assert.Error(t, g.CheckURL(u))
			}
		})
	}
	assert.Error(t, g.CheckURL(nil))
	u, _ := url.Parse("http://10.0.0.1/")
	assert.NoError(t, (&Guard{AllowPrivate: true}).CheckURL(u))
}

func TestDialTLS(t *testing.T) {
	srv := httptest.NewTLSServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	defer srv.Close()
	pool := x509.NewCertPool()
	pool.AddCert(srv.Certificate())

	e := newFakeEnv(t, map[string][]string{
		"example.com":      {"8.8.8.8"},
		"internal.example": {"10.0.0.1"},
	}, srv.Listener.Addr().String())

	conn, err := e.g.DialTLS(context.Background(), "tcp", "example.com:443", &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12})
	require.NoError(t, err)
	assert.Equal(t, "example.com", conn.ConnectionState().ServerName)
	require.NotEmpty(t, conn.ConnectionState().PeerCertificates)
	conn.Close()
	assert.Equal(t, []string{"8.8.8.8:443"}, e.dialedAddrs())

	_, err = e.g.DialTLS(context.Background(), "tcp", "internal.example:443", &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12})
	require.ErrorIs(t, err, ErrBlockedAddress)
	_, err = e.g.DialTLS(context.Background(), "tcp", "127.0.0.1:443", nil)
	require.ErrorIs(t, err, ErrBlockedAddress)
	assert.Len(t, e.dialedAddrs(), 1)
}

func TestResolveErrors(t *testing.T) {
	g := &Guard{Lookup: func(context.Context, string) ([]netip.Addr, error) { return nil, nil }}
	_, err := g.Resolve(context.Background(), "empty.example")
	assert.Error(t, err)
	_, err = g.Resolve(context.Background(), "")
	assert.Error(t, err)
	g.Lookup = func(context.Context, string) ([]netip.Addr, error) { return nil, fmt.Errorf("boom") }
	_, err = g.Resolve(context.Background(), "x.example")
	assert.ErrorContains(t, err, "boom")
}
