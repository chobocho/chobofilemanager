package main

import (
	"os"
	"path/filepath"
	"testing"
)

// ─── Todo #94: 인코딩 감지/디코딩 오류 ────────────────────────────────────────

func TestReadText_UTF8KeepsCompatibilityIdeographs(t *testing.T) {
	p := filepath.Join(t.TempDir(), "hanja.txt")
	text := "豈 更 車 한자 문서 내용입니다" // CJK 호환 한자 (NFC 시 다른 코드포인트로 바뀜)
	os.WriteFile(p, []byte(text), 0644)
	got, err := newTestFM().ReadTextFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if got != text {
		t.Errorf("UTF-8 text must not be altered on read: %q → %q", text, got)
	}
}

func TestReadText_UTF8ComposesNFDHangulOnly(t *testing.T) {
	p := filepath.Join(t.TempDir(), "nfd.txt")
	// NFD 한글 "한" + 호환 한자 "豈"
	os.WriteFile(p, []byte("한 豈"), 0644)
	got, _ := newTestFM().ReadTextFile(p)
	if got != "한 豈" {
		t.Errorf("got %q", got)
	}
}
