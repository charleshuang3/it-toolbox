package nettools

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

const (
	httpcheckMaxBodyIn        = 64 << 10  // request body limit
	httpcheckMaxRequestJSON   = 256 << 10 // whole JSON payload limit
	httpcheckPreviewBytes     = 16 << 10  // response preview size
	httpcheckMaxReadBytes     = 2 << 20   // how much of the final body is read to measure its size
	httpcheckDrainBytes       = 64 << 10  // how much of an intermediate redirect body is drained
	httpcheckMaxRedirects     = 10
	httpcheckMaxHeaders       = 50
	httpcheckMaxHeaderLen     = 8 << 10
	httpcheckMaxURLLen        = 2048
	httpcheckDefaultUserAgent = "it-toolbox-http-inspector/1.0"
)

var httpcheckMethods = map[string]bool{
	"GET": true, "HEAD": true, "POST": true, "PUT": true,
	"DELETE": true, "OPTIONS": true, "PATCH": true,
}

// httpcheckForbiddenHeaders are managed by the transport or are hop-by-hop.
var httpcheckForbiddenHeaders = map[string]bool{
	"connection": true, "keep-alive": true, "te": true, "trailer": true,
	"transfer-encoding": true, "upgrade": true, "content-length": true,
	"expect": true, "proxy-authorization": true, "proxy-authenticate": true,
	"proxy-connection": true,
}

// httpcheckTransportHook lets tests adjust the transport (e.g. to pin a fake
// public name to a local server). It is nil in production.
var httpcheckTransportHook func(tr *http.Transport)

func init() {
	register(func(g *gin.RouterGroup, d Deps) {
		g.POST("/http", httpcheckHandler(d))
	})
}

// ---- API types ----

type httpcheckRequest struct {
	URL                string            `json:"url"`
	Method             string            `json:"method"`
	Headers            map[string]string `json:"headers"`
	Body               string            `json:"body"`
	FollowRedirects    *bool             `json:"follow_redirects"`
	InsecureSkipVerify bool              `json:"insecure_skip_verify"`
	// HTTPVersion is "auto" (default), "h1" or "h2".
	HTTPVersion string `json:"http_version"`
}

type httpcheckHeader struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type httpcheckTimings struct {
	DNSMs      float64 `json:"dns_ms"`
	ConnectMs  float64 `json:"connect_ms"`
	TLSMs      float64 `json:"tls_ms"`
	TTFBMs     float64 `json:"ttfb_ms"`
	TransferMs float64 `json:"transfer_ms"`
	TotalMs    float64 `json:"total_ms"`
}

type httpcheckTLSInfo struct {
	Version     string `json:"version"`
	CipherSuite string `json:"cipher_suite"`
	ServerName  string `json:"server_name,omitempty"`
	Subject     string `json:"subject,omitempty"`
	Issuer      string `json:"issuer,omitempty"`
	NotAfter    string `json:"not_after,omitempty"`
	Verified    bool   `json:"verified"`
}

type httpcheckHop struct {
	URL        string            `json:"url"`
	Method     string            `json:"method"`
	Status     int               `json:"status"`
	StatusText string            `json:"status_text"`
	Protocol   string            `json:"protocol"`
	Headers    []httpcheckHeader `json:"headers"`
	RemoteIP   string            `json:"remote_ip,omitempty"`
	Location   string            `json:"location,omitempty"`
	Timings    httpcheckTimings  `json:"timings"`
	TLS        *httpcheckTLSInfo `json:"tls,omitempty"`
}

type httpcheckBody struct {
	ContentType string `json:"content_type"`
	Preview     string `json:"preview"`
	Truncated   bool   `json:"truncated"`
	IsBinary    bool   `json:"is_binary"`
	// Size is the number of (decoded) bytes read, capped at httpcheckMaxReadBytes.
	Size       int64 `json:"size"`
	SizeCapped bool  `json:"size_capped"`
}

type httpcheckSecurityItem struct {
	Name    string `json:"name"`
	Status  string `json:"status"` // pass | warn | missing
	Value   string `json:"value,omitempty"`
	Message string `json:"message"`
}

type httpcheckSecurity struct {
	Score int                     `json:"score"` // 0..100
	Items []httpcheckSecurityItem `json:"items"`
}

type httpcheckCookie struct {
	Name     string   `json:"name"`
	Secure   bool     `json:"secure"`
	HTTPOnly bool     `json:"http_only"`
	SameSite string   `json:"same_site"` // "", Lax, Strict, None
	Hints    []string `json:"hints"`
}

type httpcheckError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type httpcheckResponse struct {
	URL                string             `json:"url"`
	Method             string             `json:"method"`
	InsecureSkipVerify bool               `json:"insecure_skip_verify"`
	Warnings           []string           `json:"warnings"`
	Hops               []httpcheckHop     `json:"hops"`
	Body               *httpcheckBody     `json:"body,omitempty"`
	Security           *httpcheckSecurity `json:"security,omitempty"`
	Cookies            []httpcheckCookie  `json:"cookies"`
	TotalMs            float64            `json:"total_ms"`
	Error              *httpcheckError    `json:"error,omitempty"`
}

// ---- handler ----

func httpcheckHandler(d Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, httpcheckMaxRequestJSON)
		var in httpcheckRequest
		if err := c.ShouldBindJSON(&in); err != nil {
			c.JSON(http.StatusBadRequest, httpcheckError{"invalid_request", "invalid JSON request body"})
			return
		}
		spec, herr := httpcheckValidate(d, in)
		if herr != nil {
			c.JSON(httpcheckErrorStatus(herr.Code), herr)
			return
		}
		resp := httpcheckRun(c.Request.Context(), d, spec)
		if resp.Error != nil && len(resp.Hops) == 0 {
			c.JSON(httpcheckErrorStatus(resp.Error.Code), resp.Error)
			return
		}
		c.JSON(http.StatusOK, resp)
	}
}

func httpcheckErrorStatus(code string) int {
	switch code {
	case "blocked_target":
		return http.StatusForbidden
	case "timeout":
		return http.StatusGatewayTimeout
	case "invalid_request":
		return http.StatusBadRequest
	default:
		return http.StatusBadGateway
	}
}

type httpcheckSpec struct {
	target   *url.URL
	method   string
	headers  http.Header
	host     string // optional Host override
	body     string
	follow   bool
	insecure bool
	version  string
}

func httpcheckValidate(d Deps, in httpcheckRequest) (*httpcheckSpec, *httpcheckError) {
	bad := func(format string, a ...any) (*httpcheckSpec, *httpcheckError) {
		return nil, &httpcheckError{"invalid_request", fmt.Sprintf(format, a...)}
	}
	raw := strings.TrimSpace(in.URL)
	if raw == "" {
		return bad("url is required")
	}
	if len(raw) > httpcheckMaxURLLen {
		return bad("url is too long")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return bad("url is not valid (expected http:// or https://host/...)")
	}
	if u.User != nil {
		return bad("credentials in the url are not supported; use an Authorization header")
	}
	if err := d.Guard.CheckURL(u); err != nil {
		return nil, &httpcheckError{"blocked_target", httpcheckBlockedMessage(err)}
	}
	method := strings.ToUpper(strings.TrimSpace(in.Method))
	if method == "" {
		method = http.MethodGet
	}
	if !httpcheckMethods[method] {
		return bad("method %q is not supported", in.Method)
	}
	if len(in.Body) > httpcheckMaxBodyIn {
		return bad("body is larger than %d bytes", httpcheckMaxBodyIn)
	}
	ver := strings.ToLower(strings.TrimSpace(in.HTTPVersion))
	switch ver {
	case "", "auto":
		ver = "auto"
	case "h1", "http/1.1", "1.1":
		ver = "h1"
	case "h2", "http/2":
		ver = "h2"
	default:
		return bad("http_version must be auto, h1 or h2")
	}
	if len(in.Headers) > httpcheckMaxHeaders {
		return bad("too many headers (max %d)", httpcheckMaxHeaders)
	}
	spec := &httpcheckSpec{
		target: u, method: method, headers: http.Header{}, body: in.Body,
		follow: in.FollowRedirects == nil || *in.FollowRedirects, insecure: in.InsecureSkipVerify, version: ver,
	}
	for name, value := range in.Headers {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if !httpcheckValidToken(name) {
			return bad("header name %q is not valid", name)
		}
		if len(value) > httpcheckMaxHeaderLen || strings.ContainsAny(value, "\r\n\x00") {
			return bad("value of header %q is not valid", name)
		}
		lower := strings.ToLower(name)
		if httpcheckForbiddenHeaders[lower] || strings.HasPrefix(lower, "proxy-") {
			return bad("header %q cannot be set", name)
		}
		if lower == "host" {
			value = strings.TrimSpace(value)
			if !httpcheckSimpleHost(value) {
				return bad("Host header override must be a plain host name with an optional port")
			}
			spec.host = value
			continue
		}
		spec.headers.Set(name, value)
	}
	return spec, nil
}

func httpcheckValidToken(s string) bool {
	for i := 0; i < len(s); i++ {
		ch := s[i]
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9':
		case strings.IndexByte("!#$%&'*+-.^_`|~", ch) >= 0:
		default:
			return false
		}
	}
	return s != ""
}

func httpcheckSimpleHost(s string) bool {
	if s == "" || len(s) > 255 {
		return false
	}
	host := s
	if h, p, err := net.SplitHostPort(s); err == nil {
		if n, err := strconv.Atoi(p); err != nil || n < 1 || n > 65535 {
			return false
		}
		host = h
	}
	for i := 0; i < len(host); i++ {
		ch := host[i]
		ok := ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || ch == '.' || ch == '-'
		if !ok {
			return false
		}
	}
	return host != ""
}

// ---- execution ----

type httpcheckDialInfo struct {
	dns, connect time.Duration
}

type httpcheckDialKey struct{}

// httpcheckDialer resolves once (timing it), then connects to a checked IP
// literal through the guard. The guard re-validates the literal, so a changing
// DNS answer cannot bypass the policy.
func httpcheckDialer(g *netguard.Guard) func(ctx context.Context, network, addr string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		info, _ := ctx.Value(httpcheckDialKey{}).(*httpcheckDialInfo)
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		t0 := time.Now()
		ips, err := g.Resolve(ctx, host)
		if info != nil {
			info.dns = time.Since(t0)
		}
		if err != nil {
			return nil, err
		}
		t1 := time.Now()
		var errs []error
		for _, ip := range ips {
			conn, derr := g.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if derr == nil {
				if info != nil {
					info.connect = time.Since(t1)
				}
				return conn, nil
			}
			errs = append(errs, derr)
			if ctx.Err() != nil {
				break
			}
		}
		return nil, errors.Join(errs...)
	}
}

func httpcheckMs(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000.0
}

func httpcheckRun(parent context.Context, d Deps, spec *httpcheckSpec) *httpcheckResponse {
	out := &httpcheckResponse{
		URL: spec.target.String(), Method: spec.method, InsecureSkipVerify: spec.insecure,
		Warnings: []string{}, Hops: []httpcheckHop{}, Cookies: []httpcheckCookie{},
	}
	if spec.insecure {
		out.Warnings = append(out.Warnings, "TLS certificate verification was DISABLED for this request (insecure_skip_verify); the server identity was not verified.")
	}

	timeout := d.Config.RequestTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	tr := d.Guard.Transport()
	tr.DialContext = httpcheckDialer(d.Guard)
	tr.DisableKeepAlives = true
	tr.Proxy = nil
	tr.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS10, InsecureSkipVerify: spec.insecure} //nolint:gosec // opt-in, flagged in the response
	switch spec.version {
	case "h1":
		tr.ForceAttemptHTTP2 = false
		tr.TLSNextProto = map[string]func(string, *tls.Conn) http.RoundTripper{}
	case "h2":
		tr.TLSClientConfig.NextProtos = []string{"h2"}
	}
	if httpcheckTransportHook != nil {
		httpcheckTransportHook(tr)
	}
	defer tr.CloseIdleConnections()

	client := d.Guard.HTTPClient(0, httpcheckMaxRedirects)
	client.Transport = tr
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	start := time.Now()
	defer func() { out.TotalMs = httpcheckMs(time.Since(start)) }()

	method := spec.method
	sendBody := spec.body != "" && method != http.MethodGet && method != http.MethodHead
	cur := spec.target
	hostOverride := spec.host
	headers := spec.headers.Clone()

	for hop := 0; ; hop++ {
		if err := d.Guard.CheckURL(cur); err != nil {
			out.Error = &httpcheckError{"blocked_target", httpcheckBlockedMessage(err)}
			return out
		}
		var body io.Reader
		if sendBody {
			body = strings.NewReader(spec.body)
		}
		info := &httpcheckDialInfo{}
		var tlsStart, tlsEnd, wrote, firstByte time.Time
		var remote string
		trace := &httptrace.ClientTrace{
			GotConn: func(ci httptrace.GotConnInfo) {
				if ci.Conn != nil {
					if h, _, err := net.SplitHostPort(ci.Conn.RemoteAddr().String()); err == nil {
						remote = h
					}
				}
			},
			TLSHandshakeStart:    func() { tlsStart = time.Now() },
			TLSHandshakeDone:     func(tls.ConnectionState, error) { tlsEnd = time.Now() },
			WroteRequest:         func(httptrace.WroteRequestInfo) { wrote = time.Now() },
			GotFirstResponseByte: func() { firstByte = time.Now() },
		}
		rctx := context.WithValue(ctx, httpcheckDialKey{}, info)
		rctx = httptrace.WithClientTrace(rctx, trace)
		req, err := http.NewRequestWithContext(rctx, method, cur.String(), body)
		if err != nil {
			out.Error = &httpcheckError{"invalid_request", err.Error()}
			return out
		}
		for k, vs := range headers {
			req.Header[k] = append([]string(nil), vs...)
		}
		if req.Header.Get("User-Agent") == "" {
			req.Header.Set("User-Agent", httpcheckDefaultUserAgent)
		}
		if hostOverride != "" {
			req.Host = hostOverride
		}

		hopStart := time.Now()
		resp, err := client.Do(req)
		if err != nil {
			out.Error = httpcheckClassify(ctx, err, spec.insecure)
			return out
		}

		h := httpcheckHop{
			URL: cur.String(), Method: method, Status: resp.StatusCode,
			StatusText: http.StatusText(resp.StatusCode), Protocol: httpcheckProto(resp),
			Headers: httpcheckHeaderList(resp.Header), RemoteIP: remote,
			TLS: httpcheckTLS(resp.TLS, spec.insecure),
		}
		redirect := httpcheckIsRedirect(resp.StatusCode)
		loc, locErr := resp.Location()
		if redirect && locErr == nil {
			h.Location = loc.String()
		}
		follow := spec.follow && redirect && locErr == nil

		final := !follow
		if follow && hop >= httpcheckMaxRedirects {
			final = true
			out.Warnings = append(out.Warnings, fmt.Sprintf("Stopped after %d redirects; the last redirect was not followed.", httpcheckMaxRedirects))
		}

		var bodyInfo *httpcheckBody
		if final {
			bodyInfo = httpcheckReadBody(resp)
		} else {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, httpcheckDrainBytes))
		}
		end := time.Now()
		_ = resp.Body.Close()

		h.Timings.DNSMs = httpcheckMs(info.dns)
		h.Timings.ConnectMs = httpcheckMs(info.connect)
		if !tlsStart.IsZero() && !tlsEnd.IsZero() {
			h.Timings.TLSMs = httpcheckMs(tlsEnd.Sub(tlsStart))
		}
		if firstByte.IsZero() {
			firstByte = end
		}
		waitFrom := wrote
		if waitFrom.IsZero() || waitFrom.After(firstByte) {
			waitFrom = hopStart
		}
		h.Timings.TTFBMs = httpcheckMs(firstByte.Sub(waitFrom))
		h.Timings.TransferMs = httpcheckMs(end.Sub(firstByte))
		h.Timings.TotalMs = httpcheckMs(end.Sub(hopStart))
		out.Hops = append(out.Hops, h)

		if final {
			out.Body = bodyInfo
			sec := httpcheckAnalyzeSecurity(resp.Header, cur.Scheme == "https")
			out.Security = &sec
			out.Cookies = httpcheckCookies(resp.Cookies())
			return out
		}

		prev := cur
		cur = loc
		if prev.Host != cur.Host {
			headers.Del("Authorization")
			headers.Del("Cookie")
		}
		hostOverride = "" // a Host override only applies to the first request
		switch resp.StatusCode {
		case http.StatusMovedPermanently, http.StatusFound, http.StatusSeeOther:
			if method != http.MethodGet && method != http.MethodHead {
				method = http.MethodGet
				sendBody = false
				headers.Del("Content-Type")
			}
		}
	}
}

func httpcheckIsRedirect(code int) bool {
	switch code {
	case 301, 302, 303, 307, 308:
		return true
	}
	return false
}

func httpcheckProto(r *http.Response) string {
	switch r.ProtoMajor {
	case 2:
		return "h2"
	case 3:
		return "h3"
	default:
		return r.Proto
	}
}

func httpcheckHeaderList(h http.Header) []httpcheckHeader {
	names := make([]string, 0, len(h))
	for k := range h {
		names = append(names, k)
	}
	sort.Strings(names)
	out := make([]httpcheckHeader, 0, len(h))
	for _, k := range names {
		for _, v := range h[k] {
			out = append(out, httpcheckHeader{k, v})
		}
	}
	return out
}

func httpcheckTLS(cs *tls.ConnectionState, insecure bool) *httpcheckTLSInfo {
	if cs == nil {
		return nil
	}
	info := &httpcheckTLSInfo{
		Version:     tls.VersionName(cs.Version),
		CipherSuite: tls.CipherSuiteName(cs.CipherSuite),
		ServerName:  cs.ServerName,
		Verified:    !insecure,
	}
	if len(cs.PeerCertificates) > 0 {
		cert := cs.PeerCertificates[0]
		info.Subject = cert.Subject.String()
		info.Issuer = cert.Issuer.String()
		info.NotAfter = cert.NotAfter.UTC().Format(time.RFC3339)
	}
	return info
}

func httpcheckReadBody(resp *http.Response) *httpcheckBody {
	b := &httpcheckBody{ContentType: resp.Header.Get("Content-Type")}
	data, _ := io.ReadAll(io.LimitReader(resp.Body, httpcheckPreviewBytes))
	n, _ := io.Copy(io.Discard, io.LimitReader(resp.Body, httpcheckMaxReadBytes-int64(len(data))+1))
	total := int64(len(data)) + n
	if total > httpcheckMaxReadBytes {
		total = httpcheckMaxReadBytes
		b.SizeCapped = true
	}
	b.Size = total
	b.Truncated = total > int64(len(data))
	if b.Truncated {
		data = httpcheckTrimPartialRune(data)
	}
	if httpcheckIsText(data) {
		b.Preview = string(data)
	} else {
		b.IsBinary = true
	}
	return b
}

// httpcheckTrimPartialRune drops an incomplete trailing UTF-8 sequence.
func httpcheckTrimPartialRune(b []byte) []byte {
	for i := 0; i < utf8.UTFMax && len(b) > 0; i++ {
		if r, size := utf8.DecodeLastRune(b); r == utf8.RuneError && size <= 1 {
			b = b[:len(b)-1]
			continue
		}
		break
	}
	return b
}

// httpcheckIsText reports whether data is valid UTF-8 without NULs or stray
// control bytes.
func httpcheckIsText(data []byte) bool {
	if !utf8.Valid(data) {
		return false
	}
	for _, ch := range data {
		if ch < 0x20 && ch != '\n' && ch != '\r' && ch != '\t' && ch != '\f' && ch != 0x1b {
			return false
		}
	}
	return true
}

// ---- errors ----

func httpcheckBlockedMessage(err error) string {
	msg := strings.TrimPrefix(err.Error(), "netguard: ")
	return "Target blocked: " + msg + ". Private, loopback, link-local and other internal addresses cannot be inspected."
}

func httpcheckClassify(ctx context.Context, err error, insecure bool) *httpcheckError {
	var (
		unknownAuth x509.UnknownAuthorityError
		hostErr     x509.HostnameError
		certInvalid x509.CertificateInvalidError
		verifyErr   *tls.CertificateVerificationError
		netErr      net.Error
		dnsErr      *net.DNSError
	)
	switch {
	case errors.Is(err, netguard.ErrBlockedAddress) || strings.Contains(err.Error(), "netguard: scheme") ||
		strings.Contains(err.Error(), "netguard: redirect blocked"):
		return &httpcheckError{"blocked_target", httpcheckBlockedMessage(err)}
	case errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded):
		return &httpcheckError{"timeout", "The request timed out before the server finished responding."}
	case errors.Is(err, context.Canceled):
		return &httpcheckError{"canceled", "The request was canceled."}
	case errors.As(err, &unknownAuth) || errors.As(err, &hostErr) || errors.As(err, &certInvalid) || errors.As(err, &verifyErr):
		msg := "TLS certificate verification failed: " + err.Error()
		if !insecure {
			msg += ". Enable insecure_skip_verify to inspect the server anyway (not recommended)."
		}
		return &httpcheckError{"tls_error", msg}
	case errors.As(err, &netErr) && netErr.Timeout():
		return &httpcheckError{"timeout", "The connection timed out."}
	case errors.As(err, &dnsErr):
		return &httpcheckError{"dns_error", "Could not resolve host: " + dnsErr.Name}
	}
	msg := err.Error()
	var ue *url.Error
	if errors.As(err, &ue) {
		msg = ue.Err.Error()
	}
	return &httpcheckError{"request_failed", "Request failed: " + msg}
}

// ---- security analysis ----

const (
	httpcheckPass    = "pass"
	httpcheckWarn    = "warn"
	httpcheckMissing = "missing"
)

func httpcheckAnalyzeSecurity(h http.Header, isHTTPS bool) httpcheckSecurity {
	var items []httpcheckSecurityItem
	add := func(name, status, value, msg string) {
		items = append(items, httpcheckSecurityItem{Name: name, Status: status, Value: value, Message: msg})
	}
	csp := h.Get("Content-Security-Policy")

	const hsts = "Strict-Transport-Security"
	switch v := h.Get(hsts); {
	case v == "" && !isHTTPS:
		add(hsts, httpcheckMissing, "", "Not sent; HSTS is only honoured over HTTPS.")
	case v == "":
		add(hsts, httpcheckMissing, "", "Add Strict-Transport-Security to force HTTPS.")
	default:
		age := httpcheckDirectiveInt(v, "max-age")
		switch {
		case age < 0:
			add(hsts, httpcheckWarn, v, "No valid max-age directive.")
		case age < 15552000:
			add(hsts, httpcheckWarn, v, "max-age is below 180 days (15552000).")
		default:
			add(hsts, httpcheckPass, v, "HSTS is enabled with a long max-age.")
		}
	}

	const cspName = "Content-Security-Policy"
	if csp == "" {
		add(cspName, httpcheckMissing, "", "Add a Content-Security-Policy to limit script and resource sources.")
	} else {
		script := httpcheckCSPDirective(csp, "script-src")
		if script == "" {
			script = httpcheckCSPDirective(csp, "default-src")
		}
		switch {
		case strings.Contains(script, "'unsafe-inline'") || strings.Contains(script, "'unsafe-eval'"):
			add(cspName, httpcheckWarn, csp, "Allows 'unsafe-inline' or 'unsafe-eval' scripts.")
		case script == "":
			add(cspName, httpcheckWarn, csp, "No script-src or default-src directive.")
		case httpcheckHasToken(script, "*"):
			add(cspName, httpcheckWarn, csp, "Wildcard source allowed for scripts.")
		default:
			add(cspName, httpcheckPass, csp, "Policy restricts script sources.")
		}
	}

	const xcto = "X-Content-Type-Options"
	switch v := h.Get(xcto); {
	case v == "":
		add(xcto, httpcheckMissing, "", "Add 'X-Content-Type-Options: nosniff'.")
	case strings.EqualFold(strings.TrimSpace(v), "nosniff"):
		add(xcto, httpcheckPass, v, "MIME sniffing is disabled.")
	default:
		add(xcto, httpcheckWarn, v, "Value should be 'nosniff'.")
	}

	const frame = "X-Frame-Options / frame-ancestors"
	xfo := strings.ToUpper(strings.TrimSpace(h.Get("X-Frame-Options")))
	fa := ""
	if csp != "" {
		fa = httpcheckCSPDirective(csp, "frame-ancestors")
	}
	switch {
	case fa != "":
		add(frame, httpcheckPass, strings.TrimSpace(fa), "Framing is controlled by CSP frame-ancestors.")
	case xfo == "DENY" || xfo == "SAMEORIGIN":
		add(frame, httpcheckPass, xfo, "Clickjacking protection is enabled.")
	case xfo != "":
		add(frame, httpcheckWarn, h.Get("X-Frame-Options"), "Use DENY or SAMEORIGIN (or CSP frame-ancestors).")
	default:
		add(frame, httpcheckMissing, "", "Add X-Frame-Options or CSP frame-ancestors to prevent clickjacking.")
	}

	const ref = "Referrer-Policy"
	if v := h.Get(ref); v == "" {
		add(ref, httpcheckMissing, "", "Add a Referrer-Policy such as strict-origin-when-cross-origin.")
	} else {
		parts := strings.Split(v, ",")
		switch strings.ToLower(strings.TrimSpace(parts[len(parts)-1])) {
		case "no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin":
			add(ref, httpcheckPass, v, "Referrer leakage is limited.")
		default:
			add(ref, httpcheckWarn, v, "This policy may leak full URLs to other origins.")
		}
	}

	const perm = "Permissions-Policy"
	if v := h.Get(perm); v == "" {
		add(perm, httpcheckMissing, "", "Add a Permissions-Policy to restrict browser features.")
	} else {
		add(perm, httpcheckPass, v, "Browser features are restricted.")
	}

	const coop = "Cross-Origin-Opener-Policy"
	switch v := h.Get(coop); strings.ToLower(strings.TrimSpace(v)) {
	case "":
		add(coop, httpcheckMissing, "", "Add Cross-Origin-Opener-Policy: same-origin to isolate the browsing context.")
	case "same-origin", "same-origin-allow-popups":
		add(coop, httpcheckPass, v, "Browsing context group is isolated.")
	default:
		add(coop, httpcheckWarn, v, "This value provides no isolation.")
	}

	const corp = "Cross-Origin-Resource-Policy"
	switch v := h.Get(corp); strings.ToLower(strings.TrimSpace(v)) {
	case "":
		add(corp, httpcheckMissing, "", "Add Cross-Origin-Resource-Policy to control who can embed this resource.")
	case "same-origin", "same-site":
		add(corp, httpcheckPass, v, "Resource embedding is restricted.")
	default:
		add(corp, httpcheckWarn, v, "cross-origin allows any site to embed this resource.")
	}

	points := 0.0
	for _, it := range items {
		switch it.Status {
		case httpcheckPass:
			points += 1
		case httpcheckWarn:
			points += 0.5
		}
	}
	return httpcheckSecurity{Score: int(points*100/float64(len(items)) + 0.5), Items: items}
}

func httpcheckDirectiveInt(v, name string) int {
	for _, part := range strings.Split(v, ";") {
		k, val, ok := strings.Cut(strings.TrimSpace(part), "=")
		if ok && strings.EqualFold(strings.TrimSpace(k), name) {
			n, err := strconv.Atoi(strings.Trim(strings.TrimSpace(val), `"`))
			if err != nil {
				return -1
			}
			return n
		}
	}
	return -1
}

// httpcheckCSPDirective returns the lowercased value of a directive followed
// by a trailing space, or "" if the directive is absent.
func httpcheckCSPDirective(csp, name string) string {
	for _, part := range strings.Split(csp, ";") {
		fields := strings.Fields(strings.ToLower(part))
		if len(fields) > 0 && fields[0] == name {
			return strings.Join(fields[1:], " ") + " "
		}
	}
	return ""
}

func httpcheckHasToken(s, tok string) bool {
	for _, f := range strings.Fields(s) {
		if f == tok {
			return true
		}
	}
	return false
}

func httpcheckCookies(cs []*http.Cookie) []httpcheckCookie {
	out := make([]httpcheckCookie, 0, len(cs))
	for _, c := range cs {
		ck := httpcheckCookie{Name: c.Name, Secure: c.Secure, HTTPOnly: c.HttpOnly, Hints: []string{}}
		switch c.SameSite {
		case http.SameSiteLaxMode:
			ck.SameSite = "Lax"
		case http.SameSiteStrictMode:
			ck.SameSite = "Strict"
		case http.SameSiteNoneMode:
			ck.SameSite = "None"
		}
		if !c.Secure {
			ck.Hints = append(ck.Hints, "Missing Secure flag: the cookie can be sent over plain HTTP.")
		}
		if !c.HttpOnly {
			ck.Hints = append(ck.Hints, "Missing HttpOnly flag: scripts can read this cookie.")
		}
		if ck.SameSite == "" {
			ck.Hints = append(ck.Hints, "Missing SameSite attribute: browsers default to Lax; set it explicitly.")
		}
		if ck.SameSite == "None" && !c.Secure {
			ck.Hints = append(ck.Hints, "SameSite=None requires the Secure flag.")
		}
		out = append(out, ck)
	}
	return out
}
