package nettools

import (
	"bytes"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/miekg/dns"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

// dnsTestServer starts a UDP+TCP DNS server on 127.0.0.1 and returns "127.0.0.1:port".
func dnsTestServer(t *testing.T, handler dns.HandlerFunc) string {
	t.Helper()
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	require.NoError(t, err)
	_, port, _ := net.SplitHostPort(pc.LocalAddr().String())
	ln, err := net.Listen("tcp", "127.0.0.1:"+port)
	require.NoError(t, err)

	started := make(chan struct{}, 2)
	notify := func() { started <- struct{}{} }
	udp := &dns.Server{PacketConn: pc, Handler: handler, NotifyStartedFunc: notify}
	tcp := &dns.Server{Listener: ln, Handler: handler, NotifyStartedFunc: notify}
	go func() { _ = udp.ActivateAndServe() }()
	go func() { _ = tcp.ActivateAndServe() }()
	<-started
	<-started
	t.Cleanup(func() { _ = udp.Shutdown(); _ = tcp.Shutdown() })
	return "127.0.0.1:" + port
}

func dnsTestHandler(w dns.ResponseWriter, r *dns.Msg) {
	m := new(dns.Msg)
	m.SetReply(r)
	m.Authoritative = true
	q := r.Question[0]
	switch {
	case q.Name == "nx.example.com.":
		m.Rcode = dns.RcodeNameError
	case q.Name == "big.example.com." && q.Qtype == dns.TypeTXT:
		// Large answer: truncated over UDP, complete over TCP.
		for i := 0; i < 30; i++ {
			m.Answer = append(m.Answer, &dns.TXT{
				Hdr: dns.RR_Header{Name: q.Name, Rrtype: dns.TypeTXT, Class: dns.ClassINET, Ttl: 60},
				Txt: []string{strings.Repeat("x", 100)},
			})
		}
		if _, isUDP := w.RemoteAddr().(*net.UDPAddr); isUDP {
			m.Answer = m.Answer[:0]
			m.Truncated = true
		}
	case q.Qtype == dns.TypeA:
		m.Answer = append(m.Answer, &dns.A{
			Hdr: dns.RR_Header{Name: q.Name, Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
			A:   net.ParseIP("93.184.216.34"),
		})
	case q.Qtype == dns.TypeMX:
		m.Answer = append(m.Answer, &dns.MX{
			Hdr:        dns.RR_Header{Name: q.Name, Rrtype: dns.TypeMX, Class: dns.ClassINET, Ttl: 120},
			Preference: 10, Mx: "mail.example.com.",
		})
	case q.Qtype == dns.TypePTR:
		m.Answer = append(m.Answer, &dns.PTR{
			Hdr: dns.RR_Header{Name: q.Name, Rrtype: dns.TypePTR, Class: dns.ClassINET, Ttl: 30},
			Ptr: "host.example.com.",
		})
	}
	_ = w.WriteMsg(m)
}

func dnsTestRouter(allowPrivate bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	cfg := config.NetworkToolsConfig{AllowPrivate: allowPrivate, RequestTimeout: 2 * time.Second}
	g := r.Group("/api/net")
	d := Deps{Guard: netguard.NewGuard(cfg), Config: cfg}
	for _, reg := range registrars {
		reg(g, d)
	}
	return r
}

func dnsPost(t *testing.T, r *gin.Engine, body any) (int, dnsResponse, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/net/dns", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var ok dnsResponse
	var e map[string]any
	if w.Code == http.StatusOK {
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &ok))
	} else {
		_ = json.Unmarshal(w.Body.Bytes(), &e)
	}
	return w.Code, ok, e
}

func TestDNSLookupLocalServer(t *testing.T) {
	addr := dnsTestServer(t, dnsTestHandler)
	r := dnsTestRouter(true)

	code, resp, _ := dnsPost(t, r, gin.H{"name": "Example.com", "type": "a", "resolvers": []string{addr}})
	require.Equal(t, 200, code)
	assert.Equal(t, "example.com", resp.Name)
	assert.Equal(t, "A", resp.Type)
	require.Len(t, resp.Results, 1)
	res := resp.Results[0]
	assert.Empty(t, res.Error)
	assert.Equal(t, "NOERROR", res.Rcode)
	assert.True(t, res.Authoritative)
	require.Len(t, res.Answers, 1)
	assert.Equal(t, "A", res.Answers[0].Type)
	assert.EqualValues(t, 300, res.Answers[0].TTL)
	assert.Equal(t, "93.184.216.34", res.Answers[0].Data["address"])
	assert.Equal(t, "93.184.216.34", res.Answers[0].Display)

	code, resp, _ = dnsPost(t, r, gin.H{"name": "example.com", "type": "MX", "resolvers": []string{addr}})
	require.Equal(t, 200, code)
	mx := resp.Results[0].Answers[0]
	assert.EqualValues(t, 10, mx.Data["preference"])
	assert.Equal(t, "mail.example.com.", mx.Data["exchange"])
}

func TestDNSLookupNXDOMAIN(t *testing.T) {
	addr := dnsTestServer(t, dnsTestHandler)
	code, resp, _ := dnsPost(t, dnsTestRouter(true), gin.H{"name": "nx.example.com", "type": "A", "resolvers": []string{addr}})
	require.Equal(t, 200, code)
	assert.Equal(t, "NXDOMAIN", resp.Results[0].Rcode)
	assert.Empty(t, resp.Results[0].Answers)
}

func TestDNSLookupTCPFallback(t *testing.T) {
	addr := dnsTestServer(t, dnsTestHandler)
	code, resp, _ := dnsPost(t, dnsTestRouter(true), gin.H{"name": "big.example.com", "type": "TXT", "resolvers": []string{addr}})
	require.Equal(t, 200, code)
	res := resp.Results[0]
	assert.True(t, res.UsedTCP)
	assert.False(t, res.Truncated)
	assert.Len(t, res.Answers, 30)
}

func TestDNSLookupPTRFromIP(t *testing.T) {
	seen := make(chan string, 4)
	addr := dnsTestServer(t, func(w dns.ResponseWriter, r *dns.Msg) {
		seen <- r.Question[0].Name
		dnsTestHandler(w, r)
	})
	code, resp, _ := dnsPost(t, dnsTestRouter(true), gin.H{"name": "192.0.2.10", "type": "PTR", "resolvers": []string{addr}})
	require.Equal(t, 200, code)
	assert.Equal(t, "10.2.0.192.in-addr.arpa", resp.Name)
	assert.Equal(t, "10.2.0.192.in-addr.arpa.", <-seen)
	assert.Equal(t, "host.example.com.", resp.Results[0].Answers[0].Data["target"])
}

func TestDNSLookupMultipleResolversAndTimeout(t *testing.T) {
	good := dnsTestServer(t, dnsTestHandler)
	// A UDP socket that never answers.
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = pc.Close() })
	silent := pc.LocalAddr().String()

	code, resp, _ := dnsPost(t, dnsTestRouter(true), gin.H{"name": "example.com", "type": "A", "resolvers": []string{good, silent}})
	require.Equal(t, 200, code)
	require.Len(t, resp.Results, 2)
	assert.Empty(t, resp.Results[0].Error)
	assert.Contains(t, resp.Results[1].Error, "timed out")
}

func TestDNSBlockedResolvers(t *testing.T) {
	r := dnsTestRouter(false)
	for _, spec := range []string{"127.0.0.1", "10.0.0.1:5353", "169.254.169.254", "::1", "[fd00::1]:53"} {
		code, resp, _ := dnsPost(t, r, gin.H{"name": "example.com", "type": "A", "resolvers": []string{spec}})
		require.Equal(t, 200, code, spec)
		require.Len(t, resp.Results, 1)
		assert.True(t, resp.Results[0].Blocked, spec)
		assert.Contains(t, resp.Results[0].Error, "not allowed", spec)
	}
}

func TestDNSInvalidResolver(t *testing.T) {
	code, resp, _ := dnsPost(t, dnsTestRouter(false), gin.H{"name": "example.com", "resolvers": []string{"not-a-resolver", "8.8.8.8:99999"}})
	require.Equal(t, 200, code)
	for _, res := range resp.Results {
		assert.NotEmpty(t, res.Error)
		assert.False(t, res.Blocked)
	}
}

func TestDNSSystemResolver(t *testing.T) {
	old := dnsResolvConfPath
	t.Cleanup(func() { dnsResolvConfPath = old })
	dir := t.TempDir()

	private := filepath.Join(dir, "private")
	require.NoError(t, os.WriteFile(private, []byte("nameserver 127.0.0.53\n"), 0o600))
	dnsResolvConfPath = private
	_, resp, _ := dnsPost(t, dnsTestRouter(false), gin.H{"name": "example.com", "resolvers": []string{"system"}})
	assert.True(t, resp.Results[0].Blocked)
	assert.Empty(t, resp.Results[0].Address)

	// Allowed when private addresses are permitted: point it at the local server.
	addr := dnsTestServer(t, dnsTestHandler)
	host, _, _ := net.SplitHostPort(addr)
	local := filepath.Join(dir, "local")
	require.NoError(t, os.WriteFile(local, []byte("nameserver "+host+"\noptions\n"), 0o600))
	dnsResolvConfPath = local
	// ClientConfigFromFile has no port syntax; exercise address selection directly.
	a, err := dnsSystemAddr(Deps{Guard: &netguard.Guard{AllowPrivate: true}})
	require.NoError(t, err)
	assert.Equal(t, net.JoinHostPort(host, "53"), a)

	public := filepath.Join(dir, "public")
	require.NoError(t, os.WriteFile(public, []byte("nameserver 9.9.9.9\n"), 0o600))
	dnsResolvConfPath = public
	a, err = dnsSystemAddr(Deps{Guard: &netguard.Guard{}})
	require.NoError(t, err)
	assert.Equal(t, "9.9.9.9:53", a)

	dnsResolvConfPath = filepath.Join(dir, "missing")
	_, err = dnsSystemAddr(Deps{Guard: &netguard.Guard{}})
	assert.Error(t, err)
}

func TestDNSValidation(t *testing.T) {
	r := dnsTestRouter(false)
	long := strings.Repeat("a", 64) + ".com"
	tooLong := strings.Repeat("abcdefghi.", 26) + "com"
	cases := []struct {
		name string
		body gin.H
	}{
		{"empty name", gin.H{"name": "  ", "type": "A"}},
		{"bad type", gin.H{"name": "example.com", "type": "ANY"}},
		{"long label", gin.H{"name": long, "type": "A"}},
		{"long name", gin.H{"name": tooLong, "type": "A"}},
		{"empty label", gin.H{"name": "a..com", "type": "A"}},
		{"bad char", gin.H{"name": "exa mple.com", "type": "A"}},
		{"too many resolvers", gin.H{"name": "example.com", "type": "A", "resolvers": []string{"1.1.1.1", "8.8.8.8", "9.9.9.9", "1.0.0.1", "8.8.4.4", "149.112.112.112"}}},
	}
	for _, tc := range cases {
		code, _, e := dnsPost(t, r, tc.body)
		assert.Equal(t, 400, code, tc.name)
		assert.NotEmpty(t, e["error"], tc.name)
	}

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/net/dns", strings.NewReader("{bad"))
	r.ServeHTTP(w, req)
	assert.Equal(t, 400, w.Code)
}

func TestDNSNormalizeName(t *testing.T) {
	n, err := dnsNormalizeName("Bücher.example", dns.TypeA)
	require.NoError(t, err)
	assert.Equal(t, "xn--bcher-kva.example.", n)

	n, err = dnsNormalizeName("_sip._tcp.Example.com.", dns.TypeSRV)
	require.NoError(t, err)
	assert.Equal(t, "_sip._tcp.example.com.", n)

	n, err = dnsNormalizeName("2001:db8::1", dns.TypePTR)
	require.NoError(t, err)
	assert.Equal(t, "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa.", n)

	n, err = dnsNormalizeName("host.example.com", dns.TypePTR)
	require.NoError(t, err)
	assert.Equal(t, "host.example.com.", n)
}

func TestDNSRecordFromTypes(t *testing.T) {
	rr, err := dns.NewRR(`example.com. 60 IN CAA 0 issue "letsencrypt.org"`)
	require.NoError(t, err)
	rec := dnsRecordFrom(rr)
	assert.Equal(t, "CAA", rec.Type)
	assert.Equal(t, "issue", rec.Data["tag"])
	assert.Equal(t, "letsencrypt.org", rec.Data["value"])

	rr, err = dns.NewRR(`example.com. 60 IN TXT "v=spf1 " "-all"`)
	require.NoError(t, err)
	rec = dnsRecordFrom(rr)
	assert.Equal(t, "v=spf1 -all", rec.Data["text"])

	rr, err = dns.NewRR(`_sip._tcp.example.com. 60 IN SRV 1 2 5060 sip.example.com.`)
	require.NoError(t, err)
	rec = dnsRecordFrom(rr)
	assert.EqualValues(t, 5060, rec.Data["port"])

	rr, err = dns.NewRR(`example.com. 60 IN SOA ns1.example.com. admin.example.com. 5 3600 600 86400 300`)
	require.NoError(t, err)
	rec = dnsRecordFrom(rr)
	assert.EqualValues(t, 5, rec.Data["serial"])
}
