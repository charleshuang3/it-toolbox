package netguard

import (
	"net/http"
	"time"
)

// HTTPClient returns an http.Client that only connects through the guard.
// timeout bounds the whole request including redirects (0 = no timeout);
// maxRedirects caps redirect hops (<= 0 means DefaultMaxRedirects). Every hop
// is re-validated: non-http(s) schemes and denied IP literals are rejected in
// CheckRedirect, and hostnames are re-resolved and re-checked by the dialer.
func (g *Guard) HTTPClient(timeout time.Duration, maxRedirects int) *http.Client {
	return &http.Client{
		Transport:     g.Transport(),
		Timeout:       timeout,
		CheckRedirect: g.CheckRedirect(maxRedirects),
	}
}
