package nettools

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/miekg/dns"
	"golang.org/x/net/idna"

	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

const (
	dnsMaxResolvers   = 5
	dnsMaxNameLen     = 253
	dnsMaxLabelLen    = 63
	dnsEDNSBufferSize = 1232
)

var dnsDefaultResolvers = []string{"cloudflare", "google"}

// dnsNamedResolvers are the well-known public resolvers selectable by name.
var dnsNamedResolvers = map[string]string{
	"cloudflare": "1.1.1.1",
	"google":     "8.8.8.8",
	"quad9":      "9.9.9.9",
}

var dnsQueryTypes = map[string]uint16{
	"A":     dns.TypeA,
	"AAAA":  dns.TypeAAAA,
	"CNAME": dns.TypeCNAME,
	"MX":    dns.TypeMX,
	"TXT":   dns.TypeTXT,
	"NS":    dns.TypeNS,
	"SOA":   dns.TypeSOA,
	"CAA":   dns.TypeCAA,
	"SRV":   dns.TypeSRV,
	"PTR":   dns.TypePTR,
}

// dnsResolvConfPath is the file read for the "system" resolver (overridable in tests).
var dnsResolvConfPath = "/etc/resolv.conf"

// dnsRequest is the body of POST /api/net/dns.
type dnsRequest struct {
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	Resolvers []string `json:"resolvers"`
}

// dnsRecord is one answer record.
type dnsRecord struct {
	Name    string         `json:"name"`
	Type    string         `json:"type"`
	TTL     uint32         `json:"ttl"`
	Data    map[string]any `json:"data"`
	Display string         `json:"display"`
}

// dnsResolverResult is the outcome for a single resolver.
type dnsResolverResult struct {
	Resolver      string      `json:"resolver"`
	Address       string      `json:"address,omitempty"`
	Rcode         string      `json:"rcode,omitempty"`
	Authoritative bool        `json:"authoritative"`
	Truncated     bool        `json:"truncated"`
	UsedTCP       bool        `json:"usedTcp"`
	Answers       []dnsRecord `json:"answers"`
	QueryTimeMs   float64     `json:"queryTimeMs"`
	Error         string      `json:"error,omitempty"`
	Blocked       bool        `json:"blocked,omitempty"`
}

// dnsResponse is the body returned by POST /api/net/dns.
type dnsResponse struct {
	Name    string              `json:"name"` // normalized (punycode) query name
	Type    string              `json:"type"`
	Results []dnsResolverResult `json:"results"`
}

func init() {
	register(func(g *gin.RouterGroup, d Deps) {
		g.POST("/dns", func(c *gin.Context) { dnsHandle(c, d) })
	})
}

func dnsHandle(c *gin.Context, d Deps) {
	var req dnsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON body"})
		return
	}
	qtypeName := strings.ToUpper(strings.TrimSpace(req.Type))
	if qtypeName == "" {
		qtypeName = "A"
	}
	qtype, ok := dnsQueryTypes[qtypeName]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("unsupported record type %q", req.Type)})
		return
	}
	qname, err := dnsNormalizeName(req.Name, qtype)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	specs, err := dnsCleanResolvers(req.Resolvers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	timeout := d.Config.RequestTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()

	results := make([]dnsResolverResult, len(specs))
	var wg sync.WaitGroup
	for i, spec := range specs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = dnsQueryResolver(ctx, d, spec, qname, qtype, timeout)
		}()
	}
	wg.Wait()

	c.JSON(http.StatusOK, dnsResponse{
		Name:    strings.TrimSuffix(qname, "."),
		Type:    qtypeName,
		Results: results,
	})
}

// dnsNormalizeName validates and normalizes the query name. For PTR queries
// an IP literal is converted to its reverse (in-addr.arpa / ip6.arpa) name.
// The result is fully qualified, lower case, punycode.
func dnsNormalizeName(raw string, qtype uint16) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", errors.New("name is required")
	}
	if qtype == dns.TypePTR {
		if ip, err := netip.ParseAddr(strings.Trim(s, "[]")); err == nil {
			rev, err := dns.ReverseAddr(ip.WithZone("").Unmap().String())
			if err != nil {
				return "", fmt.Errorf("invalid IP address %q", s)
			}
			return rev, nil
		}
	}
	s = strings.TrimSuffix(s, ".")
	if s == "" {
		return "", errors.New("name is required")
	}
	ascii := true
	for i := 0; i < len(s); i++ {
		if s[i] >= 0x80 {
			ascii = false
			break
		}
	}
	if !ascii {
		p := idna.New(idna.MapForLookup(), idna.StrictDomainName(false), idna.Transitional(false))
		conv, err := p.ToASCII(s)
		if err != nil {
			return "", fmt.Errorf("invalid internationalized domain name: %v", err)
		}
		s = conv
	}
	s = strings.ToLower(s)
	if len(s) > dnsMaxNameLen {
		return "", fmt.Errorf("name is too long (max %d characters)", dnsMaxNameLen)
	}
	for _, label := range strings.Split(s, ".") {
		if label == "" {
			return "", errors.New("name contains an empty label")
		}
		if len(label) > dnsMaxLabelLen {
			return "", fmt.Errorf("label %q is too long (max %d characters)", label, dnsMaxLabelLen)
		}
		for i := 0; i < len(label); i++ {
			ch := label[i]
			ok := ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9' || ch == '-' || ch == '_' || ch == '*'
			if !ok {
				return "", fmt.Errorf("name contains invalid character %q", string(ch))
			}
		}
	}
	return s + ".", nil
}

// dnsCleanResolvers trims, de-duplicates and caps the resolver list, applying defaults.
func dnsCleanResolvers(in []string) ([]string, error) {
	var out []string
	seen := map[string]bool{}
	for _, r := range in {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		key := strings.ToLower(r)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, r)
	}
	if len(out) == 0 {
		out = append(out, dnsDefaultResolvers...)
	}
	if len(out) > dnsMaxResolvers {
		return nil, fmt.Errorf("too many resolvers (max %d)", dnsMaxResolvers)
	}
	return out, nil
}

// errDNSBlocked marks a resolver refused by policy.
type errDNSBlocked struct{ msg string }

func (e errDNSBlocked) Error() string { return e.msg }

// dnsResolveAddr turns a resolver spec into a "host:port" address after
// applying the address policy.
func dnsResolveAddr(d Deps, spec string) (string, error) {
	lower := strings.ToLower(spec)
	if lower == "system" {
		return dnsSystemAddr(d)
	}
	if ip, ok := dnsNamedResolvers[lower]; ok {
		return net.JoinHostPort(ip, "53"), nil
	}
	host, port := spec, "53"
	if ap, err := netip.ParseAddrPort(spec); err == nil {
		host, port = ap.Addr().String(), strconv.Itoa(int(ap.Port()))
	}
	ip, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil {
		return "", fmt.Errorf("invalid resolver %q: expected system, cloudflare, google, quad9, an IP, or IP:port", spec)
	}
	if n, err := strconv.Atoi(port); err != nil || n < 1 || n > 65535 {
		return "", fmt.Errorf("invalid resolver port %q", port)
	}
	if err := d.Guard.CheckIP(ip); err != nil {
		return "", errDNSBlocked{fmt.Sprintf("resolver %s is not allowed: %s", ip.WithZone(""), trimBlocked(err))}
	}
	return net.JoinHostPort(ip.WithZone("").String(), port), nil
}

func trimBlocked(err error) string {
	return strings.TrimPrefix(err.Error(), netguard.ErrBlockedAddress.Error()+": ")
}

// dnsSystemAddr returns the first system nameserver that passes the policy.
func dnsSystemAddr(d Deps) (string, error) {
	cfg, err := dns.ClientConfigFromFile(dnsResolvConfPath)
	if err != nil {
		return "", fmt.Errorf("cannot read system resolver configuration: %v", err)
	}
	blocked := false
	for _, s := range cfg.Servers {
		ip, err := netip.ParseAddr(strings.Trim(s, "[]"))
		if err != nil {
			continue
		}
		if d.Guard.CheckIP(ip) != nil {
			blocked = true
			continue
		}
		port := cfg.Port
		if port == "" {
			port = "53"
		}
		return net.JoinHostPort(ip.WithZone("").String(), port), nil
	}
	if blocked {
		return "", errDNSBlocked{"the system resolver uses a non-public address and is not allowed on this server"}
	}
	return "", errors.New("no nameservers found in system resolver configuration")
}

func dnsQueryResolver(ctx context.Context, d Deps, spec string, qname string, qtype uint16, timeout time.Duration) dnsResolverResult {
	res := dnsResolverResult{Resolver: spec, Answers: []dnsRecord{}}
	addr, err := dnsResolveAddr(d, spec)
	if err != nil {
		res.Error = err.Error()
		var b errDNSBlocked
		res.Blocked = errors.As(err, &b)
		return res
	}
	// Do not reveal the system resolver's address unless private use is on.
	if strings.ToLower(spec) != "system" || d.Config.AllowPrivate {
		res.Address = addr
	}

	m := new(dns.Msg)
	m.SetQuestion(qname, qtype)
	m.RecursionDesired = true
	m.SetEdns0(dnsEDNSBufferSize, false)

	start := time.Now()
	c := &dns.Client{Net: "udp", Timeout: timeout}
	resp, _, err := c.ExchangeContext(ctx, m, addr)
	if err == nil && resp.Truncated {
		res.Truncated = true
		tc := &dns.Client{Net: "tcp", Timeout: timeout}
		if r2, _, err2 := tc.ExchangeContext(ctx, m, addr); err2 == nil {
			resp, res.UsedTCP, res.Truncated = r2, true, r2.Truncated
		}
		// On TCP failure keep the truncated UDP answer.
	}
	res.QueryTimeMs = float64(time.Since(start).Microseconds()) / 1000
	if err != nil {
		res.Error = dnsErrString(err)
		return res
	}
	res.Rcode = dns.RcodeToString[resp.Rcode]
	res.Authoritative = resp.Authoritative
	for _, rr := range resp.Answer {
		res.Answers = append(res.Answers, dnsRecordFrom(rr))
	}
	return res
}

func dnsErrString(err error) string {
	var ne net.Error
	switch {
	case errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout()):
		return "timed out waiting for the resolver"
	case errors.Is(err, context.Canceled):
		return "request canceled"
	}
	return err.Error()
}

func dnsRecordFrom(rr dns.RR) dnsRecord {
	h := rr.Header()
	typ, ok := dns.TypeToString[h.Rrtype]
	if !ok {
		typ = "TYPE" + strconv.Itoa(int(h.Rrtype))
	}
	rec := dnsRecord{
		Name:    h.Name,
		Type:    typ,
		TTL:     h.Ttl,
		Display: strings.TrimSpace(strings.TrimPrefix(rr.String(), h.String())),
		Data:    map[string]any{},
	}
	switch v := rr.(type) {
	case *dns.A:
		rec.Data["address"] = v.A.String()
	case *dns.AAAA:
		rec.Data["address"] = v.AAAA.String()
	case *dns.CNAME:
		rec.Data["target"] = v.Target
	case *dns.PTR:
		rec.Data["target"] = v.Ptr
	case *dns.NS:
		rec.Data["host"] = v.Ns
	case *dns.MX:
		rec.Data["preference"] = v.Preference
		rec.Data["exchange"] = v.Mx
	case *dns.TXT:
		rec.Data["text"] = strings.Join(v.Txt, "")
		rec.Data["strings"] = v.Txt
		rec.Display = strings.Join(v.Txt, "")
	case *dns.SOA:
		rec.Data["mname"] = v.Ns
		rec.Data["rname"] = v.Mbox
		rec.Data["serial"] = v.Serial
		rec.Data["refresh"] = v.Refresh
		rec.Data["retry"] = v.Retry
		rec.Data["expire"] = v.Expire
		rec.Data["minimum"] = v.Minttl
	case *dns.CAA:
		rec.Data["flag"] = v.Flag
		rec.Data["tag"] = v.Tag
		rec.Data["value"] = v.Value
	case *dns.SRV:
		rec.Data["priority"] = v.Priority
		rec.Data["weight"] = v.Weight
		rec.Data["port"] = v.Port
		rec.Data["target"] = v.Target
	}
	return rec
}
