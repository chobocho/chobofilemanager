package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// ─── 설정 / 파일 북마크 / 드라이브 커버리지 보강 ─────────────────────────────────

// newCovApp: 실제 홈 디렉토리를 건드리지 않는 App (FTP 북마크/히스토리도 임시 경로)
func newCovApp(t *testing.T) *App {
	t.Helper()
	return &App{
		fileManager: NewFileManager(),
		ftpManager:  newTestFTPManager(t),
		configDir:   t.TempDir(),
	}
}

func writeSettings(t *testing.T, a *App, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(a.configDir, "settings.json"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestLoadPanelPaths_OldFormatLeftRightOnly(t *testing.T) {
	a := newCovApp(t)
	left := t.TempDir()
	missing := filepath.Join(t.TempDir(), "gone")
	writeSettings(t, a, `{"leftPath":`+jsonQuote(left)+`,"rightPath":`+jsonQuote(missing)+`}`)

	s := a.LoadPanelPaths()
	if s.LeftPath != left {
		t.Errorf("존재하는 구버전 leftPath 는 유지: got %q", s.LeftPath)
	}
	if s.RightPath != "" {
		t.Errorf("존재하지 않는 구버전 rightPath 는 비워야 함: got %q", s.RightPath)
	}
	if s.LeftTabs != nil || s.RightTabs != nil {
		t.Error("구버전 형식에는 탭 정보가 없어야 함")
	}
}

func TestLoadPanelPaths_InvalidJSONReturnsEmpty(t *testing.T) {
	a := newCovApp(t)
	writeSettings(t, a, `{not json`)
	s := a.LoadPanelPaths()
	if s.LeftPath != "" || s.RightPath != "" || s.LeftTabs != nil || s.RightTabs != nil {
		t.Errorf("손상된 JSON 은 빈 설정으로: %+v", s)
	}
}

func TestLoadPanelPaths_AllTabsInvalidClearsPath(t *testing.T) {
	a := newCovApp(t)
	gone := filepath.Join(t.TempDir(), "gone")
	writeSettings(t, a, `{"leftPath":`+jsonQuote(gone)+`,"rightPath":`+jsonQuote(gone)+
		`,"leftTabs":{"paths":[`+jsonQuote(gone)+`],"activeIdx":0},"rightTabs":{"paths":[],"activeIdx":3}}`)
	s := a.LoadPanelPaths()
	if s.LeftPath != "" || s.RightPath != "" {
		t.Errorf("유효한 탭이 없으면 경로를 비워야 함: %+v", s)
	}
	if len(s.LeftTabs.Paths) != 0 || s.RightTabs.ActiveIdx != 0 {
		t.Errorf("탭 정규화 오류: left=%+v right=%+v", s.LeftTabs, s.RightTabs)
	}
}

func TestSaveSessionState_EmptyTabs(t *testing.T) {
	a := newCovApp(t)
	if err := a.SaveSessionState(nil, 5, nil, -1); err != nil {
		t.Fatalf("SaveSessionState: %v", err)
	}
	s := a.LoadPanelPaths()
	if s.LeftPath != "" || s.RightPath != "" {
		t.Errorf("빈 탭 목록은 빈 경로: %+v", s)
	}
}

func TestConfigDir_DefaultAndOverride(t *testing.T) {
	def, err := defaultConfigDir()
	if err != nil {
		t.Fatalf("defaultConfigDir: %v", err)
	}
	home, _ := os.UserHomeDir()
	if def != filepath.Join(home, ".chobocho-commander") {
		t.Errorf("defaultConfigDir = %q", def)
	}

	// configDir 가 비어 있으면 기본값 (경로 계산만 — 파일은 만들지 않음)
	a := &App{}
	got, err := a.resolvedConfigDir()
	if err != nil || got != def {
		t.Errorf("resolvedConfigDir(기본) = %q, %v", got, err)
	}
	a.configDir = "custom-dir"
	if got, _ := a.resolvedConfigDir(); got != "custom-dir" {
		t.Errorf("resolvedConfigDir(주입) = %q", got)
	}
}

func TestConfigDir_UnwritableReportsErrors(t *testing.T) {
	// configDir 자리에 일반 파일이 있으면 MkdirAll 이 실패
	blocker := filepath.Join(t.TempDir(), "file")
	os.WriteFile(blocker, []byte("x"), 0644)
	a := &App{fileManager: NewFileManager(), ftpManager: newTestFTPManager(t), configDir: blocker}

	if err := a.SaveSessionState([]string{"a"}, 0, []string{"b"}, 0); err == nil {
		t.Error("SaveSessionState 는 설정 폴더를 만들 수 없으면 에러")
	}
	if s := a.LoadPanelPaths(); s.LeftPath != "" || s.LeftTabs != nil {
		t.Errorf("LoadPanelPaths 는 빈 설정: %+v", s)
	}
	if err := a.AddFileBookmark("x", t.TempDir()); err == nil {
		t.Error("AddFileBookmark 는 에러를 반환해야 함")
	}
	if bms := a.GetFileBookmarks(); len(bms) != 0 {
		t.Errorf("GetFileBookmarks = %v", bms)
	}
	if err := a.DeleteFileBookmark("x"); err == nil {
		t.Error("DeleteFileBookmark 는 에러를 반환해야 함")
	}
	if err := a.saveFileBookmarks(nil); err == nil {
		t.Error("saveFileBookmarks 는 에러를 반환해야 함")
	}
}

func TestFileBookmarks_OrderIsFileAndDelete(t *testing.T) {
	a := newCovApp(t)
	dir := t.TempDir()
	file := filepath.Join(dir, "note.txt")
	os.WriteFile(file, []byte("n"), 0644)

	if err := a.AddFileBookmark("폴더", dir); err != nil {
		t.Fatal(err)
	}
	if err := a.AddFileBookmark("파일", file); err != nil {
		t.Fatal(err)
	}
	bms := a.GetFileBookmarks()
	if len(bms) != 2 {
		t.Fatalf("got %d", len(bms))
	}
	if bms[0].Name != "폴더" || bms[1].Name != "파일" {
		t.Errorf("추가 순서가 유지되어야 함: %+v", bms)
	}
	if bms[0].IsFile || !bms[1].IsFile {
		t.Errorf("IsFile 플래그 오류: %+v", bms)
	}
	if bms[0].ID == bms[1].ID || bms[0].Created.IsZero() {
		t.Errorf("ID 는 고유하고 생성 시각이 있어야 함: %+v", bms)
	}

	if err := a.DeleteFileBookmark("no-such-id"); err != nil {
		t.Errorf("없는 id 삭제는 에러 없음: %v", err)
	}
	if len(a.GetFileBookmarks()) != 2 {
		t.Error("없는 id 삭제는 목록을 바꾸면 안 됨")
	}
	if err := a.DeleteFileBookmark(bms[0].ID); err != nil {
		t.Fatal(err)
	}
	left := a.GetFileBookmarks()
	if len(left) != 1 || left[0].ID != bms[1].ID {
		t.Errorf("삭제 후 목록 = %+v", left)
	}
}

func TestFileBookmarks_NonexistentPathMessage(t *testing.T) {
	a := newCovApp(t)
	missing := filepath.Join(t.TempDir(), "nope")
	err := a.AddFileBookmark("x", missing)
	if err == nil || !strings.Contains(err.Error(), "경로가 존재하지 않습니다") {
		t.Errorf("존재하지 않는 경로 에러 메시지 필요, got %v", err)
	}
	if len(a.GetFileBookmarks()) != 0 {
		t.Error("실패한 추가는 저장되면 안 됨")
	}
}

func TestGetDrives_HasSystemDrive(t *testing.T) {
	drives := NewFileManager().GetDrives()
	if runtime.GOOS != "windows" {
		// Linux: /proc/mounts 기반 — 형식만 확인
		for _, d := range drives {
			if d.Path == "" {
				t.Errorf("빈 경로 드라이브: %+v", d)
			}
		}
		return
	}
	sys := strings.ToUpper(os.Getenv("SystemDrive"))
	if sys == "" {
		sys = "C:"
	}
	found := false
	for _, d := range drives {
		if len(d.Path) != 3 || d.Path[1:] != `:\` || d.Name != d.Path || d.DriveType != "local" {
			t.Errorf("드라이브 형식 오류: %+v", d)
		}
		if strings.EqualFold(d.Path, sys+`\`) {
			found = true
			if d.TotalSpace <= 0 || d.FreeSpace < 0 || d.FreeSpace > d.TotalSpace {
				t.Errorf("시스템 드라이브 용량 값 이상: %+v", d)
			}
		}
	}
	if !found {
		t.Errorf("시스템 드라이브 %s 가 목록에 없음: %+v", sys, drives)
	}
}

// jsonQuote: Windows 경로의 역슬래시를 JSON 문자열로 이스케이프
func jsonQuote(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
}
