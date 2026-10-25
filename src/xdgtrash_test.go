package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Todo #137-1: 리눅스 휴지통 — freedesktop.org Trash 규격 (files/ + info/*.trashinfo)

// 테스트용 장치: mnt 아래는 장치 2, 그 밖은 장치 1
func fakeTrash(t *testing.T) (xdgTrash, string, string) {
	t.Helper()
	base := t.TempDir()
	mnt := filepath.Join(base, "mnt")
	os.MkdirAll(mnt, 0755)
	tr := xdgTrash{
		home: filepath.Join(base, "home", ".local", "share", "Trash"),
		uid:  1000,
		now:  func() time.Time { return time.Date(2026, 10, 26, 9, 5, 7, 0, time.Local) },
		device: func(p string) (uint64, error) {
			if _, err := os.Lstat(p); err != nil {
				return 0, err
			}
			if p == mnt || strings.HasPrefix(p, mnt+string(filepath.Separator)) {
				return 2, nil
			}
			return 1, nil
		},
		sticky: func(fi os.FileInfo) bool { return fi.Mode()&os.ModeSticky != 0 },
	}
	return tr, base, mnt
}

func readInfo(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return strings.ReplaceAll(string(b), "\r\n", "\n")
}

func TestXDGTrash_HomeTrash(t *testing.T) {
	tr, base, _ := fakeTrash(t)
	data := filepath.Join(base, "data")
	os.MkdirAll(filepath.Join(data, "sub dir"), 0755)
	file := filepath.Join(data, "sub dir", "a b%.txt")
	os.WriteFile(file, []byte("x"), 0644)
	if err := tr.trash(file); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(file); !os.IsNotExist(err) {
		t.Fatal("source must be gone")
	}
	if b, _ := os.ReadFile(filepath.Join(tr.home, "files", "a b%.txt")); string(b) != "x" {
		t.Fatal("file must be in Trash/files")
	}
	info := readInfo(t, filepath.Join(tr.home, "info", "a b%.txt.trashinfo"))
	want := "[Trash Info]\nPath=" + trashURLPath(file) + "\nDeletionDate=2026-10-26T09:05:07\n"
	if info != want {
		t.Fatalf("trashinfo =\n%q\nwant\n%q", info, want)
	}
	if !strings.Contains(trashURLPath(file), "a%20b%25.txt") || !strings.Contains(trashURLPath(file), "/sub%20dir/") {
		t.Errorf("Path must be URL-escaped with / kept: %s", trashURLPath(file))
	}
	// 폴더도 통째로
	dir := filepath.Join(data, "sub dir")
	if err := tr.trash(dir); err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Stat(filepath.Join(tr.home, "files", "sub dir")); err != nil || !fi.IsDir() {
		t.Fatal("folder must be in Trash/files")
	}
}

func TestXDGTrash_NameClash(t *testing.T) {
	tr, base, _ := fakeTrash(t)
	for i := 0; i < 3; i++ {
		p := filepath.Join(base, "a.txt")
		os.WriteFile(p, []byte{byte('0' + i)}, 0644)
		if err := tr.trash(p); err != nil {
			t.Fatal(err)
		}
	}
	for name, body := range map[string]string{"a.txt": "0", "a.2.txt": "1", "a.3.txt": "2"} {
		if b, _ := os.ReadFile(filepath.Join(tr.home, "files", name)); string(b) != body {
			t.Errorf("%s = %q, want %q", name, b, body)
		}
		if _, err := os.Stat(filepath.Join(tr.home, "info", name+".trashinfo")); err != nil {
			t.Errorf("%s.trashinfo missing", name)
		}
	}
	// files/에만 남은 찌꺼기(info 없음)도 피함
	os.WriteFile(filepath.Join(tr.home, "files", "b"), nil, 0644)
	p := filepath.Join(base, "b")
	os.WriteFile(p, []byte("new"), 0644)
	if err := tr.trash(p); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(tr.home, "files", "b.2")); string(b) != "new" {
		t.Error("stale files/b must not be overwritten")
	}
}

func TestXDGTrash_OtherDeviceUsesTopDirTrash(t *testing.T) {
	tr, _, mnt := fakeTrash(t)
	os.MkdirAll(filepath.Join(mnt, "docs"), 0755)
	p := filepath.Join(mnt, "docs", "r.txt")
	os.WriteFile(p, []byte("usb"), 0644)
	// 일반(sticky 아님) .Trash는 쓰면 안 됨 → .Trash-1000
	os.MkdirAll(filepath.Join(mnt, ".Trash"), 0755)
	if err := tr.trash(p); err != nil {
		t.Fatal(err)
	}
	top := filepath.Join(mnt, ".Trash-1000")
	if b, _ := os.ReadFile(filepath.Join(top, "files", "r.txt")); string(b) != "usb" {
		t.Fatal("file must go to $topdir/.Trash-$uid on another device")
	}
	if info := readInfo(t, filepath.Join(top, "info", "r.txt.trashinfo")); !strings.Contains(info, "\nPath=docs/r.txt\n") {
		t.Errorf("top-dir trash Path must be relative to the mount: %q", info)
	}
	if _, err := os.Stat(filepath.Join(tr.home, "files", "r.txt")); err == nil {
		t.Error("must not copy across devices into the home trash")
	}
	// sticky .Trash가 있으면 .Trash/$uid
	tr.sticky = func(fi os.FileInfo) bool { return fi.Name() == ".Trash" }
	q := filepath.Join(mnt, "q.txt")
	os.WriteFile(q, []byte("q"), 0644)
	if err := tr.trash(q); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(mnt, ".Trash", "1000", "files", "q.txt")); string(b) != "q" {
		t.Fatal("sticky $topdir/.Trash must be used as .Trash/$uid")
	}
}

func TestXDGTrash_Failures(t *testing.T) {
	tr, base, _ := fakeTrash(t)
	if err := tr.trash(filepath.Join(base, "nope")); err == nil {
		t.Error("missing file must fail")
	}
	// 휴지통 자체(또는 그 안)는 휴지통으로 보내지 않음
	os.MkdirAll(filepath.Join(tr.home, "files"), 0700)
	if err := tr.trash(tr.home); err == nil {
		t.Error("trashing the trash must fail")
	}
	// 옮기기가 실패하면 info를 남기지 않음
	p := filepath.Join(base, "c.txt")
	os.WriteFile(p, nil, 0644)
	tr.rename = func(string, string) error { return os.ErrPermission }
	if err := tr.trash(p); err == nil {
		t.Fatal("rename failure must be reported")
	}
	if _, err := os.Stat(filepath.Join(tr.home, "info", "c.txt.trashinfo")); err == nil {
		t.Error("trashinfo must be removed when the move fails")
	}
	if _, err := os.Stat(p); err != nil {
		t.Error("source must stay when the move fails")
	}
}
