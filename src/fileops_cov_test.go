package main

import (
	"archive/zip"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ─── 파일 작업 커버리지 보강: 건너뛰기/이름 변경 이동/덮어쓰기 복원/원자 저장 등 ──────

func writeFile(t *testing.T, p, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}

func exists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}

func TestCopyItemsSkipConflicts_SkipsExistingCopiesRest(t *testing.T) {
	base := t.TempDir()
	src, dst := filepath.Join(base, "src"), filepath.Join(base, "dst")
	writeFile(t, filepath.Join(src, "same.txt"), "new")
	writeFile(t, filepath.Join(src, "fresh.txt"), "fresh")
	writeFile(t, filepath.Join(src, "dir", "in.txt"), "in")
	writeFile(t, filepath.Join(dst, "same.txt"), "old")

	err := newTestFM().CopyItemsSkipConflicts([]string{
		filepath.Join(src, "same.txt"), filepath.Join(src, "fresh.txt"), filepath.Join(src, "dir"),
	}, dst)
	if err != nil {
		t.Fatalf("CopyItemsSkipConflicts: %v", err)
	}
	if got := readFile(t, filepath.Join(dst, "same.txt")); got != "old" {
		t.Errorf("기존 파일은 건너뛰어야 함: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "fresh.txt")); got != "fresh" {
		t.Errorf("충돌 없는 파일은 복사: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "dir", "in.txt")); got != "in" {
		t.Errorf("폴더도 복사: %q", got)
	}
	if !exists(filepath.Join(src, "same.txt")) {
		t.Error("복사는 원본을 유지해야 함")
	}
}

func TestCopyItemsSkipConflicts_MissingSource(t *testing.T) {
	err := newTestFM().CopyItemsSkipConflicts([]string{filepath.Join(t.TempDir(), "x")}, t.TempDir())
	if err == nil {
		t.Error("원본이 없으면 에러")
	}
}

func TestCopyItemsSkipConflicts_IntoSelfRejected(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "a")
	writeFile(t, filepath.Join(src, "f.txt"), "f")
	inner := filepath.Join(src, "inner")
	os.MkdirAll(inner, 0755)
	if err := newTestFM().CopyItemsSkipConflicts([]string{src}, inner); err == nil {
		t.Error("자기 하위 폴더로 복사는 거부")
	}
}

func TestMoveItemsRename_ConflictGetsSuffix(t *testing.T) {
	base := t.TempDir()
	src, dst := filepath.Join(base, "src"), filepath.Join(base, "dst")
	writeFile(t, filepath.Join(src, "a.txt"), "moved")
	writeFile(t, filepath.Join(src, "b.txt"), "b")
	writeFile(t, filepath.Join(dst, "a.txt"), "existing")

	err := newTestFM().MoveItemsRename([]string{filepath.Join(src, "a.txt"), filepath.Join(src, "b.txt")}, dst)
	if err != nil {
		t.Fatalf("MoveItemsRename: %v", err)
	}
	if got := readFile(t, filepath.Join(dst, "a.txt")); got != "existing" {
		t.Errorf("기존 파일은 그대로: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "a (1).txt")); got != "moved" {
		t.Errorf("충돌 파일은 a (1).txt 로 이동: %q", got)
	}
	if got := readFile(t, filepath.Join(dst, "b.txt")); got != "b" {
		t.Errorf("충돌 없는 파일은 같은 이름: %q", got)
	}
	if exists(filepath.Join(src, "a.txt")) || exists(filepath.Join(src, "b.txt")) {
		t.Error("이동 후 원본이 없어야 함")
	}
}

func TestMoveItemsRename_DirIntoSelfRejected(t *testing.T) {
	base := t.TempDir()
	src := filepath.Join(base, "a")
	inner := filepath.Join(src, "inner")
	os.MkdirAll(inner, 0755)
	if err := newTestFM().MoveItemsRename([]string{src}, inner); err == nil {
		t.Error("자기 하위 폴더로 이동은 거부")
	}
	if !exists(inner) {
		t.Error("거부 시 원본 유지")
	}
}

func TestMoveItemsRename_MissingSource(t *testing.T) {
	if err := newTestFM().MoveItemsRename([]string{filepath.Join(t.TempDir(), "x")}, t.TempDir()); err == nil {
		t.Error("원본이 없으면 에러")
	}
}

func TestMoveItemsOverwrite_MissingSourceKeepsDest(t *testing.T) {
	base := t.TempDir()
	dst := filepath.Join(base, "dst")
	writeFile(t, filepath.Join(dst, "a.txt"), "keep")
	err := newTestFM().MoveItemsOverwrite([]string{filepath.Join(base, "src", "a.txt")}, dst)
	if err == nil {
		t.Error("원본이 없으면 에러")
	}
	if got := readFile(t, filepath.Join(dst, "a.txt")); got != "keep" {
		t.Errorf("대상은 그대로: %q", got)
	}
}

// ─── replaceWith ──────────────────────────────────────────────────────────────

func TestReplaceWith_NoExistingDestRunsOp(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "new.txt")
	called := false
	err := replaceWith(dest, func() error { called = true; return os.WriteFile(dest, []byte("n"), 0644) })
	if err != nil || !called {
		t.Fatalf("replaceWith: err=%v called=%v", err, called)
	}
	if readFile(t, dest) != "n" {
		t.Error("op 결과가 남아야 함")
	}
}

func TestReplaceWith_SuccessRemovesBackup(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "d.txt")
	writeFile(t, dest, "old")
	if err := replaceWith(dest, func() error { return os.WriteFile(dest, []byte("new"), 0644) }); err != nil {
		t.Fatal(err)
	}
	if readFile(t, dest) != "new" {
		t.Error("새 내용이어야 함")
	}
	assertNoBackup(t, dir)
}

func TestReplaceWith_FailureRestoresOriginal(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "d.txt")
	writeFile(t, dest, "old")
	opErr := os.ErrPermission
	err := replaceWith(dest, func() error {
		os.WriteFile(dest, []byte("partial"), 0644) // 부분 결과
		return opErr
	})
	if err != opErr {
		t.Errorf("op 에러를 그대로 반환: %v", err)
	}
	if got := readFile(t, dest); got != "old" {
		t.Errorf("실패 시 원래 내용 복원: %q", got)
	}
	assertNoBackup(t, dir)
}

func TestReplaceWith_RestoreFailureMentionsBackup(t *testing.T) {
	dir := t.TempDir()
	dest := filepath.Join(dir, "d.txt")
	writeFile(t, dest, "old")
	err := replaceWith(dest, func() error {
		// 백업을 지워 복원이 불가능한 상황을 만듦
		matches, _ := filepath.Glob(filepath.Join(dir, "*"+backupMarker+"*"))
		for _, m := range matches {
			os.Remove(m)
		}
		return os.ErrInvalid
	})
	if err == nil || !strings.Contains(err.Error(), "복원 실패") {
		t.Errorf("복원 실패 정보가 에러에 포함되어야 함, got %v", err)
	}
}

func TestReplaceWith_LstatErrorIsReturned(t *testing.T) {
	called := false
	err := replaceWith("bad\x00name", func() error { called = true; return nil })
	if err == nil {
		t.Error("잘못된 경로의 Lstat 에러를 반환해야 함")
	}
	if called {
		t.Error("Lstat 실패 시 op 를 실행하면 안 됨")
	}
}

func assertNoBackup(t *testing.T, dir string) {
	t.Helper()
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), backupMarker) {
			t.Errorf("백업 파일이 남음: %s", e.Name())
		}
	}
}

// ─── writeFileAtomic / writeUserFile ─────────────────────────────────────────

func TestWriteUserFile_NewFileAndKeepPerm(t *testing.T) {
	p := filepath.Join(t.TempDir(), "u.txt")
	if err := writeUserFile(p, []byte("one")); err != nil {
		t.Fatal(err)
	}
	if readFile(t, p) != "one" {
		t.Error("새 파일 저장 실패")
	}
	if err := writeUserFile(p, []byte("two")); err != nil {
		t.Fatal(err)
	}
	if readFile(t, p) != "two" {
		t.Error("덮어쓰기 실패")
	}
}

func TestWriteUserFile_DirTargetFails(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "d")
	writeFile(t, filepath.Join(dir, "x"), "x")
	if err := writeUserFile(dir, []byte("data")); err == nil {
		t.Error("폴더 경로에 저장은 원자 교체와 폴백 모두 실패해야 함")
	}
}

// ─── GetFileInfo ─────────────────────────────────────────────────────────────

func TestGetFileInfo_FileDirHiddenMissing(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "Report.PDF")
	writeFile(t, f, "12345")
	fm := newTestFM()

	fi, err := fm.GetFileInfo(f)
	if err != nil {
		t.Fatal(err)
	}
	if fi.Name != "Report.PDF" || fi.Size != 5 || fi.IsDir || fi.Extension != ".pdf" || fi.Path != f || fi.IsSymlink || fi.Permissions == "" {
		t.Errorf("파일 정보 오류: %+v", fi)
	}

	di, err := fm.GetFileInfo(dir)
	if err != nil || !di.IsDir {
		t.Errorf("폴더 정보 오류: %+v %v", di, err)
	}

	hidden := filepath.Join(dir, ".secret")
	writeFile(t, hidden, "")
	hi, _ := fm.GetFileInfo(hidden)
	if hi == nil || !hi.IsHidden {
		t.Errorf("점 파일은 숨김: %+v", hi)
	}

	if _, err := fm.GetFileInfo(filepath.Join(dir, "none")); err == nil {
		t.Error("없는 파일은 에러")
	}
}

func TestGetFileInfo_Symlink(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "real.txt")
	writeFile(t, target, "r")
	link := filepath.Join(dir, "lnk.txt")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink 생성 불가 (권한): %v", err)
	}
	fi, err := newTestFM().GetFileInfo(link)
	if err != nil {
		t.Fatal(err)
	}
	if !fi.IsSymlink || fi.LinkTarget != target {
		t.Errorf("심볼릭 링크 정보 오류: %+v", fi)
	}
}

// ─── ReadTextFileWithEncoding 명시 인코딩 ─────────────────────────────────────

func TestReadTextFileWithEncoding_ExplicitEncodings(t *testing.T) {
	dir := t.TempDir()
	fm := newTestFM()
	cases := []struct {
		enc  string
		data []byte
		want string
	}{
		{"utf-16le", []byte{0xFF, 0xFE, 'o', 0, 'k', 0}, "ok"},
		{"utf-16be", []byte{0, 'o', 0, 'k'}, "ok"},
		{"utf-8-bom", []byte{0xEF, 0xBB, 0xBF, 'o', 'k'}, "ok"},
		{"euc-kr", eucKR(t, "한글"), "한글"},
	}
	for i, c := range cases {
		p := filepath.Join(dir, "f"+string(rune('a'+i))+".txt")
		os.WriteFile(p, c.data, 0644)
		got, err := fm.ReadTextFileWithEncoding(p, c.enc)
		if err != nil || got != c.want {
			t.Errorf("%s: got %q, %v; want %q", c.enc, got, err, c.want)
		}
	}
}

func TestReadTextFileWithEncoding_LargeFileDetectsFromWindow(t *testing.T) {
	// 감지 창(64KB)보다 큰 UTF-8 파일도 정상 판별
	p := filepath.Join(t.TempDir(), "big.txt")
	content := strings.Repeat("가", detectionWindow/3+100)
	os.WriteFile(p, []byte(content), 0644)
	got, err := newTestFM().ReadTextFile(p)
	if err != nil || got != content {
		t.Errorf("큰 UTF-8 파일 읽기 실패: len=%d err=%v", len(got), err)
	}
}

func TestReadTextFileWithEncoding_Missing(t *testing.T) {
	if _, err := newTestFM().ReadTextFileWithEncoding(filepath.Join(t.TempDir(), "x"), "utf-8"); err == nil {
		t.Error("없는 파일은 에러")
	}
}

// ─── CreateStarlarkScratchFile / RunStarlarkFile ──────────────────────────────

func setTempDirEnv(t *testing.T, dir string) {
	t.Helper()
	t.Setenv("TMPDIR", dir)
	t.Setenv("TMP", dir)
	t.Setenv("TEMP", dir)
}

func TestCreateStarlarkScratchFile_InTempDirAndRunnable(t *testing.T) {
	tmp := t.TempDir()
	setTempDirEnv(t, tmp)
	fm := newTestFM()
	p, err := fm.CreateStarlarkScratchFile()
	if err != nil {
		t.Fatal(err)
	}
	if !samePath(filepath.Dir(p), tmp) {
		t.Errorf("스크래치 파일은 임시 폴더에: %s", p)
	}
	out, err := fm.RunStarlarkFile(p)
	if err != nil || out != "Hello, Starlark!\n" {
		t.Errorf("스크래치 템플릿 실행 결과 = %q, %v", out, err)
	}
}

func TestCreateStarlarkScratchFile_TempDirMissing(t *testing.T) {
	setTempDirEnv(t, filepath.Join(t.TempDir(), "does-not-exist"))
	if _, err := newTestFM().CreateStarlarkScratchFile(); err == nil {
		t.Error("임시 폴더가 없으면 에러")
	}
}

func TestRunStarlarkFile_OutputAndErrors(t *testing.T) {
	dir := t.TempDir()
	fm := newTestFM()

	ok := filepath.Join(dir, "ok.star")
	writeFile(t, ok, "def f(n):\n    s = 0\n    while n > 0:\n        s += n\n        n -= 1\n    return s\nprint(f(4))\nprint('x')\n")
	out, err := fm.RunStarlarkFile(ok)
	if err != nil || out != "10\nx\n" {
		t.Errorf("while 루프 실행 결과 = %q, %v", out, err)
	}

	bad := filepath.Join(dir, "bad.star")
	writeFile(t, bad, "print('before')\nfail('boom')\n")
	out, err = fm.RunStarlarkFile(bad)
	if err != nil {
		t.Errorf("스크립트 에러는 출력으로 반환 (err=nil): %v", err)
	}
	if !strings.HasPrefix(out, "before\n") || !strings.Contains(out, "boom") {
		t.Errorf("앞선 출력 + 에러 메시지: %q", out)
	}

	syntaxErr := filepath.Join(dir, "syn.star")
	writeFile(t, syntaxErr, "def (:\n")
	out, err = fm.RunStarlarkFile(syntaxErr)
	if err != nil || out == "" {
		t.Errorf("문법 에러 메시지가 출력이어야 함: %q, %v", out, err)
	}

	if _, err := fm.RunStarlarkFile(filepath.Join(dir, "none.star")); err == nil {
		t.Error("없는 파일은 에러")
	}
}

// ─── RunShellCommand ─────────────────────────────────────────────────────────

func TestRunShellCommand_EchoAndWorkDir(t *testing.T) {
	dir := t.TempDir()
	fm := newTestFM()
	out, err := fm.RunShellCommand("echo hello-cov", dir)
	if err != nil {
		t.Fatalf("RunShellCommand: %v", err)
	}
	if !strings.Contains(out, "hello-cov") {
		t.Errorf("출력 = %q", out)
	}

	pwdCmd := "pwd"
	if runtime.GOOS == "windows" {
		pwdCmd = "cd"
	}
	out, err = fm.RunShellCommand(pwdCmd, dir)
	if err != nil {
		t.Fatal(err)
	}
	if !samePath(strings.TrimSpace(out), dir) {
		t.Errorf("작업 폴더가 적용되어야 함: got %q want %q", strings.TrimSpace(out), dir)
	}
}

func TestRunShellCommand_NonZeroExit(t *testing.T) {
	_, err := newTestFM().RunShellCommand("exit 3", t.TempDir())
	if err == nil {
		t.Error("0 이 아닌 종료 코드는 에러")
	}
}

// ─── CompressItems / ExtractArchive 경계 ─────────────────────────────────────

func TestCompressItems_MultipleSourcesAndUniqueName(t *testing.T) {
	base := t.TempDir()
	writeFile(t, filepath.Join(base, "one.txt"), "1")
	writeFile(t, filepath.Join(base, "folder", "two.txt"), "2")
	out := filepath.Join(t.TempDir(), "pack")
	writeFile(t, out+".zip", "existing") // 같은 이름이 이미 있음

	fm := newTestFM()
	if err := fm.CompressItems([]string{filepath.Join(base, "one.txt"), filepath.Join(base, "folder")}, out); err != nil {
		t.Fatalf("CompressItems: %v", err)
	}
	if readFile(t, out+".zip") != "existing" {
		t.Error("기존 압축 파일을 덮어쓰면 안 됨")
	}
	r, err := zip.OpenReader(out + " (1).zip")
	if err != nil {
		t.Fatalf("pack (1).zip 이 생성되어야 함: %v", err)
	}
	defer r.Close()
	names := map[string]bool{}
	for _, f := range r.File {
		names[f.Name] = true
	}
	for _, want := range []string{"one.txt", "folder/", "folder/two.txt"} {
		if !names[want] {
			t.Errorf("엔트리 %q 누락: %v", want, names)
		}
	}
}

func TestCompressItems_DestDirMissing(t *testing.T) {
	src := filepath.Join(t.TempDir(), "a.txt")
	writeFile(t, src, "a")
	if err := newTestFM().CompressItems([]string{src}, filepath.Join(t.TempDir(), "no", "out.zip")); err == nil {
		t.Error("대상 폴더가 없으면 에러")
	}
}

func TestExtractArchive_MissingArchive(t *testing.T) {
	dest := t.TempDir()
	if err := newTestFM().ExtractArchive(filepath.Join(dest, "none.zip"), dest); err == nil {
		t.Error("없는 압축 파일은 에러")
	}
}

func TestExtractArchive_DirEntriesAndNested(t *testing.T) {
	base := t.TempDir()
	zp := filepath.Join(base, "arc.zip")
	f, _ := os.Create(zp)
	w := zip.NewWriter(f)
	w.Create("empty/")
	fw, _ := w.Create("x/y/z.txt")
	fw.Write([]byte("deep"))
	w.Close()
	f.Close()

	dest := filepath.Join(base, "out")
	os.MkdirAll(dest, 0755)
	if err := newTestFM().ExtractArchive(zp, dest); err != nil {
		t.Fatalf("ExtractArchive: %v", err)
	}
	if fi, err := os.Stat(filepath.Join(dest, "arc", "empty")); err != nil || !fi.IsDir() {
		t.Error("빈 폴더 엔트리도 생성되어야 함")
	}
	if readFile(t, filepath.Join(dest, "arc", "x", "y", "z.txt")) != "deep" {
		t.Error("중첩 파일 내용 오류")
	}
}

// ─── 링크 처리 ─────────────────────────────────────────────────────────────────

func TestResolveLink_RelativeAndNotALink(t *testing.T) {
	base := t.TempDir()
	real := filepath.Join(base, "real")
	os.MkdirAll(real, 0755)
	link := filepath.Join(base, "lnk")
	makeDirLink(t, real, link)
	got, err := resolveLink(link)
	if err != nil {
		t.Fatal(err)
	}
	if !samePath(got, real) {
		t.Errorf("resolveLink = %q, want %q", got, real)
	}
	if _, err := resolveLink(real); err == nil {
		t.Error("링크가 아니면 에러")
	}
}

func TestResolveLink_RelativeSymlink(t *testing.T) {
	base := t.TempDir()
	os.MkdirAll(filepath.Join(base, "real"), 0755)
	link := filepath.Join(base, "rel")
	if err := os.Symlink("real", link); err != nil {
		t.Skipf("symlink 생성 불가: %v", err)
	}
	got, err := resolveLink(link)
	if err != nil {
		t.Fatal(err)
	}
	if !samePath(got, filepath.Join(base, "real")) {
		t.Errorf("상대 링크는 링크 폴더 기준으로 해석: %q", got)
	}
}

func TestCopyLinkTarget_BrokenLinkReported(t *testing.T) {
	base := t.TempDir()
	real := filepath.Join(base, "real")
	os.MkdirAll(real, 0755)
	link := filepath.Join(base, "lnk")
	makeDirLink(t, real, link)
	os.RemoveAll(real) // 대상 삭제 → 끊어진 링크
	err := copyLinkTarget(link, filepath.Join(base, "out"), base)
	if err == nil || !strings.Contains(err.Error(), "링크 대상을 찾을 수 없습니다") {
		t.Errorf("끊어진 링크 에러가 필요, got %v", err)
	}
}

func TestCopyLinkTarget_FileLinkCopiesContent(t *testing.T) {
	base := t.TempDir()
	target := filepath.Join(base, "t.txt")
	writeFile(t, target, "content")
	link := filepath.Join(base, "l.txt")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlink 생성 불가: %v", err)
	}
	out := filepath.Join(base, "copy.txt")
	if err := copyLinkTarget(link, out, base); err != nil {
		t.Fatal(err)
	}
	if readFile(t, out) != "content" {
		t.Error("파일 링크는 대상 내용을 복사")
	}
}

func TestCopyLinkTarget_LinkToRootRejected(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "root")
	os.MkdirAll(root, 0755)
	link := filepath.Join(root, "self")
	makeDirLink(t, root, link)
	err := copyLinkTarget(link, filepath.Join(t.TempDir(), "o"), root)
	if err == nil || !strings.Contains(err.Error(), "상위 폴더") {
		t.Errorf("복사 루트 자신을 가리키는 링크는 거부, got %v", err)
	}
}

// ─── 기타 FileManager ─────────────────────────────────────────────────────────

func TestTrashItems_GuardRejectsBeforeTrash(t *testing.T) {
	// 실제 휴지통은 건드리지 않음: 가드에서 거부되는 경로만 검사
	for _, p := range []string{"", "   "} {
		if err := newTestFM().TrashItems([]string{p}); err == nil || !strings.Contains(err.Error(), "빈 경로") {
			t.Errorf("TrashItems(%q) 는 빈 경로로 거부, got %v", p, err)
		}
	}
}

func TestGetHomeDirectory_MatchesOS(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skip(err)
	}
	if got := newTestFM().GetHomeDirectory(); got != home {
		t.Errorf("GetHomeDirectory = %q, want %q", got, home)
	}
}

func TestListDirectory_EmptyPathUsesHome(t *testing.T) {
	listing, err := newTestFM().ListDirectory("")
	if err != nil {
		t.Fatal(err)
	}
	home, _ := os.UserHomeDir()
	if listing.Path != home {
		t.Errorf("빈 경로는 홈 폴더: %q", listing.Path)
	}
}

func TestBuildOpenCmd_OS(t *testing.T) {
	cmd, err := buildOpenCmd(filepath.Join(t.TempDir(), "x.txt"))
	if runtime.GOOS == "linux" {
		if err != nil || filepath.Base(cmd.Path) != "xdg-open" && cmd.Args[0] != "xdg-open" {
			t.Errorf("Linux 는 xdg-open: %v %v", cmd, err)
		}
		return
	}
	if err == nil {
		t.Error("Linux 외에는 지원하지 않는 OS 에러 (Windows 는 ShellExecuteW 사용)")
	}
}
