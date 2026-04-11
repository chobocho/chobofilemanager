package main

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

type FileManager struct {
	ctx context.Context
}

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
	Path  string     `json:"path"`
	Files []FileInfo `json:"files"`
	Error string     `json:"error,omitempty"`
}

type DriveInfo struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	DriveType  string `json:"driveType"`
	TotalSpace int64  `json:"totalSpace"`
	FreeSpace  int64  `json:"freeSpace"`
}

type PathPart struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func NewFileManager() *FileManager {
	return &FileManager{}
}

func (fm *FileManager) ListDirectory(path string) (*DirectoryListing, error) {
	if path == "" {
		path = fm.GetHomeDirectory()
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

		if entry.Type()&os.ModeSymlink != 0 {
			fi.IsSymlink = true
			target, err := os.Readlink(fullPath)
			if err == nil {
				fi.LinkTarget = target
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

type CopyConflict struct {
	Name       string `json:"name"`
	SourcePath string `json:"sourcePath"`
	DestPath   string `json:"destPath"`
}

func (fm *FileManager) CheckCopyConflicts(sources []string, destination string) []CopyConflict {
	var conflicts []CopyConflict
	for _, src := range sources {
		name := filepath.Base(src)
		destPath := filepath.Join(destination, name)
		if _, err := os.Stat(destPath); err == nil {
			conflicts = append(conflicts, CopyConflict{
				Name:       name,
				SourcePath: src,
				DestPath:   destPath,
			})
		}
	}
	return conflicts
}

func (fm *FileManager) CopyItems(sources []string, destination string) error {
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		destPath := filepath.Join(destination, filepath.Base(src))
		if info.IsDir() {
			if err := copyDir(src, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(src, destPath); err != nil {
				return err
			}
		}
	}
	return nil
}

func (fm *FileManager) CopyItemsRename(sources []string, destination string) error {
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		name := filepath.Base(src)
		destPath := filepath.Join(destination, name)
		if _, err := os.Stat(destPath); err == nil {
			ext := filepath.Ext(name)
			base := strings.TrimSuffix(name, ext)
			for n := 1; ; n++ {
				candidate := filepath.Join(destination, fmt.Sprintf("%s (%d)%s", base, n, ext))
				if _, err := os.Stat(candidate); os.IsNotExist(err) {
					destPath = candidate
					break
				}
			}
		}
		if info.IsDir() {
			if err := copyDir(src, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(src, destPath); err != nil {
				return err
			}
		}
	}
	return nil
}

func (fm *FileManager) CopyItemsSkipConflicts(sources []string, destination string) error {
	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		destPath := filepath.Join(destination, filepath.Base(src))
		if _, err := os.Stat(destPath); err == nil {
			continue // 이미 존재하면 건너뜀
		}
		if info.IsDir() {
			if err := copyDir(src, destPath); err != nil {
				return err
			}
		} else {
			if err := copyFile(src, destPath); err != nil {
				return err
			}
		}
	}
	return nil
}

func (fm *FileManager) MoveItems(sources []string, destination string) error {
	for _, src := range sources {
		destPath := filepath.Join(destination, filepath.Base(src))
		if err := os.Rename(src, destPath); err != nil {
			// Cross-device move: copy then delete
			info, statErr := os.Stat(src)
			if statErr != nil {
				return statErr
			}
			if info.IsDir() {
				if err := copyDir(src, destPath); err != nil {
					return err
				}
				if err := os.RemoveAll(src); err != nil {
					return err
				}
			} else {
				if err := copyFile(src, destPath); err != nil {
					return err
				}
				if err := os.Remove(src); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (fm *FileManager) DeleteItems(paths []string) error {
	for _, p := range paths {
		if err := os.RemoveAll(p); err != nil {
			return err
		}
	}
	return nil
}

func (fm *FileManager) CreateDirectory(path string) error {
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("폴더가 이미 존재합니다: %s", filepath.Base(path))
	}
	return os.MkdirAll(path, 0755)
}

func (fm *FileManager) CreateFile(path string) error {
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("파일이 이미 존재합니다: %s", filepath.Base(path))
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	return f.Close()
}

func (fm *FileManager) RenameItem(oldPath, newPath string) error {
	return os.Rename(oldPath, newPath)
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

func (fm *FileManager) ReadTextFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (fm *FileManager) WriteTextFile(path string, content string) error {
	return os.WriteFile(path, []byte(content), 0644)
}

func (fm *FileManager) OpenFile(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", path)
	case "linux":
		cmd = exec.Command("xdg-open", path)
	default:
		return fmt.Errorf("unsupported OS")
	}
	return cmd.Start()
}

func (fm *FileManager) GetPathParts(path string) []PathPart {
	path = filepath.Clean(path)
	var parts []PathPart

	if runtime.GOOS == "windows" {
		segments := strings.Split(path, string(filepath.Separator))
		accumulated := ""
		for _, seg := range segments {
			if seg == "" {
				continue
			}
			if accumulated == "" {
				accumulated = seg + string(filepath.Separator)
			} else {
				accumulated = filepath.Join(accumulated, seg)
			}
			parts = append(parts, PathPart{Name: seg, Path: accumulated})
		}
	} else {
		parts = append(parts, PathPart{Name: "/", Path: "/"})
		segments := strings.Split(strings.TrimPrefix(path, "/"), "/")
		accumulated := "/"
		for _, seg := range segments {
			if seg == "" {
				continue
			}
			accumulated = filepath.Join(accumulated, seg)
			parts = append(parts, PathPart{Name: seg, Path: accumulated})
		}
	}
	return parts
}

func (fm *FileManager) JoinPath(parts ...string) string {
	return filepath.Join(parts...)
}

func (fm *FileManager) GetParentPath(path string) string {
	return filepath.Dir(path)
}

func (fm *FileManager) SearchFiles(rootPath, pattern string, recursive bool) ([]FileInfo, error) {
	var results []FileInfo
	pattern = strings.ToLower(pattern)

	walkFn := func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !recursive && d.IsDir() && path != rootPath {
			return filepath.SkipDir
		}
		name := strings.ToLower(d.Name())
		if strings.Contains(name, pattern) {
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
		}
		return nil
	}

	err := filepath.WalkDir(rootPath, walkFn)
	return results, err
}

func (fm *FileManager) GetFileSize(path string) (int64, error) {
	var total int64
	err := filepath.WalkDir(path, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err == nil {
				total += info.Size()
			}
		}
		return nil
	})
	return total, err
}

func (fm *FileManager) CompressItems(sources []string, destPath string) error {
	if !strings.HasSuffix(destPath, ".zip") {
		destPath += ".zip"
	}
	zf, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer zf.Close()

	w := zip.NewWriter(zf)
	defer w.Close()

	for _, src := range sources {
		info, err := os.Stat(src)
		if err != nil {
			return err
		}
		if info.IsDir() {
			base := filepath.Dir(src)
			filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
				if err != nil || d.IsDir() {
					return nil
				}
				rel, _ := filepath.Rel(base, path)
				fw, err := w.Create(rel)
				if err != nil {
					return nil
				}
				f, err := os.Open(path)
				if err != nil {
					return nil
				}
				defer f.Close()
				io.Copy(fw, f)
				return nil
			})
		} else {
			fw, err := w.Create(filepath.Base(src))
			if err != nil {
				return err
			}
			f, err := os.Open(src)
			if err != nil {
				return err
			}
			defer f.Close()
			io.Copy(fw, f)
		}
	}
	return nil
}

func (fm *FileManager) ExtractArchive(archivePath, destDir string) error {
	// 압축 파일명(확장자 제거)으로 서브폴더 생성, 이미 존재하면 (N) 접미사 추가
	base := filepath.Base(archivePath)
	folderName := strings.TrimSuffix(base, filepath.Ext(base))
	subDir := filepath.Join(destDir, folderName)
	if _, err := os.Stat(subDir); err == nil {
		for n := 1; ; n++ {
			candidate := filepath.Join(destDir, fmt.Sprintf("%s (%d)", folderName, n))
			if _, err := os.Stat(candidate); os.IsNotExist(err) {
				subDir = candidate
				break
			}
		}
	}
	destDir = subDir
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return err
	}

	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		destPath := filepath.Join(destDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(destPath), filepath.Clean(destDir)+string(os.PathSeparator)) {
			continue // zip slip protection
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			continue
		}
		os.MkdirAll(filepath.Dir(destPath), 0755)
		rc, err := f.Open()
		if err != nil {
			continue
		}
		outFile, err := os.Create(destPath)
		if err != nil {
			rc.Close()
			continue
		}
		io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
	}
	return nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func isHiddenFile(name string) bool {
	return strings.HasPrefix(name, ".")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	if err != nil {
		return err
	}

	info, err := os.Stat(src)
	if err == nil {
		os.Chmod(dst, info.Mode())
	}
	return nil
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		return copyFile(path, target)
	})
}
