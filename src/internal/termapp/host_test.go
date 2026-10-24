package termapp

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"totalcmd/internal/config"
	"totalcmd/internal/store"
)

// ─── Todo #118: hosting choboTerm inside Chobocho Commander's window ─────────

func TestRunSubprocessIgnoresOrdinaryArgs(t *testing.T) {
	for _, args := range [][]string{{"exe"}, {"exe", "--web"}, {"exe", "C:\\work"}, {}} {
		if RunSubprocess(args) {
			t.Errorf("RunSubprocess(%q) must not take over a normal start", args)
		}
	}
}

func withConfigFuncs(t *testing.T) {
	t.Helper()
	cf, hf, sf := config.File, store.HistoryFile, store.SessionsFile
	t.Cleanup(func() { config.File, store.HistoryFile, store.SessionsFile = cf, hf, sf })
}

func TestUseConfigDirRedirectsEveryFile(t *testing.T) {
	withConfigFuncs(t)
	dir := t.TempDir()
	UseConfigDir(dir)
	for name, f := range map[string]func() (string, error){
		"settings.json": config.File, "hosts.json": store.HistoryFile, "sessions.json": store.SessionsFile,
	} {
		p, err := f()
		if err != nil || p != filepath.Join(dir, name) {
			t.Errorf("%s → %q, %v", name, p, err)
		}
	}
}

func TestMigrateConfigCopiesOldFilesOnce(t *testing.T) {
	old, dst := t.TempDir(), filepath.Join(t.TempDir(), "term")
	os.WriteFile(filepath.Join(old, "settings.json"), []byte(`{"fontSize":20}`), 0o600)
	os.WriteFile(filepath.Join(old, "hosts.json"), []byte(`[]`), 0o600)
	os.MkdirAll(filepath.Join(old, "subdir"), 0o700)

	n, err := MigrateConfig(old, dst)
	if err != nil || n != 2 {
		t.Fatalf("first migration copied %d, err %v", n, err)
	}
	if b, _ := os.ReadFile(filepath.Join(dst, "settings.json")); string(b) != `{"fontSize":20}` {
		t.Errorf("settings not copied: %q", b)
	}
	// The new folder is now the source of truth: a later start doesn't copy again.
	os.WriteFile(filepath.Join(dst, "settings.json"), []byte(`{"fontSize":12}`), 0o600)
	if n, err := MigrateConfig(old, dst); err != nil || n != 0 {
		t.Fatalf("second migration copied %d, err %v", n, err)
	}
	if b, _ := os.ReadFile(filepath.Join(dst, "settings.json")); string(b) != `{"fontSize":12}` {
		t.Error("migration must not overwrite the merged app's own settings")
	}
}

func TestMigrateConfigWithoutOldFolder(t *testing.T) {
	dst := filepath.Join(t.TempDir(), "term")
	if n, err := MigrateConfig(filepath.Join(t.TempDir(), "missing"), dst); err != nil || n != 0 {
		t.Errorf("no old folder: copied %d, err %v", n, err)
	}
}

// newTestHost builds a Host whose settings live in a temporary folder.
func newTestHost(t *testing.T) *Host {
	t.Helper()
	withConfigFuncs(t)
	UseConfigDir(t.TempDir())
	return NewHost()
}

func TestHostBindsOneApp(t *testing.T) {
	h := newTestHost(t)
	if h.Bindings() == nil || h.Bindings() != h.Bindings() {
		t.Error("the host binds one App instance")
	}
}

func TestHostBeforeCloseAllowsCloseWhenIdle(t *testing.T) {
	h := newTestHost(t)
	h.Bindings().hooks.emit = func(string, ...interface{}) { t.Error("nothing to ask about") }
	if h.BeforeClose(context.Background()) {
		t.Error("no connected tab: the window closes normally")
	}
}

func TestHostBeforeCloseAsksWithConnectedTab(t *testing.T) {
	h := newTestHost(t)
	a := h.Bindings()
	var asked string
	a.hooks.emit = func(name string, _ ...interface{}) { asked = name }
	a.getTab(1).sess = newPipeSession()
	if !h.BeforeClose(context.Background()) {
		t.Fatal("a connected tab keeps the window open until the page confirms")
	}
	if asked != "app:close" {
		t.Errorf("the page is asked with app:close, got %q", asked)
	}
}

func TestHostShutdownClosesSessions(t *testing.T) {
	h := newTestHost(t)
	a := h.Bindings()
	a.hooks.emit = func(string, ...interface{}) {}
	s := newPipeSession()
	a.getTab(1).sess = s
	h.Shutdown(context.Background())
	s.mu.Lock()
	closed := s.closed
	s.mu.Unlock()
	if !closed {
		t.Error("shutting the window down closes every session")
	}
}
