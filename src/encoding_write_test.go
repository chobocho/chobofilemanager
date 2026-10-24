package main

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/text/encoding/korean"
)

// ─── Todo #74: 원래 인코딩으로 저장 ───────────────────────────────────────────

func writeAndRead(t *testing.T, initial []byte, content, enc string) []byte {
	t.Helper()
	p := filepath.Join(t.TempDir(), "f.txt")
	if initial != nil {
		os.WriteFile(p, initial, 0644)
	}
	if err := newTestFM().WriteTextFileWithEncoding(p, content, enc); err != nil {
		t.Fatalf("WriteTextFileWithEncoding(%s): %v", enc, err)
	}
	data, _ := os.ReadFile(p)
	return data
}

func eucKR(t *testing.T, s string) []byte {
	b, err := korean.EUCKR.NewEncoder().Bytes([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestWriteEnc_ExplicitCP949(t *testing.T) {
	got := writeAndRead(t, nil, "한글 abc", "cp949")
	if !bytes.Equal(got, eucKR(t, "한글 abc")) {
		t.Errorf("got % x", got)
	}
}

func TestWriteEnc_AutoKeepsCP949(t *testing.T) {
	orig := eucKR(t, "가나다라마바사 아자차카타파하 한국어 텍스트 파일입니다. 인코딩 유지 확인용 문장.")
	got := writeAndRead(t, orig, "수정된 한글", "auto")
	if !bytes.Equal(got, eucKR(t, "수정된 한글")) {
		t.Errorf("auto should keep CP949, got % x", got)
	}
}

func TestWriteEnc_AutoKeepsUTF16LEWithBOM(t *testing.T) {
	orig := []byte{0xFF, 0xFE, 'a', 0}
	got := writeAndRead(t, orig, "가a", "auto")
	want := []byte{0xFF, 0xFE, 0x00, 0xAC, 'a', 0}
	if !bytes.Equal(got, want) {
		t.Errorf("got % x, want % x", got, want)
	}
}

func TestWriteEnc_UTF16BE(t *testing.T) {
	got := writeAndRead(t, nil, "가", "utf-16be")
	want := []byte{0xFE, 0xFF, 0xAC, 0x00}
	if !bytes.Equal(got, want) {
		t.Errorf("got % x, want % x", got, want)
	}
}

func TestWriteEnc_UTF16Surrogate(t *testing.T) {
	got := writeAndRead(t, nil, "😀", "utf-16le")
	want := []byte{0xFF, 0xFE, 0x3D, 0xD8, 0x00, 0xDE}
	if !bytes.Equal(got, want) {
		t.Errorf("got % x, want % x", got, want)
	}
}

func TestWriteEnc_AutoKeepsUTF8BOM(t *testing.T) {
	orig := []byte{0xEF, 0xBB, 0xBF, 'x'}
	got := writeAndRead(t, orig, "y", "auto")
	if !bytes.Equal(got, []byte{0xEF, 0xBB, 0xBF, 'y'}) {
		t.Errorf("BOM should be kept, got % x", got)
	}
}

func TestWriteEnc_AutoNewFileIsUTF8(t *testing.T) {
	got := writeAndRead(t, nil, "한글", "auto")
	if string(got) != "한글" {
		t.Errorf("new file should be UTF-8, got % x", got)
	}
}

func TestWriteEnc_AutoEmptyFileIsUTF8(t *testing.T) {
	got := writeAndRead(t, []byte{}, "한글", "auto")
	if string(got) != "한글" {
		t.Errorf("empty file should become UTF-8, got % x", got)
	}
}

func TestWriteEnc_JohabRoundTrip(t *testing.T) {
	got := writeAndRead(t, nil, "한글 abc 힣가", "johab")
	if s := johabToString(got); s != "한글 abc 힣가" {
		t.Errorf("johab round trip = %q", s)
	}
}

func TestWriteEnc_UnencodableKeepsFile(t *testing.T) {
	p := filepath.Join(t.TempDir(), "f.txt")
	orig := eucKR(t, "원본")
	os.WriteFile(p, orig, 0644)
	if err := newTestFM().WriteTextFileWithEncoding(p, "이모지 😀", "cp949"); err == nil {
		t.Error("unencodable rune should return error")
	}
	if data, _ := os.ReadFile(p); !bytes.Equal(data, orig) {
		t.Error("file must be left unchanged on encode error")
	}
}

func TestWriteEnc_JohabUnencodable(t *testing.T) {
	p := filepath.Join(t.TempDir(), "f.txt")
	if err := newTestFM().WriteTextFileWithEncoding(p, "漢", "johab"); err == nil {
		t.Error("non-Hangul should not be silently written as johab")
	}
}
