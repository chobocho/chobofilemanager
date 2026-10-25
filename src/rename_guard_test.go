package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// ─── Todo #130-1: 이름 바꾸기가 다른 파일을 덮어쓰지 않게 ─────────────────────────

func TestRenameItemRefusesToOverwriteAnotherFile(t *testing.T) {
	dir := t.TempDir()
	a, b := filepath.Join(dir, "a.txt"), filepath.Join(dir, "b.txt")
	os.WriteFile(a, []byte("A"), 0o644)
	os.WriteFile(b, []byte("B"), 0o644)
	if err := NewFileManager().RenameItem(a, b); err == nil {
		t.Fatal("renaming onto an existing file must fail")
	}
	if got, _ := os.ReadFile(b); string(got) != "B" {
		t.Fatalf("b.txt was overwritten: %q", got)
	}
	if _, err := os.Stat(a); err != nil {
		t.Fatalf("a.txt must stay: %v", err)
	}
}

func TestRenameItemRefusesToReplaceAFolder(t *testing.T) {
	dir := t.TempDir()
	a, sub := filepath.Join(dir, "a"), filepath.Join(dir, "sub")
	os.Mkdir(a, 0o755)
	os.Mkdir(sub, 0o755)
	os.WriteFile(filepath.Join(sub, "keep.txt"), []byte("k"), 0o644)
	if err := NewFileManager().RenameItem(a, sub); err == nil {
		t.Fatal("renaming onto an existing folder must fail")
	}
	if _, err := os.Stat(filepath.Join(sub, "keep.txt")); err != nil {
		t.Fatal("the existing folder's content must stay")
	}
}

// 대소문자만 바꾸기(a.txt → A.txt)는 같은 파일이므로 허용 (대소문자 무시 파일 시스템)
func TestRenameItemAllowsChangingOnlyTheCase(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "case.txt")
	os.WriteFile(a, []byte("x"), 0o644)
	up := filepath.Join(dir, "CASE.txt")
	if err := NewFileManager().RenameItem(a, up); err != nil {
		t.Fatalf("case-only rename: %v", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "CASE.txt" {
		t.Fatalf("entries = %v", entries)
	}
}

func TestRenameItemToANewName(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.txt")
	os.WriteFile(a, []byte("x"), 0o644)
	if err := NewFileManager().RenameItem(a, filepath.Join(dir, "new.txt")); err != nil {
		t.Fatal(err)
	}
}

// FTP 보기의 이름 바꾸기도 같은 이름이 있으면 RNFR/RNTO를 보내지 않음 (서버가 덮어씀)
func TestFTPRenameRefusesAnExistingName(t *testing.T) {
	a := newCovApp(t)
	srv := startFakeFTP(t)
	srv.listings = map[string][]string{"/": {lsFileA, lsDirSub}}
	srv.handler = func(cmd, arg string) string {
		switch cmd {
		case "RNFR":
			return "350 ready"
		case "RNTO":
			return "250 ok"
		}
		return ""
	}
	id, err := a.FTPConnect(srv.config())
	if err != nil {
		t.Fatal(err)
	}
	if err := a.FTPRenameItem(id, "/other.txt", "/a.TXT"); err == nil {
		t.Fatal("rename onto an existing name must fail")
	}
	for _, c := range srv.received() {
		if strings.HasPrefix(c, "RNFR") {
			t.Fatalf("RNFR sent: %v", srv.received())
		}
	}
	if err := a.FTPRenameItem(id, "/a.TXT", "/A.txt"); err != nil {
		t.Fatalf("case-only rename: %v", err)
	}
	if err := a.FTPRenameItem(id, "/a.TXT", "/new.txt"); err != nil {
		t.Fatalf("new name: %v", err)
	}
}

// F6 이동: 앞쪽 충돌 검사 뒤에 생긴 같은 이름 파일을 조용히 덮어쓰지 않음 (Windows os.Rename은 덮어씀)
func TestMoveItemsRefusesToOverwriteAnExistingFile(t *testing.T) {
	src, dst := t.TempDir(), t.TempDir()
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("NEW"), 0o644)
	os.WriteFile(filepath.Join(dst, "a.txt"), []byte("OLD"), 0o644)
	if err := NewFileManager().MoveItems([]string{filepath.Join(src, "a.txt")}, dst); err == nil {
		t.Fatal("moving onto an existing file must fail")
	}
	if got, _ := os.ReadFile(filepath.Join(dst, "a.txt")); string(got) != "OLD" {
		t.Fatalf("existing file was replaced: %q", got)
	}
	if _, err := os.Stat(filepath.Join(src, "a.txt")); err != nil {
		t.Fatal("source must stay when the move is refused")
	}
}

// 덮어쓰기·새 이름 모드는 그대로 동작
func TestMoveItemsOverwriteAndRenameStillWork(t *testing.T) {
	fm := NewFileManager()
	src, dst := t.TempDir(), t.TempDir()
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("NEW"), 0o644)
	os.WriteFile(filepath.Join(dst, "a.txt"), []byte("OLD"), 0o644)
	if err := fm.MoveItemsOverwrite([]string{filepath.Join(src, "a.txt")}, dst); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(filepath.Join(dst, "a.txt")); string(got) != "NEW" {
		t.Fatalf("overwrite: got %q", got)
	}
	os.WriteFile(filepath.Join(src, "a.txt"), []byte("THIRD"), 0o644)
	if err := fm.MoveItemsRename([]string{filepath.Join(src, "a.txt")}, dst); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(filepath.Join(dst, "a (1).txt")); string(got) != "THIRD" {
		t.Fatalf("rename: got %q", got)
	}
}

// ─── Todo #130-1: 텍스트 읽기·원자적 쓰기의 가장자리 ─────────────────────────

// CP949로 풀 수 없는 바이트도 오류 없이 U+FFFD로 보임 (뷰어가 빈 화면이 되지 않음)
func TestReadTextWithEncodingShowsBrokenBytesAsReplacement(t *testing.T) {
	p := filepath.Join(t.TempDir(), "bad.txt")
	os.WriteFile(p, []byte{'a', 0xFF, 0xFF, 'b'}, 0o644)
	got, err := NewFileManager().ReadTextFileWithEncoding(p, "cp949")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(got, "a") || !strings.HasSuffix(got, "b") || !strings.Contains(got, "�") {
		t.Fatalf("got %q", got)
	}
}

// 32MB를 넘는 파일은 읽지 않고 오류 (메모리 보호)
func TestReadTextWithEncodingRefusesHugeFile(t *testing.T) {
	p := filepath.Join(t.TempDir(), "big.txt")
	f, _ := os.Create(p)
	f.Truncate(maxViewerFileSize + 1)
	f.Close()
	if _, err := NewFileManager().ReadTextFileWithEncoding(p, "utf-8"); err == nil {
		t.Fatal("a file over the viewer limit must be refused")
	}
}
