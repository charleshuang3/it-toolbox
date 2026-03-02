package frontend

import (
	"os"
	"strings"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/gin-gonic/gin"
)

func SetupHandlers(r *gin.Engine, config *config.Config) error {
	if config.FrontendFilePath == "" {
		return nil
	}

	if _, err := os.Stat(config.FrontendFilePath); err != nil {
		return err
	}

	// Serve static assets from /assets prefix
	r.Static("/assets", config.FrontendFilePath+"/assets")

	// Serve index.html for all other non-API routes (SPA fallback)
	r.NoRoute(func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.File(config.FrontendFilePath + "/index.html")
		}
	})
	return nil
}
