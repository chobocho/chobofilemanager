package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// ─── Todo #72: 파일 열기 시 cmd 셸을 거치지 않음 ──────────────────────────────

func TestOpenFile_WindowsPassesPathVerbatim(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows only")
	}
	base := t.TempDir()
	// cmd.exe가 해석하는 메타문자를 포함한 합법적인 파일명
	name := "readme&calc %PATH% ^x.txt"
	p := filepath.Join(base, name)
	os.WriteFile(p, []byte("x"), 0644)

	var gotFile, gotDir string
	orig := shellOpen
	shellOpen = func(file, dir string) error { gotFile, gotDir = file, dir; return nil }
	defer func() { shellOpen = orig }()

	if err := newTestFM().OpenFile(p); err != nil {
		t.Fatalf("OpenFile: %v", err)
	}
	if gotFile != p {
		t.Errorf("file passed = %q, want %q", gotFile, p)
	}
	if gotDir != base {
		t.Errorf("dir passed = %q, want %q", gotDir, base)
	}
}

func TestBuildOpenCmd_WindowsDoesNotUseCmdShell(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows only")
	}
	if cmd, err := buildOpenCmd(`C:\x\a&b.txt`); err == nil {
		t.Errorf("windows must not build a shell command, got %v", cmd.Args)
	}
}
