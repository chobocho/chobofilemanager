package textenc

import "fmt"

// 조합형(Johab, KS X 1001-1992 부속서 3 / Microsoft CP1361) 한글 디코더.
// hviewer/johab.h 의 비트 디코더를 Go로 포팅.
//
// 비트 구조:
//   1 [cho 5] [jung 5] [jong 5]
//   - MSB=1 이면 한글, 0 이면 ASCII
//   - cho/jung/jong 은 비트값 → 인덱스 매핑 후 유니코드로 결합
//
// 유니코드 변환:
//   syllable = 0xAC00 + (cho*21 + jung)*28 + jong  (가 ~ 힣)
//
// 비한글 영역(한자/특수) 미지원 — 실용 텍스트에서 거의 사용되지 않음.

const johabReplacement rune = 0xFFFD

// 비트값 → 인덱스. 0xFF = invalid. (johab.h와 동일)
var johabCho = [32]byte{
	0xFF, 0xFF, 0, 1, 2, 3, 4, 5,
	6, 7, 8, 9, 10, 11, 12, 13,
	14, 15, 16, 17, 18, 0xFF, 0xFF, 0xFF,
	0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
}

var johabJung = [32]byte{
	0xFF, 0xFF, 0xFF, 0, 1, 2, 3, 4,
	0xFF, 0xFF, 5, 6, 7, 8, 9, 10,
	0xFF, 0xFF, 11, 12, 13, 14, 15, 16,
	0xFF, 0xFF, 17, 18, 19, 20, 0xFF, 0xFF,
}

var johabJong = [32]byte{
	0xFF, 0, 1, 2, 3, 4, 5, 6,
	7, 8, 9, 10, 11, 12, 13, 14,
	15, 16, 0xFF, 17, 18, 19, 20, 21,
	22, 23, 24, 25, 26, 27, 0xFF, 0xFF,
}

// 비트값 1(초성), 2(중성)는 "채움(fill)" 코드 — 단독 자모 표현에 사용 (Todo #94)
const (
	johabChoFill  = 1
	johabJungFill = 2
	johabJongFill = 1
)

// 초성/중성/종성 인덱스 → 호환용 자모(U+3131~)
var choCompat = [19]rune{0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143,
	0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E}
var jongCompat = [28]rune{0, 0x3131, 0x3132, 0x3133, 0x3134, 0x3135, 0x3136, 0x3137, 0x3139, 0x313A,
	0x313B, 0x313C, 0x313D, 0x313E, 0x313F, 0x3140, 0x3141, 0x3142, 0x3144, 0x3145, 0x3146, 0x3147,
	0x3148, 0x314A, 0x314B, 0x314C, 0x314D, 0x314E}

// johabDecodeJamo: 채움 코드를 포함한 단독 자모(ㅋ, ㅠ, ㄳ 등). 해당 없으면 0.
func johabDecodeJamo(choBits, jungBits, jongBits uint16) rune {
	choFill, jungFill, jongFill := choBits == johabChoFill, jungBits == johabJungFill, jongBits == johabJongFill
	cho, jung, jong := johabCho[choBits], johabJung[jungBits], johabJong[jongBits]
	switch {
	case choFill && jungFill && jongFill:
		return 0x3164 // 한글 채움 문자
	case !choFill && jungFill && jongFill && cho != 0xFF:
		return choCompat[cho]
	case choFill && !jungFill && jongFill && jung != 0xFF:
		return rune(0x314F + uint32(jung))
	case choFill && jungFill && !jongFill && jong != 0xFF && jong != 0:
		return jongCompat[jong]
	}
	return 0
}

// johabDecodeSyllable: 2바이트(big-endian) 코드 한 음절을 유니코드로.
// 실패 시 0 반환 (MSB=0 또는 invalid 비트값).
func johabDecodeSyllable(code uint16) rune {
	if code&0x8000 == 0 {
		return 0
	}
	choBits := (code >> 10) & 0x1F
	jungBits := (code >> 5) & 0x1F
	jongBits := code & 0x1F

	cho := johabCho[choBits]
	jung := johabJung[jungBits]
	jong := johabJong[jongBits]
	if cho == 0xFF || jung == 0xFF || jong == 0xFF {
		return johabDecodeJamo(choBits, jungBits, jongBits)
	}
	return rune(0xAC00 + (uint32(cho)*21+uint32(jung))*28 + uint32(jong))
}

// johabToString: Johab 바이트 스트림 → UTF-8 문자열.
// 잘리거나 invalid한 멀티바이트는 U+FFFD로 대체.
func johabToString(src []byte) string {
	out := make([]rune, 0, len(src))
	i := 0
	for i < len(src) {
		b0 := src[i]
		if b0&0x80 == 0 {
			out = append(out, rune(b0))
			i++
			continue
		}
		if i+1 >= len(src) {
			out = append(out, johabReplacement)
			i++
			continue
		}
		b1 := src[i+1]
		// Johab trail은 0x41 이상 — 그보다 작은(제어문자/숫자 등) 바이트는 삼키지 않음 (Todo #94)
		if b1 < 0x41 {
			out = append(out, johabReplacement)
			i++
			continue
		}
		code := uint16(b0)<<8 | uint16(b1)
		uc := johabDecodeSyllable(code)
		if uc == 0 {
			out = append(out, johabReplacement)
		} else {
			out = append(out, uc)
		}
		i += 2
	}
	return string(out)
}

// johabScore: 0~100, MSB=1로 시작한 페어 중 디코드 성공 비율.
// ASCII만 있으면 attempts=0이라 0 반환.
// 짧은 파일에서는 신뢰도가 낮으니 호출 측에서 길이/카운트 체크 필요.
func johabScore(buf []byte) int {
	attempts := 0
	hits := 0
	i := 0
	for i+1 < len(buf) {
		if buf[i]&0x80 == 0 {
			i++
			continue
		}
		attempts++
		code := uint16(buf[i])<<8 | uint16(buf[i+1])
		if johabDecodeSyllable(code) != 0 {
			hits++
		}
		i += 2
	}
	if attempts == 0 {
		return 0
	}
	return hits * 100 / attempts
}

// johabHangulCount: johab으로 디코드되는 음절 절대 카운트.
// 박스 그리기 등 비-Hangul 바이트가 많은 파일에서 비율(score)은 낮게
// 깔리지만 절대 음절 수가 많으면 johab으로 봐야 하는 경우 사용.
func johabHangulCount(buf []byte) int {
	hits := 0
	i := 0
	for i+1 < len(buf) {
		if buf[i]&0x80 == 0 {
			i++
			continue
		}
		code := uint16(buf[i])<<8 | uint16(buf[i+1])
		if johabDecodeSyllable(code) != 0 {
			hits++
		}
		i += 2
	}
	return hits
}

// johabEncode: UTF-8 문자열 → Johab 바이트 (Todo #74).
// ASCII와 완성형 한글 음절(가~힣)만 지원 — 그 외 문자는 에러를 반환해 조용한 손실을 막습니다.
func johabEncode(s string) ([]byte, error) {
	var choBits, jungBits, jongBits [32]uint16
	for bits, idx := range johabCho {
		if idx != 0xFF {
			choBits[idx] = uint16(bits)
		}
	}
	for bits, idx := range johabJung {
		if idx != 0xFF {
			jungBits[idx] = uint16(bits)
		}
	}
	for bits, idx := range johabJong {
		if idx != 0xFF {
			jongBits[idx] = uint16(bits)
		}
	}
	out := make([]byte, 0, len(s))
	for _, r := range s {
		switch {
		case r < 0x80:
			out = append(out, byte(r))
		case r >= 0xAC00 && r <= 0xD7A3:
			n := uint16(r - 0xAC00)
			code := 0x8000 | choBits[n/(21*28)]<<10 | jungBits[(n%(21*28))/28]<<5 | jongBits[n%28]
			out = append(out, byte(code>>8), byte(code))
		case r >= 0x3131 && r <= 0x3164:
			code, ok := johabJamoCode(r, choBits, jungBits, jongBits)
			if !ok {
				return nil, fmt.Errorf("조합형으로 저장할 수 없는 문자: %q", r)
			}
			out = append(out, byte(code>>8), byte(code))
		default:
			return nil, fmt.Errorf("조합형으로 저장할 수 없는 문자: %q", r)
		}
	}
	return out, nil
}

// johabJamoCode: 호환용 자모 → 채움 코드를 사용한 Johab 코드
func johabJamoCode(r rune, choBits, jungBits, jongBits [32]uint16) (uint16, bool) {
	const hi = 0x8000
	if r == 0x3164 {
		return hi | johabChoFill<<10 | johabJungFill<<5 | johabJongFill, true
	}
	for i, c := range choCompat {
		if c == r {
			return hi | choBits[i]<<10 | johabJungFill<<5 | johabJongFill, true
		}
	}
	if r >= 0x314F && r <= 0x3163 {
		return hi | johabChoFill<<10 | jungBits[r-0x314F]<<5 | johabJongFill, true
	}
	for i, c := range jongCompat {
		if i > 0 && c == r {
			return hi | johabChoFill<<10 | johabJungFill<<5 | jongBits[i], true
		}
	}
	return 0, false
}
