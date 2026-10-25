package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Todo #133-4: 여러 이름 바꾸기 — 두 단계로 바꿔 묶음 안의 이름 맞바꾸기·이어 바꾸기를 허용, 실패하면 되돌림

func writeNamed(t *testing.T, dir string, names ...string) {
	t.Helper()
	for _, n := range names {
		if err := os.WriteFile(filepath.Join(dir, n), []byte(n), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

func contentOf(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}

func dirNames(t *testing.T, dir string) string {
	t.Helper()
	es, _ := os.ReadDir(dir)
	var ns []string
	for _, e := range es {
		ns = append(ns, e.Name())
	}
	return strings.Join(ns, ",")
}

func TestRenameBatch_Simple(t *testing.T) {
	d := t.TempDir()
	writeNamed(t, d, "a.txt", "b.txt")
	err := newTestFM().RenameBatch([]RenamePair{
		{Old: filepath.Join(d, "a.txt"), New: filepath.Join(d, "x.txt")},
		{Old: filepath.Join(d, "b.txt"), New: filepath.Join(d, "y.txt")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if contentOf(t, filepath.Join(d, "x.txt")) != "a.txt" || contentOf(t, filepath.Join(d, "y.txt")) != "b.txt" {
		t.Fatal("contents moved wrong")
	}
	if got := dirNames(t, d); got != "x.txt,y.txt" {
		t.Fatalf("dir = %s", got)
	}
}

func TestRenameBatch_ChainAndSwap(t *testing.T) {
	d := t.TempDir()
	writeNamed(t, d, "1.txt", "2.txt", "a", "b")
	err := newTestFM().RenameBatch([]RenamePair{
		{Old: filepath.Join(d, "1.txt"), New: filepath.Join(d, "2.txt")},
		{Old: filepath.Join(d, "2.txt"), New: filepath.Join(d, "3.txt")},
		{Old: filepath.Join(d, "a"), New: filepath.Join(d, "b")},
		{Old: filepath.Join(d, "b"), New: filepath.Join(d, "a")},
	})
	if err != nil {
		t.Fatal(err)
	}
	if contentOf(t, filepath.Join(d, "2.txt")) != "1.txt" || contentOf(t, filepath.Join(d, "3.txt")) != "2.txt" {
		t.Fatal("chain wrong")
	}
	if contentOf(t, filepath.Join(d, "a")) != "b" || contentOf(t, filepath.Join(d, "b")) != "a" {
		t.Fatal("swap wrong")
	}
	if got := dirNames(t, d); got != "2.txt,3.txt,a,b" {
		t.Fatalf("leftover temp files: %s", got)
	}
}

func TestRenameBatch_TargetExistsOutsideBatch(t *testing.T) {
	d := t.TempDir()
	writeNamed(t, d, "a.txt", "b.txt", "keep.txt")
	err := newTestFM().RenameBatch([]RenamePair{
		{Old: filepath.Join(d, "a.txt"), New: filepath.Join(d, "x.txt")},
		{Old: filepath.Join(d, "b.txt"), New: filepath.Join(d, "keep.txt")},
	})
	if err == nil {
		t.Fatal("want error: keep.txt exists")
	}
	if got := dirNames(t, d); got != "a.txt,b.txt,keep.txt" {
		t.Fatalf("must change nothing, dir = %s", got)
	}
}

func TestRenameBatch_RollsBackOnFailure(t *testing.T) {
	d := t.TempDir()
	writeNamed(t, d, "a.txt")
	err := newTestFM().RenameBatch([]RenamePair{
		{Old: filepath.Join(d, "a.txt"), New: filepath.Join(d, "x.txt")},
		{Old: filepath.Join(d, "missing.txt"), New: filepath.Join(d, "y.txt")},
	})
	if err == nil {
		t.Fatal("want error for missing source")
	}
	if got := dirNames(t, d); got != "a.txt" {
		t.Fatalf("must roll back, dir = %s", got)
	}
}

func TestRenameBatch_RejectsOtherFolderAndDuplicates(t *testing.T) {
	d := t.TempDir()
	sub := filepath.Join(d, "sub")
	os.Mkdir(sub, 0755)
	writeNamed(t, d, "a", "b")
	fm := newTestFM()
	if err := fm.RenameBatch([]RenamePair{{Old: filepath.Join(d, "a"), New: filepath.Join(sub, "a")}}); err == nil {
		t.Fatal("want error: other folder")
	}
	if err := fm.RenameBatch([]RenamePair{
		{Old: filepath.Join(d, "a"), New: filepath.Join(d, "z")},
		{Old: filepath.Join(d, "b"), New: filepath.Join(d, "z")},
	}); err == nil {
		t.Fatal("want error: duplicate target")
	}
	if err := fm.RenameBatch([]RenamePair{{Old: filepath.Join(d, "a"), New: filepath.Join(d, "x/y")}}); err == nil {
		t.Fatal("want error: separator in name")
	}
	if got := dirNames(t, d); got != "a,b,sub" {
		t.Fatalf("dir = %s", got)
	}
}

func TestRenameBatch_CaseOnly(t *testing.T) {
	d := t.TempDir()
	writeNamed(t, d, "readme.md")
	if err := newTestFM().RenameBatch([]RenamePair{{Old: filepath.Join(d, "readme.md"), New: filepath.Join(d, "README.md")}}); err != nil {
		t.Fatal(err)
	}
	if got := dirNames(t, d); got != "README.md" {
		t.Fatalf("dir = %s", got)
	}
}

// Todo #134-1: 대소문자를 구분하는 파일 시스템에서 다른 파일(a)을 덮어쓰지 않음
func TestRenameBatch_CaseSensitiveNeighbour(t *testing.T) {
	d := t.TempDir()
	if !caseSensitiveFS(d) {
		t.Skip("case-insensitive file system")
	}
	writeNamed(t, d, "A", "a", "x")
	err := newTestFM().RenameBatch([]RenamePair{
		{Old: filepath.Join(d, "A"), New: filepath.Join(d, "b")},
		{Old: filepath.Join(d, "x"), New: filepath.Join(d, "a")},
	})
	if err == nil {
		t.Fatal("a exists outside the batch: want error")
	}
	if contentOf(t, filepath.Join(d, "a")) != "a" {
		t.Fatal("a must not be overwritten")
	}
}

func TestRenameBatch_ReportsLeftoverOnRollbackFailure(t *testing.T) {
	err := rollbackError(errors.New("locked"), []string{"/d/.~rename0.x"})
	if err == nil || !strings.Contains(err.Error(), ".~rename0.x") || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("got %v", err)
	}
	if rollbackError(errors.New("e"), nil).Error() != "e" {
		t.Fatal("no leftovers: original error only")
	}
}

func caseSensitiveFS(dir string) bool {
	p := filepath.Join(dir, "CaseProbe")
	os.WriteFile(p, nil, 0644)
	_, err := os.Stat(filepath.Join(dir, "caseprobe"))
	os.Remove(p)
	return err != nil
}
