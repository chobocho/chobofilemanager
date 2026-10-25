package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Todo #136-2: 실행 권한(+x)이 있는 일반 파일 — 리눅스에서 Enter로 실행 (mc처럼)
func TestExecMode(t *testing.T) {
	cases := []struct {
		mode fs.FileMode
		want bool
	}{
		{0755, true}, {0700, true}, {0010, true}, {0001, true},
		{0644, false}, {0600, false},
		{fs.ModeDir | 0755, false},
		{fs.ModeNamedPipe | 0755, false},
		{fs.ModeSymlink | 0777, false}, // 링크 자체가 아니라 대상으로 판단
	}
	for _, c := range cases {
		if got := execMode(c.mode); got != c.want {
			t.Errorf("execMode(%v) = %v, want %v", c.mode, got, c.want)
		}
	}
}

func TestListDirectory_Executable(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "run.sh"), []byte("#!/bin/sh\necho hi\n"), 0755)
	os.WriteFile(filepath.Join(dir, "note.txt"), []byte("x"), 0644)
	os.Mkdir(filepath.Join(dir, "bin"), 0755)
	os.Symlink("run.sh", filepath.Join(dir, "link"))
	l, err := newTestFM().ListDirectory(dir)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, f := range l.Files {
		got[f.Name] = f.Executable
	}
	if runtime.GOOS == "windows" {
		for n, x := range got {
			if x {
				t.Errorf("%s: Windows has no execute bit — must be false", n)
			}
		}
		return
	}
	want := map[string]bool{"run.sh": true, "note.txt": false, "bin": false, "link": true}
	for n, w := range want {
		if got[n] != w {
			t.Errorf("%s executable = %v, want %v", n, got[n], w)
		}
	}
	if fi, err := newTestFM().GetFileInfo(filepath.Join(dir, "run.sh")); err != nil || !fi.Executable {
		t.Errorf("GetFileInfo run.sh executable = %v %v", fi, err)
	}
}
