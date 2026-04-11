package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func newTestFM() *FileManager {
	return &FileManager{}
}

// ─── ListDirectory ────────────────────────────────────────────────────────────

func TestListDirectory_DirsBeforeFiles(t *testing.T) {
	base := t.TempDir()
	os.MkdirAll(filepath.Join(base, "zebra"), 0755)
	os.WriteFile(filepath.Join(base, "apple.txt"), []byte("a"), 0644)
	os.MkdirAll(filepath.Join(base, "alpha"), 0755)

	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}

	if len(listing.Files) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(listing.Files))
	}
	if !listing.Files[0].IsDir || !listing.Files[1].IsDir {
		t.Error("directories should appear before files")
	}
	if listing.Files[2].IsDir {
		t.Error("files should appear after directories")
	}
}

func TestListDirectory_AlphabeticalSort(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "zebra.txt"), []byte{}, 0644)
	os.WriteFile(filepath.Join(base, "apple.txt"), []byte{}, 0644)
	os.WriteFile(filepath.Join(base, "Mango.txt"), []byte{}, 0644)

	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}

	names := make([]string, len(listing.Files))
	for i, f := range listing.Files {
		names[i] = strings.ToLower(f.Name)
	}
	for i := 1; i < len(names); i++ {
		if names[i-1] > names[i] {
			t.Errorf("sort order wrong: %s > %s", names[i-1], names[i])
		}
	}
}

func TestListDirectory_EmptyDir(t *testing.T) {
	base := t.TempDir()
	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}
	if len(listing.Files) != 0 {
		t.Errorf("expected 0 files, got %d", len(listing.Files))
	}
}

func TestListDirectory_InvalidPath(t *testing.T) {
	fm := newTestFM()
	_, err := fm.ListDirectory("/nonexistent/path/xyz_abc_123")
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestListDirectory_ExtensionLowercase(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "FILE.TXT"), []byte{}, 0644)

	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}
	if listing.Files[0].Extension != ".txt" {
		t.Errorf("expected .txt, got %s", listing.Files[0].Extension)
	}
}

func TestListDirectory_HiddenFile_Linux(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("dot-hidden files only on non-Windows")
	}
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, ".hidden"), []byte{}, 0644)
	os.WriteFile(filepath.Join(base, "visible.txt"), []byte{}, 0644)

	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}

	for _, f := range listing.Files {
		if f.Name == ".hidden" && !f.IsHidden {
			t.Error(".hidden should have IsHidden=true")
		}
		if f.Name == "visible.txt" && f.IsHidden {
			t.Error("visible.txt should have IsHidden=false")
		}
	}
}

// ─── CopyItems ────────────────────────────────────────────────────────────────

func TestCopyItems_SingleFile(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "src.txt")
	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)
	os.WriteFile(src, []byte("hello world"), 0644)

	fm := newTestFM()
	if err := fm.CopyItems([]string{src}, dst); err != nil {
		t.Fatalf("CopyItems error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(dst, "src.txt"))
	if err != nil {
		t.Fatalf("copied file not found: %v", err)
	}
	if string(data) != "hello world" {
		t.Errorf("content mismatch: got %q", string(data))
	}
	// 원본 존재 확인
	if _, err := os.Stat(src); err != nil {
		t.Error("source file should still exist after copy")
	}
}

func TestCopyItems_Directory(t *testing.T) {
	base := t.TempDir()
	srcDir := filepath.Join(base, "srcdir")
	os.MkdirAll(filepath.Join(srcDir, "sub"), 0755)
	os.WriteFile(filepath.Join(srcDir, "file.txt"), []byte("data"), 0644)
	os.WriteFile(filepath.Join(srcDir, "sub", "nested.txt"), []byte("nested"), 0644)

	dstDir := filepath.Join(base, "dst")
	os.MkdirAll(dstDir, 0755)

	fm := newTestFM()
	if err := fm.CopyItems([]string{srcDir}, dstDir); err != nil {
		t.Fatalf("CopyItems error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(dstDir, "srcdir", "file.txt")); err != nil {
		t.Error("file.txt should exist in copied directory")
	}
	if _, err := os.Stat(filepath.Join(dstDir, "srcdir", "sub", "nested.txt")); err != nil {
		t.Error("nested.txt should exist in copied subdirectory")
	}
}

func TestCopyItems_MissingSource(t *testing.T) {
	base := t.TempDir()
	fm := newTestFM()
	err := fm.CopyItems([]string{filepath.Join(base, "nonexistent.txt")}, base)
	if err == nil {
		t.Error("expected error for missing source")
	}
}

func TestCopyItems_EmptySources(t *testing.T) {
	base := t.TempDir()
	fm := newTestFM()
	if err := fm.CopyItems([]string{}, base); err != nil {
		t.Errorf("empty sources should not error: %v", err)
	}
}

// ─── MoveItems ────────────────────────────────────────────────────────────────

func TestMoveItems_FileDisappearsFromSource(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "move_me.txt")
	dst := filepath.Join(base, "destination")
	os.MkdirAll(dst, 0755)
	os.WriteFile(src, []byte("content"), 0644)

	fm := newTestFM()
	if err := fm.MoveItems([]string{src}, dst); err != nil {
		t.Fatalf("MoveItems error: %v", err)
	}

	if _, err := os.Stat(src); err == nil {
		t.Error("source file should be gone after move")
	}
	data, err := os.ReadFile(filepath.Join(dst, "move_me.txt"))
	if err != nil {
		t.Fatalf("moved file not found: %v", err)
	}
	if string(data) != "content" {
		t.Errorf("content mismatch after move: %q", string(data))
	}
}

func TestMoveItems_MissingSource(t *testing.T) {
	base := t.TempDir()
	fm := newTestFM()
	err := fm.MoveItems([]string{filepath.Join(base, "ghost.txt")}, base)
	if err == nil {
		t.Error("expected error for missing source")
	}
}

// ─── DeleteItems ─────────────────────────────────────────────────────────────

func TestDeleteItems_File(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "del.txt")
	os.WriteFile(f, []byte("bye"), 0644)

	fm := newTestFM()
	if err := fm.DeleteItems([]string{f}); err != nil {
		t.Fatalf("DeleteItems error: %v", err)
	}
	if _, err := os.Stat(f); err == nil {
		t.Error("file should be deleted")
	}
}

func TestDeleteItems_DirectoryRecursive(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "toDelete")
	os.MkdirAll(filepath.Join(dir, "sub"), 0755)
	os.WriteFile(filepath.Join(dir, "sub", "file.txt"), []byte("x"), 0644)

	fm := newTestFM()
	if err := fm.DeleteItems([]string{dir}); err != nil {
		t.Fatalf("DeleteItems error: %v", err)
	}
	if _, err := os.Stat(dir); err == nil {
		t.Error("directory should be deleted recursively")
	}
}

func TestDeleteItems_AlreadyGone(t *testing.T) {
	base := t.TempDir()
	fm := newTestFM()
	// os.RemoveAll은 없는 경로도 에러 없이 반환
	if err := fm.DeleteItems([]string{filepath.Join(base, "ghost")}); err != nil {
		t.Errorf("deleting nonexistent path should not error: %v", err)
	}
}

func TestDeleteItems_Empty(t *testing.T) {
	fm := newTestFM()
	if err := fm.DeleteItems([]string{}); err != nil {
		t.Errorf("empty list should not error: %v", err)
	}
}

// ─── CreateDirectory ──────────────────────────────────────────────────────────

func TestCreateDirectory_Nested(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "a", "b", "c")

	fm := newTestFM()
	if err := fm.CreateDirectory(target); err != nil {
		t.Fatalf("CreateDirectory error: %v", err)
	}
	if info, err := os.Stat(target); err != nil || !info.IsDir() {
		t.Error("nested directory should be created")
	}
}

func TestCreateDirectory_AlreadyExists(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "existing")
	fm := newTestFM()
	// 첫 번째 생성 성공
	if err := fm.CreateDirectory(dir); err != nil {
		t.Fatalf("첫 번째 생성 실패: %v", err)
	}
	// 두 번째 호출은 중복 에러 반환
	if err := fm.CreateDirectory(dir); err == nil {
		t.Error("이미 존재하는 폴더 생성 시 에러가 반환되어야 합니다")
	}
}

// ─── CreateFile ───────────────────────────────────────────────────────────────

func TestCreateFile_New(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "new.txt")

	fm := newTestFM()
	if err := fm.CreateFile(f); err != nil {
		t.Fatalf("CreateFile error: %v", err)
	}
	if _, err := os.Stat(f); err != nil {
		t.Error("file should exist after CreateFile")
	}
}

func TestCreateFile_DuplicateReturnsError(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "dup.txt")
	fm := newTestFM()

	if err := fm.CreateFile(f); err != nil {
		t.Fatalf("첫 번째 생성 실패: %v", err)
	}
	if err := fm.CreateFile(f); err == nil {
		t.Error("중복 파일 생성 시 에러가 반환되어야 합니다")
	}
}

// ─── RenameItem ───────────────────────────────────────────────────────────────

func TestRenameItem(t *testing.T) {
	base := t.TempDir()
	old := filepath.Join(base, "old.txt")
	newName := filepath.Join(base, "new.txt")
	os.WriteFile(old, []byte("data"), 0644)

	fm := newTestFM()
	if err := fm.RenameItem(old, newName); err != nil {
		t.Fatalf("RenameItem error: %v", err)
	}
	if _, err := os.Stat(old); err == nil {
		t.Error("old path should not exist")
	}
	if _, err := os.Stat(newName); err != nil {
		t.Error("new path should exist")
	}
}

// ─── ReadTextFile / WriteTextFile ─────────────────────────────────────────────

func TestReadWriteTextFile_RoundTrip(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "text.txt")
	content := "안녕하세요\nHello World\n🎉"

	fm := newTestFM()
	if err := fm.WriteTextFile(f, content); err != nil {
		t.Fatalf("WriteTextFile error: %v", err)
	}
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	if got != content {
		t.Errorf("content mismatch:\nwant: %q\ngot:  %q", content, got)
	}
}

func TestReadTextFile_NotFound(t *testing.T) {
	fm := newTestFM()
	_, err := fm.ReadTextFile("/nonexistent/path/file.txt")
	if err == nil {
		t.Error("expected error for nonexistent file")
	}
}

// ─── SearchFiles ──────────────────────────────────────────────────────────────

func TestSearchFiles_CaseInsensitive(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "TestFile.txt"), []byte{}, 0644)
	os.WriteFile(filepath.Join(base, "other.go"), []byte{}, 0644)

	fm := newTestFM()
	results, err := fm.SearchFiles(base, "test", true)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}

	found := false
	for _, r := range results {
		if strings.ToLower(r.Name) == "testfile.txt" {
			found = true
		}
	}
	if !found {
		t.Error("TestFile.txt should match pattern 'test' (case-insensitive)")
	}
}

func TestSearchFiles_Recursive(t *testing.T) {
	base := t.TempDir()
	sub := filepath.Join(base, "sub")
	os.MkdirAll(sub, 0755)
	os.WriteFile(filepath.Join(base, "match.txt"), []byte{}, 0644)
	os.WriteFile(filepath.Join(sub, "match_deep.txt"), []byte{}, 0644)

	fm := newTestFM()
	results, err := fm.SearchFiles(base, "match", true)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}

	names := make(map[string]bool)
	for _, r := range results {
		names[r.Name] = true
	}
	if !names["match.txt"] {
		t.Error("match.txt should be found in recursive search")
	}
	if !names["match_deep.txt"] {
		t.Error("match_deep.txt should be found in recursive search")
	}
}

func TestSearchFiles_NonRecursive(t *testing.T) {
	base := t.TempDir()
	sub := filepath.Join(base, "sub")
	os.MkdirAll(sub, 0755)
	os.WriteFile(filepath.Join(base, "match.txt"), []byte{}, 0644)
	os.WriteFile(filepath.Join(sub, "match_deep.txt"), []byte{}, 0644)

	fm := newTestFM()
	results, err := fm.SearchFiles(base, "match", false)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}

	for _, r := range results {
		if r.Name == "match_deep.txt" {
			t.Error("match_deep.txt should NOT be found in non-recursive search")
		}
	}
}

// ─── CompressItems ────────────────────────────────────────────────────────────

func TestCompressItems_SingleFile(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "hello.txt")
	os.WriteFile(src, []byte("zip me"), 0644)

	fm := newTestFM()
	destBase := filepath.Join(base, "output")
	if err := fm.CompressItems([]string{src}, destBase); err != nil {
		t.Fatalf("CompressItems error: %v", err)
	}

	zipPath := destBase + ".zip"
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		t.Fatalf("zip not created at %s: %v", zipPath, err)
	}
	defer r.Close()

	if len(r.File) != 1 || r.File[0].Name != "hello.txt" {
		t.Errorf("zip should contain hello.txt, got %v", r.File)
	}
}

func TestCompressItems_AutoZipExtension(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "f.txt")
	os.WriteFile(src, []byte("x"), 0644)

	fm := newTestFM()
	// .zip 없이 전달
	dest := filepath.Join(base, "archive")
	fm.CompressItems([]string{src}, dest)
	if _, err := os.Stat(dest + ".zip"); err != nil {
		t.Error(".zip extension should be appended automatically")
	}
}

func TestCompressItems_NoDoubleZipExtension(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "f.txt")
	os.WriteFile(src, []byte("x"), 0644)

	fm := newTestFM()
	// .zip 이미 있는 경우
	dest := filepath.Join(base, "archive.zip")
	fm.CompressItems([]string{src}, dest)
	if _, err := os.Stat(filepath.Join(base, "archive.zip.zip")); err == nil {
		t.Error("should not create archive.zip.zip")
	}
}

// ─── ExtractArchive ───────────────────────────────────────────────────────────

func makeTestZip(t *testing.T, dir string, files map[string]string) string {
	t.Helper()
	zipPath := filepath.Join(dir, "test.zip")
	zf, err := os.Create(zipPath)
	if err != nil {
		t.Fatalf("create zip: %v", err)
	}
	w := zip.NewWriter(zf)
	for name, content := range files {
		fw, err := w.Create(name)
		if err != nil {
			t.Fatalf("zip create entry: %v", err)
		}
		fw.Write([]byte(content))
	}
	w.Close()
	zf.Close()
	return zipPath
}

func TestExtractArchive_ValidZip(t *testing.T) {
	base := t.TempDir()
	zipPath := makeTestZip(t, base, map[string]string{
		"hello.txt":     "hello",
		"sub/world.txt": "world",
	})
	destDir := filepath.Join(base, "extracted")
	os.MkdirAll(destDir, 0755)

	fm := newTestFM()
	if err := fm.ExtractArchive(zipPath, destDir); err != nil {
		t.Fatalf("ExtractArchive error: %v", err)
	}

	// makeTestZip이 "test.zip"을 생성하므로 서브폴더명은 "test"
	subDir := filepath.Join(destDir, "test")
	data, err := os.ReadFile(filepath.Join(subDir, "hello.txt"))
	if err != nil || string(data) != "hello" {
		t.Errorf("hello.txt content mismatch: %v", err)
	}
	data, err = os.ReadFile(filepath.Join(subDir, "sub", "world.txt"))
	if err != nil || string(data) != "world" {
		t.Errorf("sub/world.txt content mismatch: %v", err)
	}
}

func TestExtractArchive_CreatesSubfolder(t *testing.T) {
	base := t.TempDir()
	// "myarchive.zip" 이름으로 생성
	zipPath := filepath.Join(base, "myarchive.zip")
	zf, _ := os.Create(zipPath)
	w := zip.NewWriter(zf)
	fw, _ := w.Create("readme.txt")
	fw.Write([]byte("content"))
	w.Close()
	zf.Close()

	destDir := filepath.Join(base, "output")
	os.MkdirAll(destDir, 0755)

	fm := newTestFM()
	if err := fm.ExtractArchive(zipPath, destDir); err != nil {
		t.Fatalf("ExtractArchive error: %v", err)
	}

	// 서브폴더 "myarchive"가 생성되어야 함
	subDir := filepath.Join(destDir, "myarchive")
	if _, err := os.Stat(subDir); os.IsNotExist(err) {
		t.Error("서브폴더 'myarchive'가 생성되지 않았습니다")
	}
	data, err := os.ReadFile(filepath.Join(subDir, "readme.txt"))
	if err != nil || string(data) != "content" {
		t.Errorf("readme.txt content mismatch: %v", err)
	}
}

func TestExtractArchive_DuplicateFolderSuffix(t *testing.T) {
	base := t.TempDir()
	zipPath := filepath.Join(base, "myarchive.zip")
	zf, _ := os.Create(zipPath)
	w := zip.NewWriter(zf)
	fw, _ := w.Create("file.txt")
	fw.Write([]byte("data"))
	w.Close()
	zf.Close()

	destDir := filepath.Join(base, "output")
	os.MkdirAll(destDir, 0755)
	fm := newTestFM()

	// 1회 추출 → "myarchive" 생성
	if err := fm.ExtractArchive(zipPath, destDir); err != nil {
		t.Fatalf("1차 추출 실패: %v", err)
	}
	if _, err := os.Stat(filepath.Join(destDir, "myarchive")); os.IsNotExist(err) {
		t.Fatal("'myarchive' 폴더가 생성되지 않았습니다")
	}

	// 2회 추출 → "myarchive (1)" 생성
	if err := fm.ExtractArchive(zipPath, destDir); err != nil {
		t.Fatalf("2차 추출 실패: %v", err)
	}
	if _, err := os.Stat(filepath.Join(destDir, "myarchive (1)")); os.IsNotExist(err) {
		t.Fatal("'myarchive (1)' 폴더가 생성되지 않았습니다")
	}

	// 3회 추출 → "myarchive (2)" 생성
	if err := fm.ExtractArchive(zipPath, destDir); err != nil {
		t.Fatalf("3차 추출 실패: %v", err)
	}
	if _, err := os.Stat(filepath.Join(destDir, "myarchive (2)")); os.IsNotExist(err) {
		t.Fatal("'myarchive (2)' 폴더가 생성되지 않았습니다")
	}
}

func TestExtractArchive_ZipSlipBlocked(t *testing.T) {
	base := t.TempDir()

	// 악성 zip: destDir 밖으로 탈출하는 경로
	zipPath := filepath.Join(base, "malicious.zip")
	zf, _ := os.Create(zipPath)
	w := zip.NewWriter(zf)
	fw, _ := w.Create("../escape.txt")
	fw.Write([]byte("escaped"))
	w.Close()
	zf.Close()

	destDir := filepath.Join(base, "safe")
	os.MkdirAll(destDir, 0755)

	fm := newTestFM()
	fm.ExtractArchive(zipPath, destDir)

	// 서브폴더(malicious) 밖에 파일이 생성되면 안 됨
	// 탈출 시도 경로: destDir/malicious/../escape.txt → destDir/escape.txt
	escapePath1 := filepath.Join(base, "escape.txt")
	escapePath2 := filepath.Join(destDir, "escape.txt")
	if _, err := os.Stat(escapePath1); err == nil {
		t.Error("zip slip: file escaped outside base dir!")
	}
	if _, err := os.Stat(escapePath2); err == nil {
		t.Error("zip slip: file escaped outside subDir!")
	}
}

func TestExtractArchive_InvalidZip(t *testing.T) {
	base := t.TempDir()
	notZip := filepath.Join(base, "fake.zip")
	os.WriteFile(notZip, []byte("this is not a zip"), 0644)

	fm := newTestFM()
	if err := fm.ExtractArchive(notZip, base); err == nil {
		t.Error("expected error for invalid zip file")
	}
}

// ─── GetPathParts ─────────────────────────────────────────────────────────────

func TestGetPathParts_Windows(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows path test only")
	}
	fm := newTestFM()
	parts := fm.GetPathParts(`C:\Users\test`)
	if len(parts) < 2 {
		t.Fatalf("expected at least 2 parts, got %d", len(parts))
	}
	if parts[0].Name != `C:` {
		t.Errorf("first part should be drive letter, got %q", parts[0].Name)
	}
}

func TestGetPathParts_Linux(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Linux path test only")
	}
	fm := newTestFM()
	parts := fm.GetPathParts("/home/user/docs")
	if len(parts) < 1 {
		t.Fatalf("expected at least 1 part, got %d", len(parts))
	}
	if parts[0].Name != "/" || parts[0].Path != "/" {
		t.Errorf("first part should be root /, got %+v", parts[0])
	}
	if len(parts) < 4 {
		t.Fatalf("expected 4 parts for /home/user/docs, got %d", len(parts))
	}
	if parts[1].Name != "home" {
		t.Errorf("second part should be 'home', got %q", parts[1].Name)
	}
}

func TestGetPathParts_Root(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Linux path test only")
	}
	fm := newTestFM()
	parts := fm.GetPathParts("/")
	if len(parts) != 1 || parts[0].Path != "/" {
		t.Errorf("root path should produce single root part, got %+v", parts)
	}
}

// ─── isHiddenFile ─────────────────────────────────────────────────────────────

func TestIsHiddenFile(t *testing.T) {
	if !isHiddenFile(".dotfile") {
		t.Error("dot-prefixed files should be hidden on all platforms")
	}
	if !isHiddenFile(".hidden") {
		t.Error("dot-prefixed files should be hidden on all platforms")
	}
	if isHiddenFile("visible.txt") {
		t.Error("regular files should not be hidden")
	}
	if isHiddenFile("") {
		t.Error("empty name should not be hidden")
	}
}

// ─── JoinPath / GetParentPath ─────────────────────────────────────────────────

func TestJoinPath(t *testing.T) {
	fm := newTestFM()
	result := fm.JoinPath("a", "b", "c")
	expected := filepath.Join("a", "b", "c")
	if result != expected {
		t.Errorf("JoinPath: want %q, got %q", expected, result)
	}
}

func TestGetParentPath(t *testing.T) {
	fm := newTestFM()
	parent := fm.GetParentPath(filepath.Join("a", "b", "c"))
	expected := filepath.Join("a", "b")
	if parent != expected {
		t.Errorf("GetParentPath: want %q, got %q", expected, parent)
	}
}

// ─── GetFileSize ──────────────────────────────────────────────────────────────

func TestGetFileSize(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "a.txt"), []byte("hello"), 0644)  // 5 bytes
	os.WriteFile(filepath.Join(base, "b.txt"), []byte("world!"), 0644) // 6 bytes

	fm := newTestFM()
	size, err := fm.GetFileSize(base)
	if err != nil {
		t.Fatalf("GetFileSize error: %v", err)
	}
	if size != 11 {
		t.Errorf("expected 11 bytes, got %d", size)
	}
}

// ─── SavePanelPaths / LoadPanelPaths ─────────────────────────────────────────

// newTestApp은 격리된 임시 configDir를 사용하는 App을 반환합니다.
// 이를 통해 테스트가 실제 ~/.chobocho-commander/ 를 오염시키지 않습니다.
func newTestApp(t *testing.T) *App {
	t.Helper()
	return &App{
		fileManager: NewFileManager(),
		ftpManager:  NewFTPManager(),
		configDir:   t.TempDir(),
	}
}

func TestSavePanelPaths_AndLoad(t *testing.T) {
	a := newTestApp(t)

	leftPath := t.TempDir()
	rightPath := t.TempDir()

	if err := a.SavePanelPaths(leftPath, rightPath); err != nil {
		t.Fatalf("SavePanelPaths error: %v", err)
	}

	loaded := a.LoadPanelPaths()
	if loaded.LeftPath != leftPath {
		t.Errorf("LeftPath: got %q, want %q", loaded.LeftPath, leftPath)
	}
	if loaded.RightPath != rightPath {
		t.Errorf("RightPath: got %q, want %q", loaded.RightPath, rightPath)
	}
}

func TestLoadPanelPaths_NonexistentPathReturnsEmpty(t *testing.T) {
	a := newTestApp(t)

	// 존재하지 않는 경로를 저장
	if err := a.SavePanelPaths("/no/such/path/left", "/no/such/path/right"); err != nil {
		t.Fatalf("SavePanelPaths error: %v", err)
	}

	loaded := a.LoadPanelPaths()
	// 존재하지 않는 경로는 빈 문자열로 반환되어야 함
	if loaded.LeftPath != "" {
		t.Errorf("LeftPath should be empty for nonexistent path, got %q", loaded.LeftPath)
	}
	if loaded.RightPath != "" {
		t.Errorf("RightPath should be empty for nonexistent path, got %q", loaded.RightPath)
	}
}

func TestLoadPanelPaths_NoFileReturnsEmpty(t *testing.T) {
	// settings.json이 없을 때 빈 구조체 반환 (에러 없음)
	a := newTestApp(t)
	// 저장 파일을 지워서 없는 상태 시뮬레이션
	path, _ := a.settingsFilePath()
	os.Remove(path)

	loaded := a.LoadPanelPaths()
	if loaded.LeftPath != "" || loaded.RightPath != "" {
		t.Errorf("파일 없을 때 빈 경로가 반환되어야 함: got left=%q right=%q", loaded.LeftPath, loaded.RightPath)
	}
}

// ─── FileBookmarks ────────────────────────────────────────────────────────────

func TestFileBookmark_AddAndGet(t *testing.T) {
	dir := t.TempDir()
	a := newTestApp(t)

	if err := a.AddFileBookmark("테스트폴더", dir); err != nil {
		t.Fatalf("AddFileBookmark error: %v", err)
	}

	bms := a.GetFileBookmarks()
	found := false
	for _, bm := range bms {
		if bm.Path == dir && bm.Name == "테스트폴더" {
			found = true
		}
	}
	if !found {
		t.Error("추가한 북마크가 목록에 없습니다")
	}
}

func TestFileBookmark_Delete(t *testing.T) {
	dir := t.TempDir()
	a := newTestApp(t)

	if err := a.AddFileBookmark("삭제대상", dir); err != nil {
		t.Fatalf("AddFileBookmark error: %v", err)
	}
	bms := a.GetFileBookmarks()
	var id string
	for _, bm := range bms {
		if bm.Path == dir {
			id = bm.ID
		}
	}
	if id == "" {
		t.Fatal("추가한 북마크 ID를 찾지 못했습니다")
	}

	if err := a.DeleteFileBookmark(id); err != nil {
		t.Fatalf("DeleteFileBookmark error: %v", err)
	}
	bms = a.GetFileBookmarks()
	for _, bm := range bms {
		if bm.ID == id {
			t.Error("삭제된 북마크가 여전히 목록에 있습니다")
		}
	}
}

func TestFileBookmark_NonexistentPathReturnsError(t *testing.T) {
	a := newTestApp(t)
	if err := a.AddFileBookmark("없는경로", "/no/such/path"); err == nil {
		t.Error("존재하지 않는 경로 추가 시 에러가 반환되어야 합니다")
	}
}
