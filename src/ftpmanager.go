package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jlaffaye/ftp"
)

type FTPConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	UseTLS   bool   `json:"useTls"`
	Passive  bool   `json:"passive"`
}

type FTPBookmark struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Config  FTPConfig `json:"config"`
	Created time.Time `json:"created"`
}

type FTPConnectionInfo struct {
	ID          string    `json:"id"`
	Host        string    `json:"host"`
	Port        int       `json:"port"`
	Username    string    `json:"username"`
	Connected   bool      `json:"connected"`
	ConnectedAt time.Time `json:"connectedAt"`
}

type ftpConnection struct {
	id          string
	client      *ftp.ServerConn
	config      FTPConfig
	connectedAt time.Time
}

type FTPHistory struct {
	ID            string    `json:"id"`
	Host          string    `json:"host"`
	Port          int       `json:"port"`
	Username      string    `json:"username"`
	LastConnected time.Time `json:"lastConnected"`
	ConnectCount  int       `json:"connectCount"`
}

type FTPManager struct {
	ctx          context.Context
	mu           sync.RWMutex
	connections  map[string]*ftpConnection
	bookmarks    []FTPBookmark
	bookmarkFile string
	history      []FTPHistory
	historyFile  string
}

func NewFTPManager() *FTPManager {
	fm := &FTPManager{
		connections: make(map[string]*ftpConnection),
	}

	// Set bookmark/history file paths
	homeDir, err := os.UserHomeDir()
	if err == nil {
		configDir := filepath.Join(homeDir, ".chobocho-commander")
		os.MkdirAll(configDir, 0755)
		fm.bookmarkFile = filepath.Join(configDir, "ftp_bookmarks.json")
		fm.historyFile = filepath.Join(configDir, "ftp_history.json")
		fm.loadBookmarks()
		fm.loadHistory()
	}

	return fm
}

func (fm *FTPManager) Connect(config FTPConfig) error {
	if config.Port == 0 {
		config.Port = 21
	}

	addr := fmt.Sprintf("%s:%d", config.Host, config.Port)
	opts := []ftp.DialOption{
		ftp.DialWithTimeout(30 * time.Second),
	}

	client, err := ftp.Dial(addr, opts...)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}

	username := config.Username
	password := config.Password
	if username == "" {
		username = "anonymous"
		password = "anonymous@"
	}

	if err := client.Login(username, password); err != nil {
		client.Quit()
		return fmt.Errorf("login failed: %w", err)
	}

	id := fmt.Sprintf("%s_%d_%d", config.Host, config.Port, time.Now().UnixNano())

	fm.mu.Lock()
	fm.connections[id] = &ftpConnection{
		id:          id,
		client:      client,
		config:      config,
		connectedAt: time.Now(),
	}
	fm.mu.Unlock()

	return nil
}

func (fm *FTPManager) Disconnect(id string) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	conn, ok := fm.connections[id]
	if !ok {
		return fmt.Errorf("connection not found: %s", id)
	}

	err := conn.client.Quit()
	delete(fm.connections, id)
	return err
}

func (fm *FTPManager) getConn(id string) (*ftpConnection, error) {
	fm.mu.RLock()
	defer fm.mu.RUnlock()
	conn, ok := fm.connections[id]
	if !ok {
		return nil, fmt.Errorf("FTP connection not found: %s", id)
	}
	return conn, nil
}

func (fm *FTPManager) ListDirectory(id, path string) (*DirectoryListing, error) {
	conn, err := fm.getConn(id)
	if err != nil {
		return nil, err
	}

	if path == "" {
		path = "/"
	}

	entries, err := conn.client.List(path)
	if err != nil {
		return nil, fmt.Errorf("list failed: %w", err)
	}

	var files []FileInfo
	for _, entry := range entries {
		if entry.Name == "." || entry.Name == ".." {
			continue
		}

		fullPath := path
		if !strings.HasSuffix(fullPath, "/") {
			fullPath += "/"
		}
		fullPath += entry.Name

		fi := FileInfo{
			Name:      entry.Name,
			Path:      fullPath,
			Size:      int64(entry.Size),
			IsDir:     entry.Type == ftp.EntryTypeFolder,
			IsHidden:  strings.HasPrefix(entry.Name, "."),
			Modified:  entry.Time,
			Extension: strings.ToLower(filepath.Ext(entry.Name)),
		}
		files = append(files, fi)
	}

	return &DirectoryListing{
		Path:  path,
		Files: files,
	}, nil
}

func (fm *FTPManager) Download(id, remotePath, localPath string) error {
	conn, err := fm.getConn(id)
	if err != nil {
		return err
	}

	r, err := conn.client.Retr(remotePath)
	if err != nil {
		return fmt.Errorf("retrieve failed: %w", err)
	}
	defer r.Close()

	// If localPath is a directory, use remote filename
	localInfo, err := os.Stat(localPath)
	if err == nil && localInfo.IsDir() {
		localPath = filepath.Join(localPath, filepath.Base(remotePath))
	}

	out, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("create local file failed: %w", err)
	}
	defer out.Close()

	_, err = io.Copy(out, r)
	return err
}

func (fm *FTPManager) Upload(id, localPath, remotePath string) error {
	conn, err := fm.getConn(id)
	if err != nil {
		return err
	}

	f, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("open local file failed: %w", err)
	}
	defer f.Close()

	// If remotePath ends with /, append filename
	if strings.HasSuffix(remotePath, "/") {
		remotePath += filepath.Base(localPath)
	}

	return conn.client.Stor(remotePath, f)
}

func (fm *FTPManager) DeleteItem(id, path string) error {
	conn, err := fm.getConn(id)
	if err != nil {
		return err
	}

	// Try as file first, then as directory
	if err := conn.client.Delete(path); err != nil {
		return conn.client.RemoveDirRecur(path)
	}
	return nil
}

func (fm *FTPManager) CreateDirectory(id, path string) error {
	conn, err := fm.getConn(id)
	if err != nil {
		return err
	}
	return conn.client.MakeDir(path)
}

func (fm *FTPManager) RenameItem(id, oldPath, newPath string) error {
	conn, err := fm.getConn(id)
	if err != nil {
		return err
	}
	return conn.client.Rename(oldPath, newPath)
}

func (fm *FTPManager) GetConnections() []FTPConnectionInfo {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	var list []FTPConnectionInfo
	for _, conn := range fm.connections {
		list = append(list, FTPConnectionInfo{
			ID:          conn.id,
			Host:        conn.config.Host,
			Port:        conn.config.Port,
			Username:    conn.config.Username,
			Connected:   true,
			ConnectedAt: conn.connectedAt,
		})
	}
	return list
}

func (fm *FTPManager) SaveBookmark(bookmark FTPBookmark) error {
	if bookmark.ID == "" {
		bookmark.ID = fmt.Sprintf("bm_%d", time.Now().UnixNano())
	}
	bookmark.Created = time.Now()

	// Update existing or append
	updated := false
	for i, bm := range fm.bookmarks {
		if bm.ID == bookmark.ID {
			fm.bookmarks[i] = bookmark
			updated = true
			break
		}
	}
	if !updated {
		fm.bookmarks = append(fm.bookmarks, bookmark)
	}

	return fm.saveBookmarks()
}

func (fm *FTPManager) GetBookmarks() []FTPBookmark {
	return fm.bookmarks
}

func (fm *FTPManager) DeleteBookmark(id string) error {
	for i, bm := range fm.bookmarks {
		if bm.ID == id {
			fm.bookmarks = append(fm.bookmarks[:i], fm.bookmarks[i+1:]...)
			return fm.saveBookmarks()
		}
	}
	return nil
}

// ─── History ──────────────────────────────────────────────────────────────────

func historyID(config FTPConfig) string {
	u := config.Username
	if u == "" {
		u = "anonymous"
	}
	return fmt.Sprintf("%s:%d:%s", config.Host, config.Port, u)
}

func (fm *FTPManager) AddHistory(config FTPConfig) {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	id := historyID(config)
	for i, h := range fm.history {
		if h.ID == id {
			fm.history[i].LastConnected = time.Now()
			fm.history[i].ConnectCount++
			fm.saveHistory()
			return
		}
	}
	u := config.Username
	if u == "" {
		u = "anonymous"
	}
	fm.history = append([]FTPHistory{{
		ID:            id,
		Host:          config.Host,
		Port:          config.Port,
		Username:      u,
		LastConnected: time.Now(),
		ConnectCount:  1,
	}}, fm.history...)
	// 최대 50개 유지
	if len(fm.history) > 50 {
		fm.history = fm.history[:50]
	}
	fm.saveHistory()
}

func (fm *FTPManager) GetHistory() []FTPHistory {
	fm.mu.RLock()
	defer fm.mu.RUnlock()
	result := make([]FTPHistory, len(fm.history))
	copy(result, fm.history)
	return result
}

func (fm *FTPManager) DeleteHistory(id string) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	for i, h := range fm.history {
		if h.ID == id {
			fm.history = append(fm.history[:i], fm.history[i+1:]...)
			return fm.saveHistory()
		}
	}
	return nil
}

func (fm *FTPManager) ClearHistory() error {
	fm.mu.Lock()
	defer fm.mu.Unlock()
	fm.history = nil
	return fm.saveHistory()
}

func (fm *FTPManager) loadHistory() {
	data, err := os.ReadFile(fm.historyFile)
	if err != nil {
		return
	}
	json.Unmarshal(data, &fm.history)
}

func (fm *FTPManager) saveHistory() error {
	data, err := json.MarshalIndent(fm.history, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(fm.historyFile, data, 0644)
}

func (fm *FTPManager) loadBookmarks() {
	data, err := os.ReadFile(fm.bookmarkFile)
	if err != nil {
		return
	}
	json.Unmarshal(data, &fm.bookmarks)
}

func (fm *FTPManager) saveBookmarks() error {
	data, err := json.MarshalIndent(fm.bookmarks, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(fm.bookmarkFile, data, 0644)
}
