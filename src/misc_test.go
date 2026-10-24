package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ─── Todo #99: 백엔드 잔여 버그 ───────────────────────────────────────────────

func TestSearchFiles_NonRecursiveMatchesFolders(t *testing.T) {
	base := t.TempDir()
	os.MkdirAll(filepath.Join(base, "report-dir", "inner"), 0755)
	os.WriteFile(filepath.Join(base, "report-dir", "inner", "report.txt"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(base, "report.txt"), []byte("x"), 0644)

	res, err := newTestFM().SearchFiles(base, "report", false)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, r := range res {
		names[r.Name] = true
	}
	if !names["report-dir"] || !names["report.txt"] {
		t.Errorf("non-recursive search should match top-level files and folders, got %v", names)
	}
	if len(res) != 2 {
		t.Errorf("should not descend into folders, got %d results", len(res))
	}
}

func TestSearchFiles_RootItselfNotReturned(t *testing.T) {
	base := filepath.Join(t.TempDir(), "match-root")
	os.MkdirAll(base, 0755)
	res, _ := newTestFM().SearchFiles(base, "match", true)
	for _, r := range res {
		if samePath(r.Path, base) {
			t.Error("the search root itself should not be a result")
		}
	}
}

func TestGetPathParts_UNC(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows only")
	}
	parts := newTestFM().GetPathParts(`\\srv\share\dir\sub`)
	want := []PathPart{
		{Name: `\\srv\share`, Path: `\\srv\share\`},
		{Name: "dir", Path: `\\srv\share\dir`},
		{Name: "sub", Path: `\\srv\share\dir\sub`},
	}
	if len(parts) != len(want) {
		t.Fatalf("parts = %+v", parts)
	}
	for i := range want {
		if parts[i] != want[i] {
			t.Errorf("part %d = %+v, want %+v", i, parts[i], want[i])
		}
	}
}

func TestUniqueName_Dotfile(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".bashrc"), []byte("x"), 0644)
	got, err := uniqueName(dir, ".bashrc")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != ".bashrc (1)" {
		t.Errorf("got %q", filepath.Base(got))
	}
	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("x"), 0644)
	os.WriteFile(filepath.Join(dir, "a (1).txt"), []byte("x"), 0644)
	got, _ = uniqueName(dir, "a.txt")
	if filepath.Base(got) != "a (2).txt" {
		t.Errorf("got %q", filepath.Base(got))
	}
}

func TestUniqueName_StatErrorDoesNotLoopForever(t *testing.T) {
	// 존재하지 않는 상위 폴더 아래 + 너무 긴 이름 → IsNotExist가 아닌 에러도 종료되어야 함
	dir := filepath.Join(t.TempDir(), strings.Repeat("x", 300))
	if _, err := uniqueName(dir, "a.txt"); err == nil {
		// 존재하지 않으면 원래 이름 그대로 사용 가능 → 에러 없음도 허용, 단 반드시 반환되어야 함
		return
	}
}

func TestDeleteItems_RejectsDangerousPaths(t *testing.T) {
	fm := newTestFM()
	home, _ := os.UserHomeDir()
	root := "/"
	if runtime.GOOS == "windows" {
		root = filepath.VolumeName(home) + `\`
	}
	for _, p := range []string{"", " ", root, home} {
		if err := fm.DeleteItems([]string{p}); err == nil {
			t.Errorf("DeleteItems(%q) must be rejected", p)
		}
	}
}

func TestCreateFile_DoesNotTruncateExisting(t *testing.T) {
	p := filepath.Join(t.TempDir(), "f.txt")
	os.WriteFile(p, []byte("keep"), 0644)
	if err := newTestFM().CreateFile(p); err == nil {
		t.Error("existing file should be an error")
	}
	if data, _ := os.ReadFile(p); string(data) != "keep" {
		t.Error("existing content must stay")
	}
}

func TestDecodeShellOutput(t *testing.T) {
	if got := decodeShellOutput([]byte("한글 UTF-8")); got != "한글 UTF-8" {
		t.Errorf("UTF-8 output should be kept, got %q", got)
	}
	if got := decodeShellOutput(eucKR(t, "한글 CP949")); got != "한글 CP949" {
		t.Errorf("CP949 output should be decoded, got %q", got)
	}
}

func TestUnescapeMountField(t *testing.T) {
	if got := unescapeMountField(`/media/My\040Disk`); got != "/media/My Disk" {
		t.Errorf("got %q", got)
	}
	if got := unescapeMountField(`/a\011b\134c`); got != "/a\tb\\c" {
		t.Errorf("got %q", got)
	}
}

func TestCompressItems_DoesNotOverwriteExistingArchive(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "a.txt")
	os.WriteFile(src, []byte("a"), 0644)
	dest := filepath.Join(base, "archive.zip")
	os.WriteFile(dest, []byte("precious"), 0644)
	if err := newTestFM().CompressItems([]string{src}, dest); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(dest); string(data) != "precious" {
		t.Error("existing archive must not be overwritten")
	}
	if _, err := os.Stat(filepath.Join(base, "archive (1).zip")); err != nil {
		t.Error("new archive should get a unique name")
	}
}
