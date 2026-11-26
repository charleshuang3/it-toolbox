package nettools

import (
	"bufio"
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
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

	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

func init() { register(tlsRoutes) }

func tlsRoutes(g *gin.RouterGroup, d Deps) {
	g.POST("/tls", func(c *gin.Context) { tlsHandle(c, d) })
}

// tlsSystemRoots is the trust store used to judge chains. nil means the
// system roots; tests replace it.
var tlsSystemRoots *x509.CertPool

const tlsDefaultTimeout = 10 * time.Second

type tlsRequest struct {
	Host          string `json:"host"`
	Port          int    `json:"port"`
	SNI           string `json:"sni"`
	StartTLS      string `json:"starttls"`
	ProbeVersions bool   `json:"probe_versions"`
}

type tlsReason struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type tlsVerdict struct {
	Valid   bool        `json:"valid"`
	Reasons []tlsReason `json:"reasons"`
}

type tlsCertInfo struct {
	Subject            string    `json:"subject"`
	Issuer             string    `json:"issuer"`
	Serial             string    `json:"serial"`
	NotBefore          time.Time `json:"not_before"`
	NotAfter           time.Time `json:"not_after"`
	DaysRemaining      int       `json:"days_remaining"`
	DNSNames           []string  `json:"dns_names"`
	IPAddresses        []string  `json:"ip_addresses"`
	KeyAlgorithm       string    `json:"key_algorithm"`
	KeySize            int       `json:"key_size,omitempty"`
	Curve              string    `json:"curve,omitempty"`
	SignatureAlgorithm string    `json:"signature_algorithm"`
	SHA256             string    `json:"sha256"`
	IsCA               bool      `json:"is_ca"`
	SelfSigned         bool      `json:"self_signed"`
	KeyUsage           []string  `json:"key_usage"`
	ExtKeyUsage        []string  `json:"ext_key_usage"`
	PEM                string    `json:"pem"`
}

type tlsConnInfo struct {
	Version     string `json:"version"`
	CipherSuite string `json:"cipher_suite"`
	ALPN        string `json:"alpn"`
	ServerName  string `json:"server_name"`
	Address     string `json:"address"`
	HandshakeMs int64  `json:"handshake_ms"`
	OCSPStapled bool   `json:"ocsp_stapled"`
	OCSPBytes   int    `json:"ocsp_bytes"`
	SCTCount    int    `json:"sct_count"`
}

type tlsProbeResult struct {
	Version     string `json:"version"`
	Supported   bool   `json:"supported"`
	CipherSuite string `json:"cipher_suite,omitempty"`
	Error       string `json:"error,omitempty"`
}

type tlsResponse struct {
	Host       string           `json:"host"`
	Port       int              `json:"port"`
	SNI        string           `json:"sni"`
	Verdict    tlsVerdict       `json:"verdict"`
	Connection tlsConnInfo      `json:"connection"`
	Chain      []tlsCertInfo    `json:"chain"`
	Probes     []tlsProbeResult `json:"probes,omitempty"`
}

func tlsErr(c *gin.Context, status int, msg string) {
	c.JSON(status, gin.H{"error": msg})
}

func tlsHandle(c *gin.Context, d Deps) {
	var req tlsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		tlsErr(c, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req.Host = strings.TrimSuffix(strings.Trim(strings.TrimSpace(req.Host), "[]"), ".")
	req.SNI = strings.TrimSpace(req.SNI)
	req.StartTLS = strings.ToLower(strings.TrimSpace(req.StartTLS))
	if req.Port == 0 {
		req.Port = 443
	}
	switch {
	case req.Host == "" || strings.ContainsAny(req.Host, " /\\@?#") || len(req.Host) > 253:
		tlsErr(c, http.StatusBadRequest, "invalid host")
		return
	case req.Port < 1 || req.Port > 65535:
		tlsErr(c, http.StatusBadRequest, "port must be between 1 and 65535")
		return
	case len(req.SNI) > 253 || strings.ContainsAny(req.SNI, " /\\@?#"):
		tlsErr(c, http.StatusBadRequest, "invalid sni")
		return
	}
	switch req.StartTLS {
	case "", "smtp", "imap", "postgres":
	default:
		tlsErr(c, http.StatusBadRequest, "starttls must be one of: smtp, imap, postgres")
		return
	}

	timeout := d.Config.RequestTimeout
	if timeout <= 0 {
		timeout = tlsDefaultTimeout
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()

	// The name used for SNI and for hostname verification.
	name := req.SNI
	if name == "" {
		name = req.Host
	}
	addr := net.JoinHostPort(req.Host, strconv.Itoa(req.Port))

	start := time.Now()
	conn, err := tlsConnect(ctx, d.Guard, addr, name, req.StartTLS, 0)
	if err != nil {
		status, msg := tlsClassifyError(err)
		tlsErr(c, status, msg)
		return
	}
	handshake := time.Since(start)
	state := conn.ConnectionState()
	remote := conn.RemoteAddr().String()
	_ = conn.Close()

	resp := tlsResponse{Host: req.Host, Port: req.Port, SNI: name, Chain: []tlsCertInfo{}}
	now := time.Now()
	for _, cert := range state.PeerCertificates {
		resp.Chain = append(resp.Chain, tlsDescribeCert(cert, now))
	}
	resp.Verdict = tlsVerify(state.PeerCertificates, name, tlsSystemRoots, now)
	resp.Connection = tlsConnInfo{
		Version:     tls.VersionName(state.Version),
		CipherSuite: tls.CipherSuiteName(state.CipherSuite),
		ALPN:        state.NegotiatedProtocol,
		ServerName:  state.ServerName,
		Address:     remote,
		HandshakeMs: handshake.Milliseconds(),
		OCSPStapled: len(state.OCSPResponse) > 0,
		OCSPBytes:   len(state.OCSPResponse),
		SCTCount:    len(state.SignedCertificateTimestamps),
	}
	if req.ProbeVersions {
		// Same ctx: total time for the whole request stays capped by RequestTimeout.
		resp.Probes = tlsProbeVersions(ctx, d.Guard, addr, name, req.StartTLS)
	}
	c.JSON(http.StatusOK, resp)
}

// tlsClassifyError maps a connection failure to an HTTP status and a message
// that is safe and useful to show to the user.
func tlsClassifyError(err error) (int, string) {
	var ne net.Error
	var oe *net.OpError
	var dns *net.DNSError
	switch {
	case errors.Is(err, netguard.ErrBlockedAddress):
		return http.StatusForbidden, "target address is not allowed: " + err.Error()
	case errors.As(err, &dns):
		return http.StatusBadGateway, "could not resolve host: " + dns.Name
	case errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &ne) && ne.Timeout()):
		return http.StatusGatewayTimeout, "connection timed out"
	case errors.Is(err, context.Canceled):
		return http.StatusBadGateway, "request cancelled"
	case errors.As(err, &oe) && oe.Op == "dial":
		return http.StatusBadGateway, "connection failed: " + oe.Err.Error()
	}
	return http.StatusBadGateway, "TLS handshake failed: " + err.Error()
}

// tlsConnect dials addr through the guard and completes a TLS handshake,
// optionally after a STARTTLS exchange. version, when non-zero, pins both the
// minimum and maximum TLS version.
//
// SECURITY NOTE: InsecureSkipVerify is set on purpose. This tool exists to
// inspect what a server presents, including broken chains (expired,
// self-signed, wrong host). The handshake is used only to read the certificate
// chain and connection parameters; no user data is ever sent over it. The
// chain is verified separately by tlsVerify and the verdict is reported.
func tlsConnect(ctx context.Context, g *netguard.Guard, addr, serverName, startTLS string, version uint16) (*tls.Conn, error) {
	cfg := &tls.Config{
		InsecureSkipVerify: true, // #nosec G402 -- inspection only, see above.
		MinVersion:         tls.VersionTLS10,
		NextProtos:         []string{"h2", "http/1.1"},
	}
	if version != 0 {
		cfg.MinVersion, cfg.MaxVersion = version, version
	}
	if _, err := netip.ParseAddr(serverName); err != nil {
		cfg.ServerName = serverName // never send an IP literal as SNI
	}
	if startTLS == "" {
		return g.DialTLS(ctx, "tcp", addr, cfg)
	}
	raw, err := g.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	if dl, ok := ctx.Deadline(); ok {
		_ = raw.SetDeadline(dl)
	}
	if err := tlsStartTLS(raw, startTLS); err != nil {
		_ = raw.Close()
		return nil, err
	}
	conn := tls.Client(raw, cfg)
	if err := conn.HandshakeContext(ctx); err != nil {
		_ = raw.Close()
		return nil, err
	}
	return conn, nil
}

// tlsStartTLS performs the plaintext part of a STARTTLS upgrade.
func tlsStartTLS(conn net.Conn, proto string) error {
	r := bufio.NewReader(conn)
	switch proto {
	case "smtp":
		if err := tlsExpectSMTP(r, "220"); err != nil {
			return err
		}
		if _, err := conn.Write([]byte("EHLO it-toolbox.invalid\r\n")); err != nil {
			return err
		}
		if err := tlsExpectSMTP(r, "250"); err != nil {
			return err
		}
		if _, err := conn.Write([]byte("STARTTLS\r\n")); err != nil {
			return err
		}
		return tlsExpectSMTP(r, "220")
	case "imap":
		line, err := r.ReadString('\n')
		if err != nil {
			return err
		}
		if !strings.HasPrefix(line, "* OK") && !strings.HasPrefix(line, "* PREAUTH") {
			return fmt.Errorf("unexpected IMAP greeting: %q", strings.TrimSpace(line))
		}
		if _, err := conn.Write([]byte("a1 STARTTLS\r\n")); err != nil {
			return err
		}
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return err
			}
			if strings.HasPrefix(line, "a1 ") {
				if !strings.HasPrefix(line, "a1 OK") {
					return fmt.Errorf("IMAP STARTTLS refused: %q", strings.TrimSpace(line))
				}
				return nil
			}
		}
	case "postgres":
		// SSLRequest: length 8, code 80877103.
		if _, err := conn.Write([]byte{0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f}); err != nil {
			return err
		}
		b, err := r.ReadByte()
		if err != nil {
			return err
		}
		if b != 'S' {
			return errors.New("PostgreSQL server does not support SSL")
		}
		return nil
	}
	return fmt.Errorf("unsupported starttls protocol %q", proto)
}

// tlsExpectSMTP reads a (possibly multi-line) SMTP reply and checks its code.
func tlsExpectSMTP(r *bufio.Reader, code string) error {
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return err
		}
		if len(line) >= 4 && line[3] == '-' {
			continue
		}
		if !strings.HasPrefix(line, code) {
			return fmt.Errorf("unexpected SMTP reply: %q", strings.TrimSpace(line))
		}
		return nil
	}
}

// tlsVerify judges the presented chain the way a client would: roots (nil =
// system roots), the given server name, and the supplied time. Every problem
// found is reported, the most severe first.
func tlsVerify(chain []*x509.Certificate, name string, roots *x509.CertPool, now time.Time) tlsVerdict {
	if len(chain) == 0 {
		return tlsVerdict{Reasons: []tlsReason{{"no_certificate", "the server presented no certificate"}}}
	}
	leaf := chain[0]
	inter := x509.NewCertPool()
	for _, c := range chain[1:] {
		inter.AddCert(c)
	}
	reasons := []tlsReason{}
	add := func(code, msg string) {
		for _, r := range reasons {
			if r.Code == code {
				return
			}
		}
		reasons = append(reasons, tlsReason{code, msg})
	}

	opts := x509.VerifyOptions{Roots: roots, Intermediates: inter, CurrentTime: now}
	if _, err := leaf.Verify(opts); err != nil {
		if tlsIsExpiry(err) {
			if now.After(leaf.NotAfter) {
				add("expired", fmt.Sprintf("certificate %q expired on %s", tlsCN(leaf), leaf.NotAfter.UTC().Format("2006-01-02 15:04 MST")))
			} else {
				add("not_yet_valid", fmt.Sprintf("certificate %q is not valid before %s", tlsCN(leaf), leaf.NotBefore.UTC().Format("2006-01-02 15:04 MST")))
			}
			// Re-verify at a moment inside the validity window so that a
			// bad chain is reported in addition to the date problem.
			opts.CurrentTime = leaf.NotBefore.Add(leaf.NotAfter.Sub(leaf.NotBefore) / 2)
			if _, err2 := leaf.Verify(opts); err2 != nil && !tlsIsExpiry(err2) {
				tlsChainReason(add, chain, err2)
			}
		} else {
			tlsChainReason(add, chain, err)
		}
	}
	if err := leaf.VerifyHostname(name); err != nil {
		add("hostname_mismatch", fmt.Sprintf("certificate is not valid for %q (it covers: %s)", name, tlsNamesSummary(leaf)))
	}
	return tlsVerdict{Valid: len(reasons) == 0, Reasons: reasons}
}

func tlsIsExpiry(err error) bool {
	var inv x509.CertificateInvalidError
	return errors.As(err, &inv) && inv.Reason == x509.Expired
}

func tlsChainReason(add func(code, msg string), chain []*x509.Certificate, err error) {
	var ua x509.UnknownAuthorityError
	if !errors.As(err, &ua) {
		add("invalid_chain", err.Error())
		return
	}
	last := chain[len(chain)-1]
	switch {
	case len(chain) == 1 && tlsSelfSigned(last):
		add("self_signed", "certificate is self-signed and not trusted")
	case tlsSelfSigned(last):
		add("unknown_authority", fmt.Sprintf("chain ends in an untrusted root %q", tlsCN(last)))
	default:
		add("incomplete_chain", fmt.Sprintf("chain is incomplete or issued by an unknown authority: issuer %q was not sent by the server and is not a trusted root", last.Issuer.String()))
	}
}

func tlsSelfSigned(c *x509.Certificate) bool {
	return bytes.Equal(c.RawSubject, c.RawIssuer) && c.CheckSignature(c.SignatureAlgorithm, c.RawTBSCertificate, c.Signature) == nil
}

func tlsCN(c *x509.Certificate) string {
	if c.Subject.CommonName != "" {
		return c.Subject.CommonName
	}
	return c.Subject.String()
}

func tlsNamesSummary(c *x509.Certificate) string {
	names := append([]string{}, c.DNSNames...)
	for _, ip := range c.IPAddresses {
		names = append(names, ip.String())
	}
	if len(names) == 0 {
		return "no subject alternative names"
	}
	if len(names) > 8 {
		names = append(names[:8], "...")
	}
	return strings.Join(names, ", ")
}

func tlsDescribeCert(c *x509.Certificate, now time.Time) tlsCertInfo {
	sum := sha256.Sum256(c.Raw)
	info := tlsCertInfo{
		Subject:            c.Subject.String(),
		Issuer:             c.Issuer.String(),
		Serial:             tlsHexColon(c.SerialNumber.Bytes()),
		NotBefore:          c.NotBefore.UTC(),
		NotAfter:           c.NotAfter.UTC(),
		DaysRemaining:      int(c.NotAfter.Sub(now).Hours() / 24),
		DNSNames:           append([]string{}, c.DNSNames...),
		IPAddresses:        []string{},
		SignatureAlgorithm: c.SignatureAlgorithm.String(),
		SHA256:             tlsHexColon(sum[:]),
		IsCA:               c.IsCA,
		SelfSigned:         tlsSelfSigned(c),
		KeyUsage:           tlsKeyUsage(c.KeyUsage),
		ExtKeyUsage:        []string{},
		PEM:                string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: c.Raw})),
	}
	for _, ip := range c.IPAddresses {
		info.IPAddresses = append(info.IPAddresses, ip.String())
	}
	for _, e := range c.ExtKeyUsage {
		info.ExtKeyUsage = append(info.ExtKeyUsage, tlsExtKeyUsageName(e))
	}
	switch k := c.PublicKey.(type) {
	case *rsa.PublicKey:
		info.KeyAlgorithm, info.KeySize = "RSA", k.N.BitLen()
	case *ecdsa.PublicKey:
		info.KeyAlgorithm, info.KeySize, info.Curve = "ECDSA", k.Curve.Params().BitSize, k.Curve.Params().Name
	case ed25519.PublicKey:
		info.KeyAlgorithm, info.KeySize = "Ed25519", 256
	default:
		info.KeyAlgorithm = c.PublicKeyAlgorithm.String()
	}
	return info
}

func tlsHexColon(b []byte) string {
	h := strings.ToUpper(hex.EncodeToString(b))
	parts := make([]string, 0, len(h)/2)
	for i := 0; i+1 < len(h); i += 2 {
		parts = append(parts, h[i:i+2])
	}
	return strings.Join(parts, ":")
}

func tlsKeyUsage(u x509.KeyUsage) []string {
	names := []struct {
		bit  x509.KeyUsage
		name string
	}{
		{x509.KeyUsageDigitalSignature, "Digital Signature"},
		{x509.KeyUsageContentCommitment, "Content Commitment"},
		{x509.KeyUsageKeyEncipherment, "Key Encipherment"},
		{x509.KeyUsageDataEncipherment, "Data Encipherment"},
		{x509.KeyUsageKeyAgreement, "Key Agreement"},
		{x509.KeyUsageCertSign, "Certificate Sign"},
		{x509.KeyUsageCRLSign, "CRL Sign"},
		{x509.KeyUsageEncipherOnly, "Encipher Only"},
		{x509.KeyUsageDecipherOnly, "Decipher Only"},
	}
	out := []string{}
	for _, n := range names {
		if u&n.bit != 0 {
			out = append(out, n.name)
		}
	}
	return out
}

func tlsExtKeyUsageName(e x509.ExtKeyUsage) string {
	switch e {
	case x509.ExtKeyUsageAny:
		return "Any"
	case x509.ExtKeyUsageServerAuth:
		return "Server Authentication"
	case x509.ExtKeyUsageClientAuth:
		return "Client Authentication"
	case x509.ExtKeyUsageCodeSigning:
		return "Code Signing"
	case x509.ExtKeyUsageEmailProtection:
		return "Email Protection"
	case x509.ExtKeyUsageTimeStamping:
		return "Time Stamping"
	case x509.ExtKeyUsageOCSPSigning:
		return "OCSP Signing"
	}
	return "Other (" + strconv.Itoa(int(e)) + ")"
}

// tlsProbeVersions tries each TLS version in isolation (min = max) in
// parallel, all bounded by ctx (whose deadline derives from RequestTimeout).
func tlsProbeVersions(ctx context.Context, g *netguard.Guard, addr, name, startTLS string) []tlsProbeResult {
	versions := []uint16{tls.VersionTLS10, tls.VersionTLS11, tls.VersionTLS12, tls.VersionTLS13}
	out := make([]tlsProbeResult, len(versions))
	var wg sync.WaitGroup
	for i, v := range versions {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res := tlsProbeResult{Version: tls.VersionName(v)}
			conn, err := tlsConnect(ctx, g, addr, name, startTLS, v)
			if err != nil {
				res.Error = tlsProbeErr(err)
			} else {
				res.Supported = true
				res.CipherSuite = tls.CipherSuiteName(conn.ConnectionState().CipherSuite)
				_ = conn.Close()
			}
			out[i] = res
		}()
	}
	wg.Wait()
	return out
}

func tlsProbeErr(err error) string {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "timed out"
	case errors.Is(err, netguard.ErrBlockedAddress):
		return "blocked"
	}
	return err.Error()
}
