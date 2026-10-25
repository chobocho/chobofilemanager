package main

import (
	"os"
	"path/filepath"
	"testing"
)

// Todo #133-1: Space로 폴더 크기 계산 (Total Commander와 같게)

func TestDirSize_SumsFilesRecursively(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "a.txt"), make([]byte, 100), 0644)
	os.MkdirAll(filepath.Join(root, "sub", "deep"), 0755)
	os.WriteFile(filepath.Join(root, "sub", "b.bin"), make([]byte, 250), 0644)
	os.WriteFile(filepath.Join(root, "sub", "deep", "c.bin"), make([]byte, 50), 0644)

	got, err := newTestFM().DirSize(root)
	if err != nil {
		t.Fatal(err)
	}
	if got.Size != 400 || got.Files != 3 || got.Dirs != 2 {
		t.Fatalf("DirSize = %+v, want size 400, 3 files, 2 dirs", got)
	}
}

func TestDirSize_EmptyAndMissing(t *testing.T) {
	got, err := newTestFM().DirSize(t.TempDir())
	if err != nil || got.Size != 0 || got.Files != 0 || got.Dirs != 0 {
		t.Fatalf("empty dir: %+v, %v", got, err)
	}
	if _, err := newTestFM().DirSize(filepath.Join(t.TempDir(), "nope")); err == nil {
		t.Fatal("missing dir: want error")
	}
}

func TestDirSize_FileGivesItsOwnSize(t *testing.T) {
	p := filepath.Join(t.TempDir(), "x.bin")
	os.WriteFile(p, make([]byte, 7), 0644)
	got, err := newTestFM().DirSize(p)
	if err != nil || got.Size != 7 || got.Files != 1 {
		t.Fatalf("file: %+v, %v", got, err)
	}
}

func TestApp_DirSize(t *testing.T) {
	root := t.TempDir()
	os.WriteFile(filepath.Join(root, "a"), make([]byte, 9), 0644)
	got, err := newTestApp(t).DirSize(root)
	if err != nil || got.Size != 9 {
		t.Fatalf("App.DirSize = %+v, %v", got, err)
	}
}
