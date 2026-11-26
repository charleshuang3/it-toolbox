// Package netguard is the shared safety layer for outbound connections made
// on behalf of users (DNS lookup, TLS check, HTTP inspector, ...). It provides
// an address policy, a DNS-rebinding-safe dialer, HTTP/TLS helpers built on it,
// and router middleware for rate and concurrency limiting. It registers no
// HTTP routes of its own.
package netguard

import (
	"errors"
	"fmt"
	"net/netip"
)

// ErrBlockedAddress is returned (wrapped) whenever the address policy denies a target.
var ErrBlockedAddress = errors.New("netguard: destination address is not allowed")

func mustPrefixes(ss ...string) []netip.Prefix {
	out := make([]netip.Prefix, len(ss))
	for i, s := range ss {
		out[i] = netip.MustParsePrefix(s)
	}
	return out
}

// deniedV4 lists IPv4 ranges that are never reachable by default.
var deniedV4 = mustPrefixes(
	"0.0.0.0/8",       // "this network", unspecified
	"10.0.0.0/8",      // RFC1918
	"100.64.0.0/10",   // CGNAT
	"127.0.0.0/8",     // loopback
	"169.254.0.0/16",  // link-local, cloud metadata
	"172.16.0.0/12",   // RFC1918
	"192.0.0.0/24",    // IETF protocol assignments
	"192.0.2.0/24",    // TEST-NET-1
	"192.88.99.0/24",  // deprecated 6to4 relay anycast
	"192.168.0.0/16",  // RFC1918
	"198.18.0.0/15",   // benchmarking
	"198.51.100.0/24", // TEST-NET-2
	"203.0.113.0/24",  // TEST-NET-3
	"224.0.0.0/4",     // multicast
	"240.0.0.0/4",     // reserved, includes 255.255.255.255 broadcast
)

// deniedV6 lists native IPv6 ranges that are denied. Forms that embed an IPv4
// address (mapped, NAT64, 6to4) are handled separately.
var deniedV6 = mustPrefixes(
	"::/96",          // unspecified, loopback and deprecated IPv4-compatible
	"64:ff9b:1::/48", // local-use NAT64
	"100::/64",       // discard-only
	"2001::/23",      // IETF protocol assignments, Teredo, ORCHID
	"2001:db8::/32",  // documentation
	"3fff::/20",      // documentation (RFC 9637)
	"fc00::/7",       // unique local
	"fe80::/10",      // link-local
	"fec0::/10",      // deprecated site-local
	"ff00::/8",       // multicast
)

var (
	nat64Prefix = netip.MustParsePrefix("64:ff9b::/96")
	sixToFour   = netip.MustParsePrefix("2002::/16")
)

// CheckAddr returns nil if ip is a publicly routable address that may be
// contacted, or an error wrapping ErrBlockedAddress otherwise.
func CheckAddr(ip netip.Addr) error {
	if reason := denyReason(ip); reason != "" {
		return fmt.Errorf("%w: %s (%s)", ErrBlockedAddress, ip.WithZone(""), reason)
	}
	return nil
}

// IsAllowedAddr reports whether ip passes the default-deny address policy.
func IsAllowedAddr(ip netip.Addr) bool { return denyReason(ip) == "" }

func denyReason(ip netip.Addr) string {
	if !ip.IsValid() {
		return "invalid address"
	}
	ip = ip.WithZone("")
	// Treat ::ffff:a.b.c.d exactly like a.b.c.d.
	ip = ip.Unmap()

	if ip.Is4() {
		return denyV4(ip)
	}

	// IPv6 forms embedding an IPv4 address: judge the embedded address.
	b := ip.As16()
	switch {
	case nat64Prefix.Contains(ip):
		return embedded("NAT64", netip.AddrFrom4([4]byte(b[12:16])))
	case sixToFour.Contains(ip):
		return embedded("6to4", netip.AddrFrom4([4]byte(b[2:6])))
	}
	for _, p := range deniedV6 {
		if p.Contains(ip) {
			return "reserved/non-public IPv6 range " + p.String()
		}
	}
	if !ip.IsGlobalUnicast() {
		return "not global unicast"
	}
	return ""
}

func embedded(kind string, v4 netip.Addr) string {
	if r := denyV4(v4); r != "" {
		return kind + "-embedded " + r
	}
	return ""
}

func denyV4(ip netip.Addr) string {
	for _, p := range deniedV4 {
		if p.Contains(ip) {
			return "reserved/non-public IPv4 range " + p.String()
		}
	}
	return ""
}
