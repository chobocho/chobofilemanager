package main

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
		return 0
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
		code := uint16(b0)<<8 | uint16(src[i+1])
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
