package main

import (
	"context"
	"errors"
	"path"
	"sync"
)

type App struct {
	ctx         context.Context
	fileManager *FileManager
	ftpManager  *FTPManager
	bookmarkMu  sync.Mutex // 파일 북마크 read-modify-write 직렬화 (Todo #87)
	configDir   string     // 빈 문자열이면 기본값(~/.chobocho-commander) 사용; 테스트에서 격리된 임시 디렉토리 주입용
}

func NewApp() *App {
	return &App{
		fileManager: NewFileManager(),
		ftpManager:  NewFTPManager(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// shutdown: 창이 닫힐 때 — FTP 보기의 연결을 끊음 (터미널은 termapp.Host.Shutdown이 정리, Todo #126)
func (a *App) shutdown(ctx context.Context) {
	a.ftpManager.CloseAll()
}

// ─── File Manager API ────────────────────────────────────────────────────────

// FTP 경로("ftp://…", Todo #133-8)는 ftppanel.go로, 나머지는 FileManager로
func (a *App) ListDirectory(path string) (*DirectoryListing, error) {
	if id, remote, ok := parseFTPPath(path); ok {
		return a.ftpList(id, remote)
	}
	return a.fileManager.ListDirectory(path)
}

func (a *App) GetHomeDirectory() string {
	return a.fileManager.GetHomeDirectory()
}

func (a *App) GetDrives() []DriveInfo {
	return a.fileManager.GetDrives()
}

func (a *App) CheckCopyConflicts(sources []string, destination string) []CopyConflict {
	if isFTPPath(destination) {
		return a.ftpConflicts(sources, destination)
	}
	return a.fileManager.CheckCopyConflicts(sources, destination)
}

func (a *App) CopyItems(sources []string, destination string) error {
	if ok, err := a.ftpCopy(sources, destination, "overwrite"); ok {
		return err
	}
	return a.fileManager.CopyItems(sources, destination)
}

func (a *App) CopyItemsRename(sources []string, destination string) error {
	if ok, err := a.ftpCopy(sources, destination, "rename"); ok {
		return err
	}
	return a.fileManager.CopyItemsRename(sources, destination)
}

func (a *App) CopyItemsSkipConflicts(sources []string, destination string) error {
	if ok, err := a.ftpCopy(sources, destination, "skip"); ok {
		return err
	}
	return a.fileManager.CopyItemsSkipConflicts(sources, destination)
}

func (a *App) MoveItems(sources []string, destination string) error {
	if ok, err := a.ftpMove(sources, destination, "overwrite"); ok {
		return err
	}
	return a.fileManager.MoveItems(sources, destination)
}

func (a *App) MoveItemsOverwrite(sources []string, destination string) error {
	if ok, err := a.ftpMove(sources, destination, "overwrite"); ok {
		return err
	}
	return a.fileManager.MoveItemsOverwrite(sources, destination)
}

func (a *App) MoveItemsRename(sources []string, destination string) error {
	if ok, err := a.ftpMove(sources, destination, "rename"); ok {
		return err
	}
	return a.fileManager.MoveItemsRename(sources, destination)
}

func (a *App) DeleteItems(paths []string) error {
	if anyFTP(paths...) {
		return a.ftpDelete(paths)
	}
	return a.fileManager.DeleteItems(paths)
}

// Todo #57: 휴지통으로 이동
func (a *App) TrashItems(paths []string) error {
	if anyFTP(paths...) {
		return errFTPNoTrash
	}
	return a.fileManager.TrashItems(paths)
}

func (a *App) CreateDirectory(path string) error {
	if id, remote, ok := parseFTPPath(path); ok {
		return a.ftpManager.CreateDirectory(id, remote)
	}
	return a.fileManager.CreateDirectory(path)
}

func (a *App) CreateFile(path string) error {
	if id, remote, ok := parseFTPPath(path); ok {
		return a.ftpCreateFile(id, remote)
	}
	return a.fileManager.CreateFile(path)
}

func (a *App) RenameItem(oldPath, newPath string) error {
	if anyFTP(oldPath, newPath) {
		id, oldRemote, ok1 := parseFTPPath(oldPath)
		id2, newRemote, ok2 := parseFTPPath(newPath)
		if !ok1 || !ok2 || id != id2 {
			return errFTPToFTP
		}
		return a.ftpManager.RenameItem(id, oldRemote, newRemote)
	}
	return a.fileManager.RenameItem(oldPath, newPath)
}

func (a *App) GetFileInfo(path string) (*FileInfo, error) {
	return a.fileManager.GetFileInfo(path)
}

func (a *App) ReadTextFile(path string) (string, error) {
	return a.ReadTextFileWithEncoding(path, "auto")
}

func (a *App) ReadTextFileWithEncoding(path string, encName string) (string, error) {
	if isFTPPath(path) {
		var s string
		err := a.withFTPLocal(path, func(local string) (e error) { s, e = a.fileManager.ReadTextFileWithEncoding(local, encName); return })
		return s, err
	}
	return a.fileManager.ReadTextFileWithEncoding(path, encName)
}

func (a *App) ReadImageFile(path string) (string, error) {
	if isFTPPath(path) {
		var s string
		err := a.withFTPLocal(path, func(local string) (e error) { s, e = a.fileManager.ReadImageFile(local); return })
		return s, err
	}
	return a.fileManager.ReadImageFile(path)
}

func (a *App) CreateStarlarkScratchFile() (string, error) {
	return a.fileManager.CreateStarlarkScratchFile()
}

func (a *App) WriteTextFile(path string, content string) error {
	if isFTPPath(path) {
		return a.ftpWriteText(path, content, "auto")
	}
	return a.fileManager.WriteTextFile(path, content)
}

func (a *App) WriteTextFileWithEncoding(path string, content string, encName string) error {
	if isFTPPath(path) {
		return a.ftpWriteText(path, content, encName)
	}
	return a.fileManager.WriteTextFileWithEncoding(path, content, encName)
}

func (a *App) OpenFile(path string) error {
	if isFTPPath(path) {
		local, err := a.ftpOpenCopy(path)
		if err != nil {
			return err
		}
		path = local
	}
	return a.fileManager.OpenFile(path)
}

func (a *App) JoinPath(parts ...string) string {
	return a.fileManager.JoinPath(parts...)
}

func (a *App) GetParentPath(p string) string {
	if id, remote, ok := parseFTPPath(p); ok {
		return ftpPanelPath(id, path.Dir(remote))
	}
	return a.fileManager.GetParentPath(p)
}

func (a *App) SearchFiles(rootPath, pattern string, recursive bool) ([]FileInfo, error) {
	if isFTPPath(rootPath) {
		return nil, errFTPNotHere
	}
	return a.fileManager.SearchFiles(rootPath, pattern, recursive)
}

func (a *App) RunShellCommand(command, workDir string) (string, error) {
	if isFTPPath(workDir) {
		return "", errFTPNotHere
	}
	return a.fileManager.RunShellCommand(command, workDir)
}

func (a *App) OpenCmdWindow(workDir string) error {
	if isFTPPath(workDir) {
		return errFTPNotHere
	}
	return a.fileManager.OpenCmdWindow(workDir)
}

func (a *App) CompressItems(sources []string, destPath string) error {
	if anyFTP(append([]string{destPath}, sources...)...) {
		return errFTPNotHere
	}
	return a.fileManager.CompressItems(sources, destPath)
}

func (a *App) ExtractArchive(archivePath, destDir string) error {
	if anyFTP(archivePath, destDir) {
		return errFTPNotHere
	}
	return a.fileManager.ExtractArchive(archivePath, destDir)
}

func (a *App) RunStarlarkFile(path string) (string, error) {
	return a.fileManager.RunStarlarkFile(path)
}

// ─── FTP Manager API ─────────────────────────────────────────────────────────

func (a *App) FTPConnect(config FTPConfig) (string, error) {
	return a.ftpManager.Connect(config)
}

func (a *App) FTPDisconnect(id string) error {
	return a.ftpManager.Disconnect(id)
}

func (a *App) FTPListDirectory(id, path string) (*DirectoryListing, error) {
	return a.ftpManager.ListDirectory(id, path)
}

func (a *App) FTPDownload(id, remotePath, localPath string) error {
	return a.ftpManager.Download(id, remotePath, localPath)
}

func (a *App) FTPUpload(id, localPath, remotePath string) error {
	return a.ftpManager.Upload(id, localPath, remotePath)
}

func (a *App) FTPDeleteItem(id, path string, isDir bool) error {
	return a.ftpManager.DeleteItem(id, path, isDir)
}

func (a *App) FTPCreateDirectory(id, path string) error {
	return a.ftpManager.CreateDirectory(id, path)
}

func (a *App) FTPRenameItem(id, oldPath, newPath string) error {
	return a.ftpManager.RenameItem(id, oldPath, newPath)
}

func (a *App) FTPGetConnections() []FTPConnectionInfo {
	return a.ftpManager.GetConnections()
}

func (a *App) FTPSaveBookmark(bookmark FTPBookmark) error {
	return a.ftpManager.SaveBookmark(bookmark)
}

func (a *App) FTPGetBookmarks() []FTPBookmark {
	return a.ftpManager.GetBookmarks()
}

func (a *App) FTPDeleteBookmark(id string) error {
	return a.ftpManager.DeleteBookmark(id)
}

func (a *App) FTPGetHistory() []FTPHistory {
	return a.ftpManager.GetHistory()
}

func (a *App) FTPDeleteHistory(id string) error {
	return a.ftpManager.DeleteHistory(id)
}

func (a *App) FTPClearHistory() error {
	return a.ftpManager.ClearHistory()
}

func (a *App) FTPAddHistory(config FTPConfig) {
	a.ftpManager.AddHistory(config)
}

// ResolveRepoImage: 마크다운의 GitHub 이미지에 대응하는 로컬 저장소 파일(data URL), 없으면 "" (Todo #116)
func (a *App) ResolveRepoImage(markdownPath, owner, repo, relPath string) string {
	return a.fileManager.ResolveRepoImage(markdownPath, owner, repo, relPath)
}

// DirSize: 폴더 크기 (Space, Todo #133-1)
func (a *App) DirSize(path string) (DirSizeResult, error) {
	if id, remote, ok := parseFTPPath(path); ok {
		return a.ftpDirSize(id, remote)
	}
	return a.fileManager.DirSize(path)
}

// RenameBatch: 여러 이름 바꾸기 (Ctrl+M, Todo #133-4)
func (a *App) RenameBatch(pairs []RenamePair) error {
	for _, p := range pairs {
		if anyFTP(p.Old, p.New) {
			return errors.New("FTP 폴더에서는 여러 이름 바꾸기를 할 수 없습니다 (F2로 하나씩)")
		}
	}
	return a.fileManager.RenameBatch(pairs)
}

// CompareDirs / SyncDirs: 폴더 비교 · 동기화 (Alt+F2, Todo #133-6)
func (a *App) CompareDirs(left, right string, opts CompareOptions) ([]SyncItem, error) {
	if anyFTP(left, right) {
		return nil, errFTPNotHere
	}
	return a.fileManager.CompareDirs(left, right, opts)
}

func (a *App) SyncDirs(left, right string, actions []SyncAction) error {
	if anyFTP(left, right) {
		return errFTPNotHere
	}
	return a.fileManager.SyncDirs(left, right, actions)
}

// CompareFileBytes: 파일 내용 비교 (Ctrl+Shift+D, Todo #133-7)
func (a *App) CompareFileBytes(pathA, pathB string) (FileCompareResult, error) {
	// FTP 파일은 임시로 받아서 비교
	if isFTPPath(pathA) {
		var r FileCompareResult
		err := a.withFTPLocal(pathA, func(local string) (e error) { r, e = a.CompareFileBytes(local, pathB); return })
		return r, err
	}
	if isFTPPath(pathB) {
		var r FileCompareResult
		err := a.withFTPLocal(pathB, func(local string) (e error) { r, e = a.CompareFileBytes(pathA, local); return })
		return r, err
	}
	return a.fileManager.CompareFileBytes(pathA, pathB)
}

// ReadThumbnail: 썸네일 보기 (Ctrl+Shift+F1, Todo #133-11)
func (a *App) ReadThumbnail(p string, size int) (string, error) {
	if isFTPPath(p) {
		var s string
		err := a.withFTPLocal(p, func(local string) (e error) { s, e = a.fileManager.ReadThumbnail(local, size); return })
		return s, err
	}
	return a.fileManager.ReadThumbnail(p, size)
}

// ChangeMode / ChangeOwner / GetOwnerChoices: 권한 · 소유자 (Alt+A, Todo #137-2)
func (a *App) ChangeMode(paths []string, set, clear uint32, recursive bool) error {
	if anyFTP(paths...) {
		return errFTPNotHere
	}
	return a.fileManager.ChangeMode(paths, set, clear, recursive)
}

func (a *App) ChangeOwner(paths []string, owner, group string, recursive bool) error {
	if anyFTP(paths...) {
		return errFTPNotHere
	}
	return a.fileManager.ChangeOwner(paths, owner, group, recursive)
}

func (a *App) GetOwnerChoices() OwnerChoices {
	return a.fileManager.GetOwnerChoices()
}
