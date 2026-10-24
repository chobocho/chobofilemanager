package main

import (
	"strings"
	"testing"

	"golang.org/x/text/encoding/korean"
)

// ─── 인코딩 판별/변환 커버리지 보강 ───────────────────────────────────────────

func TestEncoding_String(t *testing.T) {
	cases := map[Encoding]string{
		EncUnknown:   "Unknown",
		EncUTF8BOM:   "UTF-8 (BOM)",
		EncUTF16LE:   "UTF-16 LE",
		EncUTF16BE:   "UTF-16 BE",
		EncUTF8:      "UTF-8",
		EncCP949:     "CP949 (EUC-KR)",
		EncJohab:     "Johab (조합형)",
		Encoding(99): "Unknown",
	}
	for enc, want := range cases {
		if got := enc.String(); got != want {
			t.Errorf("Encoding(%d).String() = %q, want %q", int(enc), got, want)
		}
	}
}

func mustEUCKR(t *testing.T, s string) []byte {
	t.Helper()
	b, err := korean.EUCKR.NewEncoder().Bytes([]byte(s))
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestDecodeToUTF8_AllEncodings(t *testing.T) {
	johab, err := johabEncode("한글")
	if err != nil {
		t.Fatal(err)
	}
	nfd := "한" // 조합형 자모 ㅎ+ㅏ+ㄴ → "한"
	cases := []struct {
		name string
		in   []byte
		enc  Encoding
		want string
	}{
		{"UTF8BOM", append([]byte{0xEF, 0xBB, 0xBF}, "abc"...), EncUTF8BOM, "abc"},
		{"UTF8BOM-short", []byte{0xEF, 0xBB}, EncUTF8BOM, "\xEF\xBB"},
		{"UTF8-NFD", []byte(nfd), EncUTF8, "한"},
		{"UTF16LE-BOM", []byte{0xFF, 0xFE, 'h', 0, 'i', 0}, EncUTF16LE, "hi"},
		{"UTF16LE-noBOM", []byte{'h', 0, 'i', 0}, EncUTF16LE, "hi"},
		{"UTF16LE-odd", []byte{'h', 0, 'i'}, EncUTF16LE, "h"},
		{"UTF16BE-BOM", []byte{0xFE, 0xFF, 0, 'h', 0, 'i'}, EncUTF16BE, "hi"},
		{"UTF16BE-noBOM", []byte{0xD5, 0x5C}, EncUTF16BE, "한"},
		{"CP949", mustEUCKR(t, "가나"), EncCP949, "가나"},
		{"Johab", johab, EncJohab, "한글"},
		{"Unknown-raw", []byte("raw"), EncUnknown, "raw"},
	}
	for _, c := range cases {
		got, err := DecodeToUTF8(c.in, c.enc)
		if err != nil {
			t.Errorf("%s: err %v", c.name, err)
			continue
		}
		if got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}

func TestEncodeDecode_RoundTripAllEncodings(t *testing.T) {
	text := "안녕 hello"
	for _, enc := range []Encoding{EncUTF8, EncUTF8BOM, EncUTF16LE, EncUTF16BE, EncCP949, EncJohab} {
		b, err := EncodeFromUTF8(text, enc)
		if err != nil {
			t.Errorf("%v: encode err %v", enc, err)
			continue
		}
		got, err := DecodeToUTF8(b, enc)
		if err != nil || got != text {
			t.Errorf("%v: round trip = %q, %v", enc, got, err)
		}
	}
}

func TestEncodeFromUTF8_CP949UnrepresentableFails(t *testing.T) {
	// 이모지는 CP949로 표현할 수 없음
	if _, err := EncodeFromUTF8("😀", EncCP949); err == nil || !strings.Contains(err.Error(), "CP949") {
		t.Errorf("CP949 인코딩 실패 에러가 필요, got %v", err)
	}
}

func TestDetectEncoding_Branches(t *testing.T) {
	johabLong, err := johabEncode(strings.Repeat("한글조합형텍스트입니다", 3))
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name string
		in   []byte
		want Encoding
	}{
		{"empty", nil, EncUTF8},
		{"ascii", []byte("plain ascii text\n"), EncUTF8},
		{"utf8-bom", []byte{0xEF, 0xBB, 0xBF, 'a'}, EncUTF8BOM},
		{"utf16le-bom", []byte{0xFF, 0xFE, 'a', 0}, EncUTF16LE},
		{"utf16be-bom", []byte{0xFE, 0xFF, 0, 'a'}, EncUTF16BE},
		// BOM 없는 UTF-16은 판별 불가 → 기본값 UTF-8 로 폴백
		{"utf16le-noBOM", []byte{'a', 0, 'b', 0, 'c', 0}, EncUTF8},
		{"utf8-one-multibyte", []byte("a한"), EncUTF8},
		{"utf8-many", []byte("한글 텍스트입니다"), EncUTF8},
		// 마지막 멀티바이트가 잘려도 앞부분이 유효하면 UTF-8
		{"utf8-truncated-tail", append([]byte("한글텍스트"), 0xED, 0x95), EncUTF8},
		{"cp949-short", mustEUCKR(t, "한글"), EncCP949},
		{"cp949-long", mustEUCKR(t, "안녕하세요 반갑습니다. 오늘 날씨가 좋네요."), EncCP949},
		{"johab-long", johabLong, EncJohab},
		// 상위 비트 바이트지만 어느 쪽 범위에도 맞지 않음 → UTF-8 기본값
		{"garbage-low-score", []byte{0x80, 0x20, 0x80, 0x20, 0x80, 0x20}, EncUTF8},
	}
	for _, c := range cases {
		if got := DetectEncoding(c.in); got != c.want {
			t.Errorf("%s: DetectEncoding = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestUtf8ValidityScore_Branches(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
		want int
	}{
		{"ascii", []byte("abc"), 0},
		{"two-hangul", []byte("한글"), 2},
		{"four-byte", []byte("😀"), 1},
		{"two-byte", []byte("é"), 1},
		{"invalid-lead", []byte{0xFF, 0x41}, 0},
		{"overlong-C0", []byte{0xC0, 0x80}, 0},
		{"out-of-range-F5", []byte{0xF5, 0x80, 0x80, 0x80}, 0},
		{"bad-continuation", []byte{0xE0, 0x41, 0x41}, 0},
		{"truncated-only", []byte{0xED, 0x95}, 0},
		{"truncated-after-hit", append([]byte("한"), 0xED, 0x95), 1},
	}
	for _, c := range cases {
		if got := utf8ValidityScore(c.in); got != c.want {
			t.Errorf("%s: utf8ValidityScore = %d, want %d", c.name, got, c.want)
		}
	}
}

func TestCp949ExtensionRatio_Branches(t *testing.T) {
	if got := cp949ExtensionRatio([]byte("ascii")); got != 0 {
		t.Errorf("ASCII 만 있으면 0, got %d", got)
	}
	// 표준 완성형 영역만 → 0%
	if got := cp949ExtensionRatio(mustEUCKR(t, "가나다")); got != 0 {
		t.Errorf("완성형 본 영역은 0%%, got %d", got)
	}
	// lead 0x81~0xA0 (확장 영역) 1쌍 + trail 0x41~0x7A 1쌍 + 본 영역 2쌍 → 50%
	in := []byte{0x81, 0xA1, 0xB0, 0x41, 0xB0, 0xA1, 0xB0, 0xA1}
	if got := cp949ExtensionRatio(in); got != 50 {
		t.Errorf("확장 영역 비율 = %d, want 50", got)
	}
}

func TestCp949Score_Range(t *testing.T) {
	if got := cp949Score([]byte("abc")); got != 0 {
		t.Errorf("ASCII → 0, got %d", got)
	}
	if got := cp949Score(mustEUCKR(t, "한글")); got != 100 {
		t.Errorf("완성형 → 100, got %d", got)
	}
	// lead 0x80 은 CP949 lead 범위 밖
	if got := cp949Score([]byte{0x80, 0x41, 0xB0, 0xA1}); got != 50 {
		t.Errorf("절반만 유효 → 50, got %d", got)
	}
}

func TestParseEncodingName_Aliases(t *testing.T) {
	cases := []struct {
		in     string
		want   Encoding
		isAuto bool
	}{
		{"", EncUnknown, true},
		{" AUTO ", EncUnknown, true},
		{"UTF8", EncUTF8, false},
		{"utf-8-bom", EncUTF8BOM, false},
		{"utf8-bom", EncUTF8BOM, false},
		{"UTF-16LE", EncUTF16LE, false},
		{"utf-16-le", EncUTF16LE, false},
		{"utf16be", EncUTF16BE, false},
		{"utf-16-be", EncUTF16BE, false},
		{"EUC-KR", EncCP949, false},
		{"euckr", EncCP949, false},
		{"조합형", EncJohab, false},
		{"latin1", EncUnknown, true},
	}
	for _, c := range cases {
		enc, auto := parseEncodingName(c.in)
		if enc != c.want || auto != c.isAuto {
			t.Errorf("parseEncodingName(%q) = (%v,%v), want (%v,%v)", c.in, enc, auto, c.want, c.isAuto)
		}
	}
}
