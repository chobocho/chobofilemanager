package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// ─── Todo #89: 압축/해제 에러 보고 + zip 형식 ─────────────────────────────────

func zipNames(t *testing.T, p string) []string {
	t.Helper()
	r, err := zip.OpenReader(p)
	if err != nil {
		t.Fatalf("open zip: %v", err)
	}
	defer r.Close()
	var names []string
	for _, f := range r.File {
		names = append(names, f.Name)
	}
	sort.Strings(names)
	return names
}

func TestCompressItems_SlashNamesAndEmptyDirs(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "proj")
	os.MkdirAll(filepath.Join(src, "sub", "deep"), 0755)
	os.MkdirAll(filepath.Join(src, "empty"), 0755)
	os.WriteFile(filepath.Join(src, "sub", "deep", "a.txt"), []byte("a"), 0644)

	dest := filepath.Join(base, "out.zip")
	if err := newTestFM().CompressItems([]string{src}, dest); err != nil {
		t.Fatalf("CompressItems: %v", err)
	}
	names := zipNames(t, dest)
	for _, n := range names {
		if strings.Contains(n, `\`) {
			t.Errorf("zip entry must use '/', got %q", n)
		}
	}
	want := []string{"proj/", "proj/empty/", "proj/sub/", "proj/sub/deep/", "proj/sub/deep/a.txt"}
	if strings.Join(names, ",") != strings.Join(want, ",") {
		t.Errorf("entries = %v, want %v", names, want)
	}
}

func TestCompressItems_IntoSourceDirRejected(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "proj")
	os.MkdirAll(src, 0755)
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("a"), 0644)
	if err := newTestFM().CompressItems([]string{src}, filepath.Join(src, "proj.zip")); err == nil {
		t.Error("zip inside the folder being compressed should be rejected")
	}
	if _, err := os.Stat(filepath.Join(src, "proj.zip")); !os.IsNotExist(err) {
		t.Error("no zip should be created")
	}
}

func TestCompressItems_MissingSourceLeavesNoPartialZip(t *testing.T) {
	base := t.TempDir()
	ok := filepath.Join(base, "ok.txt")
	os.WriteFile(ok, []byte("x"), 0644)
	dest := filepath.Join(base, "out.zip")
	if err := newTestFM().CompressItems([]string{ok, filepath.Join(base, "missing.txt")}, dest); err == nil {
		t.Error("missing source should be an error")
	}
	entries, _ := os.ReadDir(base)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".zip") || strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("partial archive left: %s", e.Name())
		}
	}
}

func TestExtractArchive_CorruptEntryIsError(t *testing.T) {
	base := t.TempDir()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	fw, _ := w.CreateHeader(&zip.FileHeader{Name: "a.txt", Method: zip.Store})
	fw.Write([]byte("hello world content"))
	w.Close()
	data := buf.Bytes()
	i := bytes.Index(data, []byte("hello world"))
	data[i] = 'X' // CRC 불일치
	zp := filepath.Join(base, "bad.zip")
	os.WriteFile(zp, data, 0644)

	if err := newTestFM().ExtractArchive(zp, base); err == nil {
		t.Error("checksum error should be reported")
	}
}

func TestExtractArchive_ZipSlipReported(t *testing.T) {
	base := t.TempDir()
	zp := filepath.Join(base, "m.zip")
	zf, _ := os.Create(zp)
	w := zip.NewWriter(zf)
	fw, _ := w.Create("../escape.txt")
	fw.Write([]byte("x"))
	w.Close()
	zf.Close()
	if err := newTestFM().ExtractArchive(zp, base); err == nil {
		t.Error("unsafe entries should be reported as an error")
	}
}

func TestCompressExtract_RoundTrip(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "proj")
	os.MkdirAll(filepath.Join(src, "sub"), 0755)
	os.WriteFile(filepath.Join(src, "sub", "a.txt"), []byte("hello"), 0644)
	dest := filepath.Join(base, "proj.zip")
	if err := newTestFM().CompressItems([]string{src}, dest); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(base, "out")
	os.MkdirAll(out, 0755)
	if err := newTestFM().ExtractArchive(dest, out); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(out, "proj", "proj", "sub", "a.txt")); string(data) != "hello" {
		t.Errorf("round trip content = %q", data)
	}
}
