package netguard

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"github.com/charleshuang3/it-toolbox/backend/config"
)

// ClientIPResolver determines the client IP of a request. X-Forwarded-For is
// only consulted when behind_proxy is configured; otherwise it is ignored
// because any client can forge it.
type ClientIPResolver struct {
	behindProxy bool
	trusted     []netip.Prefix // empty with behindProxy: the direct peer is trusted
}

// NewClientIPResolver builds a resolver from the network_tools configuration.
func NewClientIPResolver(cfg config.NetworkToolsConfig) (*ClientIPResolver, error) {
	r := &ClientIPResolver{behindProxy: cfg.BehindProxy}
	for _, s := range cfg.TrustedProxies {
		if p, err := netip.ParsePrefix(s); err == nil {
			r.trusted = append(r.trusted, p.Masked())
			continue
		}
		ip, err := netip.ParseAddr(s)
		if err != nil {
			return nil, fmt.Errorf("netguard: invalid trusted proxy %q", s)
		}
		ip = ip.Unmap()
		r.trusted = append(r.trusted, netip.PrefixFrom(ip, ip.BitLen()))
	}
	return r, nil
}

func (r *ClientIPResolver) isTrusted(ip netip.Addr) bool {
	if len(r.trusted) == 0 {
		return true
	}
	for _, p := range r.trusted {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// ClientIP returns the client address for req, or the zero Addr if unknown.
//
// Without behind_proxy this is the TCP peer. With behind_proxy, and only if
// the peer is a trusted proxy, X-Forwarded-For is walked right to left and the
// first address that is not itself a trusted proxy is returned (entries added
// by the client on the left are never preferred over those added by our
// proxies). With behind_proxy but an empty trusted_proxies list, the rightmost
// entry, which is the one appended by the directly connected proxy, is used.
func (r *ClientIPResolver) ClientIP(req *http.Request) netip.Addr {
	peer := parseHostAddr(req.RemoteAddr)
	if !r.behindProxy || !peer.IsValid() || !r.isTrusted(peer) {
		return peer
	}
	var hops []string
	for _, v := range req.Header.Values("X-Forwarded-For") {
		hops = append(hops, strings.Split(v, ",")...)
	}
	for i := len(hops) - 1; i >= 0; i-- {
		ip, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			// Garbled header: do not guess, fall back to the peer.
			return peer
		}
		ip = ip.Unmap().WithZone("")
		if len(r.trusted) > 0 && r.isTrusted(ip) {
			continue
		}
		return ip
	}
	return peer
}

func parseHostAddr(hostport string) netip.Addr {
	host, _, err := net.SplitHostPort(hostport)
	if err != nil {
		host = hostport
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}
	}
	return ip.Unmap().WithZone("")
}

// limiterKey groups IPv6 clients by /64, since a single host controls a whole /64.
func limiterKey(ip netip.Addr) string {
	if !ip.IsValid() {
		return "unknown"
	}
	if ip.Is6() {
		return netip.PrefixFrom(ip, 64).Masked().String()
	}
	return ip.String()
}

const (
	defaultIdleTTL       = 10 * time.Minute
	defaultSweepInterval = time.Minute
)

type visitor struct {
	lim      *rate.Limiter
	lastSeen time.Time
}

// RateLimiter is a per-client-IP token bucket. Idle entries are swept lazily
// as requests arrive, so it needs no background goroutine.
type RateLimiter struct {
	resolver *ClientIPResolver
	limit    rate.Limit
	burst    int
	idleTTL  time.Duration
	sweepGap time.Duration
	now      func() time.Time

	mu        sync.Mutex
	visitors  map[string]*visitor
	lastSweep time.Time
}

// NewRateLimiter allows perMinute sustained requests per client with the
// given burst (burst <= 0 means perMinute, minimum 1). perMinute must be > 0.
func NewRateLimiter(perMinute, burst int, resolver *ClientIPResolver) *RateLimiter {
	if burst <= 0 {
		burst = perMinute
	}
	if burst < 1 {
		burst = 1
	}
	if resolver == nil {
		resolver = &ClientIPResolver{}
	}
	return &RateLimiter{
		resolver: resolver,
		limit:    rate.Limit(float64(perMinute) / 60.0),
		burst:    burst,
		idleTTL:  defaultIdleTTL,
		sweepGap: defaultSweepInterval,
		now:      time.Now,
		visitors: make(map[string]*visitor),
	}
}

// Allow consumes a token for the client and reports whether the request may
// proceed; retryAfter is how long to wait when it may not.
func (l *RateLimiter) Allow(ip netip.Addr) (ok bool, retryAfter time.Duration) {
	now := l.now()
	key := limiterKey(ip)

	l.mu.Lock()
	defer l.mu.Unlock()
	l.sweepLocked(now)
	v, found := l.visitors[key]
	if !found {
		v = &visitor{lim: rate.NewLimiter(l.limit, l.burst)}
		l.visitors[key] = v
	}
	v.lastSeen = now
	r := v.lim.ReserveN(now, 1)
	if !r.OK() {
		return false, time.Minute
	}
	if d := r.DelayFrom(now); d > 0 {
		r.CancelAt(now)
		return false, d
	}
	return true, 0
}

func (l *RateLimiter) sweepLocked(now time.Time) {
	if now.Sub(l.lastSweep) < l.sweepGap {
		return
	}
	l.lastSweep = now
	for k, v := range l.visitors {
		if now.Sub(v.lastSeen) > l.idleTTL {
			delete(l.visitors, k)
		}
	}
}

// Len returns the number of tracked clients.
func (l *RateLimiter) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.visitors)
}

// Middleware returns gin middleware replying 429 with Retry-After when the
// client exceeds its rate.
func (l *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, wait := l.Allow(l.resolver.ClientIP(c.Request))
		if !ok {
			secs := int((wait + time.Second - 1) / time.Second)
			if secs < 1 {
				secs = 1
			}
			c.Header("Retry-After", strconv.Itoa(secs))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}

// ConcurrencyLimiter bounds the number of requests in flight.
type ConcurrencyLimiter struct {
	slots chan struct{}
}

// NewConcurrencyLimiter allows at most max concurrent requests (max must be > 0).
func NewConcurrencyLimiter(max int) *ConcurrencyLimiter {
	return &ConcurrencyLimiter{slots: make(chan struct{}, max)}
}

// TryAcquire takes a slot without blocking; call the returned release once.
func (l *ConcurrencyLimiter) TryAcquire() (release func(), ok bool) {
	select {
	case l.slots <- struct{}{}:
		return func() { <-l.slots }, true
	default:
		return nil, false
	}
}

// InFlight returns the number of slots currently held.
func (l *ConcurrencyLimiter) InFlight() int { return len(l.slots) }

// Middleware returns gin middleware replying 503 when all slots are busy.
func (l *ConcurrencyLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		release, ok := l.TryAcquire()
		if !ok {
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "too many concurrent requests"})
			return
		}
		defer release()
		c.Next()
	}
}

// Middlewares builds the rate limiter and concurrency limiter described by
// cfg, in the order they should be applied. A limit of 0 disables that
// limiter. Typical use:
//
//	mws, err := netguard.Middlewares(conf.NetworkTools)
//	grp := api.Group("/net", mws...)
func Middlewares(cfg config.NetworkToolsConfig) ([]gin.HandlerFunc, error) {
	resolver, err := NewClientIPResolver(cfg)
	if err != nil {
		return nil, err
	}
	var mws []gin.HandlerFunc
	if cfg.RateLimitPerMinute > 0 {
		mws = append(mws, NewRateLimiter(cfg.RateLimitPerMinute, cfg.RateLimitBurst, resolver).Middleware())
	}
	if cfg.MaxConcurrent > 0 {
		mws = append(mws, NewConcurrencyLimiter(cfg.MaxConcurrent).Middleware())
	}
	return mws, nil
}
