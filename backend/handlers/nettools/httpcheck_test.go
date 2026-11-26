package nettools

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

func httpcheckRouter(g *netguard.Guard, timeout time.Duration) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	grp := r.Group("/api/net")
	httpcheckHandlerRegister(grp, Deps{Guard: g, Config: config.NetworkToolsConfig{RequestTimeout: timeout}})
	return r
}

func httpcheckHandlerRegister(grp *gin.RouterGroup, d Deps) {
	grp.POST("/http", httpcheckHandler(d))
}

func httpcheckPost(t *testing.T, r *gin.Engine, payload map[string]any) (int, httpcheckResponse, httpcheckError) {
	t.Helper()
	b, err := json.Marshal(payload)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, "/api/net/http", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var ok httpcheckResponse
	var bad httpcheckError
	if w.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &ok))
	} else {
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &bad))
	}
	return w.Code, ok, bad
}

func httpcheckAllowRouter() *gin.Engine {
	return httpcheckRouter(&netguard.Guard{AllowPrivate: true}, 5*time.Second)
}

func TestHTTPCheckRegistered(t *testing.T) {
	assert.NotEmpty(t, registrars)
}

func TestHTTPCheckRedirectChain(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/a", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/b", http.StatusFound) })
	mux.HandleFunc("/b", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/c", http.StatusMovedPermanently) })
	mux.HandleFunc("/c", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		http.SetCookie(w, &http.Cookie{Name: "sid", Value: "1"})
		_, _ = io.WriteString(w, "hello")
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := httpcheckAllowRouter()

	code, res, _ := httpcheckPost(t, r, map[string]any{"url": srv.URL + "/a"})
	require.Equal(t, 200, code)
	require.Len(t, res.Hops, 3)
	assert.Equal(t, []int{302, 301, 200}, []int{res.Hops[0].Status, res.Hops[1].Status, res.Hops[2].Status})
	assert.Equal(t, srv.URL+"/b", res.Hops[0].Location)
	assert.Equal(t, srv.URL+"/c", res.Hops[2].URL)
	assert.Equal(t, "HTTP/1.1", res.Hops[2].Protocol)
	assert.Equal(t, "127.0.0.1", res.Hops[2].RemoteIP)
	require.NotNil(t, res.Body)
	assert.Equal(t, "hello", res.Body.Preview)
	assert.False(t, res.Body.Truncated)
	assert.EqualValues(t, 5, res.Body.Size)
	require.Len(t, res.Cookies, 1)
	assert.Equal(t, "sid", res.Cookies[0].Name)
	assert.NotEmpty(t, res.Cookies[0].Hints)

	// no following: one hop, redirect reported
	code, res, _ = httpcheckPost(t, r, map[string]any{"url": srv.URL + "/a", "follow_redirects": false})
	require.Equal(t, 200, code)
	require.Len(t, res.Hops, 1)
	assert.Equal(t, 302, res.Hops[0].Status)
}

func TestHTTPCheckRedirectLoopCapped(t *testing.T) {
	var n atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n.Add(1)
		http.Redirect(w, r, "/loop", http.StatusFound)
	}))
	defer srv.Close()
	code, res, _ := httpcheckPost(t, httpcheckAllowRouter(), map[string]any{"url": srv.URL + "/loop"})
	require.Equal(t, 200, code)
	assert.Len(t, res.Hops, httpcheckMaxRedirects+1)
	assert.NotEmpty(t, res.Warnings)
}

func TestHTTPCheckBodyTruncationAndBinary(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/big", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write(bytes.Repeat([]byte("é"), 30000)) // 60000 bytes, multi-byte runes
	})
	mux.HandleFunc("/bin", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write([]byte{0x89, 'P', 'N', 'G', 0, 1, 2, 3})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	r := httpcheckAllowRouter()

	_, res, _ := httpcheckPost(t, r, map[string]any{"url": srv.URL + "/big"})
	require.NotNil(t, res.Body)
	assert.True(t, res.Body.Truncated)
	assert.False(t, res.Body.IsBinary)
	assert.EqualValues(t, 60000, res.Body.Size)
	assert.LessOrEqual(t, len(res.Body.Preview), httpcheckPreviewBytes)
	assert.Greater(t, len(res.Body.Preview), httpcheckPreviewBytes-4)
	assert.True(t, strings.HasPrefix(res.Body.Preview, "éé"))

	_, res, _ = httpcheckPost(t, r, map[string]any{"url": srv.URL + "/bin"})
	assert.True(t, res.Body.IsBinary)
	assert.Empty(t, res.Body.Preview)
	assert.EqualValues(t, 8, res.Body.Size)
}

func TestHTTPCheckTimingsAndSecurity(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(20 * time.Millisecond)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		_, _ = io.WriteString(w, "ok")
	}))
	defer srv.Close()
	_, res, _ := httpcheckPost(t, httpcheckAllowRouter(), map[string]any{"url": srv.URL})
	require.Len(t, res.Hops, 1)
	tm := res.Hops[0].Timings
	assert.Greater(t, tm.ConnectMs, 0.0)
	assert.GreaterOrEqual(t, tm.TTFBMs, 15.0)
	assert.GreaterOrEqual(t, tm.DNSMs, 0.0)
	assert.Greater(t, tm.TotalMs, 0.0)
	assert.GreaterOrEqual(t, tm.TotalMs, tm.TTFBMs)
	assert.Greater(t, res.TotalMs, 0.0)
	assert.Nil(t, res.Hops[0].TLS)

	require.NotNil(t, res.Security)
	status := map[string]string{}
	for _, it := range res.Security.Items {
		status[it.Name] = it.Status
	}
	assert.Equal(t, "pass", status["X-Content-Type-Options"])
	assert.Equal(t, "pass", status["X-Frame-Options / frame-ancestors"])
	assert.Equal(t, "missing", status["Content-Security-Policy"])
	assert.Equal(t, 25, res.Security.Score)
}

func TestHTTPCheckTLSAndHTTP2(t *testing.T) {
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.Proto)
	}))
	srv.EnableHTTP2 = true
	srv.StartTLS()
	defer srv.Close()
	r := httpcheckAllowRouter()

	// Self-signed certificate is rejected by default.
	code, _, bad := httpcheckPost(t, r, map[string]any{"url": srv.URL})
	assert.Equal(t, http.StatusBadGateway, code)
	assert.Equal(t, "tls_error", bad.Code)

	code, res, _ := httpcheckPost(t, r, map[string]any{"url": srv.URL, "insecure_skip_verify": true})
	require.Equal(t, 200, code)
	assert.True(t, res.InsecureSkipVerify)
	assert.NotEmpty(t, res.Warnings)
	h := res.Hops[0]
	assert.Equal(t, "h2", h.Protocol)
	require.NotNil(t, h.TLS)
	assert.Equal(t, "TLS 1.3", h.TLS.Version)
	assert.NotEmpty(t, h.TLS.CipherSuite)
	assert.False(t, h.TLS.Verified)
	assert.Greater(t, h.Timings.TLSMs, 0.0)
	assert.Equal(t, "HTTP/2.0", res.Body.Preview)

	_, res, _ = httpcheckPost(t, r, map[string]any{"url": srv.URL, "insecure_skip_verify": true, "http_version": "h1"})
	assert.Equal(t, "HTTP/1.1", res.Hops[0].Protocol)
}

func TestHTTPCheckRequestForwarding(t *testing.T) {
	type seen struct{ method, body, hdr, host, ua string }
	got := make(chan seen, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		got <- seen{r.Method, string(b), r.Header.Get("X-Test"), r.Host, r.Header.Get("User-Agent")}
	}))
	defer srv.Close()
	r := httpcheckAllowRouter()

	code, _, _ := httpcheckPost(t, r, map[string]any{
		"url": srv.URL, "method": "post", "body": "payload",
		"headers": map[string]string{"X-Test": "yes", "Host": "example.test"},
	})
	require.Equal(t, 200, code)
	s := <-got
	assert.Equal(t, seen{"POST", "payload", "yes", "example.test", httpcheckDefaultUserAgent}, s)
}

func TestHTTPCheckValidation(t *testing.T) {
	r := httpcheckAllowRouter()
	cases := map[string]map[string]any{
		"empty url":      {"url": ""},
		"bad method":     {"url": "http://example.com", "method": "TRACE"},
		"conn header":    {"url": "http://example.com", "headers": map[string]string{"Connection": "close"}},
		"te header":      {"url": "http://example.com", "headers": map[string]string{"Transfer-Encoding": "chunked"}},
		"newline value":  {"url": "http://example.com", "headers": map[string]string{"X-A": "a\r\nB: c"}},
		"bad host":       {"url": "http://example.com", "headers": map[string]string{"Host": "a b/c"}},
		"bad name":       {"url": "http://example.com", "headers": map[string]string{"X A": "1"}},
		"big body":       {"url": "http://example.com", "method": "POST", "body": strings.Repeat("x", httpcheckMaxBodyIn+1)},
		"bad version":    {"url": "http://example.com", "http_version": "h9"},
		"userinfo in ur": {"url": "http://u:p@example.com"},
	}
	for name, p := range cases {
		code, _, bad := httpcheckPost(t, r, p)
		assert.Equal(t, http.StatusBadRequest, code, name)
		assert.NotEmpty(t, bad.Message, name)
	}
}

func TestHTTPCheckTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(3 * time.Second):
		}
	}))
	defer srv.Close()
	r := httpcheckRouter(&netguard.Guard{AllowPrivate: true}, 150*time.Millisecond)
	code, _, bad := httpcheckPost(t, r, map[string]any{"url": srv.URL})
	assert.Equal(t, http.StatusGatewayTimeout, code)
	assert.Equal(t, "timeout", bad.Code)
}

func TestHTTPCheckBlockedWhenPrivateNotAllowed(t *testing.T) {
	var lookups []string
	g := &netguard.Guard{Lookup: func(_ context.Context, host string) ([]netip.Addr, error) {
		lookups = append(lookups, host)
		switch host {
		case "evil.test":
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		case "internal.test":
			return []netip.Addr{netip.MustParseAddr("10.0.0.5")}, nil
		}
		return nil, &net.DNSError{Err: "no such host", Name: host, IsNotFound: true}
	}}
	r := httpcheckRouter(g, 2*time.Second)

	for name, u := range map[string]string{
		"loopback literal": "http://127.0.0.1:8080/",
		"metadata literal": "http://169.254.169.254/latest/meta-data",
		"ipv6 loopback":    "http://[::1]/",
		"bad scheme":       "ftp://example.com/x",
	} {
		code, _, bad := httpcheckPost(t, r, map[string]any{"url": u})
		assert.Equal(t, http.StatusForbidden, code, name)
		assert.Equal(t, "blocked_target", bad.Code, name)
	}

	// name that resolves to loopback is blocked at dial time
	code, _, bad := httpcheckPost(t, r, map[string]any{"url": "http://evil.test/"})
	assert.Equal(t, http.StatusForbidden, code)
	assert.Equal(t, "blocked_target", bad.Code)

	// unresolvable names give a friendly DNS error, not "blocked"
	code, _, bad = httpcheckPost(t, r, map[string]any{"url": "http://nope.test/"})
	assert.Equal(t, http.StatusBadGateway, code)
	assert.Equal(t, "dns_error", bad.Code)
}

func TestHTTPCheckRedirectToPrivateBlocked(t *testing.T) {
	var privateHits atomic.Int32
	var next atomic.Value // redirect target
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/hit" {
			privateHits.Add(1)
		}
		http.Redirect(w, r, next.Load().(string), http.StatusFound)
	}))
	defer srv.Close()

	g := &netguard.Guard{Lookup: func(_ context.Context, host string) ([]netip.Addr, error) {
		switch host {
		case "public.test":
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		case "internal.test":
			return []netip.Addr{netip.MustParseAddr("10.0.0.5")}, nil
		}
		return nil, &net.DNSError{Err: "no such host", Name: host}
	}}
	// Pin the (policy-allowed) public name to the local test server.
	httpcheckTransportHook = func(tr *http.Transport) {
		orig := tr.DialContext
		tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
			if strings.HasPrefix(addr, "public.test:") {
				var d net.Dialer
				return d.DialContext(ctx, network, srv.Listener.Addr().String())
			}
			return orig(ctx, network, addr)
		}
	}
	t.Cleanup(func() { httpcheckTransportHook = nil })
	r := httpcheckRouter(g, 3*time.Second)

	// sanity: a redirect to another public path is followed
	next.Store("http://public.test/ok")
	code, res, _ := httpcheckPost(t, r, map[string]any{"url": "http://public.test/start", "follow_redirects": false})
	require.Equal(t, 200, code)
	require.Len(t, res.Hops, 1)
	assert.Equal(t, 302, res.Hops[0].Status)

	for name, target := range map[string]string{
		"loopback literal":    "http://127.0.0.1:1/hit",
		"metadata literal":    "http://169.254.169.254/",
		"name to private ip":  "http://internal.test/hit",
		"non http scheme":     "ftp://public.test/",
		"ipv4-mapped literal": "http://[::ffff:10.0.0.1]/",
	} {
		next.Store(target)
		code, res, bad := httpcheckPost(t, r, map[string]any{"url": "http://public.test/start"})
		if code == http.StatusOK {
			// first hop recorded, redirect target refused
			require.Len(t, res.Hops, 1, name)
			require.NotNil(t, res.Error, name)
			assert.Equal(t, "blocked_target", res.Error.Code, name)
			assert.Nil(t, res.Body, name)
		} else {
			assert.Equal(t, "blocked_target", bad.Code, name)
		}
	}
	assert.Zero(t, privateHits.Load())
}

func TestHTTPCheckSecurityAnalysis(t *testing.T) {
	get := func(h http.Header, https bool) map[string]httpcheckSecurityItem {
		s := httpcheckAnalyzeSecurity(h, https)
		m := map[string]httpcheckSecurityItem{}
		for _, it := range s.Items {
			m[it.Name] = it
		}
		return m
	}
	good := http.Header{}
	good.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
	good.Set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'")
	good.Set("X-Content-Type-Options", "nosniff")
	good.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	good.Set("Permissions-Policy", "camera=()")
	good.Set("Cross-Origin-Opener-Policy", "same-origin")
	good.Set("Cross-Origin-Resource-Policy", "same-site")
	s := httpcheckAnalyzeSecurity(good, true)
	assert.Equal(t, 100, s.Score)
	for _, it := range s.Items {
		assert.Equal(t, "pass", it.Status, it.Name)
	}

	assert.Equal(t, 0, httpcheckAnalyzeSecurity(http.Header{}, true).Score)

	weak := http.Header{}
	weak.Set("Strict-Transport-Security", "max-age=300")
	weak.Set("Content-Security-Policy", "script-src 'self' 'unsafe-inline'")
	weak.Set("X-Content-Type-Options", "yes")
	weak.Set("X-Frame-Options", "ALLOW-FROM https://x")
	weak.Set("Referrer-Policy", "unsafe-url")
	weak.Set("Cross-Origin-Opener-Policy", "unsafe-none")
	weak.Set("Cross-Origin-Resource-Policy", "cross-origin")
	m := get(weak, true)
	for _, name := range []string{"Strict-Transport-Security", "Content-Security-Policy", "X-Content-Type-Options",
		"X-Frame-Options / frame-ancestors", "Referrer-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy"} {
		assert.Equal(t, "warn", m[name].Status, name)
	}
	assert.Equal(t, "missing", m["Permissions-Policy"].Status)

	assert.Equal(t, "missing", get(http.Header{}, false)["Strict-Transport-Security"].Status)
}

func TestHTTPCheckCookies(t *testing.T) {
	h := http.Header{}
	h.Add("Set-Cookie", "a=1; Secure; HttpOnly; SameSite=Strict")
	h.Add("Set-Cookie", "b=2; SameSite=None")
	resp := &http.Response{Header: h}
	cs := httpcheckCookies(resp.Cookies())
	require.Len(t, cs, 2)
	assert.Empty(t, cs[0].Hints)
	assert.Equal(t, "Strict", cs[0].SameSite)
	assert.Equal(t, "None", cs[1].SameSite)
	assert.Len(t, cs[1].Hints, 3) // no Secure, no HttpOnly, None without Secure
}

func TestHTTPCheckTextDetection(t *testing.T) {
	assert.True(t, httpcheckIsText([]byte("héllo\nworld\t")))
	assert.True(t, httpcheckIsText(nil))
	assert.False(t, httpcheckIsText([]byte{'a', 0, 'b'}))
	assert.False(t, httpcheckIsText([]byte{0xff, 0xfe}))
	assert.Equal(t, []byte("a"), httpcheckTrimPartialRune([]byte{'a', 0xc3}))
	assert.Equal(t, []byte("aé"), httpcheckTrimPartialRune([]byte("aé")))
}
