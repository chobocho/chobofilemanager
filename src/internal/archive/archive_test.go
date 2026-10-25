package archive

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/ulikunitz/xz"
)

// Todo #133-5: 압축 파일을 폴더처럼 — ZIP · TAR(.gz .bz2 .xz) · 7Z · RAR 읽기

type file struct{ name, body string }

var sample = []file{
	{"top.txt", "top"},
	{"docs/a.md", "# a"},
	{"docs/img/p.png", "PNG"},
	{"empty/", ""},
}

func makeZip(t *testing.T, dir string, files []file) string {
	t.Helper()
	p := filepath.Join(dir, "s.zip")
	f, _ := os.Create(p)
	w := zip.NewWriter(f)
	for _, x := range files {
		h := &zip.FileHeader{Name: x.name, Method: zip.Deflate}
		h.Modified = time.Date(2026, 3, 7, 9, 5, 2, 0, time.UTC)
		fw, err := w.CreateHeader(h)
		if err != nil {
			t.Fatal(err)
		}
		fw.Write([]byte(x.body))
	}
	w.Close()
	f.Close()
	return p
}

func makeTar(t *testing.T, p string, files []file, wrap func(io.Writer) io.WriteCloser) string {
	t.Helper()
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	for _, x := range files {
		h := &tar.Header{Name: x.name, Mode: 0644, Size: int64(len(x.body)), ModTime: time.Date(2026, 3, 7, 0, 0, 0, 0, time.UTC)}
		if strings.HasSuffix(x.name, "/") {
			h.Typeflag = tar.TypeDir
			h.Size = 0
		}
		tw.WriteHeader(h)
		tw.Write([]byte(x.body))
	}
	tw.Close()
	f, _ := os.Create(p)
	defer f.Close()
	if wrap == nil {
		f.Write(buf.Bytes())
	} else {
		w := wrap(f)
		w.Write(buf.Bytes())
		w.Close()
	}
	return p
}

func names(es []Entry) string {
	var ns []string
	for _, e := range es {
		n := e.Name
		if e.IsDir {
			n += "/"
		}
		ns = append(ns, n)
	}
	sort.Strings(ns)
	return strings.Join(ns, ",")
}

func readEntry(t *testing.T, path, name string) string {
	t.Helper()
	b, err := ReadFile(path, name, 1<<20)
	if err != nil {
		t.Fatalf("ReadFile(%s): %v", name, err)
	}
	return string(b)
}

func TestKind(t *testing.T) {
	for name, want := range map[string]string{
		"a.zip": "zip", "A.JAR": "zip", "a.tar": "tar", "a.tar.gz": "tgz", "a.TGZ": "tgz",
		"a.tar.bz2": "tbz2", "a.tbz2": "tbz2", "a.tar.xz": "txz", "a.txz": "txz", "a.7z": "7z", "a.rar": "rar",
		"a.gz": "", "a.txt": "", "zip": "",
	} {
		if got := Kind(name); got != want {
			t.Errorf("Kind(%s) = %q, want %q", name, got, want)
		}
	}
	if BaseName("x.tar.gz") != "x" || BaseName("x.zip") != "x" || BaseName("x.TBZ2") != "x" {
		t.Error("BaseName strips the archive suffix")
	}
}

func TestZip_EntriesAndRead(t *testing.T) {
	p := makeZip(t, t.TempDir(), sample)
	es, err := Entries(p)
	if err != nil {
		t.Fatal(err)
	}
	// 폴더 엔트리가 없는 docs, docs/img도 만들어 줌
	if got := names(es); got != "docs/,docs/a.md,docs/img/,docs/img/p.png,empty/,top.txt" {
		t.Fatalf("entries = %s", got)
	}
	if got := names(List(es, "")); got != "docs/,empty/,top.txt" {
		t.Fatalf("root = %s", got)
	}
	if got := names(List(es, "docs")); got != "docs/a.md,docs/img/" {
		t.Fatalf("docs = %s", got)
	}
	if readEntry(t, p, "docs/img/p.png") != "PNG" {
		t.Fatal("content")
	}
	if e, ok := Find(es, "top.txt"); !ok || e.Size != 3 || e.Modified.Year() != 2026 {
		t.Fatalf("Find top.txt = %+v %v", e, ok)
	}
}

func TestZip_UnsafeNamesStayInside(t *testing.T) {
	p := makeZip(t, t.TempDir(), []file{{"../../evil.txt", "x"}, {"/abs.txt", "y"}, {`win\path.txt`, "z"}})
	es, _ := Entries(p)
	if got := names(es); got != "abs.txt,evil.txt,win/,win/path.txt" {
		t.Fatalf("entries = %s", got)
	}
	dest := t.TempDir()
	if err := Extract(p, nil, dest, "overwrite"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dest, "evil.txt")); err != nil {
		t.Fatal("evil.txt should land inside dest")
	}
}

func TestTarFamily(t *testing.T) {
	dir := t.TempDir()
	cases := map[string]func(io.Writer) io.WriteCloser{
		"s.tar":    nil,
		"s.tar.gz": func(w io.Writer) io.WriteCloser { return gzip.NewWriter(w) },
		"s.tgz":    func(w io.Writer) io.WriteCloser { return gzip.NewWriter(w) },
		"s.tar.xz": func(w io.Writer) io.WriteCloser { x, _ := xz.NewWriter(w); return x },
	}
	for name, wrap := range cases {
		p := makeTar(t, filepath.Join(dir, name), sample, wrap)
		es, err := Entries(p)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if got := names(es); got != "docs/,docs/a.md,docs/img/,docs/img/p.png,empty/,top.txt" {
			t.Fatalf("%s entries = %s", name, got)
		}
		if readEntry(t, p, "docs/a.md") != "# a" {
			t.Fatalf("%s content", name)
		}
	}
}

func TestSevenZip(t *testing.T) {
	p := filepath.Join("testdata", "t0.7z")
	es, err := Entries(p)
	if err != nil {
		t.Fatal(err)
	}
	if got := names(es); got != "bar,foo" {
		t.Fatalf("entries = %s", got)
	}
	if readEntry(t, p, "foo") != "foo\n" {
		t.Fatal("content")
	}
}

func TestRar_NotARarIsAnError(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bad.rar")
	os.WriteFile(p, []byte("not a rar file at all"), 0644)
	if _, err := Entries(p); err == nil {
		t.Fatal("want error")
	}
}

func TestReadFile_LimitsAndMissing(t *testing.T) {
	p := makeZip(t, t.TempDir(), sample)
	if _, err := ReadFile(p, "top.txt", 2); err == nil {
		t.Fatal("want size limit error")
	}
	if _, err := ReadFile(p, "nope.txt", 100); err == nil {
		t.Fatal("want not found")
	}
	if _, err := ReadFile(p, "docs", 100); err == nil {
		t.Fatal("folder is not a file")
	}
}

func TestSplit(t *testing.T) {
	dir := t.TempDir()
	p := makeZip(t, dir, sample)
	cases := []struct {
		in, arc, inner string
		ok             bool
	}{
		{p, p, "", true},
		{filepath.Join(p, "docs"), p, "docs", true},
		{filepath.Join(p, "docs", "img", "p.png"), p, "docs/img/p.png", true},
		{dir, "", "", false},
		{filepath.Join(dir, "nope", "x"), "", "", false},
	}
	for _, c := range cases {
		arc, inner, ok := Split(c.in)
		if arc != c.arc || inner != c.inner || ok != c.ok {
			t.Errorf("Split(%s) = %q %q %v, want %q %q %v", c.in, arc, inner, ok, c.arc, c.inner, c.ok)
		}
	}
	txt := filepath.Join(dir, "plain.txt")
	os.WriteFile(txt, []byte("x"), 0644)
	if _, _, ok := Split(filepath.Join(txt, "x")); ok {
		t.Error("a non-archive file is not a folder")
	}
}

func TestExtract_SelectedItemsAndModes(t *testing.T) {
	p := makeZip(t, t.TempDir(), sample)
	dest := t.TempDir()
	if err := Extract(p, []string{"docs", "top.txt"}, dest, "overwrite"); err != nil {
		t.Fatal(err)
	}
	for _, rel := range []string{"top.txt", "docs/a.md", "docs/img/p.png"} {
		if _, err := os.Stat(filepath.Join(dest, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("missing %s", rel)
		}
	}
	if _, err := os.Stat(filepath.Join(dest, "empty")); err == nil {
		t.Fatal("empty/ was not selected")
	}
	// 같은 이름: skip은 그대로, rename은 "top (1).txt"
	os.WriteFile(filepath.Join(dest, "top.txt"), []byte("mine"), 0644)
	Extract(p, []string{"top.txt"}, dest, "skip")
	if b, _ := os.ReadFile(filepath.Join(dest, "top.txt")); string(b) != "mine" {
		t.Fatal("skip must keep the existing file")
	}
	Extract(p, []string{"top.txt"}, dest, "rename")
	if b, _ := os.ReadFile(filepath.Join(dest, "top (1).txt")); string(b) != "top" {
		t.Fatal("rename must write top (1).txt")
	}
	Extract(p, []string{"top.txt"}, dest, "overwrite")
	if b, _ := os.ReadFile(filepath.Join(dest, "top.txt")); string(b) != "top" {
		t.Fatal("overwrite")
	}
	// 수정 시각 유지
	if fi, _ := os.Stat(filepath.Join(dest, "docs", "a.md")); fi.ModTime().Year() != 2026 {
		t.Fatalf("mtime = %v", fi.ModTime())
	}
}

func TestDirSize(t *testing.T) {
	p := makeZip(t, t.TempDir(), sample)
	es, _ := Entries(p)
	size, files, dirs := DirSize(es, "docs")
	if size != 6 || files != 2 || dirs != 1 {
		t.Fatalf("DirSize(docs) = %d %d %d", size, files, dirs)
	}
	size, files, dirs = DirSize(es, "")
	if size != 9 || files != 3 || dirs != 3 {
		t.Fatalf("DirSize(root) = %d %d %d", size, files, dirs)
	}
}
