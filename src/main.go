package main

import (
	"context"
	"embed"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/windows"

	"totalcmd/internal/osutil"
	"totalcmd/internal/termapp"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// choboTerm은 같은 exe를 Lua 스크립트 호스트(--lua-host)로 다시 실행함 — 창을 만들기 전에 처리 (Todo #118)
	if termapp.RunSubprocess(os.Args) {
		return
	}

	app := NewApp()
	term := newTerminalHost(app)

	err := wails.Run(newAppOptions(app, term))
	if err != nil {
		println("Error:", err.Error())
	}
}

// terminalConfigDir: 터미널(choboTerm) 설정·세션·히스토리 폴더 = <앱 설정 폴더>/term
func terminalConfigDir(a *App) (string, error) {
	dir, err := a.resolvedConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "term"), nil
}

// newTerminalHost: 터미널 설정 폴더를 앱 설정 폴더 아래로 옮기고(처음 한 번 기존 choboTerm 설정 복사) 호스트 생성
func newTerminalHost(a *App) *termapp.Host {
	if dir, err := terminalConfigDir(a); err == nil {
		_, _ = termapp.MigrateConfig(termapp.LegacyConfigDir(), dir)
		termapp.UseConfigDir(dir)
	}
	return termapp.NewHost()
}

// newAppOptions: 파일 관리자와 터미널을 한 창에 바인딩하는 Wails 옵션 (테스트 가능하도록 분리)
func newAppOptions(app *App, term *termapp.Host) *options.App {
	return &options.App{
		Title:            AppTitle(),
		Width:            1280,
		Height:           800,
		MinWidth:         900,
		MinHeight:        600,
		WindowStartState: options.Maximised,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 24, A: 1},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			term.Startup(ctx)
		},
		// 연결된 터미널 탭이 있으면 페이지가 확인한 뒤 닫힘 (app:close 이벤트)
		OnBeforeClose: term.BeforeClose,
		// 종료 시 모든 터미널 세션·웹 서버 정리
		OnShutdown: term.Shutdown,
		// 파일을 끌어다 놓으면 원격 전송에 사용 (터미널 파일 창)
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop:     true,
			DisableWebViewDrop: true,
		},
		Bind: []interface{}{
			app,
			term.Bindings(),
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
			// 창 찾기(다른 인스턴스에서 창 띄우기 등)에 쓰는 클래스 이름
			WindowClassName: osutil.WindowClass,
		},
		Linux: &linux.Options{
			Icon:        nil,
			ProgramName: "chobocho-commander",
		},
	}
}
