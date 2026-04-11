package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type FileBookmark struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Path    string    `json:"path"`
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
		return nil, err
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
	return os.WriteFile(p, data, 0644)
}

func (a *App) GetFileBookmarks() []FileBookmark {
	bms, _ := a.loadFileBookmarks()
	return bms
}

func (a *App) AddFileBookmark(name, path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("경로가 존재하지 않습니다: %s", path)
	}
	bms, err := a.loadFileBookmarks()
	if err != nil {
		return err
	}
	id := fmt.Sprintf("bm_%d", time.Now().UnixNano())
	bms = append(bms, FileBookmark{ID: id, Name: name, Path: path, Created: time.Now()})
	return a.saveFileBookmarks(bms)
}

func (a *App) DeleteFileBookmark(id string) error {
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
