package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"totalcmd/internal/atomicfile"
)

type FileBookmark struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	IsFile  bool      `json:"isFile"`
	Created time.Time `json:"created"`
}

func (a *App) fileBookmarksPath() (string, error) {
	dir, err := a.resolvedConfigDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "file_bookmarks.json"), nil
}

func (a *App) loadFileBookmarks() ([]FileBookmark, error) {
	p, err := a.fileBookmarksPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if os.IsNotExist(err) {
		return []FileBookmark{}, nil
	}
	if err != nil {
		return nil, err
	}
	var bms []FileBookmark
	if err := json.Unmarshal(data, &bms); err != nil {
		// 손상된 파일은 백업하고 빈 목록으로 시작 — 이후 추가가 영구 실패하지 않도록 (Todo #87)
		atomicfile.BackupCorrupt(p)
		return []FileBookmark{}, nil
	}
	return bms, nil
}

func (a *App) saveFileBookmarks(bms []FileBookmark) error {
	p, err := a.fileBookmarksPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(bms, "", "  ")
	if err != nil {
		return err
	}
	return atomicfile.Write(p, data, 0644)
}

func (a *App) GetFileBookmarks() []FileBookmark {
	a.bookmarkMu.Lock()
	defer a.bookmarkMu.Unlock()
	bms, _ := a.loadFileBookmarks()
	return bms
}

func (a *App) AddFileBookmark(name, path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return fmt.Errorf("경로가 존재하지 않습니다: %s", path)
	}
	a.bookmarkMu.Lock()
	defer a.bookmarkMu.Unlock()
	bms, err := a.loadFileBookmarks()
	if err != nil {
		return err
	}
	id := fmt.Sprintf("bm_%d_%d", time.Now().UnixNano(), len(bms))
	bms = append(bms, FileBookmark{
		ID:      id,
		Name:    name,
		Path:    path,
		IsFile:  !info.IsDir(),
		Created: time.Now(),
	})
	return a.saveFileBookmarks(bms)
}

func (a *App) DeleteFileBookmark(id string) error {
	a.bookmarkMu.Lock()
	defer a.bookmarkMu.Unlock()
	bms, err := a.loadFileBookmarks()
	if err != nil {
		return err
	}
	filtered := bms[:0]
	for _, bm := range bms {
		if bm.ID != id {
			filtered = append(filtered, bm)
		}
	}
	return a.saveFileBookmarks(filtered)
}
