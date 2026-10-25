package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Todo #130-1: 이름 바꾸기가 다른 파일을 덮어쓰지 않게 ─────────────────────────

func TestRenameItemRefusesToOverwriteAnotherFile(t *testing.T) {
	dir := t.TempDir()
	a, b := filepath.Join(dir, "a.txt"), filepath.Join(dir, "b.txt")
	os.WriteFile(a, []byte("A"), 0o644)
	os.WriteFile(b, []byte("B"), 0o644)
	if err := NewFileManager().RenameItem(a, b); err == nil {
		t.Fatal("renaming onto an existing file must fail")
	}
	if got, _ := os.ReadFile(b); string(got) != "B" {
		t.Fatalf("b.txt was overwritten: %q", got)
	}
	if _, err := os.Stat(a); err != nil {
		t.Fatalf("a.txt must stay: %v", err)
	}
}

func TestRenameItemRefusesToReplaceAFolder(t *testing.T) {
	dir := t.TempDir()
	a, sub := filepath.Join(dir, "a"), filepath.Join(dir, "sub")
	os.Mkdir(a, 0o755)
	os.Mkdir(sub, 0o755)
	os.WriteFile(filepath.Join(sub, "keep.txt"), []byte("k"), 0o644)
	if err := NewFileManager().RenameItem(a, sub); err == nil {
		t.Fatal("renaming onto an existing folder must fail")
	}
	if _, err := os.Stat(filepath.Join(sub, "keep.txt")); err != nil {
		t.Fatal("the existing folder's content must stay")
	}
}

// 대소문자만 바꾸기(a.txt → A.txt)는 같은 파일이므로 허용 (대소문자 무시 파일 시스템)
func TestRenameItemAllowsChangingOnlyTheCase(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "case.txt")
	os.WriteFile(a, []byte("x"), 0o644)
	up := filepath.Join(dir, "CASE.txt")
	if err := NewFileManager().RenameItem(a, up); err != nil {
		t.Fatalf("case-only rename: %v", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "CASE.txt" {
		t.Fatalf("entries = %v", entries)
	}
}

func TestRenameItemToANewName(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.txt")
	os.WriteFile(a, []byte("x"), 0o644)
	if err := NewFileManager().RenameItem(a, filepath.Join(dir, "new.txt")); err != nil {
		t.Fatal(err)
	}
}
