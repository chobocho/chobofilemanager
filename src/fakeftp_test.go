package main

import (
	"bufio"
	"net"
	"strings"
	"sync"
	"testing"
)

// fakeFTPServer: 제어 채널만 흉내 내는 최소 FTP 서버 (테스트 전용).
// 받은 명령을 기록하고, handler로 응답을 바꿀 수 있습니다.
type fakeFTPServer struct {
	ln       net.Listener
	mu       sync.Mutex
	commands []string
	// handler가 비어 있지 않은 응답을 돌려주면 기본 응답 대신 사용
	handler func(cmd, arg string) string
}

func startFakeFTP(t *testing.T) *fakeFTPServer {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	s := &fakeFTPServer{ln: ln}
	go s.serve()
	t.Cleanup(func() { ln.Close() })
	return s
}

func (s *fakeFTPServer) port() int {
	return s.ln.Addr().(*net.TCPAddr).Port
}

func (s *fakeFTPServer) config() FTPConfig {
	return FTPConfig{Host: "127.0.0.1", Port: s.port(), Username: "u", Password: "secret"}
}

func (s *fakeFTPServer) received() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]string(nil), s.commands...)
}

func (s *fakeFTPServer) serve() {
	for {
		c, err := s.ln.Accept()
		if err != nil {
			return
		}
		go s.handle(c)
	}
}

func (s *fakeFTPServer) handle(c net.Conn) {
	defer c.Close()
	w := bufio.NewWriter(c)
	reply := func(line string) { w.WriteString(line + "\r\n"); w.Flush() }
	reply("220 fake ready")
	r := bufio.NewReader(c)
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		cmd, arg, _ := strings.Cut(line, " ")
		cmd = strings.ToUpper(cmd)
		s.mu.Lock()
		s.commands = append(s.commands, line)
		h := s.handler
		s.mu.Unlock()
		if h != nil {
			if resp := h(cmd, arg); resp != "" {
				reply(resp)
				if cmd == "QUIT" {
					return
				}
				continue
			}
		}
		switch cmd {
		case "USER":
			reply("331 need password")
		case "PASS":
			reply("230 logged in")
		case "TYPE", "OPTS", "NOOP":
			reply("200 ok")
		case "QUIT":
			reply("221 bye")
			return
		default:
			reply("502 not implemented")
		}
	}
}

func hasCommandPrefix(cmds []string, prefix string) bool {
	for _, c := range cmds {
		if strings.HasPrefix(strings.ToUpper(c), prefix) {
			return true
		}
	}
	return false
}
