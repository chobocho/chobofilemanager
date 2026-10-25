package textenc

import (
	"strings"
	"testing"
)

// ─── Todo #94: 인코딩 감지/디코딩 오류 ────────────────────────────────────────

func TestCp949StrictValid_DetectsInvalidPairs(t *testing.T) {
	if !cp949StrictValid(mustEUCKR(t, "한글 텍스트")) {
		t.Error("valid EUC-KR should pass")
	}
	// lead 0xC9는 CP949 확장 영역이 아니므로 trail 0x41은 불가
	if cp949StrictValid([]byte{0xC9, 0x41, 'a'}) {
		t.Error("invalid CP949 pair must fail strict validation")
	}
	// 감지 창 끝에서 잘린 lead 바이트는 허용
	b := append(mustEUCKR(t, "한글"), 0xC7)
	if !cp949StrictValid(b) {
		t.Error("a truncated trailing lead byte should not make the buffer invalid")
	}
}

func TestDetectEncoding_JohabStrictInvalidCP949(t *testing.T) {
	jb, err := johabEncode(strings.Repeat("하늘 휴가 흐름 ", 10))
	if err != nil {
		t.Fatal(err)
	}
	if cp949StrictValid(jb) {
		t.Fatal("test data should be invalid CP949")
	}
	if enc := DetectEncoding(jb); enc != EncJohab {
		t.Errorf("DetectEncoding = %v, want Johab", enc)
	}
}

func TestJohab_StandaloneJamo(t *testing.T) {
	if s := johabToString([]byte{0xC4, 0x41}); s != "ㅋ" {
		t.Errorf("standalone ㅋ = %q", s)
	}
	for _, text := range []string{"ㅋㅋㅋ", "ㅠㅠ", "ㄱㄴㄷ ㅏㅑ", "ㄳ"} {
		jb, err := johabEncode(text)
		if err != nil {
			t.Fatalf("encode %q: %v", text, err)
		}
		if got := johabToString(jb); got != text {
			t.Errorf("round trip %q → %q", text, got)
		}
	}
}

func TestJohab_InvalidLeadDoesNotSwallowASCII(t *testing.T) {
	if s := johabToString([]byte{0xFF, '\n', 'a'}); s != "�\na" {
		t.Errorf("got %q", s)
	}
}

func TestValidUTF8IgnoringTail(t *testing.T) {
	// ED A0 80 = UTF-16 서로게이트를 UTF-8로 인코딩한 잘못된 시퀀스 (utf8ValidityScore는 통과시킴)
	sur := []byte{0xED, 0xA0, 0x80, 0xED, 0xA0, 0x80, 0xED, 0xA0, 0x80}
	if utf8ValidityScore(sur) < 3 {
		t.Fatal("precondition: score passes surrogates")
	}
	if validUTF8IgnoringTail(sur) {
		t.Error("surrogate sequences must be rejected")
	}
	ok := []byte("한글한글")
	if !validUTF8IgnoringTail(ok[:len(ok)-1]) {
		t.Error("a multibyte sequence truncated at the window end should be tolerated")
	}
	if validUTF8IgnoringTail([]byte{0xE0, 0x80, 0x80, 'a'}) {
		t.Error("overlong sequence must be rejected")
	}
}
