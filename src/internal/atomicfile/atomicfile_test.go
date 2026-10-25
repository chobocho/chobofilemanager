package atomicfile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteCreatesFolderAndReplaces(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a", "b", "x.json")
	if err := Write(p, []byte("one"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := Write(p, []byte("two"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(p); string(got) != "two" {
		t.Fatalf("got %q", got)
	}
	entries, _ := os.ReadDir(filepath.Dir(p))
	if len(entries) != 1 {
		t.Fatalf("temp files left: %v", entries)
	}
}

func TestWriteFailureKeepsTheOldFileAndNoTemp(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "x")
	os.MkdirAll(filepath.Join(p, "inner"), 0o755) // a non-empty folder can't be replaced by a file
	if err := Write(p, []byte("data"), 0o600); err == nil {
		t.Fatal("replacing a folder must fail")
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("temp file left: %v", entries)
	}
}

func TestBackupCorruptKeepsTheContent(t *testing.T) {
	p := filepath.Join(t.TempDir(), "settings.json")
	os.WriteFile(p, []byte("{broken"), 0o600)
	backup := BackupCorrupt(p)
	if !strings.HasPrefix(filepath.Base(backup), "settings.json.corrupt-") {
		t.Fatalf("backup = %q", backup)
	}
	if got, _ := os.ReadFile(backup); string(got) != "{broken" {
		t.Fatalf("backup content %q", got)
	}
	if _, err := os.Stat(p); err == nil {
		t.Fatal("the corrupt file must move away")
	}
}
