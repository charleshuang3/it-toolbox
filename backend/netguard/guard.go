package netguard

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"syscall"
	"time"

	"github.com/charleshuang3/it-toolbox/backend/config"
)

const (
	// DefaultMaxRedirects is the redirect hop cap used by HTTPClient when none is given.
	DefaultMaxRedirects = 5
	defaultDialTimeout  = 10 * time.Second
)

// LookupFunc resolves a hostname to IP addresses. It is injectable for tests.
type LookupFunc func(ctx context.Context, host string) ([]netip.Addr, error)

func defaultLookup(ctx context.Context, host string) ([]netip.Addr, error) {
	return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
}

// Guard dials outbound connections while enforcing the address policy.
//
// The hostname is resolved exactly once per dial, every resolved address is
// checked, and the connection is made directly to a checked IP literal, so a
// DNS answer that changes between "check" and "connect" (DNS rebinding) has no
// effect. A net.Dialer.Control hook re-checks the final socket address as
// defense in depth.
type Guard struct {
	// AllowPrivate disables the address policy (self-hosted intranet use).
	AllowPrivate bool
	// DialTimeout bounds a single dial (default 10s).
	DialTimeout time.Duration
	// Lookup overrides the resolver (default: net.DefaultResolver).
	Lookup LookupFunc

	// dial overrides the raw connect step; tests only.
	dial func(ctx context.Context, network, addr string) (net.Conn, error)
}

// NewGuard builds a Guard from the network_tools configuration.
func NewGuard(cfg config.NetworkToolsConfig) *Guard {
	return &Guard{AllowPrivate: cfg.AllowPrivate, DialTimeout: cfg.RequestTimeout}
}

// CheckIP applies the address policy (a no-op when AllowPrivate is set).
func (g *Guard) CheckIP(ip netip.Addr) error {
	if g.AllowPrivate {
		return nil
	}
	return CheckAddr(ip)
}

// Resolve resolves host (an IP literal or a name) and returns the addresses
// that pass the policy. If any resolved address is denied the whole lookup is
// refused: a name that mixes public and private records is treated as hostile.
func (g *Guard) Resolve(ctx context.Context, host string) ([]netip.Addr, error) {
	host = strings.TrimSuffix(strings.Trim(host, "[]"), ".")
	if host == "" {
		return nil, errors.New("netguard: empty host")
	}
	var ips []netip.Addr
	if ip, err := netip.ParseAddr(host); err == nil {
		ips = []netip.Addr{ip}
	} else {
		lookup := g.Lookup
		if lookup == nil {
			lookup = defaultLookup
		}
		if ips, err = lookup(ctx, host); err != nil {
			return nil, err
		}
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("netguard: no addresses found for %q", host)
	}
	for _, ip := range ips {
		if err := g.CheckIP(ip); err != nil {
			return nil, fmt.Errorf("%w (resolved from %q)", err, host)
		}
	}
	return ips, nil
}

// DialContext is a drop-in for net.Dialer.DialContext / http.Transport.DialContext.
func (g *Guard) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	var want4, want6 bool
	switch network {
	case "tcp", "udp":
		want4, want6 = true, true
	case "tcp4", "udp4":
		want4 = true
	case "tcp6", "udp6":
		want6 = true
	default:
		return nil, fmt.Errorf("netguard: unsupported network %q", network)
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := g.Resolve(ctx, host)
	if err != nil {
		return nil, err
	}

	var errs []error
	for _, ip := range ips {
		ip = ip.Unmap()
		if (ip.Is4() && !want4) || (ip.Is6() && !want6) {
			continue
		}
		conn, err := g.connect(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		errs = append(errs, err)
		if ctx.Err() != nil {
			break
		}
	}
	if len(errs) == 0 {
		return nil, fmt.Errorf("netguard: no usable %s address for %q", network, host)
	}
	return nil, errors.Join(errs...)
}

func (g *Guard) connect(ctx context.Context, network, ipAddr string) (net.Conn, error) {
	if g.dial != nil {
		return g.dial(ctx, network, ipAddr)
	}
	timeout := g.DialTimeout
	if timeout <= 0 {
		timeout = defaultDialTimeout
	}
	d := &net.Dialer{Timeout: timeout, Control: g.control}
	return d.DialContext(ctx, network, ipAddr)
}

// control re-validates the exact address the socket is about to connect to.
func (g *Guard) control(_, address string, _ syscall.RawConn) error {
	if g.AllowPrivate {
		return nil
	}
	ap, err := netip.ParseAddrPort(address)
	if err != nil {
		return fmt.Errorf("%w: unparsable address %q", ErrBlockedAddress, address)
	}
	return CheckAddr(ap.Addr())
}

// DialTLS connects through the guard and performs a TLS handshake. If
// cfg.ServerName is empty it is set from the host in address (unless the host
// is an IP literal). The caller's cfg is not modified.
func (g *Guard) DialTLS(ctx context.Context, network, address string, cfg *tls.Config) (*tls.Conn, error) {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	if cfg == nil {
		cfg = &tls.Config{MinVersion: tls.VersionTLS12}
	} else {
		cfg = cfg.Clone()
	}
	if cfg.ServerName == "" && !cfg.InsecureSkipVerify {
		if _, perr := netip.ParseAddr(strings.Trim(host, "[]")); perr != nil {
			cfg.ServerName = host
		}
	}
	raw, err := g.DialContext(ctx, network, address)
	if err != nil {
		return nil, err
	}
	conn := tls.Client(raw, cfg)
	if err := conn.HandshakeContext(ctx); err != nil {
		_ = raw.Close()
		return nil, err
	}
	return conn, nil
}

// Transport returns an http.Transport whose connections all go through the
// guard. Environment proxies are deliberately ignored (a proxy would see, and
// could be asked to reach, arbitrary destinations).
func (g *Guard) Transport() *http.Transport {
	return &http.Transport{
		Proxy:                 nil,
		DialContext:           g.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          10,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 0,
		ExpectContinueTimeout: time.Second,
	}
}

// CheckRedirect returns an http.Client.CheckRedirect hook that caps the number
// of hops (maxRedirects <= 0 means DefaultMaxRedirects), allows only http and
// https targets, and re-validates IP-literal targets on every hop. Hostnames
// are validated by the dialer when the next hop connects.
func (g *Guard) CheckRedirect(maxRedirects int) func(req *http.Request, via []*http.Request) error {
	if maxRedirects <= 0 {
		maxRedirects = DefaultMaxRedirects
	}
	return func(req *http.Request, via []*http.Request) error {
		if len(via) > maxRedirects {
			return fmt.Errorf("netguard: stopped after %d redirects", maxRedirects)
		}
		if err := g.CheckURL(req.URL); err != nil {
			return fmt.Errorf("netguard: redirect blocked: %w", err)
		}
		return nil
	}
}

// CheckURL verifies the scheme is http/https, a host is present, and, if the
// host is an IP literal, that it passes the policy. It does not resolve names.
func (g *Guard) CheckURL(u *url.URL) error {
	if u == nil {
		return errors.New("netguard: nil URL")
	}
	if s := strings.ToLower(u.Scheme); s != "http" && s != "https" {
		return fmt.Errorf("netguard: scheme %q is not allowed", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("netguard: URL has no host")
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		return g.CheckIP(ip)
	}
	return nil
}
