package main

// 인코딩 자동 판별 + UTF-8 변환.
// hviewer/encoding.h 의 detect_encoding 휴리스틱을 Go로 포팅.
//
// 우선순위:
//   1. BOM (UTF-8, UTF-16 LE/BE)
//   2. UTF-8 멀티바이트 시퀀스 유효성
//   3. CP949 vs Johab 점수 비교 + 보조 영역 비율 휴리스틱
//
// CP949 strict 검증: golang.org/x/text/encoding/korean의 EUCKR 디코더가
// invalid 바이트에서 에러를 반환하므로 이를 활용.

import (
	"encoding/binary"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/unicode/norm"
)

type Encoding int

const (
	EncUnknown Encoding = iota
	EncUTF8BOM
	EncUTF16LE
	EncUTF16BE
	EncUTF8
	EncCP949
	EncJohab
)

func (e Encoding) String() string {
	switch e {
	case EncUTF8BOM:
		return "UTF-8 (BOM)"
	case EncUTF16LE:
		return "UTF-16 LE"
	case EncUTF16BE:
		return "UTF-16 BE"
	case EncUTF8:
		return "UTF-8"
	case EncCP949:
		return "CP949 (EUC-KR)"
	case EncJohab:
		return "Johab (조합형)"
	default:
		return "Unknown"
	}
}

// utf8ValidityScore: RFC 3629 검증 + 멀티바이트 시퀀스 카운트.
// 0=invalid, >0=신뢰도 (멀티바이트 성공 횟수).
// ASCII만 있으면 0 반환 — 어떤 인코딩이든 valid이므로 호출 측 판단에 위임.
func utf8ValidityScore(buf []byte) int {
	multibyteHits := 0
	i := 0
	for i < len(buf) {
		b := buf[i]
		if b < 0x80 {
			i++
			continue
		}
		var extra int
		switch {
		case b&0xE0 == 0xC0:
			extra = 1
		case b&0xF0 == 0xE0:
			extra = 2
		case b&0xF8 == 0xF0:
			extra = 3
		default:
			return 0
		}
		// overlong / out-of-range 검사
		if b == 0xC0 || b == 0xC1 || b >= 0xF5 {
			return 0
		}
		if i+extra >= len(buf) {
			// 마지막 시퀀스만 잘렸다면 그 전까지의 hit 신뢰
			if multibyteHits > 0 {
				break
			}
			return 0
		}
		for k := 1; k <= extra; k++ {
			if buf[i+k]&0xC0 != 0x80 {
				return 0
			}
		}
		multibyteHits++
		i += extra + 1
	}
	return multibyteHits
}

// cp949Score: 0~100, MSB=1로 시작한 페어 중 CP949 lead/trail 범위 비율.
// CP949 lead 0x81~0xFE, trail 0x41~0x5A | 0x61~0x7A | 0x81~0xFE.
func cp949Score(buf []byte) int {
	attempts := 0
	hits := 0
	i := 0
	for i+1 < len(buf) {
		b0 := buf[i]
		if b0 < 0x80 {
			i++
			continue
		}
		attempts++
		b1 := buf[i+1]
		leadOK := b0 >= 0x81 && b0 <= 0xFE
		trailOK := (b1 >= 0x41 && b1 <= 0x5A) ||
			(b1 >= 0x61 && b1 <= 0x7A) ||
			(b1 >= 0x81 && b1 <= 0xFE)
		if leadOK && trailOK {
			hits++
		}
		i += 2
	}
	if attempts == 0 {
		return 0
	}
	return hits * 100 / attempts
}

// cp949ExtensionRatio: 표준 EUC-KR 본 영역(lead 0xA1~0xC6, trail 0xA1~0xFE) 외
// CP949 확장 영역(lead 0x81~0xA0 또는 trail 0x41~0x7A) 비율.
// 일반 한글 텍스트 CP949에서는 거의 0%. Johab은 비트 패킹 구조상 trail이
// 0x41~0x7A에 자주 떨어지므로 비율이 높다 → 동률 처리에 사용.
func cp949ExtensionRatio(buf []byte) int {
	pairs := 0
	ext := 0
	i := 0
	for i+1 < len(buf) {
		b0 := buf[i]
		if b0 < 0x80 {
			i++
			continue
		}
		b1 := buf[i+1]
		pairs++
		switch {
		case b0 >= 0x81 && b0 <= 0xA0:
			ext++
		case b1 >= 0x41 && b1 <= 0x7A:
			ext++
		}
		i += 2
	}
	if pairs == 0 {
		return 0
	}
	return ext * 100 / pairs
}

// cp949StrictValid: EUCKR 디코더가 에러 없이 통과하는지.
// hviewer의 MultiByteToWideChar(MB_ERR_INVALID_CHARS) 대응.
func cp949StrictValid(buf []byte) bool {
	_, err := korean.EUCKR.NewDecoder().Bytes(buf)
	return err == nil
}

// DetectEncoding: 휴리스틱 기반 인코딩 자동 판별.
// 입력은 파일 앞부분(권장 ~64KB).
func DetectEncoding(buf []byte) Encoding {
	// 1. BOM
	if len(buf) >= 3 && buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF {
		return EncUTF8BOM
	}
	if len(buf) >= 2 && buf[0] == 0xFF && buf[1] == 0xFE {
		return EncUTF16LE
	}
	if len(buf) >= 2 && buf[0] == 0xFE && buf[1] == 0xFF {
		return EncUTF16BE
	}

	// 2. UTF-8 멀티바이트 검증.
	//  - 멀티바이트 시퀀스가 3개 이상 valid면 UTF-8 (높은 신뢰도)
	//  - 1~2개라도 utf8.Valid 통과하면 UTF-8 (NFD 짧은 텍스트 등)
	u8 := utf8ValidityScore(buf)
	if u8 >= 3 {
		return EncUTF8
	}
	if u8 >= 1 && utf8.Valid(buf) {
		return EncUTF8
	}

	// 3. CP949 vs Johab
	cp := cp949Score(buf)
	jh := johabScore(buf)

	// 둘 다 낮으면 ASCII거나 식별 불가 — UTF-8 기본값.
	// (hviewer는 CP949를 기본값으로 했지만, 본 프로젝트는 UTF-8 환경이 주류)
	if cp < 50 && jh < 50 {
		if u8 > 0 {
			return EncUTF8
		}
		return EncUTF8
	}

	// CP949 strict invalid + johab 음절 다수 → Johab 확정.
	// (박스 그리기 등 비-Hangul 비중이 높은 johab 파일은 비율이 낮게 깔리지만
	//  CP949 strict로는 실패하는 경우가 흔함 — trail 0xFF 등.)
	if !cp949StrictValid(buf) && johabHangulCount(buf) >= 10 {
		return EncJohab
	}

	// 둘 다 valid한 경우: 보조 영역 비율 + 점수 비교
	if jh >= 80 && cp949ExtensionRatio(buf) >= 30 {
		return EncJohab
	}
	if jh > cp+10 {
		return EncJohab
	}
	return EncCP949
}

// DecodeToUTF8: 지정된 인코딩으로 buf을 디코드해 UTF-8 문자열 반환.
// UTF-8 결과는 NFC로 정규화 (조합형 NFD 한글 호환).
func DecodeToUTF8(buf []byte, enc Encoding) (string, error) {
	switch enc {
	case EncUTF8BOM:
		if len(buf) >= 3 {
			buf = buf[3:]
		}
		return norm.NFC.String(string(buf)), nil

	case EncUTF8:
		return norm.NFC.String(string(buf)), nil

	case EncUTF16LE:
		body := buf
		if len(body) >= 2 && body[0] == 0xFF && body[1] == 0xFE {
			body = body[2:]
		}
		return decodeUTF16(body, binary.LittleEndian), nil

	case EncUTF16BE:
		body := buf
		if len(body) >= 2 && body[0] == 0xFE && body[1] == 0xFF {
			body = body[2:]
		}
		return decodeUTF16(body, binary.BigEndian), nil

	case EncCP949:
		decoded, err := korean.EUCKR.NewDecoder().Bytes(buf)
		if err != nil {
			return "", err
		}
		return string(decoded), nil

	case EncJohab:
		return johabToString(buf), nil

	default:
		// Unknown → raw 바이트 그대로
		return string(buf), nil
	}
}

func decodeUTF16(body []byte, order binary.ByteOrder) string {
	n := len(body) / 2
	u16 := make([]uint16, n)
	for i := 0; i < n; i++ {
		u16[i] = order.Uint16(body[i*2:])
	}
	return string(utf16.Decode(u16))
}
