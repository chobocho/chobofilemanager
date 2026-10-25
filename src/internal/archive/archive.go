// Package archive reads archives as folders (Todo #133-5): ZIP (and JAR),
// TAR, TAR.GZ/TGZ, TAR.BZ2/TBZ2, TAR.XZ/TXZ, 7Z and RAR — read-only.
//
// Entry names use '/' and are cleaned so they can never leave the archive
// root ("../x" → "x"). Folders that only appear as part of a path are
// added, so every file has its parent folders.
//
// A path inside an archive is the archive's path followed by the inner path
// ("C:\x\a.zip\docs\a.md"); Split finds the archive in such a path.
package archive

import (
	"archive/tar"
	"archive/zip"
	"compress/bzip2"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/bodgit/sevenzip"
	"github.com/nwaples/rardecode/v2"
	"github.com/ulikunitz/xz"
)

type Entry struct {
	Name     string // inner path with '/', no leading '/'
	Size     int64
	IsDir    bool
	Modified time.Time
}

var suffixes = []struct{ ext, kind string }{
	{".tar.gz", "tgz"}, {".tgz", "tgz"},
	{".tar.bz2", "tbz2"}, {".tbz2", "tbz2"},
	{".tar.xz", "txz"}, {".txz", "txz"},
	{".tar", "tar"}, {".zip", "zip"}, {".jar", "zip"}, {".7z", "7z"}, {".rar", "rar"},
}

// Kind: "zip", "tar", "tgz", "tbz2", "txz", "7z", "rar", or "" when the name is not an archive.
func Kind(name string) string {
	lower := strings.ToLower(name)
	for _, s := range suffixes {
		if strings.HasSuffix(lower, s.ext) && len(lower) > len(s.ext) {
			return s.kind
		}
	}
	return ""
}

func IsArchive(name string) bool { return Kind(name) != "" }

// BaseName: the name without its archive suffix ("x.tar.gz" → "x").
func BaseName(name string) string {
	lower := strings.ToLower(name)
	for _, s := range suffixes {
		if strings.HasSuffix(lower, s.ext) && len(lower) > len(s.ext) {
			return name[:len(name)-len(s.ext)]
		}
	}
	return strings.TrimSuffix(name, filepath.Ext(name))
}

// Split: for a path inside an archive, the archive file and the inner path ('/').
// The archive file itself gives inner "". ok is false for ordinary paths.
func Split(p string) (archivePath, inner string, ok bool) {
	cur := filepath.Clean(p)
	var rest []string
	for {
		fi, err := os.Stat(cur)
		if err == nil {
			if fi.IsDir() || !IsArchive(cur) {
				return "", "", false
			}
			for i, j := 0, len(rest)-1; i < j; i, j = i+1, j-1 {
				rest[i], rest[j] = rest[j], rest[i]
			}
			return cur, strings.Join(rest, "/"), true
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return "", "", false
		}
		rest = append(rest, filepath.Base(cur))
		cur = parent
	}
}

// clean: the safe inner name ("" for the root).
func clean(name string) string {
	n := path.Clean("/" + strings.ReplaceAll(name, `\`, "/"))
	return strings.TrimPrefix(n, "/")
}

// ─── Readers ─────────────────────────────────────────────────────────────────

// walker reads an archive in order: fn gets each file entry wanted, with its content.
type walker interface {
	entries() ([]Entry, error)
	walk(want func(string) bool, fn func(Entry, io.Reader) error) error
	Close() error
}

func open(p string) (walker, error) {
	switch Kind(p) {
	case "zip":
		r, err := zip.OpenReader(p)
		if err != nil {
			return nil, err
		}
		return &zipWalker{r}, nil
	case "7z":
		r, err := sevenzip.OpenReader(p)
		if err != nil {
			return nil, err
		}
		return &sevenWalker{r}, nil
	case "tar", "tgz", "tbz2", "txz":
		return &tarWalker{path: p, kind: Kind(p)}, nil
	case "rar":
		return &rarWalker{path: p}, nil
	}
	return nil, fmt.Errorf("압축 파일 형식이 아닙니다: %s", filepath.Base(p))
}

type zipWalker struct{ r *zip.ReadCloser }

func (z *zipWalker) Close() error { return z.r.Close() }
func (z *zipWalker) entries() ([]Entry, error) {
	var es []Entry
	for _, f := range z.r.File {
		es = append(es, Entry{Name: f.Name, Size: int64(f.UncompressedSize64), IsDir: f.FileInfo().IsDir(), Modified: f.Modified})
	}
	return es, nil
}
func (z *zipWalker) walk(want func(string) bool, fn func(Entry, io.Reader) error) error {
	for _, f := range z.r.File {
		name := clean(f.Name)
		if f.FileInfo().IsDir() || name == "" || !want(name) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		err = fn(Entry{Name: name, Size: int64(f.UncompressedSize64), Modified: f.Modified}, rc)
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

type sevenWalker struct{ r *sevenzip.ReadCloser }

func (s *sevenWalker) Close() error { return s.r.Close() }
func (s *sevenWalker) entries() ([]Entry, error) {
	var es []Entry
	for _, f := range s.r.File {
		es = append(es, Entry{Name: f.Name, Size: int64(f.UncompressedSize), IsDir: f.FileInfo().IsDir(), Modified: f.Modified})
	}
	return es, nil
}
func (s *sevenWalker) walk(want func(string) bool, fn func(Entry, io.Reader) error) error {
	for _, f := range s.r.File {
		name := clean(f.Name)
		if f.FileInfo().IsDir() || name == "" || !want(name) {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		err = fn(Entry{Name: name, Size: int64(f.UncompressedSize), Modified: f.Modified}, rc)
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// tar: a stream — every walk reads from the start
type tarWalker struct {
	path, kind string
}

func (t *tarWalker) Close() error { return nil }
func (t *tarWalker) stream(fn func(h *tar.Header, r io.Reader) error) error {
	f, err := os.Open(t.path)
	if err != nil {
		return err
	}
	defer f.Close()
	var r io.Reader = f
	switch t.kind {
	case "tgz":
		gz, err := gzip.NewReader(f)
		if err != nil {
			return err
		}
		defer gz.Close()
		r = gz
	case "tbz2":
		r = bzip2.NewReader(f)
	case "txz":
		x, err := xz.NewReader(f)
		if err != nil {
			return err
		}
		r = x
	}
	tr := tar.NewReader(r)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if err := fn(h, tr); err != nil {
			return err
		}
	}
}
func (t *tarWalker) entries() ([]Entry, error) {
	var es []Entry
	err := t.stream(func(h *tar.Header, _ io.Reader) error {
		switch {
		case h.Typeflag == tar.TypeDir:
			es = append(es, Entry{Name: h.Name, IsDir: true, Modified: h.ModTime})
		case h.FileInfo().Mode().IsRegular():
			es = append(es, Entry{Name: h.Name, Size: h.Size, Modified: h.ModTime})
		}
		return nil
	})
	return es, err
}
func (t *tarWalker) walk(want func(string) bool, fn func(Entry, io.Reader) error) error {
	return t.stream(func(h *tar.Header, r io.Reader) error {
		name := clean(h.Name)
		if !h.FileInfo().Mode().IsRegular() || name == "" || !want(name) {
			return nil
		}
		return fn(Entry{Name: name, Size: h.Size, Modified: h.ModTime}, r)
	})
}

// rar: also a stream
type rarWalker struct{ path string }

func (w *rarWalker) Close() error { return nil }
func (w *rarWalker) stream(fn func(h *rardecode.FileHeader, r io.Reader) error) error {
	rc, err := rardecode.OpenReader(w.path)
	if err != nil {
		return err
	}
	defer rc.Close()
	for {
		h, err := rc.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if err := fn(h, rc); err != nil {
			return err
		}
	}
}
func (w *rarWalker) entries() ([]Entry, error) {
	var es []Entry
	err := w.stream(func(h *rardecode.FileHeader, _ io.Reader) error {
		es = append(es, Entry{Name: h.Name, Size: h.UnPackedSize, IsDir: h.IsDir, Modified: h.ModificationTime})
		return nil
	})
	return es, err
}
func (w *rarWalker) walk(want func(string) bool, fn func(Entry, io.Reader) error) error {
	return w.stream(func(h *rardecode.FileHeader, r io.Reader) error {
		name := clean(h.Name)
		if h.IsDir || name == "" || !want(name) {
			return nil
		}
		return fn(Entry{Name: name, Size: h.UnPackedSize, Modified: h.ModificationTime}, r)
	})
}

// ─── Entries (cached) ────────────────────────────────────────────────────────

type cacheKey struct {
	path string
	size int64
	mod  time.Time
}

var (
	cacheMu sync.Mutex
	cache   = map[cacheKey][]Entry{}
	order   []cacheKey
)

const cacheMax = 8

// Entries: every entry with cleaned names and the implied folders, sorted by name.
// Kept for the last few archives (same size and time) so moving between folders is quick.
func Entries(p string) ([]Entry, error) {
	fi, err := os.Stat(p)
	if err != nil {
		return nil, err
	}
	key := cacheKey{p, fi.Size(), fi.ModTime()}
	cacheMu.Lock()
	if es, ok := cache[key]; ok {
		cacheMu.Unlock()
		return es, nil
	}
	cacheMu.Unlock()

	w, err := open(p)
	if err != nil {
		return nil, err
	}
	defer w.Close()
	raw, err := w.entries()
	if err != nil {
		return nil, fmt.Errorf("%s: %w", filepath.Base(p), err)
	}
	es := normalize(raw)

	cacheMu.Lock()
	if len(order) >= cacheMax {
		delete(cache, order[0])
		order = order[1:]
	}
	cache[key] = es
	order = append(order, key)
	cacheMu.Unlock()
	return es, nil
}

func normalize(raw []Entry) []Entry {
	byName := map[string]Entry{}
	for _, e := range raw {
		isDir := e.IsDir || strings.HasSuffix(strings.ReplaceAll(e.Name, `\`, "/"), "/")
		name := clean(e.Name)
		if name == "" {
			continue
		}
		e.Name, e.IsDir = name, isDir
		if isDir {
			e.Size = 0
			if old, ok := byName[name]; ok && !old.IsDir {
				continue // a file and a folder with the same name: keep the file
			}
		}
		byName[name] = e
		for d := path.Dir(name); d != "."; d = path.Dir(d) {
			if _, ok := byName[d]; !ok {
				byName[d] = Entry{Name: d, IsDir: true, Modified: e.Modified}
			}
		}
	}
	es := make([]Entry, 0, len(byName))
	for _, e := range byName {
		es = append(es, e)
	}
	sort.Slice(es, func(i, j int) bool { return es[i].Name < es[j].Name })
	return es
}

func parentOf(name string) string {
	d := path.Dir(name)
	if d == "." {
		return ""
	}
	return d
}

// List: the entries directly inside folder dir ("" = root).
func List(es []Entry, dir string) []Entry {
	dir = clean(dir)
	var out []Entry
	for _, e := range es {
		if parentOf(e.Name) == dir {
			out = append(out, e)
		}
	}
	return out
}

func Find(es []Entry, name string) (Entry, bool) {
	name = clean(name)
	for _, e := range es {
		if e.Name == name {
			return e, true
		}
	}
	return Entry{}, false
}

// IsFolder: dir is the root or a folder in the archive.
func IsFolder(es []Entry, dir string) bool {
	if clean(dir) == "" {
		return true
	}
	e, ok := Find(es, dir)
	return ok && e.IsDir
}

// DirSize: total size, file count and folder count under dir ("" = everything).
func DirSize(es []Entry, dir string) (size int64, files, dirs int) {
	dir = clean(dir)
	for _, e := range es {
		if dir != "" && !strings.HasPrefix(e.Name, dir+"/") {
			continue
		}
		if e.IsDir {
			dirs++
		} else {
			size += e.Size
			files++
		}
	}
	return
}

// ─── Reading and extracting ──────────────────────────────────────────────────

// ReadFile: one file's content, refusing files larger than limit.
func ReadFile(p, name string, limit int64) ([]byte, error) {
	name = clean(name)
	es, err := Entries(p)
	if err != nil {
		return nil, err
	}
	e, ok := Find(es, name)
	if !ok {
		return nil, fmt.Errorf("압축 파일 안에 없습니다: %s", name)
	}
	if e.IsDir {
		return nil, fmt.Errorf("폴더입니다: %s", name)
	}
	if e.Size > limit {
		return nil, fmt.Errorf("파일이 너무 큽니다 (%d MB 초과): %s", limit/1024/1024, path.Base(name))
	}
	w, err := open(p)
	if err != nil {
		return nil, err
	}
	defer w.Close()
	var data []byte
	found := false
	err = w.walk(func(n string) bool { return n == name }, func(_ Entry, r io.Reader) error {
		found = true
		data, err = io.ReadAll(io.LimitReader(r, limit+1))
		if err != nil {
			return err
		}
		if int64(len(data)) > limit {
			return fmt.Errorf("파일이 너무 큽니다: %s", path.Base(name))
		}
		return errStop
	})
	if err != nil && !errors.Is(err, errStop) {
		return nil, err
	}
	if !found {
		return nil, fmt.Errorf("압축 파일 안에 없습니다: %s", name)
	}
	return data, nil
}

var errStop = errors.New("stop")

// Extract: copies items (files or folders, inner paths; nil = everything) into destDir.
// Each item lands under its own name; mode for an item whose name already exists in destDir:
// "overwrite" (default; folders merge), "skip", or "rename" ("x (1).txt").
func Extract(p string, items []string, destDir string, mode string) error {
	es, err := Entries(p)
	if err != nil {
		return err
	}
	// 고른 항목 → 대상 폴더 안의 이름 (rename이면 겹치지 않는 이름)
	type target struct{ inner, dest string }
	var targets []target
	if items == nil {
		for _, e := range List(es, "") {
			targets = append(targets, target{e.Name, filepath.Join(destDir, path.Base(e.Name))})
		}
	} else {
		for _, it := range items {
			it = clean(it)
			if _, ok := Find(es, it); !ok {
				return fmt.Errorf("압축 파일 안에 없습니다: %s", it)
			}
			targets = append(targets, target{it, filepath.Join(destDir, path.Base(it))})
		}
	}
	var keep []target
	for _, t := range targets {
		if _, err := os.Lstat(t.dest); err == nil {
			switch mode {
			case "skip":
				continue
			case "rename":
				u, err := uniqueName(destDir, filepath.Base(t.dest))
				if err != nil {
					return err
				}
				t.dest = u
			}
		}
		keep = append(keep, t)
	}
	// 폴더 (빈 폴더 포함) 먼저
	destOf := func(name string) (string, bool) {
		for _, t := range keep {
			if name == t.inner {
				return t.dest, true
			}
			if strings.HasPrefix(name, t.inner+"/") {
				return filepath.Join(t.dest, filepath.FromSlash(strings.TrimPrefix(name, t.inner+"/"))), true
			}
		}
		return "", false
	}
	for _, e := range es {
		if d, ok := destOf(e.Name); ok && e.IsDir {
			if err := os.MkdirAll(d, 0755); err != nil {
				return err
			}
		}
	}
	w, err := open(p)
	if err != nil {
		return err
	}
	defer w.Close()
	var mtimes []struct {
		path string
		t    time.Time
	}
	err = w.walk(func(n string) bool { _, ok := destOf(n); return ok }, func(e Entry, r io.Reader) error {
		d, _ := destOf(e.Name)
		if err := os.MkdirAll(filepath.Dir(d), 0755); err != nil {
			return err
		}
		out, err := os.Create(d)
		if err != nil {
			return err
		}
		if _, err := io.Copy(out, r); err != nil {
			out.Close()
			os.Remove(d)
			return fmt.Errorf("%s 풀기 실패: %w", e.Name, err)
		}
		if err := out.Close(); err != nil {
			return err
		}
		if !e.Modified.IsZero() {
			mtimes = append(mtimes, struct {
				path string
				t    time.Time
			}{d, e.Modified})
		}
		return nil
	})
	for _, m := range mtimes {
		os.Chtimes(m.path, m.t, m.t)
	}
	return err
}

// uniqueName: "x (1).txt" style name that does not exist in dir.
func uniqueName(dir, name string) (string, error) {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	if base == "" {
		base, ext = name, ""
	}
	for n := 1; n <= 10000; n++ {
		c := filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, n, ext))
		if _, err := os.Lstat(c); os.IsNotExist(err) {
			return c, nil
		}
	}
	return "", fmt.Errorf("사용 가능한 이름을 찾지 못했습니다: %s", name)
}
