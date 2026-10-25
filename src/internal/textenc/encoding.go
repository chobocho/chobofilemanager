package textenc

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
	"fmt"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/text/encoding/korean"
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
// x/text의 EUCKR 디코더는 잘못된 바이트를 에러 없이 U+FFFD로 바꾸므로 결과에 U+FFFD가 있는지로 판정 (Todo #94).
// 감지 창 끝에서 잘린 lead 바이트 하나는 무시합니다.
func cp949StrictValid(buf []byte) bool {
	end := 0
	for i := 0; i < len(buf); {
		if buf[i] < 0x80 {
			i++
			end = i
			continue
		}
		if i+1 >= len(buf) {
			break // 잘린 마지막 lead 바이트
		}
		i += 2
		end = i
	}
	decoded, err := korean.EUCKR.NewDecoder().Bytes(buf[:end])
	return err == nil && !strings.ContainsRune(string(decoded), utf8.RuneError)
}

// validUTF8IgnoringTail: 감지 창 끝에서 잘린 멀티바이트 시퀀스를 제외하고 utf8.Valid 검사.
// utf8ValidityScore는 서로게이트(ED A0..)·overlong(E0 80..)·범위 초과(F4 90..)를 거르지 못하므로 함께 사용.
func validUTF8IgnoringTail(buf []byte) bool {
	for cut := 0; cut <= 3 && cut <= len(buf); cut++ {
		head := buf[:len(buf)-cut]
		if utf8.Valid(head) {
			return cut == 0 || !utf8.FullRune(buf[len(buf)-cut:])
		}
	}
	return false
}

// composeHangulJamo: 조합형(NFD) 한글 자모 L+V(+T) 시퀀스만 완성형 음절로 합칩니다.
// 전체 NFC는 CJK 호환 한자 등 다른 문자도 바꿔 "열고 저장만 해도 내용이 바뀌는" 문제가 있어 한글만 처리 (Todo #94).
func composeHangulJamo(s string) string {
	hasJamo := false
	for _, r := range s {
		if r >= 0x1100 && r <= 0x11FF {
			hasJamo = true
			break
		}
	}
	if !hasJamo {
		return s
	}
	rs := []rune(s)
	out := make([]rune, 0, len(rs))
	for i := 0; i < len(rs); i++ {
		l := rs[i]
		if l >= 0x1100 && l <= 0x1112 && i+1 < len(rs) && rs[i+1] >= 0x1161 && rs[i+1] <= 0x1175 {
			syl := 0xAC00 + ((l-0x1100)*21+(rs[i+1]-0x1161))*28
			i++
			if i+1 < len(rs) && rs[i+1] >= 0x11A8 && rs[i+1] <= 0x11C2 {
				syl += rs[i+1] - 0x11A7
				i++
			}
			out = append(out, syl)
			continue
		}
		out = append(out, l)
	}
	return string(out)
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
	if u8 >= 3 && validUTF8IgnoringTail(buf) {
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
		return composeHangulJamo(string(buf)), nil

	case EncUTF8:
		return composeHangulJamo(string(buf)), nil

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

// EncodeFromUTF8: UTF-8 문자열을 지정 인코딩 바이트로 변환 (Todo #74 — 원래 인코딩으로 저장).
// UTF-16은 BOM을 붙입니다 (BOM이 있어야 자동 판별 가능). 표현할 수 없는 문자는 에러.
func EncodeFromUTF8(s string, enc Encoding) ([]byte, error) {
	switch enc {
	case EncUTF8BOM:
		return append([]byte{0xEF, 0xBB, 0xBF}, s...), nil
	case EncUTF16LE, EncUTF16BE:
		var order binary.AppendByteOrder = binary.LittleEndian
		out := []byte{0xFF, 0xFE}
		if enc == EncUTF16BE {
			order = binary.BigEndian
			out = []byte{0xFE, 0xFF}
		}
		for _, u := range utf16.Encode([]rune(s)) {
			out = order.AppendUint16(out, u)
		}
		return out, nil
	case EncCP949:
		b, err := korean.EUCKR.NewEncoder().Bytes([]byte(s))
		if err != nil {
			return nil, fmt.Errorf("CP949로 저장할 수 없는 문자가 있습니다: %w", err)
		}
		return b, nil
	case EncJohab:
		return johabEncode(s)
	default:
		return []byte(s), nil
	}
}

// ParseName: UI에서 받은 인코딩 이름을 Encoding으로 변환.
// 두 번째 반환값이 true면 "auto" — 호출 측에서 자동 판별 수행.
func ParseName(name string) (Encoding, bool) {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "", "auto":
		return EncUnknown, true
	case "utf-8", "utf8":
		return EncUTF8, false
	case "utf-8-bom", "utf8-bom":
		return EncUTF8BOM, false
	case "utf-16le", "utf-16-le", "utf16le":
		return EncUTF16LE, false
	case "utf-16be", "utf-16-be", "utf16be":
		return EncUTF16BE, false
	case "cp949", "euc-kr", "euckr":
		return EncCP949, false
	case "johab", "조합형":
		return EncJohab, false
	}
	// 미지원 인코딩 이름은 auto 폴백
	return EncUnknown, true
}
