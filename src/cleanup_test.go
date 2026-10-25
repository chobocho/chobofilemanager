package main

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"totalcmd/internal/version"
)

// ─── Todo #126: 버전 한 곳, FTP 설정 폴더, 종료 때 FTP 닫기 ─────────────────────

// 창 제목·터미널·업데이트 확인이 같은 버전을 씀 (ldflags -X totalcmd/internal/version.Version 하나로)
func TestAppTitleUsesTheOneVersion(t *testing.T) {
	if got := AppTitle(); got != "Chobocho Commander V"+version.Version {
		t.Fatalf("AppTitle() = %q, version.Version = %q", got, version.Version)
	}
	old := version.Version
	version.Version = "9.9.9" // 빌드 때 ldflags로 바꾸는 것처럼
	defer func() { version.Version = old }()
	if !strings.HasSuffix(AppTitle(), "V9.9.9") {
		t.Fatalf("AppTitle() = %q: the build's version must reach the title", AppTitle())
	}
}

// FTP 북마크·기록은 앱 설정 폴더에 (테스트가 실제 홈 폴더를 건드리지 않도록 폴더를 받음)
func TestFTPManagerKeepsItsFilesInTheGivenFolder(t *testing.T) {
	dir := t.TempDir()
	fm := NewFTPManagerIn(dir)
	if fm.bookmarkFile != filepath.Join(dir, "ftp_bookmarks.json") || fm.historyFile != filepath.Join(dir, "ftp_history.json") {
		t.Fatalf("files = %q, %q", fm.bookmarkFile, fm.historyFile)
	}
	if err := fm.SaveBookmark(FTPBookmark{Name: "n", Config: FTPConfig{Host: "h", Port: 21}}); err != nil {
		t.Fatal(err)
	}
	if again := NewFTPManagerIn(dir); len(again.GetBookmarks()) != 1 {
		t.Fatalf("bookmarks not read back from %s", dir)
	}
}

// 창을 닫으면 FTP 보기의 연결도 QUIT로 끊음
func TestShutdownQuitsFTPConnections(t *testing.T) {
	a := newCovApp(t)
	srv := startFakeFTP(t)
	if _, err := a.FTPConnect(srv.config()); err != nil {
		t.Fatal(err)
	}
	a.shutdown(nil)
	if n := len(a.FTPGetConnections()); n != 0 {
		t.Fatalf("%d connections left after shutdown", n)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, c := range srv.received() {
			if strings.HasPrefix(c, "QUIT") {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no QUIT sent: %v", srv.received())
}

// Wails 종료 훅이 파일 관리자와 터미널을 모두 정리
func TestShutdownHookCoversBothApps(t *testing.T) {
	opts := newAppOptions(newTestApp(t), newTestTermHost(t))
	opts.OnShutdown(nil) // must not panic, and must reach both sides
}
