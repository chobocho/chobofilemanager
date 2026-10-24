package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"path"
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
	// RETR 시 데이터 채널로 보낼 내용과 전송 후 최종 응답 (기본 "226 done")
	files     map[string][]byte
	retrFinal string
	// LIST 응답: 경로 → unix 형식 줄 목록 (없으면 550). MKD/RMD/STOR/DELE 결과 기록
	listings map[string][]string
	dirs     map[string]bool // CWD 가능한 폴더 (listings 키도 포함)
	stored   map[string][]byte
	made     []string
	removed  []string
	deleted  []string
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
	var dataLn net.Listener
	cwd := "/"
	defer func() {
		if dataLn != nil {
			dataLn.Close()
		}
	}()
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
		case "EPSV":
			if dataLn != nil {
				dataLn.Close()
			}
			dataLn, _ = net.Listen("tcp", "127.0.0.1:0")
			reply(fmt.Sprintf("229 Entering Extended Passive Mode (|||%d|)", dataLn.Addr().(*net.TCPAddr).Port))
		case "RETR":
			s.mu.Lock()
			data, ok := s.files[arg]
			final := s.retrFinal
			s.mu.Unlock()
			if !ok || dataLn == nil {
				reply("550 not found")
				continue
			}
			reply("150 opening")
			dc, err := dataLn.Accept()
			if err != nil {
				return
			}
			dc.Write(data)
			dc.Close()
			if final == "" {
				final = "226 done"
			}
			reply(final)
		case "LIST", "NLST":
			// 클라이언트가 "LIST -a /path" 형태로 보낼 수도 있으므로 옵션 제거
			p := strings.TrimSpace(strings.TrimPrefix(arg, "-a"))
			if p == "" {
				p = cwd
			}
			s.mu.Lock()
			lines, ok := s.listings[p]
			s.mu.Unlock()
			if !ok || dataLn == nil {
				reply("550 no such directory")
				continue
			}
			reply("150 listing")
			dc, err := dataLn.Accept()
			if err != nil {
				return
			}
			for _, l := range lines {
				dc.Write([]byte(l + "\r\n"))
			}
			dc.Close()
			reply("226 done")
		case "STOR":
			if dataLn == nil {
				reply("425 no data connection")
				continue
			}
			reply("150 ok to send")
			dc, err := dataLn.Accept()
			if err != nil {
				return
			}
			data, _ := io.ReadAll(dc)
			dc.Close()
			s.mu.Lock()
			if s.stored == nil {
				s.stored = map[string][]byte{}
			}
			s.stored[arg] = data
			s.mu.Unlock()
			reply("226 stored")
		case "MKD":
			s.mu.Lock()
			s.made = append(s.made, arg)
			s.mu.Unlock()
			reply(fmt.Sprintf("257 \"%s\" created", arg))
		case "RMD":
			s.mu.Lock()
			s.removed = append(s.removed, arg)
			s.mu.Unlock()
			reply("250 removed")
		case "DELE":
			s.mu.Lock()
			s.deleted = append(s.deleted, path.Join(cwd, arg))
			s.mu.Unlock()
			reply("250 deleted")
		case "PWD":
			reply(fmt.Sprintf("257 \"%s\" is current directory", cwd))
		case "CWD":
			target := arg
			if !strings.HasPrefix(target, "/") {
				target = path.Join(cwd, target)
			}
			s.mu.Lock()
			_, listed := s.listings[target]
			ok := listed || s.dirs[target] || target == "/"
			s.mu.Unlock()
			if !ok {
				reply("550 no such directory")
				continue
			}
			cwd = target
			reply("250 ok")
		case "CDUP":
			cwd = path.Dir(cwd)
			reply("250 ok")
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
		if strings.HasPrefix(strings.ToUpper(c), strings.ToUpper(prefix)) {
			return true
		}
	}
	return false
}
