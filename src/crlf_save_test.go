package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

// F4 에디터는 CRLF 파일을 저장할 때 CRLF로 되돌려 보냄(프론트 CT-10) — 백엔드의 인코딩 변환 · FTP 저장도 줄바꿈을 바꾸지 않음
func TestWriteText_KeepsCRLF(t *testing.T) {
	d := t.TempDir()
	fm := newTestFM()
	for _, enc := range []string{"auto", "utf-8", "cp949", "utf-16le"} {
		p := filepath.Join(d, enc+".txt")
		if err := fm.WriteTextFileWithEncoding(p, "가\r\nb\r\n", enc); err != nil {
			t.Fatalf("%s: %v", enc, err)
		}
		back, err := fm.ReadTextFileWithEncoding(p, enc)
		if err != nil || back != "가\r\nb\r\n" {
			t.Fatalf("%s: read back %q %v", enc, back, err)
		}
		if enc != "utf-16le" {
			raw, _ := os.ReadFile(p)
			if bytes.Count(raw, []byte("\r\n")) != 2 {
				t.Fatalf("%s: raw bytes %q", enc, raw)
			}
		}
	}
}

func TestFTPWriteText_KeepsCRLF(t *testing.T) {
	a, srv, id := ftpPanelFixture(t)
	if err := a.WriteTextFileWithEncoding("ftp://"+id+"/a.txt", "x\r\ny\r\n", "auto"); err != nil {
		t.Fatal(err)
	}
	if string(srv.stored["/a.txt"]) != "x\r\ny\r\n" {
		t.Fatalf("stored %q", srv.stored["/a.txt"])
	}
}
