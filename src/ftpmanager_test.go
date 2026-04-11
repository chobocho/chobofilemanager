package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// newTestFTPManager는 실제 홈 디렉토리 대신 임시 경로를 사용하는 FTPManager를 생성합니다.
func newTestFTPManager(t *testing.T) *FTPManager {
	t.Helper()
	dir := t.TempDir()
	return &FTPManager{
		connections:  make(map[string]*ftpConnection),
		bookmarkFile: filepath.Join(dir, "bookmarks.json"),
	}
}

// ─── SaveBookmark ─────────────────────────────────────────────────────────────

func TestSaveBookmark_New(t *testing.T) {
	fm := newTestFTPManager(t)

	bm := FTPBookmark{
		Name: "My Server",
		Config: FTPConfig{
			Host: "ftp.example.com",
			Port: 21,
		},
	}
	if err := fm.SaveBookmark(bm); err != nil {
		t.Fatalf("SaveBookmark error: %v", err)
	}

	bookmarks := fm.GetBookmarks()
	if len(bookmarks) != 1 {
		t.Fatalf("expected 1 bookmark, got %d", len(bookmarks))
	}
	if bookmarks[0].Name != "My Server" {
		t.Errorf("expected name 'My Server', got %q", bookmarks[0].Name)
	}
}

func TestSaveBookmark_AutoID(t *testing.T) {
	fm := newTestFTPManager(t)

	bm := FTPBookmark{Name: "No ID Bookmark"}
	fm.SaveBookmark(bm)

	bookmarks := fm.GetBookmarks()
	if bookmarks[0].ID == "" {
		t.Error("ID should be auto-generated when empty")
	}
	if !strings.HasPrefix(bookmarks[0].ID, "bm_") {
		t.Errorf("auto ID should start with 'bm_', got %q", bookmarks[0].ID)
	}
}

func TestSaveBookmark_Update(t *testing.T) {
	fm := newTestFTPManager(t)

	bm := FTPBookmark{ID: "fixed_id", Name: "Original"}
	fm.SaveBookmark(bm)

	bm.Name = "Updated"
	fm.SaveBookmark(bm)

	bookmarks := fm.GetBookmarks()
	if len(bookmarks) != 1 {
		t.Fatalf("update should not create duplicate, got %d bookmarks", len(bookmarks))
	}
	if bookmarks[0].Name != "Updated" {
		t.Errorf("expected 'Updated', got %q", bookmarks[0].Name)
	}
}

func TestSaveBookmark_Multiple(t *testing.T) {
	fm := newTestFTPManager(t)

	for i := 0; i < 3; i++ {
		fm.SaveBookmark(FTPBookmark{Name: "server"})
		time.Sleep(time.Millisecond) // ID 충돌 방지 (UnixNano 기반)
	}

	if len(fm.GetBookmarks()) != 3 {
		t.Errorf("expected 3 bookmarks, got %d", len(fm.GetBookmarks()))
	}
}

func TestSaveBookmark_CreatedTimestamp(t *testing.T) {
	fm := newTestFTPManager(t)
	before := time.Now().Add(-time.Second)

	fm.SaveBookmark(FTPBookmark{Name: "ts test"})

	after := time.Now().Add(time.Second)
	bm := fm.GetBookmarks()[0]
	if bm.Created.Before(before) || bm.Created.After(after) {
		t.Errorf("Created timestamp out of range: %v", bm.Created)
	}
}

// ─── DeleteBookmark ───────────────────────────────────────────────────────────

func TestDeleteBookmark_Existing(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.SaveBookmark(FTPBookmark{ID: "del_me", Name: "To Delete"})
	fm.SaveBookmark(FTPBookmark{Name: "Keep"})

	if err := fm.DeleteBookmark("del_me"); err != nil {
		t.Fatalf("DeleteBookmark error: %v", err)
	}

	bookmarks := fm.GetBookmarks()
	if len(bookmarks) != 1 {
		t.Fatalf("expected 1 remaining bookmark, got %d", len(bookmarks))
	}
	if bookmarks[0].ID == "del_me" {
		t.Error("deleted bookmark should not be present")
	}
}

func TestDeleteBookmark_NotFound(t *testing.T) {
	fm := newTestFTPManager(t)

	// 존재하지 않는 ID 삭제 시 에러 없이 반환해야 함
	if err := fm.DeleteBookmark("nonexistent_id"); err != nil {
		t.Errorf("deleting nonexistent bookmark should not error: %v", err)
	}
}

func TestDeleteBookmark_Empty(t *testing.T) {
	fm := newTestFTPManager(t)

	if err := fm.DeleteBookmark("any"); err != nil {
		t.Errorf("deleting from empty list should not error: %v", err)
	}
	if len(fm.GetBookmarks()) != 0 {
		t.Error("bookmark list should remain empty")
	}
}

// ─── 북마크 파일 퍼시스턴스 ──────────────────────────────────────────────────

func TestBookmark_PersistedToFile(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.SaveBookmark(FTPBookmark{ID: "persist_id", Name: "Persist Me"})

	data, err := os.ReadFile(fm.bookmarkFile)
	if err != nil {
		t.Fatalf("bookmark file not written: %v", err)
	}

	var loaded []FTPBookmark
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("bookmark file is not valid JSON: %v", err)
	}
	if len(loaded) != 1 || loaded[0].ID != "persist_id" {
		t.Errorf("persisted bookmark mismatch: %+v", loaded)
	}
}

func TestBookmark_LoadFromFile(t *testing.T) {
	dir := t.TempDir()
	bookmarkPath := filepath.Join(dir, "bookmarks.json")

	// 미리 파일 작성
	existing := []FTPBookmark{
		{ID: "pre_id", Name: "Pre-existing"},
	}
	data, _ := json.MarshalIndent(existing, "", "  ")
	os.WriteFile(bookmarkPath, data, 0644)

	// bookmarkFile 경로를 지정하고 loadBookmarks 호출
	fm := &FTPManager{
		connections:  make(map[string]*ftpConnection),
		bookmarkFile: bookmarkPath,
	}
	fm.loadBookmarks()

	bookmarks := fm.GetBookmarks()
	if len(bookmarks) != 1 || bookmarks[0].ID != "pre_id" {
		t.Errorf("bookmarks not loaded from file: %+v", bookmarks)
	}
}

func TestBookmark_DeletePersistedToFile(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.SaveBookmark(FTPBookmark{ID: "to_del", Name: "Delete Me"})
	fm.SaveBookmark(FTPBookmark{Name: "Keep Me"})
	fm.DeleteBookmark("to_del")

	data, _ := os.ReadFile(fm.bookmarkFile)
	var loaded []FTPBookmark
	json.Unmarshal(data, &loaded)

	if len(loaded) != 1 {
		t.Errorf("expected 1 bookmark in file after delete, got %d", len(loaded))
	}
	if loaded[0].ID == "to_del" {
		t.Error("deleted bookmark should not be in file")
	}
}

// ─── GetConnections ───────────────────────────────────────────────────────────

func TestGetConnections_Empty(t *testing.T) {
	fm := newTestFTPManager(t)
	if conns := fm.GetConnections(); len(conns) != 0 {
		t.Errorf("expected 0 connections, got %d", len(conns))
	}
}

func TestGetConnections_ThreadSafe(t *testing.T) {
	fm := newTestFTPManager(t)

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fm.GetConnections()
		}()
	}
	wg.Wait()
	// 데이터 레이스 없이 완료되면 통과
}

// ─── getConn ─────────────────────────────────────────────────────────────────

func TestGetConn_NotFound(t *testing.T) {
	fm := newTestFTPManager(t)
	_, err := fm.getConn("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent connection ID")
	}
	if !strings.Contains(err.Error(), "nonexistent") {
		t.Errorf("error should mention the connection ID: %v", err)
	}
}
