package termapp

import (
	"os"
	"path/filepath"
	"testing"

	"totalcmd/internal/localshell"
)

// ─── Todo #122: the terminal dock starts its local shell in the panel's folder ──

func TestLocalStartDirUsesAnExistingFolder(t *testing.T) {
	dir := t.TempDir()
	if got := localStartDir(dir); got != filepath.Clean(dir) {
		t.Errorf("localStartDir(%q) = %q, want the folder itself", dir, got)
	}
}

func TestLocalStartDirFallsBackToHome(t *testing.T) {
	file := filepath.Join(t.TempDir(), "a.txt")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	for _, d := range []string{"", "   ", file, filepath.Join(t.TempDir(), "missing")} {
		if got := localStartDir(d); got != localshell.Home() {
			t.Errorf("localStartDir(%q) = %q, want the home folder %q", d, got, localshell.Home())
		}
	}
}
