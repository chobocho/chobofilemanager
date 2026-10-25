package main

// FTP를 파일 패널에서 (Todo #133-8, Total Commander처럼): 패널 경로 "ftp://<연결 ID>/원격/경로".
// App이 이런 경로를 FTPManager로 보내므로 프론트는 로컬 폴더와 같은 API(F5 F6 F7 F8 F2 F3 F4)를 씀.

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"
)

const ftpScheme = "ftp://"

var (
	errFTPNoTrash = errors.New("FTP에는 휴지통이 없습니다 — Shift+Del로 삭제하세요")
	errFTPToFTP   = errors.New("FTP 폴더끼리는 복사·이동할 수 없습니다 (같은 연결 안의 이동만 가능)")
	errFTPNotHere = errors.New("FTP 폴더에서는 할 수 없는 작업입니다")
	errFTPArchive = errors.New("압축 파일 안과 FTP 사이에는 바로 복사할 수 없습니다 — 먼저 로컬로 꺼내세요")
)

// parseFTPPath: "ftp://id/a/b" → ("id", "/a/b"). 원격 경로는 항상 '/'로 시작하고 정리됨
func parseFTPPath(p string) (id, remote string, ok bool) {
	if !strings.HasPrefix(p, ftpScheme) {
		return "", "", false
	}
	rest := strings.ReplaceAll(p[len(ftpScheme):], `\`, "/")
	id, r, _ := strings.Cut(rest, "/")
	if id == "" {
		return "", "", false
	}
	return id, path.Clean("/" + r), true
}

func ftpPanelPath(id, remote string) string {
	return ftpScheme + id + path.Clean("/"+remote)
}

func isFTPPath(p string) bool {
	_, _, ok := parseFTPPath(p)
	return ok
}

func anyFTP(paths ...string) bool {
	for _, p := range paths {
		if isFTPPath(p) {
			return true
		}
	}
	return false
}

// ─── 목록 ────────────────────────────────────────────────────────────────────

func (a *App) ftpList(id, remote string) (*DirectoryListing, error) {
	l, err := a.ftpManager.ListDirectory(id, remote)
	if err != nil {
		return nil, err
	}
	files := make([]FileInfo, 0, len(l.Files))
	for _, f := range l.Files {
		f.Path = ftpPanelPath(id, path.Join(remote, f.Name))
		files = append(files, f)
	}
	return &DirectoryListing{Path: ftpPanelPath(id, remote), Files: files}, nil
}

// ftpEntries: 원격 폴더의 이름 → 폴더 여부
func (a *App) ftpEntries(id, dir string) (map[string]bool, error) {
	l, err := a.ftpManager.ListDirectory(id, dir)
	if err != nil {
		return nil, err
	}
	m := map[string]bool{}
	for _, f := range l.Files {
		m[f.Name] = f.IsDir
	}
	return m, nil
}

// ftpStat: 원격 항목이 있는지, 폴더인지 (부모 폴더 목록으로)
func (a *App) ftpStat(id, remote string) (exists, isDir bool, err error) {
	if remote == "/" {
		return true, true, nil
	}
	m, err := a.ftpEntries(id, path.Dir(remote))
	if err != nil {
		return false, false, err
	}
	d, ok := m[path.Base(remote)]
	return ok, d, nil
}

// ─── 받기 · 올리기 (폴더는 하위까지) ──────────────────────────────────────────

func (a *App) ftpDownloadTree(id, remote, localPath string) error {
	_, isDir, err := a.ftpStat(id, remote)
	if err != nil {
		return err
	}
	if !isDir {
		return a.ftpManager.Download(id, remote, localPath)
	}
	if err := os.MkdirAll(localPath, 0755); err != nil {
		return err
	}
	m, err := a.ftpEntries(id, remote)
	if err != nil {
		return err
	}
	for name, dir := range m {
		if _, err := localNameForRemote(name); err != nil {
			return err
		}
		child := path.Join(remote, name)
		if dir {
			err = a.ftpDownloadTree(id, child, filepath.Join(localPath, name))
		} else {
			err = a.ftpManager.Download(id, child, filepath.Join(localPath, name))
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (a *App) ftpUploadTree(id, localPath, remote string) error {
	info, err := os.Stat(localPath)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return a.ftpManager.Upload(id, localPath, remote)
	}
	if err := a.ftpManager.CreateDirectory(id, remote); err != nil {
		if exists, isDir, _ := a.ftpStat(id, remote); !exists || !isDir {
			return err
		}
	}
	es, err := os.ReadDir(localPath)
	if err != nil {
		return err
	}
	for _, e := range es {
		if err := a.ftpUploadTree(id, filepath.Join(localPath, e.Name()), path.Join(remote, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

// uniqueRemoteName: 원격 폴더 안에서 겹치지 않는 "x (1).txt"
func uniqueRemoteName(existing map[string]bool, name string) string {
	ext := path.Ext(name)
	base := strings.TrimSuffix(name, ext)
	if base == "" {
		base, ext = name, ""
	}
	for n := 1; ; n++ {
		c := fmt.Sprintf("%s (%d)%s", base, n, ext)
		if _, ok := existing[c]; !ok {
			return c
		}
	}
}

func remoteBase(p string) string {
	if _, r, ok := parseFTPPath(p); ok {
		return path.Base(r)
	}
	return filepath.Base(p)
}

// ftpCopy: F5 (mode: overwrite · skip · rename). FTP가 끼지 않으면 handled=false
func (a *App) ftpCopy(sources []string, dest, mode string) (bool, error) {
	destID, destRemote, destFTP := parseFTPPath(dest)
	if !destFTP && !anyFTP(sources...) {
		return false, nil
	}
	if destFTP {
		if anyFTP(sources...) {
			return true, errFTPToFTP
		}
		if err := refuseInArchive(sources...); err != nil {
			return true, errFTPArchive
		}
		existing, err := a.ftpEntries(destID, destRemote)
		if err != nil {
			return true, err
		}
		for _, src := range sources {
			name := filepath.Base(src)
			if _, ok := existing[name]; ok {
				switch mode {
				case "skip":
					continue
				case "rename":
					name = uniqueRemoteName(existing, name)
				}
			}
			existing[name] = false
			if err := a.ftpUploadTree(destID, src, path.Join(destRemote, name)); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	if archiveTarget(dest) {
		return true, errFTPArchive
	}
	for _, src := range sources {
		id, remote, ok := parseFTPPath(src)
		if !ok {
			return true, errFTPToFTP // 로컬·FTP를 섞어 고를 수는 없음 (패널 하나에서 고르므로 생기지 않음)
		}
		name, err := localNameForRemote(remote)
		if err != nil {
			return true, err
		}
		target := filepath.Join(dest, name)
		if _, err := os.Lstat(target); err == nil {
			switch mode {
			case "skip":
				continue
			case "rename":
				if target, err = uniqueName(dest, name); err != nil {
					return true, err
				}
			}
		}
		if err := a.ftpDownloadTree(id, remote, target); err != nil {
			return true, err
		}
	}
	return true, nil
}

// ftpMove: F6 — 같은 연결 안은 RNFR/RNTO, 내려받기·올리기는 복사 후 원본 삭제
func (a *App) ftpMove(sources []string, dest, mode string) (bool, error) {
	destID, destRemote, destFTP := parseFTPPath(dest)
	if !destFTP && !anyFTP(sources...) {
		return false, nil
	}
	if destFTP && anyFTP(sources...) {
		for _, src := range sources {
			id, remote, _ := parseFTPPath(src)
			if id != destID {
				return true, errFTPToFTP
			}
			if err := a.ftpManager.RenameItem(id, remote, path.Join(destRemote, path.Base(remote))); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	if _, err := a.ftpCopy(sources, dest, mode); err != nil {
		return true, err
	}
	if destFTP {
		for _, src := range sources {
			if err := os.RemoveAll(src); err != nil {
				return true, err
			}
		}
		return true, nil
	}
	return true, a.ftpDelete(sources)
}

func (a *App) ftpDelete(paths []string) error {
	for _, p := range paths {
		id, remote, ok := parseFTPPath(p)
		if !ok {
			return errFTPNotHere
		}
		if remote == "/" {
			return fmt.Errorf("FTP 루트는 삭제할 수 없습니다")
		}
		exists, isDir, err := a.ftpStat(id, remote)
		if err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("없는 항목입니다: %s", remote)
		}
		if err := a.ftpManager.DeleteItem(id, remote, isDir); err != nil {
			return err
		}
	}
	return nil
}

func (a *App) ftpCreateFile(id, remote string) error {
	exists, _, err := a.ftpStat(id, remote)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("파일이 이미 존재합니다: %s", path.Base(remote))
	}
	tmp, err := os.CreateTemp("", "chobocho-ftp-empty-*")
	if err != nil {
		return err
	}
	tmp.Close()
	defer os.Remove(tmp.Name())
	return a.ftpManager.Upload(id, tmp.Name(), remote)
}

// withFTPLocal: 원격 파일을 임시 폴더로 받아 fn에 넘김 (보기 · 저장 · 비교 · 열기)
func (a *App) withFTPLocal(p string, fn func(local string) error) error {
	id, remote, _ := parseFTPPath(p)
	name, err := localNameForRemote(remote)
	if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "chobocho-ftp-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	local := filepath.Join(dir, name)
	if err := a.ftpManager.Download(id, remote, local); err != nil {
		return err
	}
	return fn(local)
}

// ftpOpenCopy: 기본 앱으로 열 파일 — 열린 동안 남아 있어야 하므로 지우지 않는 임시 폴더에
func (a *App) ftpOpenCopy(p string) (string, error) {
	id, remote, _ := parseFTPPath(p)
	name, err := localNameForRemote(remote)
	if err != nil {
		return "", err
	}
	base := filepath.Join(os.TempDir(), "chobocho-commander", "ftp-open")
	if err := os.MkdirAll(base, 0755); err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp(base, "")
	if err != nil {
		return "", err
	}
	local := filepath.Join(dir, name)
	return local, a.ftpManager.Download(id, remote, local)
}

func (a *App) ftpWriteText(p, content, enc string) error {
	id, remote, _ := parseFTPPath(p)
	name, err := localNameForRemote(remote)
	if err != nil {
		return err
	}
	dir, err := os.MkdirTemp("", "chobocho-ftp-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	local := filepath.Join(dir, name)
	// 기존 파일을 먼저 받아 두면 'auto' 저장이 원래 인코딩을 유지
	_ = a.ftpManager.Download(id, remote, local)
	if err := a.fileManager.WriteTextFileWithEncoding(local, content, enc); err != nil {
		return err
	}
	return a.ftpManager.Upload(id, local, remote)
}

func (a *App) ftpDirSize(id, remote string) (DirSizeResult, error) {
	var r DirSizeResult
	var walk func(dir string) error
	walk = func(dir string) error {
		l, err := a.ftpManager.ListDirectory(id, dir)
		if err != nil {
			return err
		}
		for _, f := range l.Files {
			if f.IsDir {
				r.Dirs++
				if err := walk(path.Join(dir, f.Name)); err != nil {
					return err
				}
			} else {
				r.Size += f.Size
				r.Files++
			}
		}
		return nil
	}
	return r, walk(remote)
}

func (a *App) ftpConflicts(sources []string, dest string) []CopyConflict {
	id, remote, _ := parseFTPPath(dest)
	existing, err := a.ftpEntries(id, remote)
	if err != nil {
		return nil
	}
	var cs []CopyConflict
	for _, src := range sources {
		name := remoteBase(src)
		if _, ok := existing[name]; ok {
			cs = append(cs, CopyConflict{Name: name, SourcePath: src, DestPath: ftpPanelPath(id, path.Join(remote, name))})
		}
	}
	return cs
}
