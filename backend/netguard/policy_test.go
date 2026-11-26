package netguard

import (
	"net/netip"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestAddrPolicy(t *testing.T) {
	tests := []struct {
		ip      string
		allowed bool
	}{
		// public v4
		{"8.8.8.8", true},
		{"1.1.1.1", true},
		{"93.184.216.34", true},
		{"172.15.255.255", true},
		{"172.32.0.0", true},
		{"100.63.255.255", true},
		{"100.128.0.0", true},
		{"169.253.255.255", true},
		{"169.255.0.0", true},
		{"223.255.255.255", true},
		// loopback / unspecified
		{"127.0.0.1", false},
		{"127.255.255.254", false},
		{"0.0.0.0", false},
		{"0.1.2.3", false},
		// RFC1918
		{"10.0.0.1", false},
		{"10.255.255.255", false},
		{"172.16.0.1", false},
		{"172.31.255.255", false},
		{"192.168.1.1", false},
		// link-local / metadata
		{"169.254.169.254", false},
		{"169.254.0.1", false},
		// CGNAT
		{"100.64.0.1", false},
		{"100.127.255.255", false},
		// multicast, broadcast, reserved
		{"224.0.0.1", false},
		{"239.255.255.255", false},
		{"255.255.255.255", false},
		{"240.0.0.1", false},
		// documentation, benchmarking, special
		{"192.0.2.1", false},
		{"198.51.100.7", false},
		{"203.0.113.9", false},
		{"198.18.0.1", false},
		{"198.19.255.255", false},
		{"192.0.0.8", false},
		{"192.88.99.1", false},

		// public v6
		{"2606:4700:4700::1111", true},
		{"2001:4860:4860::8888", true},
		{"2a00:1450:4001:81b::200e", true},
		// v6 specials
		{"::", false},
		{"::1", false},
		{"fc00::1", false},
		{"fd12:3456:789a::1", false},
		{"fe80::1", false},
		{"fe80::1%eth0", false},
		{"febf::1", false},
		{"fec0::1", false},
		{"ff02::1", false},
		{"ff0e::1", false},
		{"2001:db8::1", false},
		{"2001::1", false}, // Teredo
		{"100::1", false},
		{"64:ff9b:1::1", false},
		{"3fff::1", false},

		// IPv4-mapped
		{"::ffff:8.8.8.8", true},
		{"::ffff:10.0.0.1", false},
		{"::ffff:127.0.0.1", false},
		{"::ffff:192.168.0.1", false},
		{"::ffff:169.254.169.254", false},
		{"::ffff:100.64.0.1", false},
		{"::ffff:0.0.0.0", false},
		{"::ffff:255.255.255.255", false},
		{"::ffff:224.0.0.1", false},
		{"::ffff:203.0.113.1", false},
		{"::ffff:7f00:1", false}, // hex form of ::ffff:127.0.0.1
		// IPv4-compatible (deprecated)
		{"::10.0.0.1", false},
		{"::127.0.0.1", false},
		{"::8.8.8.8", false},
		{"::a9fe:a9fe", false}, // ::169.254.169.254
		// NAT64
		{"64:ff9b::808:808", true},
		{"64:ff9b::a00:1", false},
		{"64:ff9b::7f00:1", false},
		{"64:ff9b::a9fe:a9fe", false},
		// 6to4
		{"2002:808:808::1", true},
		{"2002:a00:1::1", false},
		{"2002:7f00:1::", false},
		{"2002:a9fe:a9fe::1", false},

		// invalid
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.ip, func(t *testing.T) {
			var ip netip.Addr
			if tt.ip != "" {
				ip = netip.MustParseAddr(tt.ip)
			}
			assert.Equal(t, tt.allowed, IsAllowedAddr(ip))
			err := CheckAddr(ip)
			if tt.allowed {
				assert.NoError(t, err)
			} else {
				assert.ErrorIs(t, err, ErrBlockedAddress)
			}
		})
	}
}
