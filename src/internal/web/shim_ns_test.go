package web

import (
	"strings"
	"testing"
)

// Todo #124: the page served to browsers is Chobocho Commander's, which calls
// the terminal as window.go.termapp.App.
func TestShimProvidesTheTerminalNamespace(t *testing.T) {
	if !strings.Contains(string(webShim), "termapp: {App}") {
		t.Fatal("web_shim.js must define window.go.termapp.App")
	}
}
