package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ─── 경로 비교 헬퍼 ───────────────────────────────────────────────────────────

func TestSamePath(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "a.txt")
	os.WriteFile(f, []byte("x"), 0644)

	if !samePath(f, f) {
		t.Error("identical paths should be same")
	}
	if !samePath(f, filepath.Join(base, ".", "a.txt")) {
		t.Error("uncleaned path should be same")
	}
	if samePath(f, filepath.Join(base, "b.txt")) {
		t.Error("different paths should not be same")
	}
	if runtime.GOOS == "windows" && !samePath(f, strings.ToUpper(f)) {
		t.Error("case-only difference should be same on Windows")
	}
}

// ─── Todo #68: MoveItemsOverwrite ─────────────────────────────────────────────

func TestMoveItemsOverwrite_SameFolderKeepsSource(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "f.txt")
	os.WriteFile(src, []byte("precious"), 0644)

	err := newTestFM().MoveItemsOverwrite([]string{src}, base)
	if err == nil {
		t.Error("moving onto itself should return an error")
	}
	data, rerr := os.ReadFile(src)
	if rerr != nil || string(data) != "precious" {
		t.Fatalf("source must survive: data=%q err=%v", data, rerr)
	}
}

func TestMoveItemsOverwrite_SameFolderDirKeepsSource(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "d")
	os.MkdirAll(dir, 0755)
	os.WriteFile(filepath.Join(dir, "inner.txt"), []byte("x"), 0644)

	if err := newTestFM().MoveItemsOverwrite([]string{dir}, base); err == nil {
		t.Error("moving dir onto itself should return an error")
	}
	if _, err := os.Stat(filepath.Join(dir, "inner.txt")); err != nil {
		t.Fatalf("dir contents must survive: %v", err)
	}
}

func TestMoveItemsOverwrite_SameFolderCaseInsensitive(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("case-insensitive paths only on Windows")
	}
	base := t.TempDir()
	src := filepath.Join(base, "f.txt")
	os.WriteFile(src, []byte("precious"), 0644)

	newTestFM().MoveItemsOverwrite([]string{src}, strings.ToUpper(base))
	if data, err := os.ReadFile(src); err != nil || string(data) != "precious" {
		t.Fatalf("source must survive: data=%q err=%v", data, err)
	}
}

func TestMoveItemsOverwrite_ReplacesExisting(t *testing.T) {
	base := t.TempDir()
	srcDir := filepath.Join(base, "src")
	dstDir := filepath.Join(base, "dst")
	os.MkdirAll(srcDir, 0755)
	os.MkdirAll(dstDir, 0755)
	src := filepath.Join(srcDir, "f.txt")
	os.WriteFile(src, []byte("new"), 0644)
	os.WriteFile(filepath.Join(dstDir, "f.txt"), []byte("old"), 0644)

	if err := newTestFM().MoveItemsOverwrite([]string{src}, dstDir); err != nil {
		t.Fatalf("MoveItemsOverwrite: %v", err)
	}
	if data, _ := os.ReadFile(filepath.Join(dstDir, "f.txt")); string(data) != "new" {
		t.Errorf("dest should contain new content, got %q", data)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("source should be gone")
	}
	assertNoBackupLeft(t, dstDir)
}

func TestMoveItemsOverwrite_ReplacesExistingDir(t *testing.T) {
	base := t.TempDir()
	srcDir := filepath.Join(base, "src", "d")
	dstDir := filepath.Join(base, "dst")
	os.MkdirAll(srcDir, 0755)
	os.MkdirAll(filepath.Join(dstDir, "d"), 0755)
	os.WriteFile(filepath.Join(srcDir, "new.txt"), []byte("n"), 0644)
	os.WriteFile(filepath.Join(dstDir, "d", "old.txt"), []byte("o"), 0644)

	if err := newTestFM().MoveItemsOverwrite([]string{srcDir}, dstDir); err != nil {
		t.Fatalf("MoveItemsOverwrite: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dstDir, "d", "new.txt")); err != nil {
		t.Error("new content should be in dest")
	}
	if _, err := os.Stat(filepath.Join(dstDir, "d", "old.txt")); !os.IsNotExist(err) {
		t.Error("old dir content should be replaced, not merged")
	}
	assertNoBackupLeft(t, dstDir)
}

func TestMoveItemsOverwrite_FailureRestoresDest(t *testing.T) {
	base := t.TempDir()
	dstDir := filepath.Join(base, "dst")
	os.MkdirAll(dstDir, 0755)
	os.WriteFile(filepath.Join(dstDir, "f.txt"), []byte("old"), 0644)
	missing := filepath.Join(base, "src", "f.txt") // 존재하지 않는 원본 → 이동 실패

	if err := newTestFM().MoveItemsOverwrite([]string{missing}, dstDir); err == nil {
		t.Fatal("expected error for missing source")
	}
	if data, err := os.ReadFile(filepath.Join(dstDir, "f.txt")); err != nil || string(data) != "old" {
		t.Fatalf("existing dest must be restored on failure: data=%q err=%v", data, err)
	}
	assertNoBackupLeft(t, dstDir)
}

func assertNoBackupLeft(t *testing.T, dir string) {
	t.Helper()
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), backupMarker) {
			t.Errorf("backup file left behind: %s", e.Name())
		}
	}
}

// ─── Todo #69: CopyItems 원본=대상 ────────────────────────────────────────────

func TestCopyItems_SameFolderDoesNotTruncate(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "f.txt")
	os.WriteFile(src, []byte("precious"), 0644)

	if err := newTestFM().CopyItems([]string{src}, base); err == nil {
		t.Error("copying onto itself should return an error")
	}
	if data, _ := os.ReadFile(src); string(data) != "precious" {
		t.Fatalf("source must not be truncated, got %q", data)
	}
}

func TestCopyItems_SameFolderDirDoesNotTruncate(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "d")
	os.MkdirAll(dir, 0755)
	inner := filepath.Join(dir, "inner.txt")
	os.WriteFile(inner, []byte("precious"), 0644)

	if err := newTestFM().CopyItems([]string{dir}, base); err == nil {
		t.Error("copying dir onto itself should return an error")
	}
	if data, _ := os.ReadFile(inner); string(data) != "precious" {
		t.Fatalf("dir contents must not be truncated, got %q", data)
	}
}

func TestCopyFile_SamePathRejected(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "f.txt")
	os.WriteFile(f, []byte("precious"), 0644)
	if err := copyFile(f, f); err == nil {
		t.Error("copyFile onto itself should return an error")
	}
	if data, _ := os.ReadFile(f); string(data) != "precious" {
		t.Fatalf("file must not be truncated, got %q", data)
	}
}

func TestCopyItemsRename_SameFolderMakesDuplicate(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "f.txt")
	os.WriteFile(src, []byte("precious"), 0644)

	if err := newTestFM().CopyItemsRename([]string{src}, base); err != nil {
		t.Fatalf("CopyItemsRename: %v", err)
	}
	if data, _ := os.ReadFile(filepath.Join(base, "f (1).txt")); string(data) != "precious" {
		t.Errorf("duplicate should have same content, got %q", data)
	}
	if data, _ := os.ReadFile(src); string(data) != "precious" {
		t.Errorf("source must stay intact, got %q", data)
	}
}
