package main

// 압축 파일을 폴더처럼 (Todo #133-5): 패널은 "C:\x\a.zip\docs" 같은 경로를 그대로 씀.
// 목록·읽기(F3)·꺼내기(F5)·크기는 internal/archive로, 그 밖의 작업은 읽기 전용으로 거부.

import (
	"errors"
	"os"
	"path"
	"path/filepath"
	"strings"

	"totalcmd/internal/archive"
)

var errArchiveReadOnly = errors.New("압축 파일 안은 읽기 전용입니다 (F5로 꺼내서 쓰세요)")

// inArchive: p가 압축 파일 "안"의 경로인지 (압축 파일 자체는 보통 파일)
func inArchive(p string) (arc, inner string, ok bool) {
	if _, err := os.Lstat(p); err == nil {
		return "", "", false
	}
	return archive.Split(p)
}

// archiveTarget: 복사·이동 대상 폴더가 압축 파일이거나 그 안인지
func archiveTarget(p string) bool {
	if fi, err := os.Stat(p); err == nil {
		return !fi.IsDir() && archive.IsArchive(p)
	}
	_, _, ok := archive.Split(p)
	return ok
}

// refuseInArchive: 하나라도 압축 파일 안이면 읽기 전용 오류
func refuseInArchive(paths ...string) error {
	for _, p := range paths {
		if _, _, ok := inArchive(p); ok {
			return errArchiveReadOnly
		}
	}
	return nil
}

func (fm *FileManager) listArchive(arc, inner string) (*DirectoryListing, error) {
	es, err := archive.Entries(arc)
	if err != nil {
		return nil, err
	}
	if !archive.IsFolder(es, inner) {
		return nil, errors.New("cannot read directory: 압축 파일 안에 그런 폴더가 없습니다: " + inner)
	}
	files := []FileInfo{}
	for _, e := range archive.List(es, inner) {
		name := path.Base(e.Name)
		fi := FileInfo{
			Name:     name,
			Path:     filepath.Join(arc, filepath.FromSlash(e.Name)),
			Size:     e.Size,
			IsDir:    e.IsDir,
			IsHidden: isHiddenFile(name),
			Modified: e.Modified,
		}
		if !e.IsDir {
			fi.Extension = strings.ToLower(filepath.Ext(name))
		}
		files = append(files, fi)
	}
	shown := arc
	if inner != "" {
		shown = filepath.Join(arc, filepath.FromSlash(inner))
	}
	return &DirectoryListing{Path: shown, Files: files, ReadOnly: true}, nil
}

// listArchiveFor: ListDirectory가 압축 파일(또는 그 안)을 받았을 때. 해당 없으면 handled=false
func (fm *FileManager) listArchiveFor(p string) (l *DirectoryListing, err error, handled bool) {
	if fi, err := os.Stat(p); err == nil {
		if fi.IsDir() || !archive.IsArchive(p) {
			return nil, nil, false
		}
		l, err := fm.listArchive(p, "")
		return l, err, true
	}
	if arc, inner, ok := archive.Split(p); ok {
		l, err := fm.listArchive(arc, inner)
		return l, err, true
	}
	return nil, nil, false
}

// extractArchiveSources: 복사(F5) 원본 중 압축 파일 안의 항목은 풀어서 대상에 넣고, 나머지(보통 파일)를 돌려줌.
// mode: overwrite / skip / rename (복사 충돌 창의 선택)
func (fm *FileManager) extractArchiveSources(sources []string, dest, mode string) ([]string, error) {
	if archiveTarget(dest) {
		return nil, errArchiveReadOnly
	}
	var local []string
	for _, src := range sources {
		arc, inner, ok := inArchive(src)
		if !ok {
			local = append(local, src)
			continue
		}
		if err := archive.Extract(arc, []string{inner}, dest, mode); err != nil {
			return nil, err
		}
	}
	return local, nil
}

// readArchiveFile: 뷰어용 (크기 제한)
func readArchiveFile(p string) ([]byte, bool, error) {
	arc, inner, ok := inArchive(p)
	if !ok {
		return nil, false, nil
	}
	data, err := archive.ReadFile(arc, inner, maxViewerFileSize)
	return data, true, err
}

// materializeArchiveFile: 압축 파일 안의 파일을 임시 폴더로 풀어 그 경로를 돌려줌 (기본 앱으로 열기용)
func materializeArchiveFile(p string) (string, error) {
	arc, inner, ok := inArchive(p)
	if !ok {
		return p, nil
	}
	base := filepath.Join(os.TempDir(), "chobocho-commander", "archive-open")
	if err := os.MkdirAll(base, 0755); err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp(base, "")
	if err != nil {
		return "", err
	}
	if err := archive.Extract(arc, []string{inner}, dir, "overwrite"); err != nil {
		return "", err
	}
	return filepath.Join(dir, path.Base(inner)), nil
}

// archiveSearchRoot: 검색(Ctrl+F)을 압축 파일 안에서 시작했는지
func archiveSearchRoot(root string) (arc, inner string, ok bool) {
	if fi, err := os.Stat(root); err == nil {
		if fi.IsDir() || !archive.IsArchive(root) {
			return "", "", false
		}
		return root, "", true
	}
	return archive.Split(root)
}

// searchArchive: 압축 파일 안에서 이름 검색 (쉼표로 나눈 낱말을 모두 포함, SearchFiles와 같은 규칙)
func (fm *FileManager) searchArchive(root, pattern string, recursive bool) ([]FileInfo, error) {
	arc, inner, _ := archiveSearchRoot(root)
	es, err := archive.Entries(arc)
	if err != nil {
		return nil, err
	}
	var terms []string
	for _, t := range strings.Split(pattern, ",") {
		if t = strings.ToLower(strings.TrimSpace(t)); t != "" {
			terms = append(terms, t)
		}
	}
	results := []FileInfo{}
	if len(terms) == 0 {
		return results, nil
	}
	prefix := ""
	if inner != "" {
		prefix = inner + "/"
	}
	for _, e := range es {
		if !strings.HasPrefix(e.Name, prefix) {
			continue
		}
		if rel := strings.TrimPrefix(e.Name, prefix); !recursive && strings.Contains(rel, "/") {
			continue
		}
		name := path.Base(e.Name)
		lower := strings.ToLower(name)
		match := true
		for _, t := range terms {
			if !strings.Contains(lower, t) {
				match = false
				break
			}
		}
		if !match {
			continue
		}
		fi := FileInfo{Name: name, Path: filepath.Join(arc, filepath.FromSlash(e.Name)), Size: e.Size, IsDir: e.IsDir, Modified: e.Modified}
		if !e.IsDir {
			fi.Extension = strings.ToLower(filepath.Ext(name))
		}
		results = append(results, fi)
	}
	return results, nil
}

func archiveDirSize(p string) (DirSizeResult, bool, error) {
	arc, inner, ok := inArchive(p)
	if !ok {
		return DirSizeResult{}, false, nil
	}
	es, err := archive.Entries(arc)
	if err != nil {
		return DirSizeResult{}, true, err
	}
	size, files, dirs := archive.DirSize(es, inner)
	return DirSizeResult{Size: size, Files: files, Dirs: dirs}, true, nil
}
