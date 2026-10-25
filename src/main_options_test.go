package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"totalcmd/internal/config"
	"totalcmd/internal/osutil"
	"totalcmd/internal/store"
	"totalcmd/internal/termapp"
	"totalcmd/internal/version"
)

// ─── Todo #118: choboTerm이 파일 관리자 창 안에서 동작하도록 창 옵션 통합 ─────────

func newTestTermHost(t *testing.T) *termapp.Host {
	t.Helper()
	cf, hf, sf := config.File, store.HistoryFile, store.SessionsFile
	t.Cleanup(func() { config.File, store.HistoryFile, store.SessionsFile = cf, hf, sf })
	termapp.UseConfigDir(t.TempDir())
	return termapp.NewHost()
}

func TestAppOptions_BindsFileManagerAndTerminal(t *testing.T) {
	app, term := newTestApp(t), newTestTermHost(t)
	opts := newAppOptions(app, term)
	if len(opts.Bind) != 2 || opts.Bind[0] != app || opts.Bind[1] != term.Bindings() {
		t.Fatalf("Bind = %#v, want [file manager App, terminal App]", opts.Bind)
	}
	if opts.Title != AppTitle() {
		t.Errorf("Title = %q", opts.Title)
	}
}

func TestAppOptions_WindowLifecycleHooks(t *testing.T) {
	opts := newAppOptions(newTestApp(t), newTestTermHost(t))
	if opts.OnStartup == nil || opts.OnBeforeClose == nil || opts.OnShutdown == nil {
		t.Fatal("startup, before-close and shutdown must be wired (terminal sessions are closed on exit)")
	}
	// 연결된 탭이 없으면 창은 그대로 닫힘
	if opts.OnBeforeClose(context.Background()) {
		t.Error("idle app must close normally")
	}
}

func TestAppOptions_FileDropAndWindowClass(t *testing.T) {
	opts := newAppOptions(newTestApp(t), newTestTermHost(t))
	if opts.DragAndDrop == nil || !opts.DragAndDrop.EnableFileDrop {
		t.Error("file drop must be enabled (drag files into the terminal file transfer)")
	}
	if opts.Windows == nil || opts.Windows.WindowClassName != osutil.WindowClass {
		t.Error("the window class must match osutil.WindowClass so window raise/handoff find this window")
	}
}

func TestTerminalConfigDir_UnderAppConfigDir(t *testing.T) {
	a := newTestApp(t)
	dir, err := terminalConfigDir(a)
	if err != nil {
		t.Fatal(err)
	}
	if dir != filepath.Join(a.configDir, "term") {
		t.Errorf("terminal config dir = %q", dir)
	}
}

func TestTerminalVersionMatchesApp(t *testing.T) {
	if !strings.HasSuffix(AppTitle(), version.Version) {
		t.Errorf("AppTitle() = %q, internal/version.Version = %q (keep one version)", AppTitle(), version.Version)
	}
}

// Todo #124: 터미널의 창 투명도(설정 > 창 투명도)가 보이려면 웹뷰·창이 투명해야 함.
// 페이지 body는 불투명 배경이라 투명도를 켜지 않으면 보기에는 그대로.
func TestAppOptions_WindowCanBeSeeThrough(t *testing.T) {
	opts := newAppOptions(newTestApp(t), newTestTermHost(t))
	if opts.Windows == nil || !opts.Windows.WebviewIsTransparent || !opts.Windows.WindowIsTranslucent {
		t.Fatalf("Windows options = %+v, want a transparent webview and a translucent window", opts.Windows)
	}
	if opts.BackgroundColour == nil || opts.BackgroundColour.A != 0 {
		t.Errorf("BackgroundColour = %+v, want alpha 0", opts.BackgroundColour)
	}
}
