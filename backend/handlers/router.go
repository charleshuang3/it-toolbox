package handlers

import (
	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/handlers/jwts"
	"github.com/gin-gonic/gin"
)

func SetupHandlers(r *gin.RouterGroup, conf *config.Config) error {
	if err := jwts.SetupHandlers(r, conf.JWKS); err != nil {
		return err
	}
	return nil
}
