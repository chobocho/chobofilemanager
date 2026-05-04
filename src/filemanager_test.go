package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/unicode/norm"
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

func TestReadTextFile_EUCKR_완성형(t *testing.T) {
	// EUC-KR로 인코딩된 "안녕하세요" 바이트 쓰기
	eucKRBytes, err := korean.EUCKR.NewEncoder().Bytes([]byte("안녕하세요"))
	if err != nil {
		t.Skip("EUC-KR 인코딩 불가 환경:", err)
	}
	base := t.TempDir()
	f := filepath.Join(base, "korean_euckr.txt")
	if err := os.WriteFile(f, eucKRBytes, 0644); err != nil {
		t.Fatalf("파일 쓰기 실패: %v", err)
	}
	fm := newTestFM()
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	if !strings.Contains(got, "안녕하세요") {
		t.Errorf("EUC-KR 디코딩 실패: got %q", got)
	}
}

func TestReadTextFile_Johab조합형인코딩(t *testing.T) {
	// 조합형(Johab/CP1361) 한글 파일 — "가나다" 5회 반복 (음절 15개 → johab_hangul_count >= 10)
	one := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	var content []byte
	for i := 0; i < 5; i++ {
		content = append(content, one...)
	}
	base := t.TempDir()
	f := filepath.Join(base, "korean_johab.txt")
	if err := os.WriteFile(f, content, 0644); err != nil {
		t.Fatalf("파일 쓰기 실패: %v", err)
	}
	fm := newTestFM()
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	if !strings.Contains(got, "가나다") {
		t.Errorf("Johab 디코딩 실패: got %q", got)
	}
}

func TestReadTextFile_UTF16LE_BOM(t *testing.T) {
	// UTF-16 LE BOM + "안녕" — '안' U+C548 → 0x48,0xC5  '녕' U+B155 → 0x55,0xB1
	content := []byte{0xFF, 0xFE, 0x48, 0xC5, 0x55, 0xB1}
	base := t.TempDir()
	f := filepath.Join(base, "korean_utf16le.txt")
	if err := os.WriteFile(f, content, 0644); err != nil {
		t.Fatalf("파일 쓰기 실패: %v", err)
	}
	fm := newTestFM()
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	if got != "안녕" {
		t.Errorf("UTF-16 LE 디코딩 실패: got %q", got)
	}
}

func TestReadTextFile_UTF16BE_BOM(t *testing.T) {
	// UTF-16 BE BOM + "안녕"
	content := []byte{0xFE, 0xFF, 0xC5, 0x48, 0xB1, 0x55}
	base := t.TempDir()
	f := filepath.Join(base, "korean_utf16be.txt")
	if err := os.WriteFile(f, content, 0644); err != nil {
		t.Fatalf("파일 쓰기 실패: %v", err)
	}
	fm := newTestFM()
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	if got != "안녕" {
		t.Errorf("UTF-16 BE 디코딩 실패: got %q", got)
	}
}

func TestReadTextFile_NFD_조합형(t *testing.T) {
	// NFD 정규화 (조합형 유니코드 한글) → NFC 변환 확인
	// "가" NFD = ㄱ(U+1100) + ㅏ(U+1161)
	nfdText := "가" // NFD: jamo 조합형 '가'
	base := t.TempDir()
	f := filepath.Join(base, "korean_nfd.txt")
	if err := os.WriteFile(f, []byte(nfdText), 0644); err != nil {
		t.Fatalf("파일 쓰기 실패: %v", err)
	}
	fm := newTestFM()
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	// NFC 정규화 결과는 완성형 '가' (U+AC00)
	expected := norm.NFC.String(nfdText)
	if got != expected {
		t.Errorf("NFD→NFC 변환 실패: got %q, want %q", got, expected)
	}
}

// ─── ReadTextFileWithEncoding (수동 인코딩 지정) ───────────────────────────────

func TestReadTextFileWithEncoding_Auto는기본동작(t *testing.T) {
	// "auto"는 ReadTextFile과 동일 — 자동 판별
	one := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	var content []byte
	for i := 0; i < 5; i++ {
		content = append(content, one...)
	}
	base := t.TempDir()
	f := filepath.Join(base, "k.txt")
	os.WriteFile(f, content, 0644)
	fm := newTestFM()
	got, err := fm.ReadTextFileWithEncoding(f, "auto")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !strings.Contains(got, "가나다") {
		t.Errorf("auto 판별 실패: got %q", got)
	}
}

func TestReadTextFileWithEncoding_명시Johab(t *testing.T) {
	// 자동 판별이 다른 인코딩을 골라도 사용자가 johab 강제 가능해야 함
	src := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	base := t.TempDir()
	f := filepath.Join(base, "short.txt")
	os.WriteFile(f, src, 0644)
	fm := newTestFM()
	got, err := fm.ReadTextFileWithEncoding(f, "johab")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "가나다" {
		t.Errorf("johab 강제 실패: got %q", got)
	}
}

func TestReadTextFileWithEncoding_명시CP949(t *testing.T) {
	enc, encErr := korean.EUCKR.NewEncoder().Bytes([]byte("안녕"))
	if encErr != nil {
		t.Skip("EUC-KR 인코딩 환경 없음:", encErr)
	}
	base := t.TempDir()
	f := filepath.Join(base, "k.txt")
	os.WriteFile(f, enc, 0644)
	fm := newTestFM()
	got, err := fm.ReadTextFileWithEncoding(f, "cp949")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "안녕" {
		t.Errorf("cp949 강제 실패: got %q", got)
	}
}

func TestReadTextFileWithEncoding_명시UTF8(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "k.txt")
	os.WriteFile(f, []byte("hello 한글"), 0644)
	fm := newTestFM()
	got, err := fm.ReadTextFileWithEncoding(f, "utf-8")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "hello 한글" {
		t.Errorf("utf-8 강제 실패: got %q", got)
	}
}

func TestReadTextFileWithEncoding_UnknownEnc는Auto폴백(t *testing.T) {
	// 알 수 없는 인코딩 이름은 auto로 폴백
	base := t.TempDir()
	f := filepath.Join(base, "k.txt")
	os.WriteFile(f, []byte("hello"), 0644)
	fm := newTestFM()
	got, err := fm.ReadTextFileWithEncoding(f, "klingon")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if got != "hello" {
		t.Errorf("미지원 인코딩 폴백 실패: got %q", got)
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

// ─── SaveSessionState / LoadPanelPaths (tabs) ────────────────────────────────

func TestSaveSessionState_MultipleTabs(t *testing.T) {
	a := newTestApp(t)
	left1, left2 := t.TempDir(), t.TempDir()
	right1 := t.TempDir()

	if err := a.SaveSessionState([]string{left1, left2}, 1, []string{right1}, 0); err != nil {
		t.Fatalf("SaveSessionState error: %v", err)
	}

	loaded := a.LoadPanelPaths()

	if loaded.LeftTabs == nil || len(loaded.LeftTabs.Paths) != 2 {
		t.Fatalf("LeftTabs.Paths: want 2 entries, got %v", loaded.LeftTabs)
	}
	if loaded.LeftTabs.Paths[0] != left1 || loaded.LeftTabs.Paths[1] != left2 {
		t.Errorf("LeftTabs.Paths mismatch: got %v", loaded.LeftTabs.Paths)
	}
	if loaded.LeftTabs.ActiveIdx != 1 {
		t.Errorf("LeftTabs.ActiveIdx: want 1, got %d", loaded.LeftTabs.ActiveIdx)
	}
	if loaded.RightTabs == nil || len(loaded.RightTabs.Paths) != 1 {
		t.Fatalf("RightTabs.Paths: want 1 entry, got %v", loaded.RightTabs)
	}
	if loaded.RightTabs.Paths[0] != right1 {
		t.Errorf("RightTabs.Paths[0]: want %q, got %q", right1, loaded.RightTabs.Paths[0])
	}
}

func TestSaveSessionState_InvalidTabPathsFiltered(t *testing.T) {
	a := newTestApp(t)
	valid := t.TempDir()

	// 유효 경로 + 존재하지 않는 경로 혼합
	if err := a.SaveSessionState([]string{valid, "/no/such/path"}, 0, []string{"/another/invalid"}, 0); err != nil {
		t.Fatalf("SaveSessionState error: %v", err)
	}

	loaded := a.LoadPanelPaths()

	if loaded.LeftTabs == nil || len(loaded.LeftTabs.Paths) != 1 {
		t.Errorf("LeftTabs: 유효 경로만 남아야 함, got %v", loaded.LeftTabs)
	}
	if loaded.LeftTabs != nil && loaded.LeftTabs.Paths[0] != valid {
		t.Errorf("LeftTabs.Paths[0]: want %q, got %q", valid, loaded.LeftTabs.Paths[0])
	}
	// 오른쪽은 모두 무효 → 빈 슬라이스
	if loaded.RightTabs == nil || len(loaded.RightTabs.Paths) != 0 {
		t.Errorf("RightTabs: 모두 무효이면 빈 슬라이스여야 함, got %v", loaded.RightTabs)
	}
}

func TestSaveSessionState_ActiveIdxClamped(t *testing.T) {
	a := newTestApp(t)
	p := t.TempDir()

	// activeIdx가 탭 수를 초과하면 0으로 클램핑
	if err := a.SaveSessionState([]string{p}, 99, []string{p}, 99); err != nil {
		t.Fatalf("SaveSessionState error: %v", err)
	}

	loaded := a.LoadPanelPaths()
	if loaded.LeftTabs != nil && loaded.LeftTabs.ActiveIdx != 0 {
		t.Errorf("LeftTabs.ActiveIdx: want 0 (clamped), got %d", loaded.LeftTabs.ActiveIdx)
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

// ─── ChangeWorkingDirectory ───────────────────────────────────────────────────

func TestChangeWorkingDirectory_ValidPath(t *testing.T) {
	// 원래 작업 폴더 저장
	orig, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd error: %v", err)
	}

	dir := t.TempDir()

	// t.TempDir() 이후에 등록해야 LIFO 순서상 먼저 실행되어
	// TempDir 삭제 전에 원래 폴더로 복원됨
	t.Cleanup(func() { os.Chdir(orig) })

	fm := newTestFM()
	if err := fm.ChangeWorkingDirectory(dir); err != nil {
		t.Fatalf("ChangeWorkingDirectory error: %v", err)
	}
	got, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd error: %v", err)
	}
	// filepath.EvalSymlinks로 심볼릭 링크 정규화 (macOS /var→/private/var 등)
	gotEval, _ := filepath.EvalSymlinks(got)
	dirEval, _ := filepath.EvalSymlinks(dir)
	if gotEval != dirEval {
		t.Errorf("working dir = %q, want %q", gotEval, dirEval)
	}
}

func TestChangeWorkingDirectory_InvalidPath(t *testing.T) {
	fm := newTestFM()
	if err := fm.ChangeWorkingDirectory("/nonexistent/path/xyz_abc_123"); err == nil {
		t.Error("존재하지 않는 경로에 대해 에러가 반환되어야 합니다")
	}
}

// ─── buildOpenCmd ─────────────────────────────────────────────────────────────

func TestBuildOpenCmd_DirIsFileDirectory(t *testing.T) {
	base := t.TempDir()
	filePath := filepath.Join(base, "test.txt")
	os.WriteFile(filePath, []byte("hello"), 0644)

	cmd, err := buildOpenCmd(filePath)
	if err != nil {
		t.Fatalf("buildOpenCmd error: %v", err)
	}
	if cmd.Dir != base {
		t.Errorf("cmd.Dir = %q, want %q", cmd.Dir, base)
	}
}

func TestBuildOpenCmd_UsesCorrectProgram(t *testing.T) {
	base := t.TempDir()
	filePath := filepath.Join(base, "test.txt")
	os.WriteFile(filePath, []byte("hello"), 0644)

	cmd, err := buildOpenCmd(filePath)
	if err != nil {
		t.Fatalf("buildOpenCmd error: %v", err)
	}

	switch runtime.GOOS {
	case "windows":
		// "cmd /c start "" path" 형태인지 확인
		if !strings.HasSuffix(strings.ToLower(cmd.Path), "cmd.exe") {
			t.Errorf("windows: expected cmd.exe, got %q", cmd.Path)
		}
		if len(cmd.Args) < 2 || cmd.Args[1] != "/c" {
			t.Errorf("windows: expected /c flag, args = %v", cmd.Args)
		}
	case "linux":
		if !strings.HasSuffix(cmd.Path, "xdg-open") {
			t.Errorf("linux: expected xdg-open, got %q", cmd.Path)
		}
	}
}

func TestBuildOpenCmd_NestedDir(t *testing.T) {
	base := t.TempDir()
	sub := filepath.Join(base, "sub", "dir")
	os.MkdirAll(sub, 0755)
	filePath := filepath.Join(sub, "file.txt")
	os.WriteFile(filePath, []byte(""), 0644)

	cmd, err := buildOpenCmd(filePath)
	if err != nil {
		t.Fatalf("buildOpenCmd error: %v", err)
	}
	if cmd.Dir != sub {
		t.Errorf("cmd.Dir = %q, want %q", cmd.Dir, sub)
	}
}

// ─── SearchFiles 추가 테스트 ──────────────────────────────────────────────────

func TestSearchFiles_EmptyPattern_ReturnsEmpty(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "file.txt"), []byte{}, 0644)

	fm := newTestFM()
	results, err := fm.SearchFiles(base, "", true)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("빈 패턴은 결과가 없어야 함, got %d results", len(results))
	}
}

func TestSearchFiles_AND_MultipleKeywords(t *testing.T) {
	base := t.TempDir()
	// "go" AND "test" 둘 다 포함하는 파일만 매칭되어야 함
	os.WriteFile(filepath.Join(base, "filemanager_test.go"), []byte{}, 0644)
	os.WriteFile(filepath.Join(base, "main.go"), []byte{}, 0644)
	os.WriteFile(filepath.Join(base, "run_test.sh"), []byte{}, 0644)

	fm := newTestFM()
	results, err := fm.SearchFiles(base, "go,test", true)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}

	names := make(map[string]bool)
	for _, r := range results {
		names[r.Name] = true
	}
	if !names["filemanager_test.go"] {
		t.Error("filemanager_test.go 는 'go'와 'test' 를 모두 포함하므로 매칭되어야 함")
	}
	if names["main.go"] {
		t.Error("main.go 는 'test' 를 포함하지 않으므로 매칭되면 안 됨")
	}
	if names["run_test.sh"] {
		t.Error("run_test.sh 는 'go' 를 포함하지 않으므로 매칭되면 안 됨")
	}
}

func TestSearchFiles_NoMatch(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "alpha.txt"), []byte{}, 0644)

	fm := newTestFM()
	results, err := fm.SearchFiles(base, "zzznomatch", true)
	if err != nil {
		t.Fatalf("SearchFiles error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("매칭 없으면 빈 결과여야 함, got %d", len(results))
	}
}

// ─── ReadTextFile 추가 테스트 ────────────────────────────────────────────────

func TestReadTextFile_EmptyFile(t *testing.T) {
	base := t.TempDir()
	f := filepath.Join(base, "empty.txt")
	os.WriteFile(f, []byte{}, 0644)

	fm := newTestFM()
	got, err := fm.ReadTextFile(f)
	if err != nil {
		t.Fatalf("ReadTextFile error: %v", err)
	}
	if got != "" {
		t.Errorf("빈 파일은 빈 문자열을 반환해야 함, got %q", got)
	}
}

// ─── RenameItem 추가 테스트 ──────────────────────────────────────────────────

func TestRenameItem_MissingSource(t *testing.T) {
	base := t.TempDir()
	fm := newTestFM()
	err := fm.RenameItem(filepath.Join(base, "ghost.txt"), filepath.Join(base, "new.txt"))
	if err == nil {
		t.Error("존재하지 않는 파일 이름 변경 시 에러가 반환되어야 함")
	}
}

func TestRenameItem_Directory(t *testing.T) {
	base := t.TempDir()
	oldDir := filepath.Join(base, "old_folder")
	newDir := filepath.Join(base, "new_folder")
	os.MkdirAll(filepath.Join(oldDir, "sub"), 0755)
	os.WriteFile(filepath.Join(oldDir, "file.txt"), []byte("data"), 0644)

	fm := newTestFM()
	if err := fm.RenameItem(oldDir, newDir); err != nil {
		t.Fatalf("RenameItem(directory) error: %v", err)
	}
	if _, err := os.Stat(oldDir); err == nil {
		t.Error("원래 폴더가 사라져야 함")
	}
	if _, err := os.Stat(filepath.Join(newDir, "file.txt")); err != nil {
		t.Error("이름 변경된 폴더 안에 파일이 있어야 함")
	}
}

// ─── CopyItems / MoveItems / DeleteItems 다중 파일 테스트 ────────────────────

func TestCopyItems_MultipleFiles(t *testing.T) {
	base := t.TempDir()
	src1 := filepath.Join(base, "a.txt")
	src2 := filepath.Join(base, "b.txt")
	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)
	os.WriteFile(src1, []byte("aaa"), 0644)
	os.WriteFile(src2, []byte("bbb"), 0644)

	fm := newTestFM()
	if err := fm.CopyItems([]string{src1, src2}, dst); err != nil {
		t.Fatalf("CopyItems error: %v", err)
	}

	for _, name := range []string{"a.txt", "b.txt"} {
		if _, err := os.Stat(filepath.Join(dst, name)); err != nil {
			t.Errorf("%s 가 대상 폴더에 없습니다", name)
		}
	}
	// 원본 모두 존재
	if _, err := os.Stat(src1); err != nil {
		t.Error("복사 후 원본 a.txt 가 사라지면 안 됩니다")
	}
}

func TestMoveItems_MultipleFiles(t *testing.T) {
	base := t.TempDir()
	src1 := filepath.Join(base, "c.txt")
	src2 := filepath.Join(base, "d.txt")
	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)
	os.WriteFile(src1, []byte("ccc"), 0644)
	os.WriteFile(src2, []byte("ddd"), 0644)

	fm := newTestFM()
	if err := fm.MoveItems([]string{src1, src2}, dst); err != nil {
		t.Fatalf("MoveItems error: %v", err)
	}

	// 원본 사라짐
	for _, src := range []string{src1, src2} {
		if _, err := os.Stat(src); err == nil {
			t.Errorf("%s 원본이 이동 후에도 남아있습니다", src)
		}
	}
	// 대상에 존재
	for _, name := range []string{"c.txt", "d.txt"} {
		if _, err := os.Stat(filepath.Join(dst, name)); err != nil {
			t.Errorf("%s 가 대상 폴더에 없습니다", name)
		}
	}
}

func TestDeleteItems_MultipleFiles(t *testing.T) {
	base := t.TempDir()
	f1 := filepath.Join(base, "x.txt")
	f2 := filepath.Join(base, "y.txt")
	os.WriteFile(f1, []byte("x"), 0644)
	os.WriteFile(f2, []byte("y"), 0644)

	fm := newTestFM()
	if err := fm.DeleteItems([]string{f1, f2}); err != nil {
		t.Fatalf("DeleteItems error: %v", err)
	}

	for _, f := range []string{f1, f2} {
		if _, err := os.Stat(f); err == nil {
			t.Errorf("%s 가 삭제 후에도 남아있습니다", f)
		}
	}
}

// ─── RunStarlarkFile ──────────────────────────────────────────────────────────

func TestRunStarlarkFile_PrintOutput(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "hello.star")
	os.WriteFile(script, []byte(`print("hello, starlark!")`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	if !strings.Contains(out, "hello, starlark!") {
		t.Errorf("출력에 'hello, starlark!'가 없습니다: %q", out)
	}
}

func TestRunStarlarkFile_ArithmeticAndVar(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "calc.star")
	os.WriteFile(script, []byte(`
x = 6 * 7
print(x)
`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	if !strings.Contains(out, "42") {
		t.Errorf("6*7=42 가 출력에 없습니다: %q", out)
	}
}

func TestRunStarlarkFile_SyntaxError(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "bad.star")
	os.WriteFile(script, []byte(`def (`), 0644) // 문법 오류

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile should not return Go error for syntax errors: %v", err)
	}
	if out == "" {
		t.Error("문법 오류 메시지가 출력에 있어야 합니다")
	}
}

func TestRunStarlarkFile_RuntimeError(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "runtime_err.star")
	os.WriteFile(script, []byte(`x = 1 // 0`), 0644) // 런타임 오류 (0 나누기)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile should not return Go error for runtime errors: %v", err)
	}
	if out == "" {
		t.Error("런타임 오류 메시지가 출력에 있어야 합니다")
	}
}

func TestRunStarlarkFile_MultipleLines(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "multi.star")
	os.WriteFile(script, []byte(`
print("line1")
print("line2")
print("line3")
`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	for _, expected := range []string{"line1", "line2", "line3"} {
		if !strings.Contains(out, expected) {
			t.Errorf("출력에 %q 가 없습니다", expected)
		}
	}
}

func TestRunStarlarkFile_NotFound(t *testing.T) {
	fm := newTestFM()
	_, err := fm.RunStarlarkFile("/nonexistent/path/script.star")
	if err == nil {
		t.Error("존재하지 않는 파일 실행 시 에러가 반환되어야 합니다")
	}
}

func TestRunStarlarkFile_FunctionDef(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "func.star")
	os.WriteFile(script, []byte(`
def greet(name):
    print("hello, " + name)

greet("starlark")
`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	if !strings.Contains(out, "hello, starlark") {
		t.Errorf("함수 출력이 없습니다: %q", out)
	}
}

func TestRunStarlarkFile_ForLoop(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "loop.star")
	// Starlark은 함수 내부에서만 for 사용 가능
	os.WriteFile(script, []byte(`
def sum_range():
    total = 0
    for i in range(5):
        total += i
    print(total)

sum_range()
`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	if !strings.Contains(out, "10") {
		t.Errorf("0+1+2+3+4=10 이 출력에 없습니다: %q", out)
	}
}

func TestRunStarlarkFile_IfElse(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "ifelse.star")
	// Starlark은 함수 내부에서만 if 사용 가능
	os.WriteFile(script, []byte(`
def check(x):
    if x > 5:
        print("big")
    else:
        print("small")

check(7)
`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	if !strings.Contains(out, "big") {
		t.Errorf("if/else 출력이 없습니다: %q", out)
	}
}

func TestRunStarlarkFile_ListOps(t *testing.T) {
	base := t.TempDir()
	script := filepath.Join(base, "list.star")
	os.WriteFile(script, []byte(`
items = [1, 2, 3]
items.append(4)
print(len(items))
`), 0644)

	fm := newTestFM()
	out, err := fm.RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	if !strings.Contains(out, "4") {
		t.Errorf("리스트 길이 4 가 출력에 없습니다: %q", out)
	}
}

// ─── GetFileInfo ──────────────────────────────────────────────────────────────

func TestGetFileInfo_File(t *testing.T) {
	base := t.TempDir()
	p := filepath.Join(base, "hello.txt")
	os.WriteFile(p, []byte("hello world"), 0644)

	fm := newTestFM()
	info, err := fm.GetFileInfo(p)
	if err != nil {
		t.Fatalf("GetFileInfo error: %v", err)
	}
	if info.Name != "hello.txt" {
		t.Errorf("expected name hello.txt, got %s", info.Name)
	}
	if info.Size != 11 {
		t.Errorf("expected size 11, got %d", info.Size)
	}
	if info.IsDir {
		t.Error("file should not be a directory")
	}
	if info.Extension != ".txt" {
		t.Errorf("expected extension .txt, got %s", info.Extension)
	}
}

func TestGetFileInfo_Directory(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "mydir")
	os.MkdirAll(dir, 0755)

	fm := newTestFM()
	info, err := fm.GetFileInfo(dir)
	if err != nil {
		t.Fatalf("GetFileInfo error: %v", err)
	}
	if !info.IsDir {
		t.Error("directory should have IsDir=true")
	}
	if info.Name != "mydir" {
		t.Errorf("expected name mydir, got %s", info.Name)
	}
}

func TestGetFileInfo_NotFound(t *testing.T) {
	fm := newTestFM()
	_, err := fm.GetFileInfo("/nonexistent/path/file.txt")
	if err == nil {
		t.Error("존재하지 않는 파일에 에러가 반환되어야 합니다")
	}
}

func TestGetFileInfo_ExtensionLowercase(t *testing.T) {
	base := t.TempDir()
	p := filepath.Join(base, "IMAGE.PNG")
	os.WriteFile(p, []byte{}, 0644)

	fm := newTestFM()
	info, err := fm.GetFileInfo(p)
	if err != nil {
		t.Fatalf("GetFileInfo error: %v", err)
	}
	if info.Extension != ".png" {
		t.Errorf("extension should be lowercase .png, got %s", info.Extension)
	}
}

// ─── CheckCopyConflicts ───────────────────────────────────────────────────────

func TestCheckCopyConflicts_NoConflict(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "src", "file.txt")
	os.MkdirAll(filepath.Dir(src), 0755)
	os.WriteFile(src, []byte("data"), 0644)

	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)

	fm := newTestFM()
	conflicts := fm.CheckCopyConflicts([]string{src}, dst)
	if len(conflicts) != 0 {
		t.Errorf("충돌이 없어야 하는데 %d개 감지됨", len(conflicts))
	}
}

func TestCheckCopyConflicts_WithConflict(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "src", "file.txt")
	os.MkdirAll(filepath.Dir(src), 0755)
	os.WriteFile(src, []byte("source"), 0644)

	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)
	// 목적지에 같은 이름 파일 미리 생성 → 충돌
	os.WriteFile(filepath.Join(dst, "file.txt"), []byte("existing"), 0644)

	fm := newTestFM()
	conflicts := fm.CheckCopyConflicts([]string{src}, dst)
	if len(conflicts) != 1 {
		t.Fatalf("충돌 1개가 감지되어야 합니다, got %d", len(conflicts))
	}
	if conflicts[0].Name != "file.txt" {
		t.Errorf("충돌 파일명 mismatch: %s", conflicts[0].Name)
	}
}

func TestCheckCopyConflicts_MultiplePartialConflict(t *testing.T) {
	base := t.TempDir()
	srcDir := filepath.Join(base, "src")
	os.MkdirAll(srcDir, 0755)
	os.WriteFile(filepath.Join(srcDir, "a.txt"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(srcDir, "b.txt"), []byte("b"), 0644)

	dst := filepath.Join(base, "dst")
	os.MkdirAll(dst, 0755)
	os.WriteFile(filepath.Join(dst, "a.txt"), []byte("existing"), 0644) // a.txt만 충돌

	fm := newTestFM()
	srcs := []string{
		filepath.Join(srcDir, "a.txt"),
		filepath.Join(srcDir, "b.txt"),
	}
	conflicts := fm.CheckCopyConflicts(srcs, dst)
	if len(conflicts) != 1 {
		t.Fatalf("충돌 1개만 있어야 합니다, got %d", len(conflicts))
	}
	if conflicts[0].Name != "a.txt" {
		t.Errorf("충돌 파일명 mismatch: %s", conflicts[0].Name)
	}
}

// ─── WriteTextFile ─────────────────────────────────────────────────────────────

func TestWriteTextFile_EmptyContent(t *testing.T) {
	base := t.TempDir()
	p := filepath.Join(base, "empty.txt")

	fm := newTestFM()
	if err := fm.WriteTextFile(p, ""); err != nil {
		t.Fatalf("WriteTextFile error: %v", err)
	}
	data, _ := os.ReadFile(p)
	if len(data) != 0 {
		t.Errorf("파일이 비어 있어야 합니다, got %d bytes", len(data))
	}
}

func TestWriteTextFile_UnicodeContent(t *testing.T) {
	base := t.TempDir()
	p := filepath.Join(base, "unicode.txt")
	content := "안녕하세요 🌍"

	fm := newTestFM()
	if err := fm.WriteTextFile(p, content); err != nil {
		t.Fatalf("WriteTextFile error: %v", err)
	}
	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("파일 읽기 오류: %v", err)
	}
	if string(data) != content {
		t.Errorf("내용 불일치: got %q", string(data))
	}
}

func TestWriteTextFile_Overwrite(t *testing.T) {
	base := t.TempDir()
	p := filepath.Join(base, "overwrite.txt")
	os.WriteFile(p, []byte("original content"), 0644)

	fm := newTestFM()
	if err := fm.WriteTextFile(p, "new content"); err != nil {
		t.Fatalf("WriteTextFile error: %v", err)
	}
	data, _ := os.ReadFile(p)
	if string(data) != "new content" {
		t.Errorf("덮어쓰기 실패: got %q", string(data))
	}
}

// ─── ListDirectory additional ─────────────────────────────────────────────────

func TestListDirectory_ExactCount(t *testing.T) {
	base := t.TempDir()
	for _, name := range []string{"a.txt", "b.txt", "c.txt"} {
		os.WriteFile(filepath.Join(base, name), []byte{}, 0644)
	}

	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}
	if len(listing.Files) != 3 {
		t.Errorf("파일 3개가 있어야 합니다, got %d", len(listing.Files))
	}
}

func TestListDirectory_NoExtensionFile(t *testing.T) {
	base := t.TempDir()
	os.WriteFile(filepath.Join(base, "Makefile"), []byte{}, 0644)

	fm := newTestFM()
	listing, err := fm.ListDirectory(base)
	if err != nil {
		t.Fatalf("ListDirectory error: %v", err)
	}
	if len(listing.Files) != 1 {
		t.Fatalf("파일 1개가 있어야 합니다, got %d", len(listing.Files))
	}
	if listing.Files[0].Extension != "" {
		t.Errorf("확장자 없는 파일의 Extension은 빈 문자열이어야 합니다, got %q", listing.Files[0].Extension)
	}
}
