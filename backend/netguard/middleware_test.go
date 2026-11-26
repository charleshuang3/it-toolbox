package netguard

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/charleshuang3/it-toolbox/backend/config"
)

func init() { gin.SetMode(gin.TestMode) }

func TestClientIP(t *testing.T) {
	tests := []struct {
		name       string
		cfg        config.NetworkToolsConfig
		remote     string
		xff        []string
		want       string
		wantNewErr bool
	}{
		{"direct, no proxy", config.NetworkToolsConfig{}, "203.0.113.7:1234", nil, "203.0.113.7", false},
		{"xff ignored without behind_proxy", config.NetworkToolsConfig{}, "203.0.113.7:1234", []string{"1.2.3.4"}, "203.0.113.7", false},
		{"xff ignored when only trusted_proxies set", config.NetworkToolsConfig{TrustedProxies: []string{"10.0.0.0/8"}}, "10.0.0.1:1", []string{"1.2.3.4"}, "10.0.0.1", false},
		{"ipv6 peer", config.NetworkToolsConfig{}, "[2001:db8::1]:99", nil, "2001:db8::1", false},
		{"mapped peer", config.NetworkToolsConfig{}, "[::ffff:1.2.3.4]:99", nil, "1.2.3.4", false},
		{"behind proxy any peer: rightmost", config.NetworkToolsConfig{BehindProxy: true}, "10.0.0.1:1", []string{"6.6.6.6, 1.2.3.4"}, "1.2.3.4", false},
		{"behind proxy spoof prefix ignored", config.NetworkToolsConfig{BehindProxy: true}, "10.0.0.1:1", []string{"9.9.9.9", "1.2.3.4"}, "1.2.3.4", false},
		{"behind proxy no header", config.NetworkToolsConfig{BehindProxy: true}, "10.0.0.1:1", nil, "10.0.0.1", false},
		{"behind proxy garbage header", config.NetworkToolsConfig{BehindProxy: true}, "10.0.0.1:1", []string{"not-an-ip"}, "10.0.0.1", false},
		{"trusted peer, skip trusted hops", config.NetworkToolsConfig{BehindProxy: true, TrustedProxies: []string{"10.0.0.0/8", "192.168.1.1"}}, "10.0.0.1:1", []string{"8.8.8.8, 10.0.0.9, 192.168.1.1"}, "8.8.8.8", false},
		{"untrusted peer cannot set xff", config.NetworkToolsConfig{BehindProxy: true, TrustedProxies: []string{"10.0.0.0/8"}}, "203.0.113.7:1", []string{"1.2.3.4"}, "203.0.113.7", false},
		{"all hops trusted falls back to peer", config.NetworkToolsConfig{BehindProxy: true, TrustedProxies: []string{"10.0.0.0/8"}}, "10.0.0.1:1", []string{"10.0.0.5"}, "10.0.0.1", false},
		{"v6 xff with zone/mapped", config.NetworkToolsConfig{BehindProxy: true}, "10.0.0.1:1", []string{"::ffff:5.5.5.5"}, "5.5.5.5", false},
		{"bad trusted proxy", config.NetworkToolsConfig{TrustedProxies: []string{"junk"}}, "", nil, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, err := NewClientIPResolver(tt.cfg)
			if tt.wantNewErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = tt.remote
			for _, v := range tt.xff {
				req.Header.Add("X-Forwarded-For", v)
			}
			assert.Equal(t, netip.MustParseAddr(tt.want), r.ClientIP(req))
		})
	}
}

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

func TestRateLimiterBurstAndRefill(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := NewRateLimiter(60, 3, nil) // 1/sec, burst 3
	l.now = clk.now
	a := netip.MustParseAddr("1.1.1.1")
	b := netip.MustParseAddr("2.2.2.2")

	for i := 0; i < 3; i++ {
		ok, _ := l.Allow(a)
		require.True(t, ok, "burst request %d", i)
	}
	ok, wait := l.Allow(a)
	assert.False(t, ok)
	assert.InDelta(t, time.Second.Seconds(), wait.Seconds(), 0.01)

	// other clients are unaffected
	ok, _ = l.Allow(b)
	assert.True(t, ok)

	// a rejected request must not consume tokens: after 1s exactly one passes
	clk.t = clk.t.Add(time.Second)
	ok, _ = l.Allow(a)
	assert.True(t, ok)
	ok, _ = l.Allow(a)
	assert.False(t, ok)
}

func TestRateLimiterIPv6GroupedBy64(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := NewRateLimiter(60, 1, nil)
	l.now = clk.now
	ok, _ := l.Allow(netip.MustParseAddr("2606:4700:1:2::1"))
	assert.True(t, ok)
	ok, _ = l.Allow(netip.MustParseAddr("2606:4700:1:2:ffff::9"))
	assert.False(t, ok, "same /64 shares a bucket")
	ok, _ = l.Allow(netip.MustParseAddr("2606:4700:1:3::1"))
	assert.True(t, ok)
}

func TestRateLimiterCleansIdleEntries(t *testing.T) {
	clk := &fakeClock{t: time.Unix(1_000_000, 0)}
	l := NewRateLimiter(60, 1, nil)
	l.now = clk.now
	for i := 0; i < 50; i++ {
		l.Allow(netip.AddrFrom4([4]byte{10, 0, 0, byte(i)}))
	}
	assert.Equal(t, 50, l.Len())

	clk.t = clk.t.Add(defaultIdleTTL + 2*defaultSweepInterval)
	l.Allow(netip.MustParseAddr("9.9.9.9"))
	assert.Equal(t, 1, l.Len(), "idle entries must be evicted")
}

func TestRateLimiterConcurrent(t *testing.T) {
	l := NewRateLimiter(600, 10, nil)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				l.Allow(netip.AddrFrom4([4]byte{1, 1, 1, byte(j % 7)}))
			}
		}()
	}
	wg.Wait()
	assert.LessOrEqual(t, l.Len(), 7)
}

func do(r http.Handler, remote string, hdr map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.RemoteAddr = remote
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRateLimitMiddleware(t *testing.T) {
	cfg := config.NetworkToolsConfig{RateLimitPerMinute: 2, RateLimitBurst: 2}
	mws, err := Middlewares(cfg)
	require.NoError(t, err)
	require.Len(t, mws, 1)
	r := gin.New()
	r.GET("/x", append(mws, func(c *gin.Context) { c.String(200, "ok") })...)

	assert.Equal(t, 200, do(r, "1.1.1.1:1", nil).Code)
	assert.Equal(t, 200, do(r, "1.1.1.1:2", nil).Code)
	w := do(r, "1.1.1.1:3", nil)
	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.NotEmpty(t, w.Header().Get("Retry-After"))

	// spoofing X-Forwarded-For must not buy a fresh bucket
	assert.Equal(t, http.StatusTooManyRequests, do(r, "1.1.1.1:4", map[string]string{"X-Forwarded-For": "7.7.7.7"}).Code)
	// a different peer has its own bucket
	assert.Equal(t, 200, do(r, "2.2.2.2:1", nil).Code)
}

func TestRateLimitMiddlewareBehindProxy(t *testing.T) {
	cfg := config.NetworkToolsConfig{RateLimitPerMinute: 1, BehindProxy: true, TrustedProxies: []string{"10.0.0.1"}}
	mws, err := Middlewares(cfg)
	require.NoError(t, err)
	r := gin.New()
	r.GET("/x", append(mws, func(c *gin.Context) { c.String(200, "ok") })...)

	assert.Equal(t, 200, do(r, "10.0.0.1:1", map[string]string{"X-Forwarded-For": "8.8.8.8"}).Code)
	assert.Equal(t, 429, do(r, "10.0.0.1:1", map[string]string{"X-Forwarded-For": "8.8.8.8"}).Code)
	assert.Equal(t, 200, do(r, "10.0.0.1:1", map[string]string{"X-Forwarded-For": "8.8.4.4"}).Code)
}

func TestConcurrencyLimiter(t *testing.T) {
	l := NewConcurrencyLimiter(2)
	r1, ok := l.TryAcquire()
	require.True(t, ok)
	r2, ok := l.TryAcquire()
	require.True(t, ok)
	_, ok = l.TryAcquire()
	assert.False(t, ok)
	assert.Equal(t, 2, l.InFlight())
	r1()
	assert.Equal(t, 1, l.InFlight())
	r3, ok := l.TryAcquire()
	assert.True(t, ok)
	r2()
	r3()
	assert.Equal(t, 0, l.InFlight())
}

func TestConcurrencyMiddleware(t *testing.T) {
	l := NewConcurrencyLimiter(1)
	started := make(chan struct{})
	finish := make(chan struct{})
	r := gin.New()
	r.GET("/x", l.Middleware(), func(c *gin.Context) {
		close(started)
		<-finish
		c.String(200, "ok")
	})

	done := make(chan int)
	go func() { done <- do(r, "1.1.1.1:1", nil).Code }()
	<-started

	w := do(r, "1.1.1.1:2", nil)
	assert.Equal(t, http.StatusServiceUnavailable, w.Code)
	assert.Equal(t, "1", w.Header().Get("Retry-After"))

	close(finish)
	assert.Equal(t, 200, <-done)
	assert.Equal(t, 0, l.InFlight(), "slot released after handler returns")
}

func TestMiddlewaresDisabledAndInvalid(t *testing.T) {
	mws, err := Middlewares(config.NetworkToolsConfig{})
	require.NoError(t, err)
	assert.Empty(t, mws)

	mws, err = Middlewares(config.NetworkToolsConfig{RateLimitPerMinute: 1, MaxConcurrent: 1})
	require.NoError(t, err)
	assert.Len(t, mws, 2)

	_, err = Middlewares(config.NetworkToolsConfig{TrustedProxies: []string{"zzz"}})
	assert.Error(t, err)
}
