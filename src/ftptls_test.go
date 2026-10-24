package main

import "testing"

// ─── Todo #106: 연결 정보/히스토리에 TLS 설정 보존 ────────────────────────────

func TestGetConnections_ReportsTLS(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.connections["x"] = &ftpConnection{id: "x", seq: 1, config: FTPConfig{Host: "h", Port: 21, UseTLS: true}}
	conns := fm.GetConnections()
	if len(conns) != 1 || !conns[0].UseTLS {
		t.Errorf("connection info should carry UseTLS, got %+v", conns)
	}
}

func TestAddHistory_KeepsTLS(t *testing.T) {
	fm := newTestFTPManager(t)
	fm.AddHistory(FTPConfig{Host: "h", Port: 21, Username: "u", UseTLS: true})
	if h := fm.GetHistory(); len(h) != 1 || !h[0].UseTLS {
		t.Fatalf("history should keep UseTLS, got %+v", h)
	}
	// 같은 서버에 평문으로 다시 접속하면 최신 설정으로 갱신
	fm.AddHistory(FTPConfig{Host: "h", Port: 21, Username: "u", UseTLS: false})
	if h := fm.GetHistory(); len(h) != 1 || h[0].UseTLS || h[0].ConnectCount != 2 {
		t.Errorf("history should update to latest TLS setting, got %+v", h)
	}
}
