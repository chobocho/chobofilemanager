package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// ─── Todo #86: FTP 비밀번호 미저장, 북마크 동시성/손상 처리 ───────────────────

func TestSaveBookmark_DoesNotPersistPassword(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.SaveBookmark(FTPBookmark{Name: "x", Config: FTPConfig{Host: "h", Username: "u", Password: "secret"}})
	if fm.GetBookmarks()[0].Config.Password != "" {
		t.Error("password must not be kept in bookmarks")
	}
	data, _ := os.ReadFile(fm.bookmarkFile)
	if strings.Contains(string(data), "secret") {
		t.Error("password must not be written to the bookmark file")
	}
}

func TestLoadBookmarks_ScrubsLegacyPasswords(t *testing.T) {
	fm := newTestFTPManager(t)
	os.WriteFile(fm.bookmarkFile, []byte(`[{"id":"a","name":"n","config":{"host":"h","password":"old-secret"}}]`), 0644)
	fm.loadBookmarks()
	if bms := fm.GetBookmarks(); len(bms) != 1 || bms[0].Config.Password != "" {
		t.Fatalf("legacy password should be dropped on load: %+v", bms)
	}
	data, _ := os.ReadFile(fm.bookmarkFile)
	if strings.Contains(string(data), "old-secret") {
		t.Error("legacy password should be removed from the file")
	}
}

func TestLoadBookmarks_CorruptFileIsBackedUp(t *testing.T) {
	fm := newTestFTPManager(t)
	os.WriteFile(fm.bookmarkFile, []byte(`[{"id":"a", BROKEN`), 0644)
	fm.loadBookmarks()
	fm.SaveBookmark(FTPBookmark{Name: "new", Config: FTPConfig{Host: "h"}})
	matches, _ := filepath.Glob(fm.bookmarkFile + ".corrupt-*")
	if len(matches) != 1 {
		t.Fatalf("corrupt file should be preserved as a backup, found %v", matches)
	}
	if data, _ := os.ReadFile(matches[0]); !strings.Contains(string(data), "BROKEN") {
		t.Error("backup should keep the original bytes")
	}
}

func TestLoadHistory_CorruptFileIsBackedUp(t *testing.T) {
	fm := newTestFTPManager(t)
	os.WriteFile(fm.historyFile, []byte(`{not json`), 0644)
	fm.loadHistory()
	fm.AddHistory(FTPConfig{Host: "h"})
	if matches, _ := filepath.Glob(fm.historyFile + ".corrupt-*"); len(matches) != 1 {
		t.Errorf("corrupt history should be backed up, found %v", matches)
	}
}

func TestSaveBookmark_Concurrent(t *testing.T) {
	fm := newTestFTPManager(t)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			fm.SaveBookmark(FTPBookmark{ID: fmt.Sprintf("b%d", i), Name: "n", Config: FTPConfig{Host: "h"}})
		}(i)
	}
	wg.Wait()
	if n := len(fm.GetBookmarks()); n != 20 {
		t.Errorf("expected 20 bookmarks, got %d", n)
	}
	fresh := newTestFTPManager(t)
	fresh.bookmarkFile = fm.bookmarkFile
	fresh.loadBookmarks()
	if n := len(fresh.GetBookmarks()); n != 20 {
		t.Errorf("file should contain 20 bookmarks, got %d", n)
	}
}

func TestGetBookmarks_ReturnsCopy(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.SaveBookmark(FTPBookmark{ID: "a", Name: "orig", Config: FTPConfig{Host: "h"}})
	got := fm.GetBookmarks()
	got[0].Name = "mutated"
	if fm.GetBookmarks()[0].Name != "orig" {
		t.Error("GetBookmarks must not expose internal slice")
	}
}
