package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Todo #137-2: 권한 · 소유자 ──────────────────────────────────────────────

func TestPerms_UnixPermRoundTrip(t *testing.T) {
	for _, p := range []uint32{0, 0644, 0755, 04755, 02750, 01777, 07777} {
		if got := unixPerm(goMode(p)); got != p {
			t.Errorf("%o → %o", p, got)
		}
	}
}

func TestPerms_ListingHasMode(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "a.txt"), []byte("a"), 0644)
	l, err := newTestFM().ListDirectory(base)
	if err != nil || len(l.Files) != 1 {
		t.Fatal(err)
	}
	if l.Files[0].Mode&0400 == 0 {
		t.Errorf("mode %o should be readable by owner", l.Files[0].Mode)
	}
	if unixCopy && (l.Files[0].Owner == "" || l.Files[0].Group == "") {
		t.Error("owner and group must be listed on Linux · macOS")
	}
	if !unixCopy && l.Files[0].Owner != "" {
		t.Error("Windows lists no owner")
	}
}

func TestPerms_WindowsUnsupported(t *testing.T) {
	if unixCopy {
		t.Skip("Windows only")
	}
	p := filepath.Join(t.TempDir(), "a")
	os.WriteFile(p, nil, 0644)
	if err := newTestFM().ChangeMode([]string{p}, 0, 0222, false); err != errPermsUnsupported {
		t.Errorf("ChangeMode: %v", err)
	}
	if err := newTestFM().ChangeOwner([]string{p}, "root", "", false); err != errPermsUnsupported {
		t.Errorf("ChangeOwner: %v", err)
	}
}

func TestPerms_RefuseInArchive(t *testing.T) {
	if !unixCopy {
		t.Skip("unix only")
	}
	base := t.TempDir()
	zipPath := makeTestZip(t, base, map[string]string{"x.txt": "x"})
	if err := newTestFM().ChangeMode([]string{filepath.Join(zipPath, "x.txt")}, 0777, 0, false); err != errArchiveReadOnly {
		t.Errorf("got %v", err)
	}
}
