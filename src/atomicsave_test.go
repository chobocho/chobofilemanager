package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
)

// ─── Todo #87: 설정/북마크/에디터 저장을 원자적으로 ───────────────────────────

func assertNoTmpLeft(t *testing.T, dir string) {
	t.Helper()
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("temp file left: %s", e.Name())
		}
	}
}

func TestWriteTextFileWithEncoding_NoTempLeftAndKeepsMode(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "script.sh")
	os.WriteFile(p, []byte("old"), 0755)
	if err := newTestFM().WriteTextFileWithEncoding(p, "new", "utf-8"); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(p); string(data) != "new" {
		t.Errorf("got %q", data)
	}
	assertNoTmpLeft(t, dir)
	if runtime.GOOS != "windows" {
		if info, _ := os.Stat(p); info.Mode().Perm() != 0755 {
			t.Errorf("mode should be preserved, got %v", info.Mode().Perm())
		}
	}
}

func TestSaveSessionState_NoTempLeft(t *testing.T) {
	a := newTestApp(t)
	d := t.TempDir()
	if err := a.SaveSessionState([]string{d}, 0, []string{d}, 0); err != nil {
		t.Fatal(err)
	}
	assertNoTmpLeft(t, a.configDir)
}

func TestFileBookmarks_CorruptFileIsBackedUpAndAddWorks(t *testing.T) {
	a := newTestApp(t)
	p, _ := a.fileBookmarksPath()
	os.WriteFile(p, []byte("[{broken"), 0644)

	if bms := a.GetFileBookmarks(); len(bms) != 0 {
		t.Errorf("corrupt file should load as empty, got %v", bms)
	}
	if err := a.AddFileBookmark("x", t.TempDir()); err != nil {
		t.Fatalf("AddFileBookmark should recover from a corrupt file: %v", err)
	}
	if matches, _ := filepath.Glob(p + ".corrupt-*"); len(matches) != 1 {
		t.Errorf("corrupt file should be backed up, found %v", matches)
	}
}

func TestFileBookmarks_ConcurrentAdds(t *testing.T) {
	a := newTestApp(t)
	target := t.TempDir()
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			a.AddFileBookmark(fmt.Sprintf("b%d", i), target)
		}(i)
	}
	wg.Wait()
	if n := len(a.GetFileBookmarks()); n != 20 {
		t.Errorf("expected 20 bookmarks, got %d", n)
	}
}
