package transfer

import (
	"bufio"
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"

	"totalcmd/internal/codec"
)

// ─── Todo #130-2: SCP fallback against an in-process fake server ──────────
// The WSL test in termapp (TestSCPFallback) needs CHOBOTERM_WSL; this one runs
// everywhere. The fake answers exactly the commands scpFS sends (ls, scp -f,
// scp -t, rm, mv, mkdir) over a temp folder that stands for "/".

type fakeSCPServer struct {
	root  string
	noSCP bool // "command -v scp" fails, like a box without scp
}

// shellWords undoes shellQuote (quoted runs and backslash escapes) and splits on spaces.
func shellWords(s string) []string {
	var words []string
	var cur strings.Builder
	inWord, quoted := false, false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case quoted && c == '\'':
			quoted = false
		case quoted:
			cur.WriteByte(c)
		case c == '\'':
			quoted, inWord = true, true
		case c == '\\' && i+1 < len(s):
			i++
			cur.WriteByte(s[i])
			inWord = true
		case c == ' ':
			if inWord {
				words = append(words, cur.String())
				cur.Reset()
				inWord = false
			}
		default:
			cur.WriteByte(c)
			inWord = true
		}
	}
	if inWord {
		words = append(words, cur.String())
	}
	return words
}

func (f *fakeSCPServer) local(p string) string { return filepath.Join(f.root, filepath.FromSlash(p)) }

// exec runs one command on the channel and returns the exit status.
func (f *fakeSCPServer) exec(cmd string, ch ssh.Channel) uint32 {
	w := shellWords(cmd)
	fail := func(format string, a ...interface{}) uint32 {
		fmt.Fprintf(ch.Stderr(), format+"\n", a...)
		return 1
	}
	switch {
	case cmd == "command -v scp":
		if f.noSCP {
			return 1
		}
		io.WriteString(ch, "/usr/bin/scp\n")
	case cmd == "pwd":
		io.WriteString(ch, "/home/test\n")
	case len(w) == 4 && w[0] == "LC_ALL=C" && w[1] == "ls" && w[2] == "-laL":
		entries, err := os.ReadDir(f.local(w[3]))
		if err != nil {
			return fail("ls: cannot access '%s': No such file or directory", w[3])
		}
		io.WriteString(ch, "total 8\ndrwxr-xr-x 2 u g 4096 Oct  3 01:02 .\ndrwxr-xr-x 2 u g 4096 Oct  3 01:02 ..\n")
		for _, e := range entries {
			info, _ := e.Info()
			kind := "-"
			if e.IsDir() {
				kind = "d"
			}
			fmt.Fprintf(ch, "%srw-r--r-- 1 u g %d Jan 15  2024 %s\n", kind, info.Size(), e.Name())
		}
	case len(w) == 3 && w[0] == "scp" && w[1] == "-f":
		return f.send(w[2], ch)
	case len(w) == 3 && w[0] == "scp" && w[1] == "-t":
		return f.receive(w[2], ch)
	case len(w) == 4 && w[0] == "rm" && w[3] != "" && w[2] == "--":
		rm := os.Remove
		if w[1] == "-rf" {
			rm = os.RemoveAll
		}
		if err := rm(f.local(w[3])); err != nil {
			return fail("rm: cannot remove '%s'", w[3])
		}
	case len(w) == 4 && w[0] == "mv" && w[1] == "--":
		if err := os.Rename(f.local(w[2]), f.local(w[3])); err != nil {
			return fail("mv: cannot move '%s'", w[2])
		}
	case len(w) == 3 && w[0] == "mkdir" && w[1] == "--":
		if err := os.Mkdir(f.local(w[2]), 0o755); err != nil {
			return fail("mkdir: cannot create directory '%s': File exists", w[2])
		}
	default:
		return fail("sh: unknown command: %s", cmd)
	}
	return 0
}

// send is the remote side of "scp -f": wait for 0, send header, data, 0.
func (f *fakeSCPServer) send(p string, ch ssh.Channel) uint32 {
	r := bufio.NewReader(ch)
	if b, err := r.ReadByte(); err != nil || b != 0 {
		return 1
	}
	st, err := os.Stat(f.local(p))
	if err != nil {
		fmt.Fprintf(ch, "\x01scp: %s: No such file or directory\n", p)
		return 1
	}
	if st.IsDir() {
		fmt.Fprintf(ch, "D0755 0 %s\n", filepath.Base(p))
		return 1
	}
	data, _ := os.ReadFile(f.local(p))
	fmt.Fprintf(ch, "C0644 %d %s\n", len(data), filepath.Base(p))
	if b, err := r.ReadByte(); err != nil || b != 0 {
		return 1
	}
	ch.Write(data)
	ch.Write([]byte{0})
	r.ReadByte()
	return 0
}

// receive is the remote side of "scp -t": ack, read "C0644 size name", ack,
// read data and the trailing 0, ack.
func (f *fakeSCPServer) receive(dir string, ch ssh.Channel) uint32 {
	if st, err := os.Stat(f.local(dir)); err != nil || !st.IsDir() {
		fmt.Fprintf(ch, "\x02scp: %s: No such file or directory\n", dir)
		return 1
	}
	ch.Write([]byte{0})
	r := bufio.NewReader(ch)
	header, err := r.ReadString('\n')
	if err != nil {
		return 1
	}
	fields := strings.SplitN(strings.TrimSpace(header), " ", 3)
	size, _ := strconv.ParseInt(fields[1], 10, 64)
	ch.Write([]byte{0})
	data := make([]byte, size)
	if _, err := io.ReadFull(r, data); err != nil {
		return 1
	}
	r.ReadByte()
	os.WriteFile(filepath.Join(f.local(dir), fields[2]), data, 0o644)
	ch.Write([]byte{0})
	return 0
}

func startFakeSCP(t *testing.T, f *fakeSCPServer) *ssh.Client {
	t.Helper()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	signer, _ := ssh.NewSignerFromKey(priv)
	cfg := &ssh.ServerConfig{NoClientAuth: true}
	cfg.AddHostKey(signer)
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			nc, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				_, chans, reqs, err := ssh.NewServerConn(nc, cfg)
				if err != nil {
					return
				}
				go ssh.DiscardRequests(reqs)
				for nch := range chans {
					ch, chReqs, err := nch.Accept()
					if err != nil {
						continue
					}
					go func() {
						for req := range chReqs {
							if req.Type != "exec" {
								req.Reply(false, nil)
								continue
							}
							req.Reply(true, nil)
							n := binary.BigEndian.Uint32(req.Payload)
							status := f.exec(string(req.Payload[4:4+n]), ch)
							ch.SendRequest("exit-status", false, binary.BigEndian.AppendUint32(nil, status))
							ch.Close()
							return
						}
					}()
				}
			}()
		}
	}()
	client, err := ssh.Dial("tcp", ln.Addr().String(), &ssh.ClientConfig{User: "test", HostKeyCallback: ssh.InsecureIgnoreHostKey()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { client.Close() })
	return client
}

func newFakeSCP(t *testing.T) (*scpFS, string) {
	t.Helper()
	root := t.TempDir()
	fs, err := NewSCP(startFakeSCP(t, &fakeSCPServer{root: root}), codec.New("utf-8"))
	if err != nil {
		t.Fatal(err)
	}
	return fs, root
}

func TestShellWordsUndoesShellQuote(t *testing.T) {
	for _, s := range []string{"plain", "with space", "it's", "''", "a'b'c", "/tmp/한글 폴더"} {
		if got := shellWords("mv -- " + shellQuote(s) + " " + shellQuote("x")); len(got) != 4 || got[2] != s || got[3] != "x" {
			t.Errorf("%q → %q", s, got)
		}
	}
}

func TestSCPRefusesAServerWithoutSCP(t *testing.T) {
	_, err := NewSCP(startFakeSCP(t, &fakeSCPServer{root: t.TempDir(), noSCP: true}), codec.New("utf-8"))
	if err == nil || !strings.Contains(err.Error(), "scp") {
		t.Fatalf("err = %v", err)
	}
}

func TestSCPGetwdAndList(t *testing.T) {
	fs, root := newFakeSCP(t)
	if wd, _ := fs.Getwd(); wd != "/home/test" {
		t.Fatalf("wd = %q", wd)
	}
	os.MkdirAll(filepath.Join(root, "d", "sub dir"), 0o755)
	os.WriteFile(filepath.Join(root, "d", "한글.txt"), []byte("hello"), 0o644)
	list, err := fs.List("/d")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Name != "sub dir" || !list[0].IsDir || list[1].Name != "한글.txt" || list[1].Size != 5 || list[1].ModTime != "2024-01-15" {
		t.Fatalf("list = %+v", list)
	}
	if _, err := fs.List("/missing"); err == nil || !strings.Contains(err.Error(), "No such file") {
		t.Fatalf("missing folder: err = %v (want the server's message)", err)
	}
}

func TestSCPDownload(t *testing.T) {
	fs, root := newFakeSCP(t)
	os.WriteFile(filepath.Join(root, "it's.txt"), []byte("quoted name"), 0o644)
	os.Mkdir(filepath.Join(root, "folder"), 0o755)
	var buf bytes.Buffer
	if err := fs.Download("/it's.txt", &buf); err != nil {
		t.Fatal(err)
	}
	if buf.String() != "quoted name" {
		t.Fatalf("got %q", buf.String())
	}
	if err := fs.Download("/none.txt", io.Discard); err == nil || !strings.Contains(err.Error(), "No such file") {
		t.Fatalf("missing file: err = %v", err)
	}
	if err := fs.Download("/folder", io.Discard); err == nil || !strings.Contains(err.Error(), "폴더") {
		t.Fatalf("folder: err = %v", err)
	}
}

func TestSCPUpload(t *testing.T) {
	fs, root := newFakeSCP(t)
	os.Mkdir(filepath.Join(root, "up"), 0o755)
	data := bytes.Repeat([]byte("0123456789"), 10000)
	if err := fs.Upload("/up/new file.bin", bytes.NewReader(data), int64(len(data))); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(filepath.Join(root, "up", "new file.bin")); !bytes.Equal(got, data) {
		t.Fatalf("uploaded %d bytes, want %d", len(got), len(data))
	}
	if err := fs.Upload("/nowhere/a.txt", strings.NewReader("x"), 1); err == nil || !strings.Contains(err.Error(), "No such file") {
		t.Fatalf("missing folder: err = %v", err)
	}
}

func TestSCPRemoveRenameMkdir(t *testing.T) {
	fs, root := newFakeSCP(t)
	os.WriteFile(filepath.Join(root, "a.txt"), []byte("A"), 0o644)
	os.MkdirAll(filepath.Join(root, "tree", "x"), 0o755)

	if err := fs.Rename("/a.txt", "/b c.txt"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "b c.txt")); err != nil {
		t.Fatal("rename did not happen")
	}
	if err := fs.Mkdir("/new"); err != nil {
		t.Fatal(err)
	}
	if err := fs.Mkdir("/new"); err == nil || !strings.Contains(err.Error(), "File exists") {
		t.Fatalf("mkdir twice: err = %v", err)
	}
	if err := fs.Remove("/b c.txt", false); err != nil {
		t.Fatal(err)
	}
	if err := fs.Remove("/tree", true); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"b c.txt", "tree"} {
		if _, err := os.Stat(filepath.Join(root, n)); err == nil {
			t.Fatalf("%s still there", n)
		}
	}
	if err := fs.Close(); err != nil {
		t.Fatal(err)
	}
}
