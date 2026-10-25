package termapp

import (
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"totalcmd/internal/osutil"
	"totalcmd/internal/version"
	"totalcmd/internal/web"
)

// runHeadless runs only the web server (--headless, or a headless build)
// until interrupted, and returns the exit code.
func runHeadless(opts cliOptions) int {
	osutil.AttachConsole()
	app := NewApp()
	o := opts.webOptions()
	if o == nil {
		o = &web.Options{}
	}
	w, err := startWeb(app, webPage, *o)
	if err != nil {
		fmt.Fprintln(os.Stderr, "chobocho-term:", err)
		if errors.Is(err, syscall.EADDRINUSE) {
			return 0
		}
		return 1
	}
	fmt.Printf("Chobocho Commander V%s terminal web server (no window)\n\n  %s\n\n", version.Version, w.URL(false))
	if fp := w.Fingerprint(); fp != "" {
		fmt.Printf("  TLS certificate SHA-256: %s\n  (compare it with the one your browser shows before trusting it)\n\n", fp)
	}
	if opts.noToken {
		fmt.Println("WARNING: browser token authentication is disabled. Anyone who can reach this server can use its shells and saved sessions.")
	} else {
		fmt.Println("Anyone with this URL can use this PC's shells and saved sessions: keep it secret.")
	}
	fmt.Println("Ctrl+C stops the server.")
	if opts.open {
		if err := osutil.OpenURL(w.LocalURL()); err != nil {
			fmt.Fprintln(os.Stderr, "chobocho-term: open browser:", err)
		}
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	fmt.Println("stopping...")
	w.Stop()
	app.shutdown(nil)
	return 0
}
