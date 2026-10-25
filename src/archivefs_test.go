package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// Todo #133-5: 압축 파일을 폴더처럼 — 패널 목록, F5 꺼내기, F3 보기, 나머지 작업은 읽기 전용

func makeSampleZip(t *testing.T, dir string) string {
	t.Helper()
	p := filepath.Join(dir, "s.zip")
	f, _ := os.Create(p)
	w := zip.NewWriter(f)
	for name, body := range map[string]string{"top.txt": "top", "docs/a.md": "# a", "docs/img/p.png": "PNG"} {
		fw, _ := w.Create(name)
		fw.Write([]byte(body))
	}
	w.Close()
	f.Close()
	return p
}

func listedNames(l *DirectoryListing) string {
	var ns []string
	for _, f := range l.Files {
		n := f.Name
		if f.IsDir {
			n += "/"
		}
		ns = append(ns, n)
	}
	sort.Strings(ns)
	return strings.Join(ns, ",")
}

func TestArchive_ListDirectory(t *testing.T) {
	z := makeSampleZip(t, t.TempDir())
	fm := newTestFM()
	root, err := fm.ListDirectory(z)
	if err != nil {
		t.Fatal(err)
	}
	if root.Path != z || !root.ReadOnly || listedNames(root) != "docs/,top.txt" {
		t.Fatalf("root = %s %v %s", root.Path, root.ReadOnly, listedNames(root))
	}
	for _, f := range root.Files {
		if f.Name == "top.txt" && (f.Path != filepath.Join(z, "top.txt") || f.Size != 3 || f.Extension != ".txt") {
			t.Fatalf("top.txt = %+v", f)
		}
	}
	sub, err := fm.ListDirectory(filepath.Join(z, "docs"))
	if err != nil || listedNames(sub) != "a.md,img/" || sub.Path != filepath.Join(z, "docs") {
		t.Fatalf("docs = %v %v", sub, err)
	}
	if _, err := fm.ListDirectory(filepath.Join(z, "nope")); err == nil {
		t.Fatal("missing inner folder: want error")
	}
	if _, err := fm.ListDirectory(filepath.Join(z, "top.txt")); err == nil {
		t.Fatal("a file inside is not a folder")
	}
	local, _ := fm.ListDirectory(filepath.Dir(z))
	if local.ReadOnly {
		t.Fatal("local folder is not read-only")
	}
}

func TestArchive_ReadAndSize(t *testing.T) {
	z := makeSampleZip(t, t.TempDir())
	fm := newTestFM()
	if s, err := fm.ReadTextFile(filepath.Join(z, "docs", "a.md")); err != nil || s != "# a" {
		t.Fatalf("ReadTextFile = %q %v", s, err)
	}
	if s, err := fm.ReadImageFile(filepath.Join(z, "docs", "img", "p.png")); err != nil || !strings.HasPrefix(s, "data:image/png;base64,") {
		t.Fatalf("ReadImageFile = %q %v", s, err)
	}
	if r, err := fm.DirSize(filepath.Join(z, "docs")); err != nil || r.Size != 6 || r.Files != 2 || r.Dirs != 1 {
		t.Fatalf("DirSize = %+v %v", r, err)
	}
}

func TestArchive_CopyOut(t *testing.T) {
	z := makeSampleZip(t, t.TempDir())
	dest := t.TempDir()
	fm := newTestFM()
	if err := fm.CopyItems([]string{filepath.Join(z, "docs"), filepath.Join(z, "top.txt")}, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "docs", "img", "p.png")); string(b) != "PNG" {
		t.Fatal("docs/img/p.png not copied out")
	}
	cs := fm.CheckCopyConflicts([]string{filepath.Join(z, "top.txt")}, dest)
	if len(cs) != 1 {
		t.Fatalf("conflicts = %+v", cs)
	}
	os.WriteFile(filepath.Join(dest, "top.txt"), []byte("mine"), 0644)
	if err := fm.CopyItemsSkipConflicts([]string{filepath.Join(z, "top.txt")}, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "top.txt")); string(b) != "mine" {
		t.Fatal("skip must keep the file")
	}
	if err := fm.CopyItemsRename([]string{filepath.Join(z, "top.txt")}, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "top (1).txt")); string(b) != "top" {
		t.Fatal("rename")
	}
}

func TestArchive_ReadOnly(t *testing.T) {
	dir := t.TempDir()
	z := makeSampleZip(t, dir)
	before, _ := os.ReadFile(z)
	local := filepath.Join(dir, "l.txt")
	os.WriteFile(local, []byte("l"), 0644)
	in := filepath.Join(z, "top.txt")
	fm := newTestFM()
	checks := map[string]error{
		"copy into":     fm.CopyItems([]string{local}, filepath.Join(z, "docs")),
		"move out":      fm.MoveItems([]string{in}, dir),
		"move into":     fm.MoveItems([]string{local}, z),
		"delete":        fm.DeleteItems([]string{in}),
		"trash":         fm.TrashItems([]string{in}),
		"rename":        fm.RenameItem(in, filepath.Join(z, "x.txt")),
		"mkdir":         fm.CreateDirectory(filepath.Join(z, "new")),
		"new file":      fm.CreateFile(filepath.Join(z, "new.txt")),
		"write":         fm.WriteTextFileWithEncoding(in, "x", "auto"),
		"rename batch":  fm.RenameBatch([]RenamePair{{Old: in, New: filepath.Join(z, "y.txt")}}),
		"compress into": fm.CompressItems([]string{local}, filepath.Join(z, "a.zip")),
	}
	for name, err := range checks {
		if err == nil || !strings.Contains(err.Error(), "읽기 전용") {
			t.Errorf("%s: want read-only error, got %v", name, err)
		}
	}
	if after, _ := os.ReadFile(z); string(after) != string(before) {
		t.Fatal("the archive must not change")
	}
	if _, err := os.Stat(local); err != nil {
		t.Fatal("the local file must stay")
	}
}

func TestArchive_ExtractTarGz(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "pkg.tar.gz")
	f, _ := os.Create(p)
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	tw.WriteHeader(&tar.Header{Name: "pkg/readme.txt", Mode: 0644, Size: 2})
	tw.Write([]byte("hi"))
	tw.Close()
	gz.Close()
	f.Close()
	if err := newTestFM().ExtractArchive(p, dir); err != nil {
		t.Fatal(err)
	}
	// 폴더 이름은 .tar.gz를 모두 뺀 "pkg"
	if b, _ := os.ReadFile(filepath.Join(dir, "pkg", "pkg", "readme.txt")); string(b) != "hi" {
		t.Fatal("tar.gz extract")
	}
}

func TestArchive_SearchAndOpenCopy(t *testing.T) {
	z := makeSampleZip(t, t.TempDir())
	fm := newTestFM()
	rs, err := fm.SearchFiles(z, "a", true)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, r := range rs {
		got = append(got, r.Name)
	}
	sort.Strings(got)
	if strings.Join(got, ",") != "a.md" {
		t.Fatalf("recursive search = %v", got)
	}
	if rs, _ := fm.SearchFiles(z, "a.md", false); len(rs) != 0 {
		t.Fatal("non-recursive search stays in the folder")
	}
	if rs, _ := fm.SearchFiles(filepath.Join(z, "docs"), "png", true); len(rs) != 1 || rs[0].Path != filepath.Join(z, "docs", "img", "p.png") {
		t.Fatalf("search from inner folder = %+v", rs)
	}
	// 기본 앱으로 열기: 임시 폴더로 풀린 파일
	p, err := materializeArchiveFile(filepath.Join(z, "docs", "a.md"))
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(filepath.Dir(p))
	if b, _ := os.ReadFile(p); string(b) != "# a" || filepath.Base(p) != "a.md" {
		t.Fatalf("materialized %s = %q", p, b)
	}
}
