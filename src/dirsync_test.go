package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Todo #133-6: 폴더 비교 · 동기화 (Total Commander "Synchronize dirs")

var (
	tOld = time.Date(2026, 1, 1, 10, 0, 0, 0, time.Local)
	tNew = time.Date(2026, 2, 1, 10, 0, 0, 0, time.Local)
)

func put(t *testing.T, root, rel, body string, mod time.Time) {
	t.Helper()
	p := filepath.Join(root, filepath.FromSlash(rel))
	os.MkdirAll(filepath.Dir(p), 0755)
	if err := os.WriteFile(p, []byte(body), 0644); err != nil {
		t.Fatal(err)
	}
	os.Chtimes(p, mod, mod)
}

func states(items []SyncItem) string {
	var s []string
	for _, it := range items {
		n := it.Rel
		if it.IsDir {
			n += "/"
		}
		s = append(s, n+"="+it.State)
	}
	return strings.Join(s, " ")
}

func syncFixture(t *testing.T) (string, string) {
	l, r := t.TempDir(), t.TempDir()
	put(t, l, "same.txt", "x", tOld)
	put(t, r, "same.txt", "x", tOld)
	put(t, l, "newer-left.txt", "new", tNew)
	put(t, r, "newer-left.txt", "old", tOld)
	put(t, l, "newer-right.txt", "old", tOld)
	put(t, r, "newer-right.txt", "new!", tNew)
	put(t, l, "only-left.txt", "L", tOld)
	put(t, r, "only-right.txt", "R", tOld)
	put(t, l, "samedate-diff.txt", "aaaa", tOld)
	put(t, r, "samedate-diff.txt", "bb", tOld)
	put(t, l, "sub/inner.txt", "1", tNew)
	put(t, r, "sub/inner.txt", "1", tOld)
	put(t, l, "leftdir/deep/a.txt", "a", tOld)
	return l, r
}

func TestCompareDirs_ByDateAndSize(t *testing.T) {
	l, r := syncFixture(t)
	items, err := newTestFM().CompareDirs(l, r, CompareOptions{Recursive: true})
	if err != nil {
		t.Fatal(err)
	}
	want := "leftdir/=left-only newer-left.txt=left-newer newer-right.txt=right-newer only-left.txt=left-only " +
		"only-right.txt=right-only same.txt=equal samedate-diff.txt=different sub/inner.txt=left-newer"
	if got := states(items); got != want {
		t.Fatalf("\ngot  %s\nwant %s", got, want)
	}
}

func TestCompareDirs_NotRecursiveSkipsSubfolders(t *testing.T) {
	l, r := syncFixture(t)
	items, _ := newTestFM().CompareDirs(l, r, CompareOptions{})
	got := states(items)
	if strings.Contains(got, "sub/inner") || !strings.Contains(got, "leftdir/=left-only") {
		t.Fatalf("got %s", got)
	}
}

func TestCompareDirs_ByContentAndIgnoreDate(t *testing.T) {
	l, r := t.TempDir(), t.TempDir()
	put(t, l, "a.txt", "same", tNew)
	put(t, r, "a.txt", "same", tOld) // 날짜만 다름
	put(t, l, "b.txt", "abcd", tOld)
	put(t, r, "b.txt", "abce", tOld) // 크기·날짜 같고 내용만 다름
	items, _ := newTestFM().CompareDirs(l, r, CompareOptions{ByContent: true})
	if got := states(items); got != "a.txt=equal b.txt=different" {
		t.Fatalf("by content: %s", got)
	}
	items, _ = newTestFM().CompareDirs(l, r, CompareOptions{IgnoreDate: true})
	if got := states(items); got != "a.txt=equal b.txt=equal" {
		t.Fatalf("ignore date, size only: %s", got)
	}
}

func TestCompareDirs_SideInfoAndErrors(t *testing.T) {
	l, r := syncFixture(t)
	items, _ := newTestFM().CompareDirs(l, r, CompareOptions{})
	for _, it := range items {
		if it.Rel == "newer-right.txt" && (it.Left == nil || it.Right == nil || it.Right.Size != 4 || !it.Right.Modified.Equal(tNew)) {
			t.Fatalf("side info = %+v %+v", it.Left, it.Right)
		}
		if it.Rel == "only-left.txt" && it.Right != nil {
			t.Fatal("only-left has no right side")
		}
	}
	if _, err := newTestFM().CompareDirs(l, filepath.Join(r, "nope"), CompareOptions{}); err == nil {
		t.Fatal("missing folder: want error")
	}
}

func TestSyncDirs_CopiesBothWaysAndKeepsTimes(t *testing.T) {
	l, r := syncFixture(t)
	fm := newTestFM()
	err := fm.SyncDirs(l, r, []SyncAction{
		{Rel: "newer-left.txt", To: "right"},
		{Rel: "newer-right.txt", To: "left"},
		{Rel: "only-left.txt", To: "right"},
		{Rel: "only-right.txt", To: "left"},
		{Rel: "leftdir", To: "right"},
		{Rel: "sub/inner.txt", To: "right"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(r, "newer-left.txt")); string(b) != "new" {
		t.Fatal("newer-left not copied right")
	}
	if b, _ := os.ReadFile(filepath.Join(l, "newer-right.txt")); string(b) != "new!" {
		t.Fatal("newer-right not copied left")
	}
	if b, _ := os.ReadFile(filepath.Join(r, "leftdir", "deep", "a.txt")); string(b) != "a" {
		t.Fatal("folder not copied")
	}
	// 다시 비교하면 같음 (수정 시각 유지) — 일부러 안 고른 samedate-diff만 남음
	items, _ := fm.CompareDirs(l, r, CompareOptions{Recursive: true})
	for _, it := range items {
		if it.State != "equal" && it.Rel != "samedate-diff.txt" {
			t.Fatalf("after sync %s = %s", it.Rel, it.State)
		}
	}
}

func TestSyncDirs_RejectsEscapes(t *testing.T) {
	l, r := t.TempDir(), t.TempDir()
	for _, a := range []SyncAction{{Rel: "../x", To: "right"}, {Rel: "a", To: "up"}, {Rel: "", To: "left"}} {
		if err := newTestFM().SyncDirs(l, r, []SyncAction{a}); err == nil {
			t.Fatalf("%+v: want error", a)
		}
	}
}

func TestCopyFile_KeepsModTime(t *testing.T) {
	d := t.TempDir()
	put(t, d, "a.txt", "a", tOld)
	os.Mkdir(filepath.Join(d, "out"), 0755)
	if err := newTestFM().CopyItems([]string{filepath.Join(d, "a.txt")}, filepath.Join(d, "out")); err != nil {
		t.Fatal(err)
	}
	fi, _ := os.Stat(filepath.Join(d, "out", "a.txt"))
	if !fi.ModTime().Equal(tOld) {
		t.Fatalf("mtime = %v, want %v", fi.ModTime(), tOld)
	}
}

// Todo #134-1: 덮어쓰기 동기화가 실패해도 대상의 옛 파일은 남음 (임시 파일에 복사한 뒤 바꿔 넣음)
func TestSyncDirs_FailedCopyKeepsOldTarget(t *testing.T) {
	l, r := t.TempDir(), t.TempDir()
	put(t, l, "doc.txt", "new", tNew)
	put(t, r, "doc.txt", "old", tOld)
	old := syncCopyHook
	syncCopyHook = func() error { return errors.New("disk full") }
	err := newTestFM().SyncDirs(l, r, []SyncAction{{Rel: "doc.txt", To: "right"}})
	syncCopyHook = old
	if err == nil {
		t.Fatal("want copy error")
	}
	if b, _ := os.ReadFile(filepath.Join(r, "doc.txt")); string(b) != "old" {
		t.Fatalf("old target must stay, got %q", b)
	}
	// 정상 덮어쓰기는 임시 파일을 남기지 않음
	if err := newTestFM().SyncDirs(l, r, []SyncAction{{Rel: "doc.txt", To: "right"}}); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(r, "doc.txt")); string(b) != "new" {
		t.Fatal("overwrite")
	}
	es, _ := os.ReadDir(r)
	if len(es) != 1 {
		t.Fatalf("leftover temp files: %v", es)
	}
}

// Todo #134-3: 이름 안의 ".."(v1..2.txt)은 허용, 경로 조각 ".."만 거부
func TestSyncDirs_DotsInNames(t *testing.T) {
	l, r := t.TempDir(), t.TempDir()
	put(t, l, "v1..2.txt", "x", tOld)
	if err := newTestFM().SyncDirs(l, r, []SyncAction{{Rel: "v1..2.txt", To: "right"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(r, "v1..2.txt")); err != nil {
		t.Fatal("copied")
	}
	for _, rel := range []string{"../x", "a/../../x", `..\x`} {
		if err := newTestFM().SyncDirs(l, r, []SyncAction{{Rel: rel, To: "right"}}); err == nil {
			t.Errorf("%s: want error", rel)
		}
	}
}
