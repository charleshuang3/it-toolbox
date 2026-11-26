package frontend

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/charleshuang3/it-toolbox/backend/config"
)

func SetupHandlers(r *gin.Engine, config *config.Config) error {
	if config.FrontendFilePath == "" {
		return nil
	}

	if _, err := os.Stat(config.FrontendFilePath); err != nil {
		return err
	}

	// Serve static assets from /assets prefix. Filenames are content-hashed,
	// so they can be cached for a long time.
	assets := r.Group("/assets", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
	})
	assets.Static("/", config.FrontendFilePath+"/assets")

	// Serve favicon
	r.StaticFile("/icon.svg", config.FrontendFilePath+"/icon.svg")

	// Serve index.html for all other non-API routes (SPA fallback)
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "/api" || strings.HasPrefix(path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.File(config.FrontendFilePath + "/index.html")
	})
	return nil
}
