package main

import (
	"context"
)

type App struct {
	ctx         context.Context
	fileManager *FileManager
	ftpManager  *FTPManager
	configDir   string // 빈 문자열이면 기본값(~/.chobocho-commander) 사용; 테스트에서 격리된 임시 디렉토리 주입용
}

func NewApp() *App {
	return &App{
		fileManager: NewFileManager(),
		ftpManager:  NewFTPManager(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.fileManager.ctx = ctx
	a.ftpManager.ctx = ctx
}

// ─── File Manager API ────────────────────────────────────────────────────────

func (a *App) ListDirectory(path string) (*DirectoryListing, error) {
	return a.fileManager.ListDirectory(path)
}

func (a *App) GetHomeDirectory() string {
	return a.fileManager.GetHomeDirectory()
}

func (a *App) GetDrives() []DriveInfo {
	return a.fileManager.GetDrives()
}

func (a *App) CheckCopyConflicts(sources []string, destination string) []CopyConflict {
	return a.fileManager.CheckCopyConflicts(sources, destination)
}

func (a *App) CopyItems(sources []string, destination string) error {
	return a.fileManager.CopyItems(sources, destination)
}

func (a *App) CopyItemsRename(sources []string, destination string) error {
	return a.fileManager.CopyItemsRename(sources, destination)
}

func (a *App) CopyItemsSkipConflicts(sources []string, destination string) error {
	return a.fileManager.CopyItemsSkipConflicts(sources, destination)
}

func (a *App) MoveItems(sources []string, destination string) error {
	return a.fileManager.MoveItems(sources, destination)
}

func (a *App) MoveItemsOverwrite(sources []string, destination string) error {
	return a.fileManager.MoveItemsOverwrite(sources, destination)
}

func (a *App) MoveItemsRename(sources []string, destination string) error {
	return a.fileManager.MoveItemsRename(sources, destination)
}

func (a *App) DeleteItems(paths []string) error {
	return a.fileManager.DeleteItems(paths)
}

func (a *App) CreateDirectory(path string) error {
	return a.fileManager.CreateDirectory(path)
}

func (a *App) CreateFile(path string) error {
	return a.fileManager.CreateFile(path)
}

func (a *App) RenameItem(oldPath, newPath string) error {
	return a.fileManager.RenameItem(oldPath, newPath)
}

func (a *App) GetFileInfo(path string) (*FileInfo, error) {
	return a.fileManager.GetFileInfo(path)
}

func (a *App) ReadTextFile(path string) (string, error) {
	return a.fileManager.ReadTextFile(path)
}

func (a *App) ReadTextFileWithEncoding(path string, encName string) (string, error) {
	return a.fileManager.ReadTextFileWithEncoding(path, encName)
}

func (a *App) WriteTextFile(path string, content string) error {
	return a.fileManager.WriteTextFile(path, content)
}

func (a *App) OpenFile(path string) error {
	return a.fileManager.OpenFile(path)
}

func (a *App) GetPathParts(path string) []PathPart {
	return a.fileManager.GetPathParts(path)
}

func (a *App) JoinPath(parts ...string) string {
	return a.fileManager.JoinPath(parts...)
}

func (a *App) GetParentPath(path string) string {
	return a.fileManager.GetParentPath(path)
}

func (a *App) ChangeWorkingDirectory(path string) error {
	return a.fileManager.ChangeWorkingDirectory(path)
}

func (a *App) SearchFiles(rootPath, pattern string, recursive bool) ([]FileInfo, error) {
	return a.fileManager.SearchFiles(rootPath, pattern, recursive)
}

func (a *App) RunShellCommand(command, workDir string) (string, error) {
	return a.fileManager.RunShellCommand(command, workDir)
}

func (a *App) OpenCmdWindow(workDir string) error {
	return a.fileManager.OpenCmdWindow(workDir)
}

func (a *App) GetFileSize(path string) (int64, error) {
	return a.fileManager.GetFileSize(path)
}

func (a *App) CompressItems(sources []string, destPath string) error {
	return a.fileManager.CompressItems(sources, destPath)
}

func (a *App) ExtractArchive(archivePath, destDir string) error {
	return a.fileManager.ExtractArchive(archivePath, destDir)
}

func (a *App) RunStarlarkFile(path string) (string, error) {
	return a.fileManager.RunStarlarkFile(path)
}

// ─── FTP Manager API ─────────────────────────────────────────────────────────

func (a *App) FTPConnect(config FTPConfig) error {
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

func (a *App) FTPDeleteItem(id, path string) error {
	return a.ftpManager.DeleteItem(id, path)
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
