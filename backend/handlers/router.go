package handlers

import (
	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/handlers/frontend"
	"github.com/charleshuang3/it-toolbox/backend/handlers/jwts"
	"github.com/gin-gonic/gin"
)

func SetupHandlers(r *gin.Engine, conf *config.Config) error {
	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "*")
		c.Next()
	})

	api := r.Group("/api")
	if err := jwts.SetupHandlers(api, conf.JWKS); err != nil {
		return err
	}

	if err := frontend.SetupHandlers(r, conf); err != nil {
		return err
	}
	return nil
}
