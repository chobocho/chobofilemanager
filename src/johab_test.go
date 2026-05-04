package main

import (
	"strings"
	"testing"
)

// 조합형(Johab, KS X 1001-1992 부속서 3 / CP1361) 디코더 단위 테스트
// 참고: D:\github3\hviewer\johab.h

// johab "가" = 0x8861 (cho=ㄱ idx0, jung=ㅏ idx0, jong=받침없음 idx0)
// 비트: 1 00010 00011 00001 (cho_bits=2, jung_bits=3, jong_bits=1)
// → 0xAC00 = '가'
func TestJohabDecodeSyllable_가(t *testing.T) {
	got := johabDecodeSyllable(0x8861)
	if got != 0xAC00 {
		t.Errorf("johab '가' 디코드 실패: got U+%04X, want U+AC00", got)
	}
}

// johab "힣" = 0xD3BD (cho=ㅎ idx18→bits 0x14, jung=ㅣ idx20→bits 0x1D,
// jong=ㅎ idx27→bits 0x1D)
//   syllable = 0xAC00 + (18*21+20)*28 + 27 = 0xD7A3
func TestJohabDecodeSyllable_힣(t *testing.T) {
	got := johabDecodeSyllable(0xD3BD)
	if got != 0xD7A3 {
		t.Errorf("johab '힣' 디코드 실패: got U+%04X, want U+D7A3", got)
	}
}

// MSB=0 (ASCII 영역) → 0 반환
func TestJohabDecodeSyllable_ASCII는Invalid(t *testing.T) {
	if got := johabDecodeSyllable(0x4141); got != 0 {
		t.Errorf("ASCII 영역은 invalid해야 함: got U+%04X", got)
	}
}

// 비트 패턴 invalid (cho_bits=0x00) → 0 반환
func TestJohabDecodeSyllable_InvalidCho(t *testing.T) {
	// MSB=1, cho_bits=0x00 (invalid), jung=ㅏ, jong=없음
	code := uint16(0x8000) | (0x00 << 10) | (0x03 << 5) | 0x01
	if got := johabDecodeSyllable(code); got != 0 {
		t.Errorf("invalid cho는 0 반환해야 함: got U+%04X", got)
	}
}

func TestJohabToString_가나다(t *testing.T) {
	// "가" 0x8861, "나" 0x9061, "다" 0x9461
	// (cho 인덱스: ㄱ=0, ㄲ=1, ㄴ=2, ㄷ=3 — ㄲ 포함)
	src := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	got := johabToString(src)
	want := "가나다"
	if got != want {
		t.Errorf("johab 변환: got %q, want %q", got, want)
	}
}

func TestJohabToString_ASCII통과(t *testing.T) {
	src := []byte("hello")
	got := johabToString(src)
	if got != "hello" {
		t.Errorf("ASCII 통과 실패: got %q", got)
	}
}

func TestJohabToString_혼합(t *testing.T) {
	// "A가B"
	src := []byte{0x41, 0x88, 0x61, 0x42}
	got := johabToString(src)
	if got != "A가B" {
		t.Errorf("혼합 텍스트: got %q", got)
	}
}

// 잘린 멀티바이트 끝 → replacement (U+FFFD)로 처리
func TestJohabToString_잘린끝(t *testing.T) {
	src := []byte{0x88} // lead만 있고 trail 없음
	got := johabToString(src)
	if !strings.ContainsRune(got, '�') {
		t.Errorf("잘린 끝은 U+FFFD로 대체되어야 함: got %q", got)
	}
}

func TestJohabScore_NoneHangul는0(t *testing.T) {
	src := []byte("plain ASCII text only.")
	if s := johabScore(src); s != 0 {
		t.Errorf("ASCII만 있으면 attempts=0이라 score=0: got %d", s)
	}
}

func TestJohabScore_가나다는100(t *testing.T) {
	src := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	if s := johabScore(src); s != 100 {
		t.Errorf("순수 johab은 100점: got %d", s)
	}
}

func TestJohabHangulCount_3(t *testing.T) {
	// "가나다" 3 syllables
	src := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	if c := johabHangulCount(src); c != 3 {
		t.Errorf("음절 수: got %d, want 3", c)
	}
}
