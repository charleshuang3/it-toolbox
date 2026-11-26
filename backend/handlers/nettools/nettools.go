// Package nettools hosts the network diagnostic endpoints (DNS, TLS, HTTP, ...).
//
// Every endpoint lives under /api/net and is protected by per-client rate
// limiting and a concurrency cap. Outbound connections must go through the
// shared netguard.Guard so private/internal targets stay blocked.
//
// To add a tool, create a new file in this package and register it from init():
//
//	func init() { register(func(g *gin.RouterGroup, d Deps) { g.POST("/dns", ...) }) }
package nettools

import (
	"github.com/gin-gonic/gin"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/netguard"
)

// Deps is what each tool needs to serve requests safely.
type Deps struct {
	Guard  *netguard.Guard
	Config config.NetworkToolsConfig
}

type registrar func(g *gin.RouterGroup, d Deps)

var registrars []registrar

func register(r registrar) { registrars = append(registrars, r) }

// SetupHandlers mounts all registered network tools under <api>/net.
func SetupHandlers(api *gin.RouterGroup, conf config.NetworkToolsConfig) error {
	mws, err := netguard.Middlewares(conf)
	if err != nil {
		return err
	}
	g := api.Group("/net", mws...)
	d := Deps{Guard: netguard.NewGuard(conf), Config: conf}
	for _, r := range registrars {
		r(g, d)
	}
	return nil
}
