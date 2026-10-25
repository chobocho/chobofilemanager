//go:build linux

package main

import (
	"net"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Todo #137-3: 특수 파일 · 심볼릭 링크를 안전하게 복사 (mc와 같게)
// FIFO · 장치 파일을 읽어서 복사하면 멈추거나(FIFO) 끝나지 않음(/dev/zero) — 시간 제한으로 잡음

func within(t *testing.T, d time.Duration, f func() error) error {
	t.Helper()
	done := make(chan error, 1)
	go func() { done <- f() }()
	select {
	case err := <-done:
		return err
	case <-time.After(d):
		t.Fatal("copy hung (reading a special file?)")
		return nil
	}
}

func TestCopy_FifoIsRecreatedNotRead(t *testing.T) {
	src := filepath.Join(t.TempDir(), "proj")
	os.MkdirAll(src, 0755)
	if err := syscall.Mkfifo(filepath.Join(src, "pipe"), 0640); err != nil {
		t.Skip(err)
	}
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("a"), 0644)
	dest := t.TempDir()
	if err := within(t, 5*time.Second, func() error { return newTestFM().CopyItems([]string{src}, dest) }); err != nil {
		t.Fatal(err)
	}
	fi, err := os.Lstat(filepath.Join(dest, "proj", "pipe"))
	if err != nil || fi.Mode()&os.ModeNamedPipe == 0 || fi.Mode().Perm() != 0640 {
		t.Fatalf("pipe must be recreated as a FIFO 0640: %v %v", fi, err)
	}
	// 고른 항목 자체가 FIFO
	dest2 := t.TempDir()
	if err := within(t, 5*time.Second, func() error {
		return newTestFM().CopyItems([]string{filepath.Join(src, "pipe")}, dest2)
	}); err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Lstat(filepath.Join(dest2, "pipe")); err != nil || fi.Mode()&os.ModeNamedPipe == 0 {
		t.Fatal("selected FIFO must be recreated")
	}
}

func TestCopy_DeviceIsNotReadForever(t *testing.T) {
	dest := t.TempDir()
	err := within(t, 5*time.Second, func() error { return newTestFM().CopyItems([]string{"/dev/zero"}, dest) })
	if os.Geteuid() == 0 {
		return // root는 mknod로 장치 파일을 만들 수 있음
	}
	if err == nil || !strings.Contains(err.Error(), "zero") {
		t.Fatalf("device copy must be refused with the name, got %v", err)
	}
	if fi, err := os.Lstat(filepath.Join(dest, "zero")); err == nil && fi.Mode().IsRegular() {
		t.Fatal("must not create a regular file from a device")
	}
}

func TestCopy_SocketSkippedOthersCopied(t *testing.T) {
	// 유닉스 소켓 경로는 짧아야 함 (108바이트)
	base, err := os.MkdirTemp("", "s")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(base)
	src := filepath.Join(base, "p")
	os.MkdirAll(src, 0755)
	l, err := net.Listen("unix", filepath.Join(src, "s.sock"))
	if err != nil {
		t.Skip(err)
	}
	defer l.Close()
	os.WriteFile(filepath.Join(src, "b.txt"), []byte("b"), 0644)
	dest := t.TempDir()
	err = within(t, 5*time.Second, func() error { return newTestFM().CopyItems([]string{src}, dest) })
	if err == nil || !strings.Contains(err.Error(), "s.sock") {
		t.Fatalf("skipped socket must be reported, got %v", err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "p", "b.txt")); string(b) != "b" {
		t.Error("other files must still be copied")
	}
}

func TestCopy_SymlinksStayLinks(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "proj")
	os.MkdirAll(filepath.Join(src, "lib"), 0755)
	os.WriteFile(filepath.Join(src, "lib", "real.txt"), []byte("r"), 0644)
	os.Symlink("lib/real.txt", filepath.Join(src, "rel"))   // 상대 링크
	os.Symlink("/", filepath.Join(src, "root"))             // 루트를 가리킴 — 따라가면 디스크 전체 복사
	os.Symlink("missing.txt", filepath.Join(src, "broken")) // 끊어진 링크
	dest := t.TempDir()
	if err := within(t, 10*time.Second, func() error { return newTestFM().CopyItems([]string{src}, dest) }); err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]string{"rel": "lib/real.txt", "root": "/", "broken": "missing.txt"} {
		got, err := os.Readlink(filepath.Join(dest, "proj", name))
		if err != nil || got != target {
			t.Errorf("%s: must be copied as a link to %q, got %q %v", name, target, got, err)
		}
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "proj", "rel")); string(b) != "r" {
		t.Error("relative link must still resolve inside the copy")
	}
	// 고른 항목 자체가 링크: 링크로 복사, 같은 이름이 있으면 덮어쓰기
	dest2 := t.TempDir()
	os.WriteFile(filepath.Join(dest2, "rel"), []byte("old"), 0644)
	if err := newTestFM().CopyItems([]string{filepath.Join(src, "rel")}, dest2); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.Readlink(filepath.Join(dest2, "rel")); got != "lib/real.txt" {
		t.Errorf("selected link must be copied as a link, got %q", got)
	}
	// 이름 바꾸기 모드
	if err := newTestFM().CopyItemsRename([]string{filepath.Join(src, "root")}, dest2); err != nil {
		t.Fatal(err)
	}
	if err := newTestFM().CopyItemsRename([]string{filepath.Join(src, "root")}, dest2); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.Readlink(filepath.Join(dest2, "root (1)")); got != "/" {
		t.Errorf("rename mode must copy the link under a new name, got %q", got)
	}
}

func TestCopy_KeepsFolderModes(t *testing.T) {
	src := filepath.Join(t.TempDir(), "ro")
	os.MkdirAll(filepath.Join(src, "private"), 0755)
	os.WriteFile(filepath.Join(src, "private", "k"), []byte("k"), 0600)
	os.Chmod(filepath.Join(src, "private"), 0700)
	os.Chmod(src, 0555) // 읽기 전용 폴더: 안을 다 채운 뒤에 권한을 맞춰야 함
	defer os.Chmod(src, 0755)
	dest := t.TempDir()
	if err := newTestFM().CopyItems([]string{src}, dest); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(filepath.Join(dest, "ro"), 0755)
	for p, want := range map[string]os.FileMode{"ro": 0555, "ro/private": 0700} {
		if fi, err := os.Stat(filepath.Join(dest, p)); err != nil || fi.Mode().Perm() != want {
			t.Errorf("%s mode = %v, want %v (%v)", p, fi.Mode().Perm(), want, err)
		}
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "ro", "private", "k")); string(b) != "k" {
		t.Error("contents of a read-only folder must be copied")
	}
}

// 폴더 동기화(Alt+F2)도 같은 규칙
func TestSyncDirs_SpecialFilesAndLinks(t *testing.T) {
	left, right := t.TempDir(), t.TempDir()
	if err := syscall.Mkfifo(filepath.Join(left, "pipe"), 0600); err != nil {
		t.Skip(err)
	}
	os.Symlink("/", filepath.Join(left, "root"))
	fm := newTestFM()
	err := within(t, 5*time.Second, func() error {
		return fm.SyncDirs(left, right, []SyncAction{{Rel: "pipe", To: "right"}, {Rel: "root", To: "right"}})
	})
	if err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Lstat(filepath.Join(right, "pipe")); err != nil || fi.Mode()&os.ModeNamedPipe == 0 {
		t.Error("sync must recreate the FIFO")
	}
	if got, _ := os.Readlink(filepath.Join(right, "root")); got != "/" {
		t.Errorf("sync must copy the link as a link, got %q", got)
	}
}

// 진짜 리눅스 휴지통 (Todo #137-1): XDG_DATA_HOME 아래로
func TestTrashItems_LinuxXDG(t *testing.T) {
	data := t.TempDir()
	t.Setenv("XDG_DATA_HOME", data)
	p := filepath.Join(data, "x.txt")
	os.WriteFile(p, []byte("x"), 0644)
	if err := newTestFM().TrashItems([]string{p}); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(data, "Trash", "files", "x.txt")); string(b) != "x" {
		t.Fatal("file must be in $XDG_DATA_HOME/Trash/files")
	}
	info, _ := os.ReadFile(filepath.Join(data, "Trash", "info", "x.txt.trashinfo"))
	if !strings.Contains(string(info), "Path="+p+"\n") {
		t.Errorf("trashinfo = %q", info)
	}
}

// 덮어쓸 대상이 링크면 링크가 가리키는 다른 파일에 쓰지 않음 (Todo #137-3)
func TestCopy_OverwriteDoesNotWriteThroughLink(t *testing.T) {
	base := t.TempDir()
	victim := filepath.Join(base, "victim.txt")
	os.WriteFile(victim, []byte("keep"), 0644)
	src := filepath.Join(base, "src")
	os.MkdirAll(src, 0755)
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("new"), 0644)
	dest := filepath.Join(base, "dest")
	os.MkdirAll(dest, 0755)
	os.Symlink(victim, filepath.Join(dest, "a.txt"))
	if err := newTestFM().CopyItems([]string{filepath.Join(src, "a.txt")}, dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(victim); string(b) != "keep" {
		t.Fatalf("overwrite wrote through the link: victim = %q", b)
	}
	if fi, err := os.Lstat(filepath.Join(dest, "a.txt")); err != nil || !fi.Mode().IsRegular() {
		t.Fatal("link must be replaced by the copied file")
	}
}
