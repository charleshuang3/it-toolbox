package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/charleshuang3/it-toolbox/backend/config"
	"github.com/charleshuang3/it-toolbox/backend/handlers"
	"github.com/gin-gonic/gin"
)

func main() {
	confFile := ""
	// Parse env argument
	if os.Getenv("CONFIG_FILE") != "" {
		confFile = os.Getenv("CONFIG_FILE")
	}

	// Parse command line arguments
	configFile := flag.String("c", "", "path to config file")
	flag.Parse()

	if confFile == "" {
		confFile = *configFile
	}

	if confFile == "" {
		log.Fatal("No config file specified")
	}

	conf, err := config.LoadConfig(confFile)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if conf.Debug {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	r := gin.Default()

	// API routes
	if err := handlers.SetupHandlers(r, conf); err != nil {
		log.Fatalf("Failed to setup JWKS handler: %v", err)
	}

	// Start server
	addr := fmt.Sprintf(":%d", conf.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	// Run server in a goroutine
	go func() {
		log.Printf("Starting server on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	// Give outstanding requests 5 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
