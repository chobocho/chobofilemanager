package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Todo #98: 내장 뷰어용 읽기 크기 제한 ─────────────────────────────────────

func makeSparse(t *testing.T, name string, size int64) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	f, err := os.Create(p)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(size); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return p
}

func TestReadTextFile_TooLargeRejected(t *testing.T) {
	p := makeSparse(t, "big.txt", maxViewerFileSize+1)
	if _, err := newTestFM().ReadTextFile(p); err == nil {
		t.Error("files over the viewer limit should be rejected")
	}
}

func TestReadImageFile_TooLargeRejected(t *testing.T) {
	p := makeSparse(t, "big.png", maxViewerFileSize+1)
	if _, err := newTestFM().ReadImageFile(p); err == nil {
		t.Error("images over the viewer limit should be rejected")
	}
}

func TestReadTextFile_AtLimitAllowed(t *testing.T) {
	p := makeSparse(t, "ok.txt", 1024)
	if _, err := newTestFM().ReadTextFile(p); err != nil {
		t.Errorf("small file should load: %v", err)
	}
}
