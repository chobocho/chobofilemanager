package appdir

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Todo #125: one settings folder for the window app and the headless terminal ──

func TestDirIsUnderHome(t *testing.T) {
	home, _ := os.UserHomeDir()
	d, err := Dir()
	if err != nil || d != filepath.Join(home, ".chobocho-commander") {
		t.Fatalf("Dir() = %q, %v", d, err)
	}
}

func TestTermDirIsInsideDir(t *testing.T) {
	d, _ := Dir()
	if td, err := TermDir(); err != nil || td != filepath.Join(d, "term") {
		t.Fatalf("TermDir() = %q, %v", td, err)
	}
}
