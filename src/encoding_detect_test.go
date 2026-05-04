package main

import (
	"strings"
	"testing"

	"golang.org/x/text/encoding/korean"
)

// 인코딩 자동 판별 + UTF-8 변환 통합 테스트.
// 참고: D:\github3\hviewer\encoding.h

func TestDetectEncoding_UTF8BOM(t *testing.T) {
	buf := append([]byte{0xEF, 0xBB, 0xBF}, []byte("hello")...)
	if got := DetectEncoding(buf); got != EncUTF8BOM {
		t.Errorf("UTF-8 BOM 판별 실패: got %v", got)
	}
}

func TestDetectEncoding_UTF16LE_BOM(t *testing.T) {
	buf := []byte{0xFF, 0xFE, 'H', 0, 'i', 0}
	if got := DetectEncoding(buf); got != EncUTF16LE {
		t.Errorf("UTF-16 LE BOM 판별 실패: got %v", got)
	}
}

func TestDetectEncoding_UTF16BE_BOM(t *testing.T) {
	buf := []byte{0xFE, 0xFF, 0, 'H', 0, 'i'}
	if got := DetectEncoding(buf); got != EncUTF16BE {
		t.Errorf("UTF-16 BE BOM 판별 실패: got %v", got)
	}
}

func TestDetectEncoding_UTF8_NoBOM_HangulValid(t *testing.T) {
	buf := []byte("안녕하세요 hello")
	if got := DetectEncoding(buf); got != EncUTF8 {
		t.Errorf("UTF-8 (no BOM) 판별 실패: got %v", got)
	}
}

func TestDetectEncoding_PureASCII는UTF8(t *testing.T) {
	// ASCII만 있으면 인코딩 모호 — UTF-8로 처리해도 무방
	buf := []byte("plain ascii text only.")
	got := DetectEncoding(buf)
	if got != EncUTF8 && got != EncCP949 {
		t.Errorf("ASCII는 UTF-8 또는 CP949 둘 다 허용: got %v", got)
	}
}

func TestDetectEncoding_EUCKR완성형(t *testing.T) {
	enc, err := korean.EUCKR.NewEncoder().Bytes([]byte("안녕하세요 반갑습니다"))
	if err != nil {
		t.Skip("EUC-KR 인코딩 환경 없음:", err)
	}
	if got := DetectEncoding(enc); got != EncCP949 {
		t.Errorf("EUC-KR/CP949 판별 실패: got %v", got)
	}
}

func TestDetectEncoding_Johab가나다(t *testing.T) {
	// "가나다" johab + 충분한 길이 (짧은 파일은 신뢰도 낮음)
	// "가나다" 패턴을 반복해서 johab_hangul_count >= 10 만족
	one := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	var buf []byte
	for i := 0; i < 5; i++ {
		buf = append(buf, one...)
	}
	if got := DetectEncoding(buf); got != EncJohab {
		t.Errorf("Johab 판별 실패: got %v", got)
	}
}

func TestDecodeToUTF8_UTF8BOM_제거(t *testing.T) {
	buf := append([]byte{0xEF, 0xBB, 0xBF}, []byte("hello 안녕")...)
	got, err := DecodeToUTF8(buf, EncUTF8BOM)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	if got != "hello 안녕" {
		t.Errorf("BOM 미제거: got %q", got)
	}
}

func TestDecodeToUTF8_UTF16LE(t *testing.T) {
	// "Hi가" UTF-16 LE: 'H' 0x48 0x00, 'i' 0x69 0x00, '가' 0x00 0xAC
	buf := []byte{0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00, 0x00, 0xAC}
	got, err := DecodeToUTF8(buf, EncUTF16LE)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	if got != "Hi가" {
		t.Errorf("UTF-16 LE 디코딩 실패: got %q", got)
	}
}

func TestDecodeToUTF8_UTF16BE(t *testing.T) {
	// "Hi가" UTF-16 BE: 'H' 0x00 0x48, 'i' 0x00 0x69, '가' 0xAC 0x00
	buf := []byte{0xFE, 0xFF, 0x00, 0x48, 0x00, 0x69, 0xAC, 0x00}
	got, err := DecodeToUTF8(buf, EncUTF16BE)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	if got != "Hi가" {
		t.Errorf("UTF-16 BE 디코딩 실패: got %q", got)
	}
}

func TestDecodeToUTF8_Johab가나다(t *testing.T) {
	src := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	got, err := DecodeToUTF8(src, EncJohab)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	if got != "가나다" {
		t.Errorf("Johab → UTF-8 디코딩 실패: got %q", got)
	}
}

// 판별 → 디코딩 통합 흐름
func TestDetectAndDecode_Johab(t *testing.T) {
	one := []byte{0x88, 0x61, 0x90, 0x61, 0x94, 0x61}
	var buf []byte
	for i := 0; i < 5; i++ {
		buf = append(buf, one...)
	}
	enc := DetectEncoding(buf)
	got, err := DecodeToUTF8(buf, enc)
	if err != nil {
		t.Fatalf("decode err: %v", err)
	}
	if !strings.Contains(got, "가나다") {
		t.Errorf("자동판별→디코드 실패: got %q (enc=%v)", got, enc)
	}
}
