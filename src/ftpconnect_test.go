package main

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

// ─── Todo #80: Connect가 새 연결 id를 반환 ────────────────────────────────────

func TestFTPConnect_ReturnsID(t *testing.T) {
	srv := startFakeFTP(t)
	fm := newTestFTPManager(t)
	id, err := fm.Connect(srv.config())
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	if id == "" {
		t.Fatal("Connect should return the new connection id")
	}
	if _, err := fm.getConn(id); err != nil {
		t.Errorf("returned id must be registered: %v", err)
	}
	fm.Disconnect(id)
}

func TestFTPConnect_TwoServersDistinctIDs(t *testing.T) {
	a, b := startFakeFTP(t), startFakeFTP(t)
	fm := newTestFTPManager(t)
	idA, err := fm.Connect(a.config())
	if err != nil {
		t.Fatal(err)
	}
	idB, err := fm.Connect(b.config())
	if err != nil {
		t.Fatal(err)
	}
	if idA == idB {
		t.Fatal("ids must differ")
	}
	ca, _ := fm.getConn(idA)
	cb, _ := fm.getConn(idB)
	if ca.config.Port != a.port() || cb.config.Port != b.port() {
		t.Errorf("id→server mapping wrong: A=%d(want %d) B=%d(want %d)", ca.config.Port, a.port(), cb.config.Port, b.port())
	}
	fm.Disconnect(idA)
	fm.Disconnect(idB)
}

func TestFTPGetConnections_SortedByConnectTime(t *testing.T) {
	fm := newTestFTPManager(t)
	var ids []string
	for i := 0; i < 5; i++ {
		srv := startFakeFTP(t)
		id, err := fm.Connect(srv.config())
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	for round := 0; round < 10; round++ {
		conns := fm.GetConnections()
		for i, c := range conns {
			if c.ID != ids[i] {
				t.Fatalf("round %d: GetConnections order = index %d is %s, want %s", round, i, c.ID, ids[i])
			}
		}
	}
	for _, id := range ids {
		fm.Disconnect(id)
	}
}

// ─── Todo #81: UseTLS면 AUTH TLS를 요구, 실패 시 평문으로 진행하지 않음 ──────────

func TestFTPConnect_TLSRefusedDoesNotSendPassword(t *testing.T) {
	srv := startFakeFTP(t) // AUTH → 502
	cfg := srv.config()
	cfg.UseTLS = true
	fm := newTestFTPManager(t)
	if id, err := fm.Connect(cfg); err == nil {
		fm.Disconnect(id)
		t.Fatal("Connect must fail when server refuses TLS")
	}
	cmds := srv.received()
	if !hasCommandPrefix(cmds, "AUTH TLS") {
		t.Errorf("client should request AUTH TLS, got %v", cmds)
	}
	if hasCommandPrefix(cmds, "PASS") || hasCommandPrefix(cmds, "USER") {
		t.Errorf("credentials must not be sent in cleartext: %v", cmds)
	}
}

func TestFTPConnect_PlainDoesNotRequestTLS(t *testing.T) {
	srv := startFakeFTP(t)
	fm := newTestFTPManager(t)
	id, err := fm.Connect(srv.config())
	if err != nil {
		t.Fatal(err)
	}
	fm.Disconnect(id)
	if hasCommandPrefix(srv.received(), "AUTH") {
		t.Error("plain FTP should not send AUTH")
	}
}

// ─── Todo #83: 한 연결에 대한 동시 호출이 제어 채널에서 섞이지 않음 ────────────────

func TestFTPConcurrentRenamesDoNotInterleave(t *testing.T) {
	srv := startFakeFTP(t)
	var mu sync.Mutex
	pending := ""
	pairs := map[string]string{}
	srv.handler = func(cmd, arg string) string {
		switch cmd {
		case "RNFR":
			mu.Lock()
			pending = arg
			mu.Unlock()
			time.Sleep(2 * time.Millisecond) // 경합 창을 넓힘
			return "350 ready"
		case "RNTO":
			mu.Lock()
			pairs[pending] = arg
			mu.Unlock()
			return "250 renamed"
		}
		return ""
	}
	fm := newTestFTPManager(t)
	id, err := fm.Connect(srv.config())
	if err != nil {
		t.Fatal(err)
	}
	defer fm.Disconnect(id)

	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if err := fm.RenameItem(id, fmt.Sprintf("/f%d", i), fmt.Sprintf("/g%d", i)); err != nil {
				errs <- err
			}
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Errorf("rename error: %v", err)
	}
	for i := 0; i < 20; i++ {
		from, to := fmt.Sprintf("/f%d", i), fmt.Sprintf("/g%d", i)
		if pairs[from] != to {
			t.Errorf("RNFR %s was paired with RNTO %q (interleaved)", from, pairs[from])
		}
	}
}

func TestFTPDisconnectDoesNotBlockOtherConnections(t *testing.T) {
	slow := startFakeFTP(t)
	release := make(chan struct{})
	slow.handler = func(cmd, arg string) string {
		if cmd == "QUIT" {
			<-release // 응답 없는 서버 흉내
			return "221 bye"
		}
		return ""
	}
	fast := startFakeFTP(t)
	fm := newTestFTPManager(t)
	slowID, err := fm.Connect(slow.config())
	if err != nil {
		t.Fatal(err)
	}
	fastID, err := fm.Connect(fast.config())
	if err != nil {
		t.Fatal(err)
	}
	defer fm.Disconnect(fastID)

	go fm.Disconnect(slowID)
	time.Sleep(20 * time.Millisecond)

	done := make(chan struct{})
	go func() {
		fm.GetConnections()
		fm.getConn(fastID)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Error("Disconnect of a hung server must not block other connections")
	}
	close(release)
}
