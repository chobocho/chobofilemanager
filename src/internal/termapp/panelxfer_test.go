package termapp

import (
	"os"
	"path/filepath"
	"testing"

	"totalcmd/internal/transfer"
)

// ─── Todo #123: the remote file window downloads into the file panel's folder ──

func TestFileDownloadToPanelFolderSkipsTheDialog(t *testing.T) {
	dir := t.TempDir()
	p := &fakePicker{}
	a, fs := pickerApp(t, p)
	fs.files["/d/a.txt"] = []byte("a")
	fs.files["/d/sub/b.txt"] = []byte("bb")
	fs.files["/c.txt"] = []byte("ccc")

	res, err := a.FileDownloadTo(1, "/", []transfer.FileEntry{{Name: "d", IsDir: true}, {Name: "c.txt", Size: 3}}, dir)
	if err != nil || res.Count != 3 || res.Dir != filepath.Clean(dir) {
		t.Fatalf("download to: %+v %v", res, err)
	}
	if got := listTree(t, dir); !equalList(got, []string{"c.txt", "d/", "d/a.txt", "d/sub/", "d/sub/b.txt"}) {
		t.Fatalf("tree %v", got)
	}
	if len(p.calls) != 0 {
		t.Fatalf("no dialog expected, got %v", p.calls)
	}
	// An existing name gets " (1)", as with the dialog.
	if _, err := a.FileDownloadTo(1, "/", []transfer.FileEntry{{Name: "c.txt", Size: 3}}, dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "c (1).txt")); err != nil {
		t.Fatalf("second copy: %v", err)
	}
}

func TestFileDownloadToNeedsAnExistingFolder(t *testing.T) {
	a, _ := pickerApp(t, &fakePicker{})
	file := filepath.Join(t.TempDir(), "f")
	os.WriteFile(file, []byte("x"), 0o644)
	for _, d := range []string{"", file, filepath.Join(t.TempDir(), "missing")} {
		if _, err := a.FileDownloadTo(1, "/", []transfer.FileEntry{{Name: "a"}}, d); err == nil {
			t.Errorf("FileDownloadTo(%q) should fail", d)
		}
	}
	if _, err := a.FileDownloadTo(99, "/", nil, t.TempDir()); err == nil {
		t.Error("an unknown tab must fail")
	}
}
