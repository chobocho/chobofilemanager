// chobocho-term is Chobocho Commander's terminal without the window: with
// "-tags headless" it only runs the web server (--headless), for a PC
// without a desktop (no WebView2, GTK or WebKit). It keeps its settings,
// sessions and history in the same folder as the window app.
//
//	go build -tags headless -o chobocho-term-headless.exe ./cmd/chobocho-term
package main

import (
	"totalcmd/internal/appdir"
	"totalcmd/internal/termapp"
)

func main() {
	setupConfig()
	termapp.Main()
}

// setupConfig points the terminal at ~/.chobocho-commander/term, copying a
// standalone choboterm's settings there the first time (as the window app does).
func setupConfig() string {
	dir, err := appdir.TermDir()
	if err != nil {
		return ""
	}
	_, _ = termapp.MigrateConfig(termapp.LegacyConfigDir(), dir)
	termapp.UseConfigDir(dir)
	return dir
}
