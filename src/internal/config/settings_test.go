package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func useTempSettings(t *testing.T) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "settings.json")
	orig := File
	File = func() (string, error) { return p, nil }
	t.Cleanup(func() { File = orig })
	return p
}

func corruptBackups(t *testing.T, p string) []string {
	t.Helper()
	m, _ := filepath.Glob(p + ".corrupt-*")
	return m
}

func TestLoadMissingFileGivesDefaults(t *testing.T) {
	useTempSettings(t)
	if s := Load(); s.FontSize != Default().FontSize || s.Macros == nil {
		t.Fatalf("got %+v", s)
	}
}

func TestUpdateKeepsOtherFieldsAndWritesAtomically(t *testing.T) {
	p := useTempSettings(t)
	if err := Update(func(s *Settings) { s.FontSize = 20 }); err != nil {
		t.Fatal(err)
	}
	if err := Update(func(s *Settings) { s.Theme = "dark" }); err != nil {
		t.Fatal(err)
	}
	s := Load()
	if s.FontSize != 20 || s.Theme != "dark" {
		t.Fatalf("got %+v", s)
	}
	entries, _ := os.ReadDir(filepath.Dir(p))
	if len(entries) != 1 {
		t.Fatalf("temp files left: %v", entries)
	}
}

func TestLoadNullMacrosBecomesAList(t *testing.T) {
	p := useTempSettings(t)
	os.WriteFile(p, []byte(`{"fontSize": 18, "macros": null}`), 0o600)
	s := Load()
	if s.FontSize != 18 || s.Macros == nil || s.Theme != Default().Theme {
		t.Fatalf("got %+v", s)
	}
}

// Todo #130-2: a broken settings.json is kept aside, not overwritten by the next save.
func TestCorruptSettingsAreBackedUpBeforeTheNextSave(t *testing.T) {
	p := useTempSettings(t)
	os.WriteFile(p, []byte(`{"fontSize": 18,`), 0o600)
	if s := Load(); s.FontSize != Default().FontSize {
		t.Fatalf("corrupt file should give defaults, got %+v", s)
	}
	if err := Update(func(s *Settings) { s.FontSize = 22 }); err != nil {
		t.Fatal(err)
	}
	b := corruptBackups(t, p)
	if len(b) != 1 {
		t.Fatalf("backups = %v", b)
	}
	if got, _ := os.ReadFile(b[0]); !strings.Contains(string(got), `"fontSize": 18`) {
		t.Fatalf("backup content %q", got)
	}
	if Load().FontSize != 22 {
		t.Fatal("the new save must be readable")
	}
}
