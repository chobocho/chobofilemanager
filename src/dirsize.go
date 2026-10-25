package main

// 폴더 크기 계산 (Todo #133-1): Space / Alt+Shift+Enter — Total Commander와 같게

import (
	"io/fs"
	"os"
	"path/filepath"
)

type DirSizeResult struct {
	Size  int64 `json:"size"`
	Files int   `json:"files"`
	Dirs  int   `json:"dirs"` // 하위 폴더 수 (자기 자신 제외)
}

// DirSize: 폴더 안 모든 파일 크기의 합. 읽을 수 없는 하위 항목은 건너뜀, 링크는 따라가지 않음.
// 파일을 주면 그 파일 하나의 크기.
func (fm *FileManager) DirSize(path string) (DirSizeResult, error) {
	var r DirSizeResult
	if _, err := os.Stat(path); err != nil {
		return r, err
	}
	err := filepath.WalkDir(path, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			if p == path {
				return err
			}
			return nil
		}
		if d.IsDir() {
			if p != path {
				r.Dirs++
			}
			return nil
		}
		if info, err := d.Info(); err == nil {
			r.Size += info.Size()
			r.Files++
		}
		return nil
	})
	return r, err
}
