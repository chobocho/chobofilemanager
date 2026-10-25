package main

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

// ─── App 래퍼 메서드: 임시 폴더에서 실제 결과까지 검증 ─────────────────────────────

func TestApp_Startup_KeepsContext(t *testing.T) {
	a := newCovApp(t)
	type key struct{}
	ctx := context.WithValue(context.Background(), key{}, "v")
	a.startup(ctx)
	if a.ctx != ctx {
		t.Error("startup은 Wails 컨텍스트를 보관해야 함")
	}
}

func TestApp_FileWrappers_EndToEnd(t *testing.T) {
	a := newCovApp(t)
	base := t.TempDir()
	src := filepath.Join(base, "src")
	dst := filepath.Join(base, "dst")

	// 폴더/파일 생성
	if err := a.CreateDirectory(src); err != nil {
		t.Fatal(err)
	}
	if err := a.CreateDirectory(src); err == nil {
		t.Error("이미 있는 폴더 생성은 에러")
	}
	if err := a.CreateDirectory(dst); err != nil {
		t.Fatal(err)
	}
	aTxt := a.JoinPath(src, "a.txt")
	if err := a.CreateFile(aTxt); err != nil {
		t.Fatal(err)
	}
	if err := a.CreateFile(aTxt); err == nil {
		t.Error("이미 있는 파일 생성은 에러")
	}

	// 쓰기/읽기
	if err := a.WriteTextFile(aTxt, "hello"); err != nil {
		t.Fatal(err)
	}
	if got, err := a.ReadTextFile(aTxt); err != nil || got != "hello" {
		t.Errorf("ReadTextFile = %q, %v", got, err)
	}
	bTxt := filepath.Join(src, "b.txt")
	if err := a.WriteTextFileWithEncoding(bTxt, "한글", "cp949"); err != nil {
		t.Fatal(err)
	}
	if raw, _ := os.ReadFile(bTxt); string(raw) != string(mustEUCKR(t, "한글")) {
		t.Errorf("CP949 로 저장되어야 함: % x", raw)
	}
	if got, err := a.ReadTextFileWithEncoding(bTxt, "cp949"); err != nil || got != "한글" {
		t.Errorf("ReadTextFileWithEncoding = %q, %v", got, err)
	}

	// 목록 / 정보
	listing, err := a.ListDirectory(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(listing.Files) != 2 || listing.Files[0].Name != "a.txt" || listing.Files[1].Name != "b.txt" {
		t.Errorf("ListDirectory = %+v", listing.Files)
	}
	fi, err := a.GetFileInfo(aTxt)
	if err != nil || fi.Size != 5 {
		t.Errorf("GetFileInfo = %+v, %v", fi, err)
	}

	// 복사 계열
	if c := a.CheckCopyConflicts([]string{aTxt}, dst); len(c) != 0 {
		t.Errorf("처음에는 충돌 없음: %+v", c)
	}
	if err := a.CopyItems([]string{aTxt}, dst); err != nil {
		t.Fatal(err)
	}
	conf := a.CheckCopyConflicts([]string{aTxt, bTxt}, dst)
	if len(conf) != 1 || conf[0].Name != "a.txt" || conf[0].DestPath != filepath.Join(dst, "a.txt") {
		t.Errorf("CheckCopyConflicts = %+v", conf)
	}
	if err := a.CopyItemsRename([]string{aTxt}, dst); err != nil {
		t.Fatal(err)
	}
	if readFile(t, filepath.Join(dst, "a (1).txt")) != "hello" {
		t.Error("CopyItemsRename 은 a (1).txt 생성")
	}
	a.WriteTextFile(aTxt, "changed")
	if err := a.CopyItemsSkipConflicts([]string{aTxt, bTxt}, dst); err != nil {
		t.Fatal(err)
	}
	if readFile(t, filepath.Join(dst, "a.txt")) != "hello" {
		t.Error("CopyItemsSkipConflicts 는 기존 파일 유지")
	}
	if !exists(filepath.Join(dst, "b.txt")) {
		t.Error("CopyItemsSkipConflicts 는 충돌 없는 파일 복사")
	}

	// 이동 계열
	mv := filepath.Join(base, "mv")
	a.CreateDirectory(mv)
	if err := a.MoveItems([]string{filepath.Join(dst, "b.txt")}, mv); err != nil {
		t.Fatal(err)
	}
	if exists(filepath.Join(dst, "b.txt")) || !exists(filepath.Join(mv, "b.txt")) {
		t.Error("MoveItems 결과 오류")
	}
	writeFile(t, filepath.Join(dst, "b.txt"), "second")
	if err := a.MoveItemsRename([]string{filepath.Join(dst, "b.txt")}, mv); err != nil {
		t.Fatal(err)
	}
	if readFile(t, filepath.Join(mv, "b (1).txt")) != "second" {
		t.Error("MoveItemsRename 은 b (1).txt 로 이동")
	}
	writeFile(t, filepath.Join(dst, "b.txt"), "third")
	if err := a.MoveItemsOverwrite([]string{filepath.Join(dst, "b.txt")}, mv); err != nil {
		t.Fatal(err)
	}
	if readFile(t, filepath.Join(mv, "b.txt")) != "third" {
		t.Error("MoveItemsOverwrite 는 기존 파일 교체")
	}

	// 이름 변경
	renamed := filepath.Join(mv, "renamed.txt")
	if err := a.RenameItem(filepath.Join(mv, "b.txt"), renamed); err != nil {
		t.Fatal(err)
	}
	if !exists(renamed) {
		t.Error("RenameItem 결과 없음")
	}

	// 검색
	res, err := a.SearchFiles(base, "renamed", true)
	if err != nil || len(res) != 1 || res[0].Path != renamed {
		t.Errorf("SearchFiles = %+v, %v", res, err)
	}

	// 경로 도우미
	if a.GetParentPath(renamed) != mv {
		t.Errorf("GetParentPath = %q", a.GetParentPath(renamed))
	}

	// 압축 / 해제
	zipBase := filepath.Join(base, "pack")
	if err := a.CompressItems([]string{src}, zipBase); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(base, "out")
	a.CreateDirectory(out)
	if err := a.ExtractArchive(zipBase+".zip", out); err != nil {
		t.Fatal(err)
	}
	if readFile(t, filepath.Join(out, "pack", "src", "a.txt")) != "changed" {
		t.Error("압축→해제 왕복 내용 오류")
	}

	// 삭제
	if err := a.DeleteItems([]string{mv, out}); err != nil {
		t.Fatal(err)
	}
	if exists(mv) || exists(out) {
		t.Error("DeleteItems 후 남아 있음")
	}
	if err := a.TrashItems([]string{""}); err == nil {
		t.Error("빈 경로 휴지통 이동은 가드에서 거부")
	}
}

func TestApp_ImageStarlarkHomeDrives(t *testing.T) {
	a := newCovApp(t)
	dir := t.TempDir()

	png := filepath.Join(dir, "p.png")
	os.WriteFile(png, []byte{0x89, 'P', 'N', 'G'}, 0644)
	url, err := a.ReadImageFile(png)
	if err != nil || url != "data:image/png;base64,iVBORw==" {
		t.Errorf("ReadImageFile = %q, %v", url, err)
	}

	setTempDirEnv(t, dir)
	scratch, err := a.CreateStarlarkScratchFile()
	if err != nil || !strings.HasSuffix(scratch, ".star") {
		t.Fatalf("CreateStarlarkScratchFile = %q, %v", scratch, err)
	}
	if out, err := a.RunStarlarkFile(scratch); err != nil || !strings.Contains(out, "Hello, Starlark!") {
		t.Errorf("RunStarlarkFile = %q, %v", out, err)
	}

	home, _ := os.UserHomeDir()
	if a.GetHomeDirectory() != home {
		t.Errorf("GetHomeDirectory = %q", a.GetHomeDirectory())
	}
	if runtime.GOOS == "windows" && len(a.GetDrives()) == 0 {
		t.Error("Windows 에서는 드라이브가 하나 이상")
	}
}

// Todo #126: 셸 명령은 넘긴 폴더에서 돌고, 프로세스 작업 폴더(터미널과 함께 쓰는 전역 상태)는 그대로
func TestApp_ShellAndWorkingDirectory(t *testing.T) {
	a := newCovApp(t)
	dir := t.TempDir()
	before, _ := os.Getwd()
	out, err := a.RunShellCommand("echo app-shell", dir)
	if err != nil || !strings.Contains(out, "app-shell") {
		t.Errorf("RunShellCommand = %q, %v", out, err)
	}
	if after, _ := os.Getwd(); after != before {
		t.Errorf("작업 폴더가 바뀜: %q → %q", before, after)
	}
	// 패널을 옮길 때마다 os.Chdir 하던 바인딩은 없어야 함
	if _, ok := reflect.TypeOf(a).MethodByName("ChangeWorkingDirectory"); ok {
		t.Error("ChangeWorkingDirectory 바인딩이 남아 있음")
	}
}

func TestApp_FTPWrappers_EndToEnd(t *testing.T) {
	a := newCovApp(t)
	srv := startFakeFTP(t)
	srv.listings = map[string][]string{"/": {lsFileA, lsDirSub}}
	srv.files = map[string][]byte{"/a.TXT": []byte("remote")}
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
	conns := a.FTPGetConnections()
	if len(conns) != 1 || conns[0].ID != id {
		t.Fatalf("FTPGetConnections = %+v", conns)
	}

	listing, err := a.FTPListDirectory(id, "/")
	if err != nil || len(listing.Files) != 2 {
		t.Fatalf("FTPListDirectory = %+v, %v", listing, err)
	}

	local := t.TempDir()
	if err := a.FTPDownload(id, "/a.TXT", local); err != nil {
		t.Fatal(err)
	}
	if readFile(t, filepath.Join(local, "a.TXT")) != "remote" {
		t.Error("FTPDownload 내용 오류")
	}

	up := filepath.Join(local, "up.txt")
	writeFile(t, up, "upload")
	if err := a.FTPUpload(id, up, "/"); err != nil {
		t.Fatal(err)
	}
	srv.mu.Lock()
	stored := string(srv.stored["/up.txt"])
	srv.mu.Unlock()
	if stored != "upload" {
		t.Errorf("FTPUpload 저장 내용 = %q", stored)
	}

	if err := a.FTPCreateDirectory(id, "/nd"); err != nil {
		t.Error(err)
	}
	if err := a.FTPRenameItem(id, "/a.TXT", "/b.TXT"); err != nil {
		t.Error(err)
	}
	if err := a.FTPDeleteItem(id, "/b.TXT", false); err != nil {
		t.Error(err)
	}
	cmds := srv.received()
	for _, want := range []string{"MKD /nd", "RNFR /a.TXT", "RNTO /b.TXT", "DELE /b.TXT"} {
		if !hasCommandPrefix(cmds, want) {
			t.Errorf("명령 %q 누락: %v", want, cmds)
		}
	}

	if err := a.FTPDisconnect(id); err != nil {
		t.Error(err)
	}
	if len(a.FTPGetConnections()) != 0 {
		t.Error("연결 해제 후 목록이 비어야 함")
	}
	if err := a.FTPDisconnect(id); err == nil {
		t.Error("이미 해제한 연결은 에러")
	}
}

func TestApp_FTPBookmarkAndHistoryWrappers(t *testing.T) {
	a := newCovApp(t)

	if err := a.FTPSaveBookmark(FTPBookmark{ID: "b1", Name: "srv", Config: FTPConfig{Host: "h", Password: "pw"}}); err != nil {
		t.Fatal(err)
	}
	bms := a.FTPGetBookmarks()
	if len(bms) != 1 || bms[0].Config.Password != "" {
		t.Errorf("FTPGetBookmarks = %+v (비밀번호는 저장 안 함)", bms)
	}
	if err := a.FTPDeleteBookmark("b1"); err != nil || len(a.FTPGetBookmarks()) != 0 {
		t.Errorf("FTPDeleteBookmark 실패: %v", err)
	}

	a.FTPAddHistory(FTPConfig{Host: "h", Port: 21, Username: "u"})
	a.FTPAddHistory(FTPConfig{Host: "h2", Port: 21})
	h := a.FTPGetHistory()
	if len(h) != 2 || h[0].Host != "h2" {
		t.Fatalf("FTPGetHistory = %+v", h)
	}
	if err := a.FTPDeleteHistory("h:21:u"); err != nil || len(a.FTPGetHistory()) != 1 {
		t.Errorf("FTPDeleteHistory 실패: %v", err)
	}
	if err := a.FTPClearHistory(); err != nil || len(a.FTPGetHistory()) != 0 {
		t.Errorf("FTPClearHistory 실패: %v", err)
	}
}
