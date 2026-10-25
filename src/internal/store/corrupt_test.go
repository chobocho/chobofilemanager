package store

import (
	"os"
	"path/filepath"
	"testing"
)

// Todo #130-2: a broken sessions.json / hosts.json is kept aside instead of
// being replaced by the next save (which would drop every saved session).

func TestCorruptSessionsAreBackedUpBeforeTheNextSave(t *testing.T) {
	hosts := useTempHistory(t)
	p := filepath.Join(filepath.Dir(hosts), "sessions.json")
	os.WriteFile(p, []byte(`{"sessions": [{"id": "x", "host": "keep.me"`), 0o600)
	if _, err := SaveSession(SavedSession{Name: "new", Host: "n.example", Port: 22}, false); err != nil {
		t.Fatal(err)
	}
	b, _ := filepath.Glob(p + ".corrupt-*")
	if len(b) != 1 {
		t.Fatalf("backups = %v", b)
	}
	if got, _ := os.ReadFile(b[0]); string(got) != `{"sessions": [{"id": "x", "host": "keep.me"` {
		t.Fatalf("backup content %q", got)
	}
	if l := LoadSessions(); len(l) != 1 || l[0].Name != "new" {
		t.Fatalf("sessions = %+v", l)
	}
}

func TestCorruptHistoryIsBackedUpBeforeTheNextSave(t *testing.T) {
	p := useTempHistory(t)
	os.WriteFile(p, []byte(`[{"host": "keep.me"`), 0o600)
	if err := AddHistory(HostEntry{Host: "n.example", Port: 22}, nil); err != nil {
		t.Fatal(err)
	}
	b, _ := filepath.Glob(p + ".corrupt-*")
	if len(b) != 1 {
		t.Fatalf("backups = %v", b)
	}
	if l := LoadHistory(); len(l) != 1 || l[0].Host != "n.example" {
		t.Fatalf("history = %+v", l)
	}
	entries, _ := os.ReadDir(filepath.Dir(p))
	for _, e := range entries {
		if filepath.Ext(e.Name()) == ".tmp" {
			t.Fatalf("temp file left: %s", e.Name())
		}
	}
}
