package frontend

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/charleshuang3/it-toolbox/backend/config"
)

func TestSetupHandlers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "assets", "a-123.js"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	r := gin.New()
	if err := SetupHandlers(r, &config.Config{FrontendFilePath: dir}); err != nil {
		t.Fatal(err)
	}

	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}

	if w := get("/assets/a-123.js"); w.Code != 200 || w.Header().Get("Cache-Control") == "" {
		t.Errorf("asset: code=%d cache=%q", w.Code, w.Header().Get("Cache-Control"))
	}
	if w := get("/api/nope"); w.Code != 404 || w.Body.String() != `{"error":"not found"}` {
		t.Errorf("api: code=%d body=%q", w.Code, w.Body.String())
	}
	if w := get("/some/route"); w.Code != 200 || w.Body.String() != "<html>" {
		t.Errorf("spa: code=%d body=%q", w.Code, w.Body.String())
	}
}
