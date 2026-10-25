package termapp

import (
	"context"
	"testing"
	"time"

	"totalcmd/internal/web"
)

// ─── Todo #128: a second Chobocho Commander shows the running one ───────────

func TestHostHandoffWithoutWebServerStartsNormally(t *testing.T) {
	h := newTestHost(t)
	h.app.webStart = nil
	if h.HandoffToRunning() {
		t.Fatal("no web server in the settings: start normally")
	}
	h.app.webStart = &web.Options{Addr: "127.0.0.1:1"} // nothing listens there
	if h.HandoffToRunning() {
		t.Fatal("nothing running: start normally")
	}
}

func TestHostHandsOffToTheRunningOne(t *testing.T) {
	f := startTestWeb(t, web.Options{}) // "the running Commander", same settings folder
	f.a.ctx = context.Background()
	defer func() { f.a.ctx = nil }()
	shown := make(chan struct{}, 1)
	old := showWindowHook
	showWindowHook = func(*App) { shown <- struct{}{} }
	defer func() { showWindowHook = old }()

	second := &Host{app: NewApp()}
	second.app.webStart = &web.Options{Addr: f.w.Addr()}
	if !second.HandoffToRunning() {
		t.Fatal("the second one must hand off instead of failing on the port")
	}
	select {
	case <-shown:
	case <-time.After(2 * time.Second):
		t.Fatal("the running one's window was not shown")
	}
}
