package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Todo #88: 음수/범위 밖 activeIdx 방어, 경로 필터 후 활성 탭 유지 ───────────

func TestSaveSessionState_NegativeIdxDoesNotPanic(t *testing.T) {
	a := newTestApp(t)
	d := t.TempDir()
	if err := a.SaveSessionState([]string{d}, -1, []string{d}, -5); err != nil {
		t.Fatalf("SaveSessionState: %v", err)
	}
	s := a.LoadPanelPaths()
	if s.LeftTabs.ActiveIdx != 0 || s.RightTabs.ActiveIdx != 0 {
		t.Errorf("negative idx should be clamped to 0, got %d/%d", s.LeftTabs.ActiveIdx, s.RightTabs.ActiveIdx)
	}
}

func TestLoadPanelPaths_NegativeIdxInFileDoesNotPanic(t *testing.T) {
	a := newTestApp(t)
	d := t.TempDir()
	p, _ := a.settingsFilePath()
	os.WriteFile(p, []byte(`{"leftTabs":{"paths":["`+filepath.ToSlash(d)+`"],"activeIdx":-1},"rightTabs":{"paths":["`+filepath.ToSlash(d)+`"],"activeIdx":-3}}`), 0644)
	s := a.LoadPanelPaths()
	if s.LeftTabs.ActiveIdx != 0 || s.RightTabs.ActiveIdx != 0 {
		t.Errorf("got %d/%d", s.LeftTabs.ActiveIdx, s.RightTabs.ActiveIdx)
	}
}

func TestLoadPanelPaths_ActiveTabKeptAfterFilter(t *testing.T) {
	a := newTestApp(t)
	d1, d2 := t.TempDir(), t.TempDir()
	gone := filepath.Join(t.TempDir(), "gone")
	// 활성 탭은 d2 (index 2). 앞의 gone이 제거되어도 d2가 활성이어야 함
	if err := a.SaveSessionState([]string{d1, gone, d2}, 2, []string{d1}, 0); err != nil {
		t.Fatal(err)
	}
	s := a.LoadPanelPaths()
	if got := s.LeftTabs.Paths[s.LeftTabs.ActiveIdx]; got != d2 {
		t.Errorf("active tab should stay %s, got %s (idx %d)", d2, got, s.LeftTabs.ActiveIdx)
	}
	if s.LeftPath != d2 {
		t.Errorf("LeftPath should be %s, got %s", d2, s.LeftPath)
	}
}
