package termapp

import (
	"context"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"

	"totalcmd/frontend"
	"totalcmd/internal/config"
	"totalcmd/internal/luahost"
	"totalcmd/internal/osutil"
	"totalcmd/internal/store"
	"totalcmd/internal/web"
)

// Host runs choboTerm inside another program's Wails window (Chobocho Commander).
// The host program owns the window: it binds Bindings() next to its own App and
// forwards the window lifecycle here. Host is deliberately a separate type with
// the lifecycle methods, because every exported method of *App becomes a binding.
type Host struct {
	app *App
}

// RunSubprocess handles the process modes choboTerm starts itself with, before
// the host creates its window. It returns false for a normal start. For
// "--lua-host" it runs the Lua script host and exits the process, so a Lua
// script never opens a second window.
func RunSubprocess(args []string) bool {
	if len(args) > 1 && args[1] == "--lua-host" {
		os.Exit(luahost.Run(os.Stdin, os.Stdout))
	}
	return false
}

// UseConfigDir keeps every choboTerm file (settings.json, hosts.json,
// sessions.json, the web token and certificate next to them) in dir.
func UseConfigDir(dir string) {
	config.File = func() (string, error) { return filepath.Join(dir, "settings.json"), nil }
	store.HistoryFile = func() (string, error) { return filepath.Join(dir, "hosts.json"), nil }
	store.SessionsFile = func() (string, error) { return filepath.Join(dir, "sessions.json"), nil }
}

// LegacyConfigDir is where a standalone choboTerm keeps its files.
func LegacyConfigDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}
	return filepath.Join(dir, "choboterm")
}

// MigrateConfig copies the files of a standalone choboTerm (old) into dst the
// first time, when dst doesn't exist yet. Afterwards dst is the only source of
// truth and old is left untouched. It returns how many files were copied.
func MigrateConfig(old, dst string) (int, error) {
	if old == "" {
		return 0, nil
	}
	if _, err := os.Stat(dst); err == nil {
		return 0, nil
	}
	entries, err := os.ReadDir(old)
	if errors.Is(err, fs.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	if err := os.MkdirAll(dst, 0o700); err != nil {
		return 0, err
	}
	n := 0
	for _, e := range entries {
		if !e.Type().IsRegular() {
			continue
		}
		if err := copyRegular(filepath.Join(old, e.Name()), filepath.Join(dst, e.Name())); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

func copyRegular(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// NewHost prepares choboTerm the way Main does for its own window: the first-run
// font size, the page served to browsers, and the web server from Settings > Web.
// Call UseConfigDir first so the settings are read from the right folder.
func NewHost() *Host {
	config.FirstRun = func(s *config.Settings) {
		if f := osutil.SystemMonoFont(); f.Size >= 8 && f.Size <= 40 {
			s.FontSize = f.Size
		}
	}
	if page, err := fs.Sub(frontend.Assets, frontend.AssetDir); err == nil {
		webPage = page
	}
	a := NewApp()
	if s := config.Load().Web; s != nil && s.Enabled {
		a.webStart = &web.Options{Addr: s.Addr}
	}
	return &Host{app: a}
}

// HandoffToRunning: with the web server turned on in Settings, a Chobocho
// Commander already serving its port is asked to show its window (it may be
// hidden, see WebHideWindow); true means it did, and this one should quit
// instead of starting a second app that can't serve the same port.
func (h *Host) HandoffToRunning() bool {
	return h.app.webStart != nil && web.Handoff(*h.app.webStart)
}

// Bindings is the struct to add to the host window's Bind list.
func (h *Host) Bindings() *App { return h.app }

// Startup is the host window's OnStartup.
func (h *Host) Startup(ctx context.Context) { h.app.startup(ctx) }

// BeforeClose is called from the host window's OnBeforeClose. It returns true to
// keep the window open while a tab is connected (the page then asks the user
// after an "app:close" event) or browsers use the web server. Unlike the
// standalone window it doesn't save the window position: the host owns the window.
func (h *Host) BeforeClose(ctx context.Context) bool {
	a := h.app
	if a.quit.Load() {
		return false
	}
	if w := a.web.Load(); w != nil {
		if n := w.ConnectedCount(); n > 0 {
			a.emit("app:closeWeb", n)
			return true
		}
	}
	if a.windowTabsConnected() {
		a.emit("app:close")
		return true
	}
	return false
}

// Shutdown is the host window's OnShutdown: it closes every session and the web server.
func (h *Host) Shutdown(ctx context.Context) { h.app.shutdown(ctx) }
