package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ─── FTP 커버리지 보강: 목록/업로드/폴더 생성/재귀 삭제/히스토리 ─────────────────

// 서버가 내려주는 unix 형식 LIST 줄
const (
	lsDirSub    = "drwxr-xr-x   2 u g        0 Mar 16  2016 sub"
	lsFileA     = "-rw-r--r--   1 u g       12 Mar 16  2016 a.TXT"
	lsHidden    = "-rw-r--r--   1 u g        3 Mar 16  2016 .hidden"
	lsDot       = "drwxr-xr-x   2 u g        0 Mar 16  2016 ."
	lsDotDot    = "drwxr-xr-x   2 u g        0 Mar 16  2016 .."
	lsFileInSub = "-rw-r--r--   1 u g        5 Mar 16  2016 g.txt"
)

func TestFTPListDirectory_ParsesEntries(t *testing.T) {
	srv := startFakeFTP(t)
	srv.listings = map[string][]string{
		"/pub": {lsDot, lsDotDot, lsDirSub, lsFileA, lsHidden},
	}
	fm, id := connectFake(t, srv)

	listing, err := fm.ListDirectory(id, "/pub")
	if err != nil {
		t.Fatalf("ListDirectory: %v", err)
	}
	if listing.Path != "/pub" {
		t.Errorf("Path = %q, want /pub", listing.Path)
	}
	if len(listing.Files) != 3 {
		t.Fatalf(". 과 .. 은 제외되어 3개여야 함, got %d: %+v", len(listing.Files), listing.Files)
	}
	byName := map[string]FileInfo{}
	for _, f := range listing.Files {
		byName[f.Name] = f
	}
	sub := byName["sub"]
	if !sub.IsDir || sub.Path != "/pub/sub" {
		t.Errorf("sub 폴더 정보 오류: %+v", sub)
	}
	a := byName["a.TXT"]
	if a.IsDir || a.Size != 12 || a.Extension != ".txt" || a.Path != "/pub/a.TXT" || a.IsHidden {
		t.Errorf("a.TXT 정보 오류: %+v", a)
	}
	if a.Modified.Year() != 2016 || a.Modified.Month() != time.March || a.Modified.Day() != 16 {
		t.Errorf("수정 시각 파싱 오류: %v", a.Modified)
	}
	if !byName[".hidden"].IsHidden {
		t.Error(".hidden 은 숨김 파일이어야 함")
	}
	if !hasCommandPrefix(srv.received(), "LIST /pub") {
		t.Errorf("LIST 명령이 전송되어야 함: %v", srv.received())
	}
}

func TestFTPListDirectory_EmptyPathMeansRoot(t *testing.T) {
	srv := startFakeFTP(t)
	srv.listings = map[string][]string{"/": {lsFileA}}
	fm, id := connectFake(t, srv)

	listing, err := fm.ListDirectory(id, "")
	if err != nil {
		t.Fatalf("ListDirectory: %v", err)
	}
	if listing.Path != "/" {
		t.Errorf("빈 경로는 / 로 처리되어야 함, got %q", listing.Path)
	}
	// 루트에서는 경로에 '/'가 중복되지 않아야 함
	if len(listing.Files) != 1 || listing.Files[0].Path != "/a.TXT" {
		t.Errorf("루트 항목 경로 오류: %+v", listing.Files)
	}
}

func TestFTPListDirectory_ServerErrorIsWrapped(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	_, err := fm.ListDirectory(id, "/missing")
	if err == nil || !strings.Contains(err.Error(), "list failed") {
		t.Errorf("list failed 로 감싼 에러가 필요, got %v", err)
	}
}

func TestFTPUpload_StoresContent(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	local := filepath.Join(t.TempDir(), "up.txt")
	os.WriteFile(local, []byte("payload"), 0644)

	if err := fm.Upload(id, local, "/remote/name.bin"); err != nil {
		t.Fatalf("Upload: %v", err)
	}
	srv.mu.Lock()
	got := string(srv.stored["/remote/name.bin"])
	srv.mu.Unlock()
	if got != "payload" {
		t.Errorf("업로드 내용 = %q, want payload", got)
	}
}

func TestFTPUpload_TrailingSlashAppendsLocalName(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	local := filepath.Join(t.TempDir(), "doc.md")
	os.WriteFile(local, []byte("# hi"), 0644)

	if err := fm.Upload(id, local, "/inbox/"); err != nil {
		t.Fatalf("Upload: %v", err)
	}
	srv.mu.Lock()
	_, ok := srv.stored["/inbox/doc.md"]
	srv.mu.Unlock()
	if !ok {
		t.Errorf("'/' 로 끝나는 원격 경로에는 로컬 파일명이 붙어야 함: %v", srv.received())
	}
}

func TestFTPUpload_MissingLocalFile(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	err := fm.Upload(id, filepath.Join(t.TempDir(), "nope.txt"), "/x")
	if err == nil || !strings.Contains(err.Error(), "open local file failed") {
		t.Errorf("로컬 파일 열기 실패 에러가 필요, got %v", err)
	}
	if hasCommandPrefix(srv.received(), "STOR") {
		t.Error("로컬 파일이 없으면 STOR를 보내면 안 됨")
	}
}

func TestFTPUpload_ServerRejects(t *testing.T) {
	srv := startFakeFTP(t)
	srv.handler = func(cmd, arg string) string {
		if cmd == "STOR" {
			return "553 not allowed"
		}
		return ""
	}
	fm, id := connectFake(t, srv)
	local := filepath.Join(t.TempDir(), "a.txt")
	os.WriteFile(local, []byte("x"), 0644)
	if err := fm.Upload(id, local, "/ro/a.txt"); err == nil || !strings.Contains(err.Error(), "not allowed") {
		t.Errorf("서버 거부 에러가 전달되어야 함, got %v", err)
	}
}

func TestFTPCreateDirectory_SendsMKD(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	if err := fm.CreateDirectory(id, "/new/folder"); err != nil {
		t.Fatalf("CreateDirectory: %v", err)
	}
	srv.mu.Lock()
	made := append([]string(nil), srv.made...)
	srv.mu.Unlock()
	if len(made) != 1 || made[0] != "/new/folder" {
		t.Errorf("MKD 기록 = %v", made)
	}
}

func TestFTPCreateDirectory_ServerError(t *testing.T) {
	srv := startFakeFTP(t)
	srv.handler = func(cmd, arg string) string {
		if cmd == "MKD" {
			return "550 exists"
		}
		return ""
	}
	fm, id := connectFake(t, srv)
	if err := fm.CreateDirectory(id, "/dup"); err == nil {
		t.Error("MKD 실패는 에러로 보고되어야 함")
	}
}

func TestFTPDeleteItem_FileSuccess(t *testing.T) {
	srv := startFakeFTP(t)
	fm, id := connectFake(t, srv)
	if err := fm.DeleteItem(id, "/a.txt", false); err != nil {
		t.Fatalf("DeleteItem: %v", err)
	}
	srv.mu.Lock()
	deleted := append([]string(nil), srv.deleted...)
	srv.mu.Unlock()
	if len(deleted) != 1 || deleted[0] != "/a.txt" {
		t.Errorf("DELE 기록 = %v", deleted)
	}
}

func TestFTPDeleteItem_DirRecursiveRemovesTree(t *testing.T) {
	srv := startFakeFTP(t)
	srv.listings = map[string][]string{
		"/d":     {lsDot, lsDotDot, lsFileA, lsDirSub},
		"/d/sub": {lsFileInSub},
	}
	fm, id := connectFake(t, srv)
	if err := fm.DeleteItem(id, "/d", true); err != nil {
		t.Fatalf("DeleteItem(dir): %v\ncmds: %v", err, srv.received())
	}
	srv.mu.Lock()
	deleted := append([]string(nil), srv.deleted...)
	removed := append([]string(nil), srv.removed...)
	srv.mu.Unlock()
	if strings.Join(deleted, ",") != "/d/a.TXT,/d/sub/g.txt" {
		t.Errorf("삭제된 파일 = %v", deleted)
	}
	// 하위 폴더가 먼저 지워지고 마지막에 대상 폴더
	if strings.Join(removed, ",") != "/d/sub,/d" {
		t.Errorf("삭제된 폴더 순서 = %v", removed)
	}
}

func TestFTPRenameItem_Success(t *testing.T) {
	srv := startFakeFTP(t)
	srv.handler = func(cmd, arg string) string {
		switch cmd {
		case "RNFR":
			return "350 ready"
		case "RNTO":
			return "250 renamed"
		}
		return ""
	}
	fm, id := connectFake(t, srv)
	if err := fm.RenameItem(id, "/old.txt", "/new.txt"); err != nil {
		t.Fatalf("RenameItem: %v", err)
	}
	cmds := srv.received()
	if !hasCommandPrefix(cmds, "RNFR /old.txt") || !hasCommandPrefix(cmds, "RNTO /new.txt") {
		t.Errorf("RNFR/RNTO 명령 누락: %v", cmds)
	}
}

func TestFTPOps_UnknownConnectionID(t *testing.T) {
	fm := newTestFTPManager(t)
	local := filepath.Join(t.TempDir(), "x.txt")
	os.WriteFile(local, []byte("x"), 0644)

	ops := map[string]func() error{
		"ListDirectory": func() error { _, err := fm.ListDirectory("nope", "/"); return err },
		"Download":      func() error { return fm.Download("nope", "/a", t.TempDir()) },
		"Upload":        func() error { return fm.Upload("nope", local, "/a") },
		"DeleteItem":    func() error { return fm.DeleteItem("nope", "/a", false) },
		"CreateDir":     func() error { return fm.CreateDirectory("nope", "/a") },
		"RenameItem":    func() error { return fm.RenameItem("nope", "/a", "/b") },
	}
	for name, op := range ops {
		err := op()
		if err == nil || !strings.Contains(err.Error(), "FTP connection not found: nope") {
			t.Errorf("%s: 연결 없음 에러가 필요, got %v", name, err)
		}
	}
	if err := fm.Disconnect("nope"); err == nil || !strings.Contains(err.Error(), "connection not found") {
		t.Errorf("Disconnect: 연결 없음 에러가 필요, got %v", err)
	}
}

func TestFTPConnect_DefaultPortAndAnonymousLogin(t *testing.T) {
	srv := startFakeFTP(t)
	fm := newTestFTPManager(t)
	cfg := srv.config()
	cfg.Username, cfg.Password = "", ""
	id, err := fm.Connect(cfg)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer fm.Disconnect(id)
	if !hasCommandPrefix(srv.received(), "USER anonymous") {
		t.Errorf("사용자 이름이 없으면 anonymous 로 로그인해야 함: %v", srv.received())
	}
	conns := fm.GetConnections()
	if len(conns) != 1 || !conns[0].Connected || conns[0].Port != srv.port() {
		t.Errorf("GetConnections = %+v", conns)
	}
}

func TestFTPConnect_LoginFailure(t *testing.T) {
	srv := startFakeFTP(t)
	srv.handler = func(cmd, arg string) string {
		if cmd == "PASS" {
			return "530 bad password"
		}
		return ""
	}
	fm := newTestFTPManager(t)
	if _, err := fm.Connect(srv.config()); err == nil || !strings.Contains(err.Error(), "login failed") {
		t.Errorf("로그인 실패 에러가 필요, got %v", err)
	}
	if len(fm.GetConnections()) != 0 {
		t.Error("로그인 실패 시 연결이 등록되면 안 됨")
	}
}

func TestFTPConnect_DialFailure(t *testing.T) {
	srv := startFakeFTP(t)
	cfg := srv.config()
	srv.ln.Close() // 접속 거부 상황
	fm := newTestFTPManager(t)
	if _, err := fm.Connect(cfg); err == nil || !strings.Contains(err.Error(), "connection failed") {
		t.Errorf("접속 실패 에러가 필요, got %v", err)
	}
}

// ─── History ──────────────────────────────────────────────────────────────────

func TestFTPHistory_AddDedupesAndCounts(t *testing.T) {
	fm := newTestFTPManager(t)
	cfg := FTPConfig{Host: "h", Port: 21, Username: "bob"}
	fm.AddHistory(cfg)
	first := fm.GetHistory()[0].LastConnected
	time.Sleep(2 * time.Millisecond)
	fm.AddHistory(cfg)

	h := fm.GetHistory()
	if len(h) != 1 {
		t.Fatalf("같은 접속 정보는 하나로 합쳐져야 함, got %d", len(h))
	}
	if h[0].ConnectCount != 2 {
		t.Errorf("ConnectCount = %d, want 2", h[0].ConnectCount)
	}
	if h[0].ID != "h:21:bob" || h[0].Username != "bob" {
		t.Errorf("히스토리 항목 = %+v", h[0])
	}
	if h[0].LastConnected.Before(first) {
		t.Error("LastConnected 가 갱신되어야 함")
	}
}

func TestFTPHistory_AnonymousAndNewestFirst(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.AddHistory(FTPConfig{Host: "a", Port: 21})
	fm.AddHistory(FTPConfig{Host: "b", Port: 2121, Username: "x"})

	h := fm.GetHistory()
	if len(h) != 2 {
		t.Fatalf("got %d", len(h))
	}
	if h[0].Host != "b" || h[1].Host != "a" {
		t.Errorf("최근 항목이 앞에 와야 함: %+v", h)
	}
	if h[1].Username != "anonymous" || h[1].ID != "a:21:anonymous" {
		t.Errorf("빈 사용자 이름은 anonymous 로 기록: %+v", h[1])
	}
}

func TestFTPHistory_CappedAt50(t *testing.T) {
	fm := newTestFTPManager(t)
	for i := 0; i < 55; i++ {
		fm.AddHistory(FTPConfig{Host: "h", Port: 1000 + i})
	}
	h := fm.GetHistory()
	if len(h) != 50 {
		t.Fatalf("최대 50개 유지, got %d", len(h))
	}
	if h[0].Port != 1054 || h[49].Port != 1005 {
		t.Errorf("가장 오래된 항목이 잘려야 함: first=%d last=%d", h[0].Port, h[49].Port)
	}
}

func TestFTPHistory_DeleteAndPersist(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.AddHistory(FTPConfig{Host: "a", Port: 21})
	fm.AddHistory(FTPConfig{Host: "b", Port: 21})

	if err := fm.DeleteHistory("a:21:anonymous"); err != nil {
		t.Fatalf("DeleteHistory: %v", err)
	}
	if err := fm.DeleteHistory("not-there"); err != nil {
		t.Errorf("없는 id 삭제는 nil 이어야 함: %v", err)
	}

	// 같은 파일에서 다시 읽어 영속성 확인
	reloaded := &FTPManager{historyFile: fm.historyFile}
	reloaded.loadHistory()
	h := reloaded.GetHistory()
	if len(h) != 1 || h[0].Host != "b" {
		t.Errorf("파일에 반영된 히스토리 = %+v", h)
	}
}

func TestFTPHistory_ClearPersists(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.AddHistory(FTPConfig{Host: "a", Port: 21})
	if err := fm.ClearHistory(); err != nil {
		t.Fatalf("ClearHistory: %v", err)
	}
	if len(fm.GetHistory()) != 0 {
		t.Error("메모리 히스토리가 비어야 함")
	}
	reloaded := &FTPManager{historyFile: fm.historyFile}
	reloaded.loadHistory()
	if len(reloaded.GetHistory()) != 0 {
		t.Error("파일 히스토리도 비어야 함")
	}
}

func TestFTPHistory_GetReturnsCopy(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.AddHistory(FTPConfig{Host: "a", Port: 21})
	h := fm.GetHistory()
	h[0].Host = "mutated"
	if fm.GetHistory()[0].Host != "a" {
		t.Error("GetHistory 는 내부 슬라이스의 복사본을 돌려줘야 함")
	}
}

func TestFTPHistory_SaveErrorReported(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.historyFile = filepath.Join(t.TempDir(), "missing-dir", "h.json")
	if err := fm.ClearHistory(); err == nil {
		t.Error("저장 폴더가 없으면 ClearHistory 가 에러를 반환해야 함")
	}
	fm.bookmarkFile = filepath.Join(t.TempDir(), "missing-dir", "b.json")
	if err := fm.SaveBookmark(FTPBookmark{Name: "x"}); err == nil {
		t.Error("저장 폴더가 없으면 SaveBookmark 가 에러를 반환해야 함")
	}
}

func TestFTPHistory_LoadValidFile(t *testing.T) {
	fm := newTestFTPManager(t)
	data, _ := json.Marshal([]FTPHistory{{ID: "x:21:u", Host: "x", Port: 21, Username: "u", ConnectCount: 7}})
	os.WriteFile(fm.historyFile, data, 0600)
	fm.loadHistory()
	h := fm.GetHistory()
	if len(h) != 1 || h[0].ConnectCount != 7 {
		t.Errorf("로드된 히스토리 = %+v", h)
	}
	// 기존 항목에 다시 접속하면 카운트 증가
	fm.AddHistory(FTPConfig{Host: "x", Port: 21, Username: "u"})
	if got := fm.GetHistory()[0].ConnectCount; got != 8 {
		t.Errorf("ConnectCount = %d, want 8", got)
	}
}

func TestFTPHistoryID(t *testing.T) {
	cases := []struct {
		cfg  FTPConfig
		want string
	}{
		{FTPConfig{Host: "h", Port: 21}, "h:21:anonymous"},
		{FTPConfig{Host: "h", Port: 990, Username: "me"}, "h:990:me"},
	}
	for _, c := range cases {
		if got := historyID(c.cfg); got != c.want {
			t.Errorf("historyID(%+v) = %q, want %q", c.cfg, got, c.want)
		}
	}
}

func TestLocalNameForRemote(t *testing.T) {
	ok := map[string]string{"/a/b.txt": "b.txt", "c.bin": "c.bin"}
	for in, want := range ok {
		got, err := localNameForRemote(in)
		if err != nil || got != want {
			t.Errorf("localNameForRemote(%q) = %q, %v", in, got, err)
		}
	}
	for _, bad := range []string{"/", "/x/..", "/a/b:c", `/a/b\c`, "/q?.txt"} {
		if _, err := localNameForRemote(bad); err == nil {
			t.Errorf("localNameForRemote(%q) 는 거부되어야 함", bad)
		}
	}
}

// 여러 연결의 GetConnections 정보가 각 서버 설정을 반영하는지
func TestFTPGetConnections_Fields(t *testing.T) {
	fm := newTestFTPManager(t)
	var ids []string
	for i := 0; i < 2; i++ {
		srv := startFakeFTP(t)
		cfg := srv.config()
		cfg.Username = fmt.Sprintf("user%d", i)
		id, err := fm.Connect(cfg)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	defer func() {
		for _, id := range ids {
			fm.Disconnect(id)
		}
	}()
	conns := fm.GetConnections()
	if len(conns) != 2 {
		t.Fatalf("got %d", len(conns))
	}
	for i, c := range conns {
		if c.ID != ids[i] || c.Username != fmt.Sprintf("user%d", i) || c.Host != "127.0.0.1" || c.ConnectedAt.IsZero() {
			t.Errorf("conn[%d] = %+v", i, c)
		}
	}
}
