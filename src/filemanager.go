package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

// FileManager: 파일 작업 (상태 없음 — 작업마다 경로를 받음)
type FileManager struct{}

type FileInfo struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	Size        int64     `json:"size"`
	IsDir       bool      `json:"isDir"`
	IsHidden    bool      `json:"isHidden"`
	Modified    time.Time `json:"modified"`
	Extension   string    `json:"extension"`
	Permissions string    `json:"permissions"`
	IsSymlink   bool      `json:"isSymlink"`
	LinkTarget  string    `json:"linkTarget"`
}

type DirectoryListing struct {
	Path     string     `json:"path"`
	Files    []FileInfo `json:"files"`
	Error    string     `json:"error,omitempty"`
	ReadOnly bool       `json:"readOnly,omitempty"` // 압축 파일 안 (Todo #133-5)
}

type DriveInfo struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	DriveType  string `json:"driveType"`
	TotalSpace int64  `json:"totalSpace"`
	FreeSpace  int64  `json:"freeSpace"`
}

func NewFileManager() *FileManager {
	return &FileManager{}
}

func (fm *FileManager) ListDirectory(path string) (*DirectoryListing, error) {
	if path == "" {
		path = fm.GetHomeDirectory()
	}
	// 압축 파일(또는 그 안)은 폴더처럼 (Todo #133-5)
	if l, err, ok := fm.listArchiveFor(path); ok {
		return l, err
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read directory: %w", err)
	}

	var files []FileInfo
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}

		fullPath := filepath.Join(path, entry.Name())
		isHidden := isHiddenFile(entry.Name())

		fi := FileInfo{
			Name:        entry.Name(),
			Path:        fullPath,
			Size:        info.Size(),
			IsDir:       entry.IsDir(),
			IsHidden:    isHidden,
			Modified:    info.ModTime(),
			Extension:   strings.ToLower(filepath.Ext(entry.Name())),
			Permissions: info.Mode().String(),
		}

		if entry.Type()&(os.ModeSymlink|os.ModeIrregular) != 0 {
			fi.IsSymlink = true
			target, err := os.Readlink(fullPath)
			if err == nil {
				fi.LinkTarget = target
			}
			// 폴더를 가리키는 링크/정션은 폴더로 표시 (Enter로 진입 가능, Todo #90)
			if ti, err := os.Stat(fullPath); err == nil && ti.IsDir() {
				fi.IsDir = true
			}
		}

		files = append(files, fi)
	}

	// Sort: directories first, then files, both alphabetically
	sort.Slice(files, func(i, j int) bool {
		if files[i].IsDir != files[j].IsDir {
			return files[i].IsDir
		}
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})

	return &DirectoryListing{
		Path:  path,
		Files: files,
	}, nil
}

func (fm *FileManager) GetHomeDirectory() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "/"
	}
	return home
}

func (fm *FileManager) GetDrives() []DriveInfo {
	if runtime.GOOS == "windows" {
		return getWindowsDrives()
	}
	return getLinuxMounts()
}

func (fm *FileManager) GetFileInfo(path string) (*FileInfo, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	fi := &FileInfo{
		Name:        info.Name(),
		Path:        path,
		Size:        info.Size(),
		IsDir:       info.IsDir(),
		IsHidden:    isHiddenFile(info.Name()),
		Modified:    info.ModTime(),
		Extension:   strings.ToLower(filepath.Ext(info.Name())),
		Permissions: info.Mode().String(),
	}
	if info.Mode()&os.ModeSymlink != 0 {
		fi.IsSymlink = true
		target, err := os.Readlink(path)
		if err == nil {
			fi.LinkTarget = target
		}
	}
	return fi, nil
}

func (fm *FileManager) JoinPath(parts ...string) string {
	return filepath.Join(parts...)
}

func (fm *FileManager) GetParentPath(path string) string {
	return filepath.Dir(path)
}

func (fm *FileManager) SearchFiles(rootPath, pattern string, recursive bool) ([]FileInfo, error) {
	var results []FileInfo
	if _, _, ok := archiveSearchRoot(rootPath); ok {
		return fm.searchArchive(rootPath, pattern, recursive)
	}

	// 쉼표로 분리한 후 각 키워드를 모두 포함하는 AND 검색
	rawTerms := strings.Split(pattern, ",")
	terms := make([]string, 0, len(rawTerms))
	for _, t := range rawTerms {
		t = strings.ToLower(strings.TrimSpace(t))
		if t != "" {
			terms = append(terms, t)
		}
	}
	if len(terms) == 0 {
		return results, nil
	}

	walkFn := func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if path == rootPath {
			return nil // 검색 루트 자체는 결과에서 제외
		}
		// 비재귀 검색: 폴더도 이름 매칭은 하되 내부로 들어가지 않음 (Todo #99)
		skip := error(nil)
		if !recursive && d.IsDir() {
			skip = filepath.SkipDir
		}
		name := strings.ToLower(d.Name())
		for _, term := range terms {
			if !strings.Contains(name, term) {
				return skip
			}
		}
		info, err := d.Info()
		if err == nil {
			results = append(results, FileInfo{
				Name:      d.Name(),
				Path:      path,
				Size:      info.Size(),
				IsDir:     d.IsDir(),
				Modified:  info.ModTime(),
				Extension: strings.ToLower(filepath.Ext(d.Name())),
			})
		}
		return skip
	}

	err := filepath.WalkDir(rootPath, walkFn)
	return results, err
}

func isHiddenFile(name string) bool {
	return strings.HasPrefix(name, ".")
}
