package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ─── Todo #84: 다운로드 실패를 성공으로 보고하지 않음 ──────────────────────────

func connectFake(t *testing.T, srv *fakeFTPServer) (*FTPManager, string) {
	t.Helper()
	fm := newTestFTPManager(t)
	id, err := fm.Connect(srv.config())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { fm.Disconnect(id) })
	return fm, id
}

func TestFTPDownload_Success(t *testing.T) {
	srv := startFakeFTP(t)
	srv.files = map[string][]byte{"/dir/a.txt": []byte("hello")}
	fm, id := connectFake(t, srv)
	dir := t.TempDir()
	if err := fm.Download(id, "/dir/a.txt", dir); err != nil {
		t.Fatalf("Download: %v", err)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(data) != "hello" {
		t.Errorf("content = %q", data)
	}
	assertNoTempLeft(t, dir)
}

func TestFTPDownload_AbortedTransferIsError(t *testing.T) {
	srv := startFakeFTP(t)
	srv.files = map[string][]byte{"/a.txt": []byte("trunc")}
	srv.retrFinal = "426 Connection closed; transfer aborted"
	fm, id := connectFake(t, srv)
	dir := t.TempDir()
	if err := fm.Download(id, "/a.txt", dir); err == nil {
		t.Error("426 after data must be reported as an error")
	}
	if _, err := os.Stat(filepath.Join(dir, "a.txt")); !os.IsNotExist(err) {
		t.Error("truncated file must not be left as the target")
	}
	assertNoTempLeft(t, dir)
}

func TestFTPDownload_FailureKeepsExistingLocalFile(t *testing.T) {
	srv := startFakeFTP(t)
	srv.files = map[string][]byte{"/a.txt": []byte("new")}
	srv.retrFinal = "426 aborted"
	fm, id := connectFake(t, srv)
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("original"), 0644)
	fm.Download(id, "/a.txt", dir)
	if data, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(data) != "original" {
		t.Errorf("existing local file must survive a failed download, got %q", data)
	}
}

func TestFTPDownload_MissingRemoteKeepsExistingLocalFile(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("original"), 0644)
	if err := fm.Download(id, "/a.txt", dir); err == nil {
		t.Error("missing remote file should fail")
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(data) != "original" {
		t.Errorf("existing file must survive, got %q", data)
	}
}

func TestFTPDownload_UnsafeRemoteNameRejected(t *testing.T) {
	srv := startFakeFTP(t)
	srv.files = map[string][]byte{`/C:x`: []byte("x"), `/a\b`: []byte("x")}
	fm, id := connectFake(t, srv)
	dir := t.TempDir()
	for _, remote := range []string{`/C:x`, `/a\b`} {
		if err := fm.Download(id, remote, dir); err == nil {
			t.Errorf("remote name %q should be rejected for local save", remote)
		}
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 0 {
		t.Errorf("nothing should be written, got %d entries", len(entries))
	}
}

func assertNoTempLeft(t *testing.T, dir string) {
	t.Helper()
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), ".part") {
			t.Errorf("temp file left: %s", e.Name())
		}
	}
}
