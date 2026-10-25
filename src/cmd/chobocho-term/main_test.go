package main

import (
	"path/filepath"
	"strings"
	"testing"

	"totalcmd/internal/config"
	"totalcmd/internal/store"
)

// Todo #125: the headless terminal uses the window app's terminal folder.
func TestSetupConfigUsesTheAppsTerminalFolder(t *testing.T) {
	cf, hf, sf := config.File, store.HistoryFile, store.SessionsFile
	t.Cleanup(func() { config.File, store.HistoryFile, store.SessionsFile = cf, hf, sf })
	t.Setenv("USERPROFILE", t.TempDir())
	t.Setenv("HOME", t.TempDir())
	dir := setupConfig()
	if !strings.HasSuffix(dir, filepath.Join(".chobocho-commander", "term")) {
		t.Fatalf("dir = %q", dir)
	}
	if p, err := config.File(); err != nil || filepath.Dir(p) != dir {
		t.Fatalf("settings file %q (%v), want it in %q", p, err, dir)
	}
}
