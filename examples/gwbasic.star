# GW-BASIC 인터프리터 - 1~6단계 + 의미론 수정 (Todo #62 → Todo.md #66)
#
# 1단계: 렉서 + PRINT/LET/REM/GOTO + 산술·비교
# 2단계: IF/THEN/ELSE, FOR/NEXT, GOSUB/RETURN, WHILE/WEND
# 3단계: 부동소수점·16/8진수 리터럴, `$` 변수, 빌트인 함수, 배열
# 4단계: DATA/READ/RESTORE, INPUT(큐), DEF FN
# 5단계: SCREEN/COLOR/CLS/PSET/LINE/CIRCLE/SOUND/PLAY (ASCII 시뮬레이션)
# 6단계: trace 모드 + 예제
#
# 의미론 (GW-BASIC 호환):
#   - `:` 다중 문장, IF ... THEN s1: s2 [ELSE s3: s4], IF c GOTO n, ON n GOTO/GOSUB
#   - 연산자 우선순위: ^ > 단항 -/+ > * / > \ > MOD > + - > 관계 > NOT > AND > OR > XOR
#   - 관계 연산 결과 참=-1 / 거짓=0, AND/OR/NOT/XOR 은 정수 비트 연산
#   - `/` 는 항상 실수 나눗셈, `\` 는 정수 나눗셈(0 방향 절사)
#   - PRINT: 숫자 앞 부호 자리 공백 + 뒤 공백, 단정도(유효 7자리) 서식, `,` 14칸 구역,
#     끝의 `;`/`,` 는 줄바꿈 억제, TAB()/SPC()
#   - 런타임 오류 시 지금까지의 출력 + "<오류> in <라인>" 반환 (호스트를 죽이지 않음)
#   - 스칼라/배열 네임스페이스 분리, 배열 자동 DIM(10), 다차원 배열
#
# Starlark 제약: 클래스/예외 없음 → 모든 상태는 dict, 오류는 (값, 오류) 튜플로 전파.

# ─── 토큰 타입 상수 ───────────────────────────────────────────────────────────
T_NUMBER  = "NUMBER"
T_STRING  = "STRING"
T_IDENT   = "IDENT"
T_KEYWORD = "KEYWORD"
T_OP      = "OP"
T_LPAREN  = "LPAREN"
T_RPAREN  = "RPAREN"
T_COMMA   = "COMMA"
T_SEMI    = "SEMICOLON"
T_COLON   = "COLON"
T_DATA    = "DATA_RAW"   # DATA 문 뒤의 원문 (토큰화하지 않음)
T_EOL     = "EOL"
T_EOF     = "EOF"

KEYWORDS = {
    "PRINT": True, "LET": True, "REM": True, "GOTO": True,
    "IF": True, "THEN": True, "ELSE": True,
    "FOR": True, "TO": True, "STEP": True, "NEXT": True,
    "GOSUB": True, "RETURN": True, "ON": True,
    "WHILE": True, "WEND": True,
    "DIM": True,
    "DATA": True, "READ": True, "RESTORE": True,
    "INPUT": True,
    "DEF": True, "FN": True,
    "SCREEN": True, "COLOR": True, "CLS": True,
    "PSET": True, "PRESET": True, "LINE": True, "CIRCLE": True,
    "SOUND": True, "PLAY": True,
    "END": True, "STOP": True, "RANDOMIZE": True,
    "AND": True, "OR": True, "NOT": True, "MOD": True, "XOR": True,
}

# 두 글자 연산자 → 정규화된 연산자 (`=<` 는 `<=` 와 동일 등)
TWO_CHAR_OPS = {"<=": "<=", ">=": ">=", "<>": "<>", "=<": "<=", "=>": ">=", "><": "<>"}
SINGLE_OPS   = {"+": True, "-": True, "*": True, "/": True, "\\": True, "^": True,
                "=": True, "<": True, ">": True}

# 단정도 최대값 (GW-BASIC Overflow 기준)
MAX_NUM = 1.701411e38

E_SYNTAX   = "Syntax error"
E_TYPE     = "Type mismatch"
E_DIV0     = "Division by zero"
E_ILLEGAL  = "Illegal function call"
E_OVERFLOW = "Overflow"
E_SUBSCR   = "Subscript out of range"


def is_digit(c):
    return len(c) == 1 and c >= "0" and c <= "9"

def is_alpha(c):
    return len(c) == 1 and ((c >= "A" and c <= "Z") or (c >= "a" and c <= "z"))

def is_alnum(c):
    return is_digit(c) or is_alpha(c)

def make_tok(typ, value, line, col, num = None):
    return {"type": typ, "value": value, "line": line, "col": col, "num": num}

def _is_num(v):
    t = type(v)
    return t == "int" or t == "float"


# ─── 숫자 문자열 → 값 ─────────────────────────────────────────────────────────

def _strip_zeros(s):
    """앞쪽 0 제거 (빈 문자열이면 "0")."""
    i = 0
    for _ in range(len(s)):
        if i < len(s) - 1 and s[i] == "0":
            i += 1
        else:
            break
    return s[i:] if s != "" else "0"

def _make_number(ipart, fpart, exp, is_float):
    """정수부/소수부 숫자열 + 지수로 값 생성. 범위 초과 시 (None, Overflow)."""
    if not is_float:
        v = int(_strip_zeros(ipart))
        if v > MAX_NUM:
            return None, E_OVERFLOW
        return v, None
    ip = _strip_zeros(ipart)
    if ip == "0" and fpart.replace("0", "") == "":
        return 0.0, None
    # 크기(10의 지수) 추정 — float() 가 너무 큰 값에서 오류를 내지 않도록 사전 차단
    if ip != "0":
        mag = len(ip) + exp
    else:
        lead = 0
        for k in range(len(fpart)):
            if fpart[k] == "0":
                lead += 1
            else:
                break
        mag = exp - lead
    if mag > 39:
        return None, E_OVERFLOW
    if mag < -45:
        return 0.0, None
    v = float(ip + "." + (fpart if fpart != "" else "0") + "e" + str(exp))
    if v > MAX_NUM:
        return None, E_OVERFLOW
    return v, None

def _scan_number(s, i):
    """s[i:] 에서 [+-]digits[.digits][E[+-]digits] 를 스캔.
    반환: (값 또는 None, 끝 인덱스, err)."""
    n = len(s)
    j = i
    sign = 1
    if j < n and (s[j] == "+" or s[j] == "-"):
        if s[j] == "-":
            sign = -1
        j += 1
    ipart = ""
    fpart = ""
    is_float = False
    for _ in range(n):
        if j < n and is_digit(s[j]):
            ipart += s[j]; j += 1
        else:
            break
    if j < n and s[j] == ".":
        is_float = True
        j += 1
        for _ in range(n):
            if j < n and is_digit(s[j]):
                fpart += s[j]; j += 1
            else:
                break
    if ipart == "" and fpart == "":
        return None, i, None
    exp = 0
    if j < n and (s[j] == "E" or s[j] == "e" or s[j] == "D" or s[j] == "d"):
        k = j + 1
        esign = 1
        if k < n and (s[k] == "+" or s[k] == "-"):
            if s[k] == "-":
                esign = -1
            k += 1
        ed = ""
        for _ in range(n):
            if k < n and is_digit(s[k]):
                ed += s[k]; k += 1
            else:
                break
        if ed != "":
            is_float = True
            e = int(_strip_zeros(ed))
            if e > 999:
                e = 999
            exp = esign * e
            j = k
    v, err = _make_number(ipart, fpart, exp, is_float)
    if err:
        return None, j, err
    return sign * v, j, None

def _parse_number_strict(s):
    """INPUT/DATA 용: 문자열 전체가 숫자여야 함. 빈 문자열은 0.
    반환: (값, ok)."""
    t = s.strip(" \t\r")
    if t == "":
        return 0, True
    v, end, err = _scan_number(t, 0)
    if err or v == None or end != len(t):
        return None, False
    return v, True


# ─── 숫자 출력 서식 (GW-BASIC 단정도) ──────────────────────────────────────────

def _fmt_abs(a):
    """음이 아닌 수 a 를 GW-BASIC 스타일(유효 7자리)로 문자열화. 부호 없음."""
    if type(a) == "int" and a < 10000000:
        return str(a)
    a = float(a)
    if a == 0:
        return "0"
    s = "%e" % a                    # d.dddddde±XX (유효 7자리, 반올림)
    epos = s.find("e")
    digits = s[0] + s[2:epos]
    exp = int(s[epos + 1:])
    # 끝의 0 제거
    k = len(digits)
    for _ in range(len(digits)):
        if k > 1 and digits[k - 1] == "0":
            k -= 1
        else:
            break
    digits = digits[:k]
    nd = len(digits)
    if exp >= 0 and exp < 7:
        if nd <= exp + 1:
            return digits + "0" * (exp + 1 - nd)
        return digits[:exp + 1] + "." + digits[exp + 1:]
    if exp < 0 and (-exp - 1) + nd <= 7:
        return "." + "0" * (-exp - 1) + digits
    m = digits[0]
    if nd > 1:
        m += "." + digits[1:]
    ae = -exp if exp < 0 else exp
    return m + "E" + ("-" if exp < 0 else "+") + ("0" if ae < 10 else "") + str(ae)

def fmt_num(v):
    """PRINT/STR$ 용 숫자 문자열: 음수는 '-', 그 외는 부호 자리 공백."""
    if v < 0:
        return "-" + _fmt_abs(-v)
    return " " + _fmt_abs(v)

def _fmt_plain(v):
    """로그용 (앞 공백 없음)."""
    if _is_num(v):
        return fmt_num(v).strip(" ")
    return str(v)


# ─── Lexer ────────────────────────────────────────────────────────────────────

def tokenize(src):
    """src 문자열을 토큰 리스트로 변환. 에러 시 (None, 에러문자열) 반환."""
    tokens = []
    pos = 0
    line = 1
    col = 1
    n = len(src)

    for _ in range(n + 1):
        if pos >= n:
            break
        ch = src[pos]

        # 공백 (개행 제외)
        if ch == " " or ch == "\t" or ch == "\r":
            pos += 1
            col += 1
            continue

        # 개행
        if ch == "\n":
            tokens.append(make_tok(T_EOL, "\n", line, col))
            pos += 1
            line += 1
            col = 1
            continue

        # ' 코멘트 → EOL까지 무시 (토큰화하지 않음)
        if ch == "'":
            for _ in range(n):
                if pos < n and src[pos] != "\n":
                    pos += 1
                    col += 1
                else:
                    break
            continue

        # 16진수 / 8진수 리터럴: &H... / &O...
        if ch == "&" and pos + 1 < n and (src[pos + 1] == "H" or src[pos + 1] == "h" or
                                          src[pos + 1] == "O" or src[pos + 1] == "o"):
            start_col = col
            base_ch = src[pos + 1]
            pos += 2; col += 2
            s = ""
            for _ in range(n):
                if pos >= n:
                    break
                c = src[pos]
                if base_ch == "H" or base_ch == "h":
                    ok = is_digit(c) or (c >= "A" and c <= "F") or (c >= "a" and c <= "f")
                else:
                    ok = c >= "0" and c <= "7"
                if not ok:
                    break
                s += c; pos += 1; col += 1
            if s == "":
                return None, "Syntax error: empty &%s literal at line %d" % (base_ch.upper(), line)
            num = int(s, 16) if (base_ch == "H" or base_ch == "h") else int(s, 8)
            tokens.append(make_tok(T_NUMBER, "&" + base_ch.upper() + s, line, start_col, num = num))
            continue

        # 숫자 (정수 / 부동소수점). `.5`, `5.`, `1.5E2` 허용.
        if is_digit(ch) or (ch == "." and pos + 1 < n and is_digit(src[pos + 1])):
            v, end, err = _scan_number(src, pos)
            if err:
                return None, "%s at line %d" % (err, line)
            tokens.append(make_tok(T_NUMBER, src[pos:end], line, col, num = v))
            col += end - pos
            pos = end
            continue

        # 문자열 — GW-BASIC 처럼 줄 끝에서 닫는 따옴표 생략 허용
        if ch == '"':
            start_col = col
            pos += 1
            col += 1
            s = ""
            for _ in range(n):
                if pos < n and src[pos] != '"' and src[pos] != "\n":
                    s += src[pos]
                    pos += 1
                    col += 1
                else:
                    break
            if pos < n and src[pos] == '"':
                pos += 1
                col += 1
            tokens.append(make_tok(T_STRING, s.rstrip("\r"), line, start_col))
            continue

        # 식별자 / 키워드. 끝에 `$` `%` `!` `#` 타입 sigil 한 글자 허용 (`!` 는 기본형과 동일).
        if is_alpha(ch):
            start_col = col
            s = ""
            for _ in range(n):
                if pos < n and is_alnum(src[pos]):
                    s += src[pos]
                    pos += 1
                    col += 1
                else:
                    break
            up = s.upper()
            # REM (REMARK 등 포함) → 줄 끝까지 원문 무시
            if up.startswith("REM"):
                tokens.append(make_tok(T_KEYWORD, "REM", line, start_col))
                for _ in range(n):
                    if pos < n and src[pos] != "\n":
                        pos += 1
                        col += 1
                    else:
                        break
                continue
            # DATA → `:` (따옴표 밖) 또는 줄 끝까지 원문 보존
            if up == "DATA":
                tokens.append(make_tok(T_KEYWORD, "DATA", line, start_col))
                j = pos
                inq = False
                for _ in range(n):
                    if j >= n or src[j] == "\n":
                        break
                    if src[j] == '"':
                        inq = not inq
                    elif src[j] == ":" and not inq:
                        break
                    j += 1
                tokens.append(make_tok(T_DATA, src[pos:j], line, col))
                col += j - pos
                pos = j
                continue
            if pos < n and (src[pos] == "$" or src[pos] == "%" or src[pos] == "!" or src[pos] == "#"):
                if src[pos] != "!":
                    up += src[pos]
                pos += 1; col += 1
            if up in KEYWORDS:
                tokens.append(make_tok(T_KEYWORD, up, line, start_col))
            else:
                tokens.append(make_tok(T_IDENT, up, line, start_col))
            continue

        # 구두점
        if ch == "(":
            tokens.append(make_tok(T_LPAREN, "(", line, col))
            pos += 1; col += 1
            continue
        if ch == ")":
            tokens.append(make_tok(T_RPAREN, ")", line, col))
            pos += 1; col += 1
            continue
        if ch == ",":
            tokens.append(make_tok(T_COMMA, ",", line, col))
            pos += 1; col += 1
            continue
        if ch == ";":
            tokens.append(make_tok(T_SEMI, ";", line, col))
            pos += 1; col += 1
            continue
        if ch == ":":
            tokens.append(make_tok(T_COLON, ":", line, col))
            pos += 1; col += 1
            continue
        if ch == "?":  # GW-BASIC ? = PRINT
            tokens.append(make_tok(T_KEYWORD, "PRINT", line, col))
            pos += 1; col += 1
            continue

        # 두 글자 연산자
        two = src[pos:pos + 2]
        if two in TWO_CHAR_OPS:
            tokens.append(make_tok(T_OP, TWO_CHAR_OPS[two], line, col))
            pos += 2; col += 2
            continue

        # 한 글자 연산자
        if ch in SINGLE_OPS:
            tokens.append(make_tok(T_OP, ch, line, col))
            pos += 1; col += 1
            continue

        return None, "Syntax error: unexpected character %r at line %d col %d" % (ch, line, col)

    tokens.append(make_tok(T_EOF, "", line, col))
    return tokens, None


# ─── 수학 보조 (Starlark에는 math 모듈 없음) ──────────────────────────────────

PI = 3.141592653589793
LN2 = 0.6931471805599453

def _chk(v):
    """산술 결과 범위 검사 → (v, err)."""
    if type(v) == "float":
        if v != v or v > MAX_NUM or v < -MAX_NUM:
            return None, E_OVERFLOW
    elif type(v) == "int":
        if v > MAX_NUM or v < -MAX_NUM:
            return None, E_OVERFLOW
    return v, None

def _round_int(v):
    """0.5 는 0에서 먼 쪽으로 반올림한 정수."""
    if type(v) == "int":
        return v
    if v >= 0:
        return int(v + 0.5)
    return -int(-v + 0.5)

def _to_int(v):
    """논리 연산/인덱스/함수 인자용 정수 변환 → (int, err)."""
    if not _is_num(v):
        return None, E_TYPE
    return _round_int(v), None

def _floor(v):
    iv = int(v)
    if v < 0 and iv != v:
        iv -= 1
    return iv

def _sin(x):
    # 범위 축소: x - 2π·floor(x/2π) 를 몇 번 반복 (큰 값에서 무한 루프 없이 수렴)
    T = 2 * PI
    for _ in range(4):
        if x >= 0 and x < T:
            break
        x = x - _floor(x / T) * T
    if x < 0 or x >= T:
        x = 0.0
    if x > PI:
        x -= T                     # [-π, π]
    if x > PI / 2:
        x = PI - x                 # sin(π - x) = sin(x)
    elif x < -PI / 2:
        x = -PI - x
    # |x| ≤ π/2 에서 Taylor 급수 (x^17 항까지 → 오차 < 1e-10)
    x2 = x * x
    term = x
    s = x
    for k in range(1, 9):
        term = -term * x2 / ((2 * k) * (2 * k + 1))
        s += term
    return s

def _cos(x):
    return _sin(x + PI / 2)

def _exp(x):
    if x > 88.03:
        return None, E_OVERFLOW
    if x < -104:
        return 0.0, None
    k = int(x / LN2)
    r = x - k * LN2
    s = 1.0
    term = 1.0
    for i in range(1, 25):
        term = term * r / i
        s += term
    if k >= 0:
        for _ in range(k):
            s *= 2.0
    else:
        for _ in range(-k):
            s /= 2.0
    return _chk(s)

def _log(x):
    if x <= 0:
        return None, E_ILLEGAL
    m = float(x)
    e = 0
    for _ in range(2200):
        if m >= 2.0:
            m /= 2.0; e += 1
        elif m < 1.0:
            m *= 2.0; e -= 1
        else:
            break
    # log(m) = 2·atanh(z), z = (m-1)/(m+1) ∈ [0, 1/3)
    z = (m - 1.0) / (m + 1.0)
    z2 = z * z
    term = z
    s = 0.0
    for k in range(30):
        s += term / (2 * k + 1)
        term *= z2
    return 2.0 * s + e * LN2, None

def _sqr(x):
    if x < 0:
        return None, E_ILLEGAL
    if x == 0:
        return 0.0, None
    lg, _ = _log(x)
    g, _ = _exp(0.5 * lg)
    for _ in range(4):
        g = (g + x / g) / 2.0
    return g, None

def _ipow(base, n):
    """정수 지수 n ≥ 0 거듭제곱 (이진 거듭제곱)."""
    r = 1 if type(base) == "int" else 1.0
    b = base
    for _ in range(64):
        if n == 0:
            break
        if n % 2 == 1:
            r = r * b
        n = n // 2
        if n > 0:
            b = b * b
            if type(b) == "float" and (b > MAX_NUM or b < -MAX_NUM):
                b = MAX_NUM * 2.0   # inf 대신 큰 값 — 결과 검사에서 Overflow
            elif type(b) == "int" and (b > MAX_NUM or b < -MAX_NUM):
                return None, E_OVERFLOW
    return _chk(r)

def _pow(a, b):
    if type(a) == "int" and type(b) == "int" and b >= 0:
        if (a > 1 or a < -1) and b > 130:
            return None, E_OVERFLOW
        return _ipow(a, b)
    fa = float(a)
    if b == _floor(b) and b < 100000 and b > -100000:
        n = int(b)
        r, err = _ipow(fa, n if n >= 0 else -n)
        if err: return None, err
        if n < 0:
            if r == 0:
                return None, E_DIV0
            r = 1.0 / r
        return _chk(r)
    if fa < 0:
        return None, E_ILLEGAL
    if fa == 0:
        if b < 0: return None, E_DIV0
        return 0.0, None
    lg, _ = _log(fa)
    return _exp(b * lg)


# ─── 빌트인 함수 ──────────────────────────────────────────────────────────────
#
# 이름 → 함수(args) → (값, err). 인자는 모두 평가된 값(list).

def _need(args, kinds):
    """인자 개수/타입 검사. kinds: "n"(숫자) / "s"(문자열) 문자열."""
    if len(args) != len(kinds):
        return E_SYNTAX
    for i in range(len(kinds)):
        if kinds[i] == "n" and not _is_num(args[i]):
            return E_TYPE
        if kinds[i] == "s" and type(args[i]) != "string":
            return E_TYPE
    return None

def _b_len(args):
    err = _need(args, "s")
    if err: return None, err
    return len(args[0]), None

def _b_left(args):
    err = _need(args, "sn")
    if err: return None, err
    n = _round_int(args[1])
    if n < 0 or n > 255: return None, E_ILLEGAL
    return args[0][:n], None

def _b_right(args):
    err = _need(args, "sn")
    if err: return None, err
    n = _round_int(args[1])
    if n < 0 or n > 255: return None, E_ILLEGAL
    if n == 0: return "", None
    return args[0][-n:], None

def _b_mid(args):
    # MID$(s, start [, len]). GW-BASIC은 1-based start.
    if len(args) == 2:
        err = _need(args, "sn")
    else:
        err = _need(args, "snn")
    if err: return None, err
    s = args[0]
    start = _round_int(args[1])
    if start < 1 or start > 255: return None, E_ILLEGAL
    if len(args) == 2:
        return s[start - 1:], None
    n = _round_int(args[2])
    if n < 0 or n > 255: return None, E_ILLEGAL
    return s[start - 1:start - 1 + n], None

def _b_instr(args):
    # INSTR([start,] haystack, needle) → 1-based pos, 못 찾으면 0
    if len(args) == 2:
        err = _need(args, "ss")
        if err: return None, err
        h = args[0]; needle = args[1]; start = 0
    else:
        err = _need(args, "nss")
        if err: return None, err
        start = _round_int(args[0]) - 1
        if start < 0 or start > 254: return None, E_ILLEGAL
        h = args[1]; needle = args[2]
    if start > len(h): return 0, None
    p = h.find(needle, start)
    return p + 1 if p >= 0 else 0, None

def _b_int(args):
    err = _need(args, "n")
    if err: return None, err
    return _floor(args[0]), None      # 음의 무한대 방향 floor

def _b_fix(args):
    err = _need(args, "n")
    if err: return None, err
    return int(args[0]), None         # 0 방향 절사

def _b_cint(args):
    err = _need(args, "n")
    if err: return None, err
    v = _round_int(args[0])
    if v < -32768 or v > 32767: return None, E_OVERFLOW
    return v, None

def _b_abs(args):
    err = _need(args, "n")
    if err: return None, err
    v = args[0]
    return (-v if v < 0 else v), None

def _b_sgn(args):
    err = _need(args, "n")
    if err: return None, err
    v = args[0]
    if v > 0: return 1, None
    if v < 0: return -1, None
    return 0, None

def _b_sin(args):
    err = _need(args, "n")
    if err: return None, err
    return _sin(float(args[0])), None

def _b_cos(args):
    err = _need(args, "n")
    if err: return None, err
    return _cos(float(args[0])), None

def _b_tan(args):
    err = _need(args, "n")
    if err: return None, err
    x = float(args[0])
    c = _cos(x)
    if c == 0: return None, E_DIV0
    return _chk(_sin(x) / c)

def _b_atn(args):
    err = _need(args, "n")
    if err: return None, err
    x = float(args[0])
    # atan: |x|>1 → π/2 - atan(1/x), 그 뒤 반각 공식 2번으로 수렴 가속
    inv = False
    neg = x < 0
    if neg: x = -x
    if x > 1:
        x = 1.0 / x; inv = True
    for _ in range(2):
        r, _ = _sqr(1.0 + x * x)
        x = x / (1.0 + r)
    x2 = x * x
    term = x
    s = 0.0
    for k in range(20):
        s += term / (2 * k + 1)
        term = -term * x2
    s *= 4.0
    if inv: s = PI / 2 - s
    return (-s if neg else s), None

def _b_sqr(args):
    err = _need(args, "n")
    if err: return None, err
    return _sqr(float(args[0]))

def _b_exp(args):
    err = _need(args, "n")
    if err: return None, err
    return _exp(float(args[0]))

def _b_log(args):
    err = _need(args, "n")
    if err: return None, err
    return _log(args[0])

def _b_chr(args):
    err = _need(args, "n")
    if err: return None, err
    v = _round_int(args[0])
    if v < 0 or v > 255: return None, E_ILLEGAL
    return chr(v), None

def _b_asc(args):
    err = _need(args, "s")
    if err: return None, err
    if args[0] == "": return None, E_ILLEGAL
    return ord(args[0][0]), None

def _b_str(args):
    err = _need(args, "n")
    if err: return None, err
    return fmt_num(args[0]), None

def _b_val(args):
    err = _need(args, "s")
    if err: return None, err
    s = args[0].lstrip(" \t")
    v, _, err = _scan_number(s, 0)
    if err: return None, err
    if v == None: return 0, None
    return v, None

def _b_space(args):
    err = _need(args, "n")
    if err: return None, err
    n = _round_int(args[0])
    if n < 0 or n > 255: return None, E_ILLEGAL
    return " " * n, None

BUILTINS = {
    "LEN":    _b_len,
    "LEFT$":  _b_left,
    "RIGHT$": _b_right,
    "MID$":   _b_mid,
    "INSTR":  _b_instr,
    "INT":    _b_int,
    "FIX":    _b_fix,
    "CINT":   _b_cint,
    "ABS":    _b_abs,
    "SGN":    _b_sgn,
    "SIN":    _b_sin,
    "COS":    _b_cos,
    "TAN":    _b_tan,
    "ATN":    _b_atn,
    "SQR":    _b_sqr,
    "EXP":    _b_exp,
    "LOG":    _b_log,
    "CHR$":   _b_chr,
    "ASC":    _b_asc,
    "STR$":   _b_str,
    "VAL":    _b_val,
    "SPACE$": _b_space,
}

# RND: 상태는 실행 상태(st["rnd"])에 보관 — 결정적 LCG (재현 가능)
def _rnd(st, arg):
    if arg != None and arg < 0:
        st["rnd"] = int(-arg * 1000003) % 2147483648
    elif arg != None and arg == 0:
        return st["rnd_last"]
    st["rnd"] = (st["rnd"] * 1103515245 + 12345) % 2147483648
    v = st["rnd"] / 2147483648.0
    st["rnd_last"] = v
    return v


# ─── 변수 / 배열 ──────────────────────────────────────────────────────────────

def _default_for(name):
    return "" if name.endswith("$") else 0

def _coerce(name, v):
    """변수 이름 타입에 맞게 값 검사/변환 → (v, err)."""
    if name.endswith("$"):
        if type(v) != "string":
            return None, E_TYPE
        return v, None
    if not _is_num(v):
        return None, E_TYPE
    if name.endswith("%"):
        iv = _round_int(v)
        if iv < -32768 or iv > 32767:
            return None, E_OVERFLOW
        return iv, None
    return v, None

def _array_dim(st, name, dims):
    if name in st["arrays"]:
        return "Duplicate Definition"
    size = 1
    for d in dims:
        if d < 0:
            return E_ILLEGAL
        size *= d + 1
        if size > 200000:
            return "Out of memory"
    dv = _default_for(name)
    st["arrays"][name] = {"dims": dims, "data": [dv for _ in range(size)]}
    return None

def _array_slot(st, name, idx):
    """배열 원소 위치 → (arr, flat, err). 미선언 배열은 각 차원 10으로 자동 DIM."""
    if name not in st["arrays"]:
        err = _array_dim(st, name, [10 for _ in idx])
        if err: return None, 0, err
    arr = st["arrays"][name]
    dims = arr["dims"]
    if len(idx) != len(dims):
        return None, 0, E_SUBSCR
    flat = 0
    for k in range(len(dims)):
        i, err = _to_int(idx[k])
        if err: return None, 0, err
        if i < 0 or i > dims[k]:
            return None, 0, E_SUBSCR
        flat = flat * (dims[k] + 1) + i
    return arr, flat, None

def _assign(st, target, v):
    """target = {"name", "idx"(None 이면 스칼라)} 에 값 대입 → err."""
    name = target["name"]
    v, err = _coerce(name, v)
    if err: return err
    if target["idx"] == None:
        st["vars"][name] = v
        return None
    arr, flat, err = _array_slot(st, name, target["idx"])
    if err: return err
    arr["data"][flat] = v
    return None

def _get_var(st, name):
    if name in st["vars"]:
        return st["vars"][name]
    return _default_for(name)


# ─── 표현식 평가 (재귀 하강) ──────────────────────────────────────────────────
#
# 우선순위 (낮음 → 높음):
#   XOR < OR < AND < NOT < 관계(= <> < > <= >=) < + - < MOD < \ < * / < 단항 -/+ < ^
#   원시: NUMBER / STRING / IDENT [ '(' args ')' ] / FN 호출 / "(" expr ")"
# 모든 함수는 (값, 다음 idx, err) 반환.

def _tok_is(tokens, idx, typ, val = None):
    if idx >= len(tokens):
        return False
    t = tokens[idx]
    if t["type"] != typ:
        return False
    return val == None or t["value"] == val

def _parse_call_args(tokens, idx, st):
    """tokens[idx] 가 '(' 인 경우 인자 리스트 파싱. 반환: (args_list, next_idx, err)."""
    if not _tok_is(tokens, idx, T_LPAREN):
        return None, idx, E_SYNTAX
    idx += 1
    args = []
    if _tok_is(tokens, idx, T_RPAREN):
        return args, idx + 1, None
    for _ in range(64):  # 인자 64개 제한
        v, idx, err = parse_expr(tokens, idx, st)
        if err: return None, idx, err
        args.append(v)
        if _tok_is(tokens, idx, T_COMMA):
            idx += 1
            continue
        if _tok_is(tokens, idx, T_RPAREN):
            return args, idx + 1, None
        return None, idx, E_SYNTAX
    return None, idx, E_SYNTAX

def _call_fn(st, fname, args):
    """DEF FN 사용자 함수 호출. 매개변수는 스칼라 변수에 임시 바인딩 후 복원."""
    defn = st["defns"].get(fname)
    if defn == None:
        return None, "Undefined user function"
    params = defn["params"]
    if len(args) != len(params):
        return None, E_SYNTAX
    if st["fn_depth"] >= 100:
        return None, "Out of memory"
    saved = []
    for k in range(len(params)):
        p = params[k]
        v, err = _coerce(p, args[k])
        if err: return None, err
        saved.append((p, p in st["vars"], st["vars"].get(p)))
        st["vars"][p] = v
    st["fn_depth"] = st["fn_depth"] + 1
    v, end, err = parse_expr(defn["body"], defn["start"], st)
    st["fn_depth"] = st["fn_depth"] - 1
    for p, had, old in saved:
        if had:
            st["vars"][p] = old
        else:
            st["vars"].pop(p)
    if err: return None, err
    if end < len(defn["body"]) and not _tok_is(defn["body"], end, T_COLON):
        return None, E_SYNTAX
    return _coerce(fname, v)

def parse_primary(tokens, idx, st):
    if idx >= len(tokens):
        return None, idx, E_SYNTAX
    tok = tokens[idx]
    if tok["type"] == T_NUMBER:
        return tok["num"], idx + 1, None
    if tok["type"] == T_STRING:
        return tok["value"], idx + 1, None
    if tok["type"] == T_LPAREN:
        v, idx2, err = parse_expr(tokens, idx + 1, st)
        if err: return None, idx2, err
        if not _tok_is(tokens, idx2, T_RPAREN):
            return None, idx2, E_SYNTAX
        return v, idx2 + 1, None
    # `FN <name>(args)` — DEF FN 사용자 함수 호출 (`FNNAME(...)` 한 토큰 형태는 아래 IDENT)
    if tok["type"] == T_KEYWORD and tok["value"] == "FN":
        if not _tok_is(tokens, idx + 1, T_IDENT):
            return None, idx, E_SYNTAX
        fname = "FN" + tokens[idx + 1]["value"]
        args = []
        nxt = idx + 2
        if _tok_is(tokens, nxt, T_LPAREN):
            args, nxt, err = _parse_call_args(tokens, nxt, st)
            if err: return None, nxt, err
        v, err = _call_fn(st, fname, args)
        return v, nxt, err
    if tok["type"] == T_IDENT:
        name = tok["value"]
        has_paren = _tok_is(tokens, idx + 1, T_LPAREN)
        if name == "RND":
            arg = None
            nxt = idx + 1
            if has_paren:
                args, nxt, err = _parse_call_args(tokens, idx + 1, st)
                if err: return None, nxt, err
                if len(args) > 1: return None, nxt, E_SYNTAX
                if len(args) == 1:
                    if not _is_num(args[0]): return None, nxt, E_TYPE
                    arg = args[0]
            return _rnd(st, arg), nxt, None
        # `FN` 접두 이름은 항상 사용자 함수 (미정의면 Undefined user function)
        if name.startswith("FN") and len(name) > 2:
            args = []
            nxt = idx + 1
            if has_paren:
                args, nxt, err = _parse_call_args(tokens, idx + 1, st)
                if err: return None, nxt, err
            v, err = _call_fn(st, name, args)
            return v, nxt, err
        if has_paren:
            args, next_idx, err = _parse_call_args(tokens, idx + 1, st)
            if err: return None, next_idx, err
            if name in BUILTINS:
                v, err = BUILTINS[name](args)
                if err: return None, next_idx, err
                return v, next_idx, None
            arr, flat, err = _array_slot(st, name, args)
            if err: return None, next_idx, err
            return arr["data"][flat], next_idx, None
        return _get_var(st, name), idx + 1, None
    return None, idx, E_SYNTAX

def _unary_operand(tokens, idx, st):
    """`^` 의 우변: 단항 부호 허용 (2^-1)."""
    if _tok_is(tokens, idx, T_OP, "-") or _tok_is(tokens, idx, T_OP, "+"):
        neg = tokens[idx]["value"] == "-"
        v, idx, err = _unary_operand(tokens, idx + 1, st)
        if err: return None, idx, err
        if not _is_num(v): return None, idx, E_TYPE
        return (-v if neg else v), idx, None
    return parse_primary(tokens, idx, st)

def parse_power(tokens, idx, st):
    left, idx, err = parse_primary(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not _tok_is(tokens, idx, T_OP, "^"):
            break
        right, idx, err = _unary_operand(tokens, idx + 1, st)
        if err: return None, idx, err
        if not _is_num(left) or not _is_num(right):
            return None, idx, E_TYPE
        left, err = _pow(left, right)
        if err: return None, idx, err
    return left, idx, None

def parse_unary(tokens, idx, st):
    if _tok_is(tokens, idx, T_OP, "-") or _tok_is(tokens, idx, T_OP, "+"):
        neg = tokens[idx]["value"] == "-"
        v, idx, err = parse_unary(tokens, idx + 1, st)
        if err: return None, idx, err
        if not _is_num(v): return None, idx, E_TYPE
        return (-v if neg else v), idx, None
    return parse_power(tokens, idx, st)

def parse_mul(tokens, idx, st):
    left, idx, err = parse_unary(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not (_tok_is(tokens, idx, T_OP, "*") or _tok_is(tokens, idx, T_OP, "/")):
            break
        op = tokens[idx]["value"]
        right, idx, err = parse_unary(tokens, idx + 1, st)
        if err: return None, idx, err
        if not _is_num(left) or not _is_num(right):
            return None, idx, E_TYPE
        if op == "*":
            left, err = _chk(left * right)
        else:
            if right == 0:
                return None, idx, E_DIV0
            left, err = _chk(float(left) / float(right))
        if err: return None, idx, err
    return left, idx, None

def _int_div(a, b):
    """0 방향 절사 정수 나눗셈 (피연산자는 반올림된 정수)."""
    q = (a if a >= 0 else -a) // (b if b >= 0 else -b)
    if (a < 0) != (b < 0):
        q = -q
    return q

def parse_intdiv(tokens, idx, st):
    left, idx, err = parse_mul(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not _tok_is(tokens, idx, T_OP, "\\"):
            break
        right, idx, err = parse_mul(tokens, idx + 1, st)
        if err: return None, idx, err
        a, err = _to_int(left)
        if err: return None, idx, err
        b, err = _to_int(right)
        if err: return None, idx, err
        if b == 0:
            return None, idx, E_DIV0
        left = _int_div(a, b)
    return left, idx, None

def parse_mod(tokens, idx, st):
    left, idx, err = parse_intdiv(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not _tok_is(tokens, idx, T_KEYWORD, "MOD"):
            break
        right, idx, err = parse_intdiv(tokens, idx + 1, st)
        if err: return None, idx, err
        a, err = _to_int(left)
        if err: return None, idx, err
        b, err = _to_int(right)
        if err: return None, idx, err
        if b == 0:
            return None, idx, E_DIV0
        left = a - b * _int_div(a, b)   # 부호는 피제수를 따름
    return left, idx, None

def parse_add(tokens, idx, st):
    left, idx, err = parse_mod(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not (_tok_is(tokens, idx, T_OP, "+") or _tok_is(tokens, idx, T_OP, "-")):
            break
        op = tokens[idx]["value"]
        right, idx, err = parse_mod(tokens, idx + 1, st)
        if err: return None, idx, err
        ls = type(left) == "string"
        rs = type(right) == "string"
        if op == "+" and ls and rs:
            left = left + right
            if len(left) > 255:
                return None, idx, "String too long"
            continue
        if ls or rs:
            return None, idx, E_TYPE
        if op == "+":
            left, err = _chk(left + right)
        else:
            left, err = _chk(left - right)
        if err: return None, idx, err
    return left, idx, None

REL_OPS = {"=": True, "<>": True, "<": True, ">": True, "<=": True, ">=": True}

def parse_rel(tokens, idx, st):
    left, idx, err = parse_add(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not (idx < len(tokens) and tokens[idx]["type"] == T_OP and tokens[idx]["value"] in REL_OPS):
            break
        op = tokens[idx]["value"]
        right, idx, err = parse_add(tokens, idx + 1, st)
        if err: return None, idx, err
        if (type(left) == "string") != (type(right) == "string"):
            return None, idx, E_TYPE
        if op == "=":    r = left == right
        elif op == "<>": r = left != right
        elif op == "<":  r = left < right
        elif op == ">":  r = left > right
        elif op == "<=": r = left <= right
        else:            r = left >= right
        left = -1 if r else 0          # GW-BASIC: 참 = -1, 거짓 = 0
    return left, idx, None

def parse_not(tokens, idx, st):
    if _tok_is(tokens, idx, T_KEYWORD, "NOT"):
        v, idx, err = parse_not(tokens, idx + 1, st)
        if err: return None, idx, err
        iv, err = _to_int(v)
        if err: return None, idx, err
        return ~iv, idx, None
    return parse_rel(tokens, idx, st)

def _parse_logic(tokens, idx, st, kw, sub):
    left, idx, err = sub(tokens, idx, st)
    if err: return None, idx, err
    for _ in range(len(tokens)):
        if not _tok_is(tokens, idx, T_KEYWORD, kw):
            break
        right, idx, err = sub(tokens, idx + 1, st)
        if err: return None, idx, err
        a, err = _to_int(left)
        if err: return None, idx, err
        b, err = _to_int(right)
        if err: return None, idx, err
        if kw == "AND":   left = a & b
        elif kw == "OR":  left = a | b
        else:             left = a ^ b
    return left, idx, None

def parse_and(tokens, idx, st):
    return _parse_logic(tokens, idx, st, "AND", parse_not)

def parse_or(tokens, idx, st):
    return _parse_logic(tokens, idx, st, "OR", parse_and)

def parse_expr(tokens, idx, st):
    return _parse_logic(tokens, idx, st, "XOR", parse_or)


# ─── 그래픽 ASCII 시뮬레이션 (5단계) ──────────────────────────────────────────
#
# Starlark에는 그래픽 출력이 없으므로 작은 픽셀 버퍼를 dict에 보관하고
# SCREEN 활성 모드에서 PSET/LINE/CIRCLE을 호출한 후 END 또는 CLS 직전에
# output_lines로 flush 한다. 모드/색은 텍스트 로그로 기록.

GFX_W = 40
GFX_H = 20

def _gfx_new():
    rows = []
    for _ in range(GFX_H):
        rows.append(["." for _ in range(GFX_W)])
    return {"w": GFX_W, "h": GFX_H, "buf": rows, "mode": 0, "active": False}

def _gfx_plot(g, x, y, ch):
    x = int(x); y = int(y)
    if x < 0 or x >= g["w"] or y < 0 or y >= g["h"]:
        return
    g["buf"][y][x] = ch

def _gfx_line(g, x0, y0, x1, y1, ch):
    # Bresenham
    x0 = int(x0); y0 = int(y0); x1 = int(x1); y1 = int(y1)
    dx = x1 - x0 if x1 >= x0 else x0 - x1
    dy = -(y1 - y0) if y1 >= y0 else -(y0 - y1)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    for _ in range(GFX_W * GFX_H):
        _gfx_plot(g, x0, y0, ch)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy

def _gfx_circle(g, cx, cy, r, ch):
    # midpoint algorithm
    cx = int(cx); cy = int(cy); r = int(r)
    if r <= 0:
        _gfx_plot(g, cx, cy, ch)
        return
    x = r
    y = 0
    err = 1 - r
    for _ in range(r * 8 + 8):
        _gfx_plot(g, cx + x, cy + y, ch)
        _gfx_plot(g, cx + y, cy + x, ch)
        _gfx_plot(g, cx - y, cy + x, ch)
        _gfx_plot(g, cx - x, cy + y, ch)
        _gfx_plot(g, cx - x, cy - y, ch)
        _gfx_plot(g, cx - y, cy - x, ch)
        _gfx_plot(g, cx + y, cy - x, ch)
        _gfx_plot(g, cx + x, cy - y, ch)
        y += 1
        if err < 0:
            err += 2 * y + 1
        else:
            x -= 1
            err += 2 * (y - x) + 1
        if x < y:
            break

def _gfx_flush(g, output_lines):
    """그래픽 버퍼를 텍스트로 출력. 호출 후 clear."""
    if not g["active"]:
        return
    output_lines.append("[SCREEN buffer %dx%d]" % (g["w"], g["h"]))
    for row in g["buf"]:
        output_lines.append("".join(row))
    output_lines.append("[/SCREEN]")
    # clear
    for y in range(g["h"]):
        for x in range(g["w"]):
            g["buf"][y][x] = "."




# ─── 출력 버퍼 ────────────────────────────────────────────────────────────────
#
# st["lines"]: 완성된 줄, st["cur"]: 아직 줄바꿈되지 않은 현재 줄 (PRINT ...; 지원)

def _out(st, s):
    st["cur"] = st["cur"] + s

def _newline(st):
    st["lines"].append(st["cur"])
    st["cur"] = ""

def _flush_cur(st):
    if st["cur"] != "":
        _newline(st)

def _log_line(st, s):
    """그래픽/사운드/trace 로그 — 항상 독립된 한 줄."""
    _flush_cur(st)
    st["lines"].append(s)

def _output(st):
    ls = list(st["lines"])
    if st["cur"] != "":
        ls.append(st["cur"])
    return "\n".join(ls)


# ─── 라인 분리 ───────────────────────────────────────────────────────────────

def split_lines(tokens):
    """{line_no: [tokens..]} dict + 정렬된 line_no 리스트 반환.
    같은 라인 번호가 다시 나오면 나중 것이 앞의 줄을 대체한다 (GW-BASIC 편집 규칙)."""
    lines = {}
    i = 0
    n = len(tokens)
    while i < n:
        t = tokens[i]
        if t["type"] == T_EOL:
            i += 1
            continue
        if t["type"] == T_EOF:
            break
        if t["type"] != T_NUMBER or type(t["num"]) != "int" or t["num"] < 0 or t["num"] > 65529:
            return None, None, "Syntax error: line must start with line number (source line %d)" % t["line"]
        ln = t["num"]
        i += 1
        body = []
        while i < n and tokens[i]["type"] != T_EOL and tokens[i]["type"] != T_EOF:
            body.append(tokens[i])
            i += 1
        lines[ln] = body
    return lines, sorted(lines.keys()), None


# ─── DATA 풀 사전 수집 ────────────────────────────────────────────────────────
#
# DATA 원문(T_DATA)을 `,` 로 분리해 평탄한 풀로 모은다. 따옴표 없는 항목은
# 앞뒤 공백만 제거하고 대소문자/내부 공백 유지. 빈 항목도 하나의 항목.
# data_starts: [(라인번호, 그 라인의 첫 항목 인덱스)] — RESTORE <line> 용

def _split_data(raw):
    items = []
    i = 0
    n = len(raw)
    for _ in range(n + 1):
        while i < n and (raw[i] == " " or raw[i] == "\t"):
            i += 1
        if i < n and raw[i] == '"':
            j = i + 1
            while j < n and raw[j] != '"':
                j += 1
            items.append({"text": raw[i + 1:j], "quoted": True})
            while j < n and raw[j] != ",":
                j += 1
        else:
            j = i
            while j < n and raw[j] != ",":
                j += 1
            items.append({"text": raw[i:j].strip(" \t\r"), "quoted": False})
        if j < n and raw[j] == ",":
            i = j + 1
            continue
        break
    return items

def build_data_pool(lines, line_order):
    pool = []
    starts = []
    for ln in line_order:
        first = True
        for tok in lines[ln]:
            if tok["type"] != T_DATA:
                continue
            if first:
                starts.append((ln, len(pool)))
                first = False
            for it in _split_data(tok["value"]):
                it["ln"] = ln
                pool.append(it)
    return pool, starts


# ─── PRINT ────────────────────────────────────────────────────────────────────

def _is_stmt_end(body, i):
    if i >= len(body):
        return True
    t = body[i]
    return t["type"] == T_COLON or (t["type"] == T_KEYWORD and t["value"] == "ELSE")

def exec_print(st, body, i):
    """PRINT 항목 처리. 끝의 `;`/`,` 는 줄바꿈 억제. 반환: (다음 idx, err)."""
    newline = True
    for _ in range(len(body) + 1):
        if _is_stmt_end(body, i):
            break
        t = body[i]
        if t["type"] == T_SEMI:
            i += 1
            newline = False
            continue
        if t["type"] == T_COMMA:
            col = len(st["cur"])
            _out(st, " " * (14 - col % 14))     # 다음 14칸 구역
            i += 1
            newline = False
            continue
        if t["type"] == T_IDENT and (t["value"] == "TAB" or t["value"] == "SPC") and _tok_is(body, i + 1, T_LPAREN):
            args, i, err = _parse_call_args(body, i + 1, st)
            if err: return i, err
            if len(args) != 1: return i, E_SYNTAX
            n, err = _to_int(args[0])
            if err: return i, err
            if n < 0 or n > 255: return i, E_ILLEGAL
            if t["value"] == "SPC":
                _out(st, " " * n)
            else:
                target = n - 1 if n > 0 else 0
                if len(st["cur"]) > target:
                    _newline(st)
                _out(st, " " * (target - len(st["cur"])))
            newline = False
            continue
        v, i, err = parse_expr(body, i, st)
        if err: return i, err
        if type(v) == "string":
            _out(st, v)
        else:
            _out(st, fmt_num(v) + " ")
        newline = True
    if newline:
        _newline(st)
    return i, None


# ─── 문장 보조 ────────────────────────────────────────────────────────────────

def _stmt_end(body, i):
    """다음 ':' / ELSE / 줄 끝 위치."""
    while not _is_stmt_end(body, i):
        i += 1
    return i

def _goto_target(st, body, i):
    """body[i] 의 라인 번호 → (pc, err)."""
    if not _tok_is(body, i, T_NUMBER):
        return None, E_SYNTAX
    target = body[i]["num"]
    if type(target) != "int" or target not in st["line_idx"]:
        return None, "Undefined line number"
    return st["line_idx"][target], None

def parse_lvalue(body, i, st):
    """IDENT [ '(' 인덱스들 ')' ] → ({"name", "idx"}, 다음 idx, err)."""
    if not _tok_is(body, i, T_IDENT):
        return None, i, E_SYNTAX
    name = body[i]["value"]
    if _tok_is(body, i + 1, T_LPAREN):
        idx, j, err = _parse_call_args(body, i + 1, st)
        if err: return None, j, err
        if len(idx) == 0: return None, j, E_SYNTAX
        return {"name": name, "idx": idx}, j, None
    return {"name": name, "idx": None}, i + 1, None

def _find_else(body, i):
    """IF 의 THEN 이후에서 짝이 맞는 ELSE 위치 (중첩 IF 고려). 없으면 -1."""
    depth = 0
    for j in range(i, len(body)):
        t = body[j]
        if t["type"] != T_KEYWORD:
            continue
        if t["value"] == "IF":
            depth += 1
        elif t["value"] == "ELSE":
            if depth == 0:
                return j
            depth -= 1
    return -1

def _count_next_vars(body, k):
    """NEXT 뒤 변수 목록 [IDENT {, IDENT}] → (개수, 끝 위치)."""
    cnt = 0
    while _tok_is(body, k, T_IDENT):
        cnt += 1
        k += 1
        if _tok_is(body, k, T_COMMA):
            k += 1
        else:
            break
    return cnt, k

def _find_next(st, pc, i):
    """FOR 본문을 건너뛸 때 짝이 맞는 NEXT 다음 위치 → (pc, pos, err).
    `NEXT J,I` 는 여러 단계를 한꺼번에 닫는다."""
    depth = 0
    p = pc
    j = i
    while p < len(st["order"]):
        body = st["prog"][st["order"][p]]
        while j < len(body):
            t = body[j]
            if t["type"] == T_KEYWORD and t["value"] == "FOR":
                depth += 1
            elif t["type"] == T_KEYWORD and t["value"] == "NEXT":
                cnt, k = _count_next_vars(body, j + 1)
                if cnt == 0:
                    cnt = 1
                if depth < cnt:
                    return p, k, None
                depth -= cnt
                j = k
                continue
            j += 1
        p += 1
        j = 0
    return None, 0, "FOR without NEXT"

def _find_wend(st, pc, i):
    """조건이 거짓인 WHILE 에서 짝이 맞는 WEND 다음 위치 → (pc, pos, err)."""
    depth = 0
    p = pc
    j = i
    while p < len(st["order"]):
        body = st["prog"][st["order"][p]]
        while j < len(body):
            t = body[j]
            if t["type"] == T_KEYWORD and t["value"] == "WHILE":
                depth += 1
            elif t["type"] == T_KEYWORD and t["value"] == "WEND":
                if depth == 0:
                    return p, j + 1, None
                depth -= 1
            j += 1
        p += 1
        j = 0
    return None, 0, "WHILE without WEND"

def _parse_coord_env(body, i, st):
    """`(x, y)` → (x, y, 다음 idx, err)."""
    if not _tok_is(body, i, T_LPAREN):
        return None, None, i, E_SYNTAX
    x, j, err = parse_expr(body, i + 1, st)
    if err: return None, None, j, err
    if not _tok_is(body, j, T_COMMA):
        return None, None, j, E_SYNTAX
    y, k, err = parse_expr(body, j + 1, st)
    if err: return None, None, k, err
    if not _tok_is(body, k, T_RPAREN):
        return None, None, k, E_SYNTAX
    if not _is_num(x) or not _is_num(y):
        return None, None, k, E_TYPE
    return x, y, k + 1, None


# ─── 문장 실행 ────────────────────────────────────────────────────────────────
#
# exec_stmt(st, body, start, ln, pc) → (next_pc, next_pos, jump, err)
#   - next_pc == None : 프로그램 종료 (END/STOP)
#   - jump == False   : 같은 줄의 next_pos 에서 계속 (':' / ELSE / 줄 끝이어야 함)
#   - jump == True    : (next_pc, next_pos) 로 이동 (문장 시작/끝 어디든)

def exec_stmt(st, body, start, ln, pc):
    head = body[start]
    hv = head["value"]

    if head["type"] == T_IDENT:
        hv = "LET"
        i = start
    elif head["type"] != T_KEYWORD:
        return pc, start, False, E_SYNTAX
    else:
        i = start + 1

    if hv == "REM":
        return pc + 1, 0, True, None
    if hv == "END" or hv == "STOP":
        return None, 0, True, None

    # LET (명시) 또는 암묵 LET — 스칼라 / 배열 원소
    if hv == "LET":
        target, i, err = parse_lvalue(body, i, st)
        if err: return pc, i, False, err
        if not _tok_is(body, i, T_OP, "="):
            return pc, i, False, E_SYNTAX
        v, i, err = parse_expr(body, i + 1, st)
        if err: return pc, i, False, err
        err = _assign(st, target, v)
        return pc, i, False, err

    if hv == "PRINT":
        i, err = exec_print(st, body, i)
        return pc, i, False, err

    # DATA — 실행 시에는 건너뜀 (사전 수집 완료)
    if hv == "DATA":
        if _tok_is(body, i, T_DATA):
            i += 1
        return pc, i, False, None

    # DEF FN<name>[(p1, p2, ...)] = expr — 실행될 때 등록
    if hv == "DEF":
        if _tok_is(body, i, T_KEYWORD, "FN") and _tok_is(body, i + 1, T_IDENT):
            fname = "FN" + body[i + 1]["value"]
            i += 2
        elif _tok_is(body, i, T_IDENT) and body[i]["value"].startswith("FN") and len(body[i]["value"]) > 2:
            fname = body[i]["value"]
            i += 1
        else:
            return pc, i, False, E_SYNTAX
        params = []
        if _tok_is(body, i, T_LPAREN):
            i += 1
            for _ in range(len(body)):
                if not _tok_is(body, i, T_IDENT):
                    return pc, i, False, E_SYNTAX
                params.append(body[i]["value"])
                i += 1
                if _tok_is(body, i, T_COMMA):
                    i += 1
                    continue
                break
            if not _tok_is(body, i, T_RPAREN):
                return pc, i, False, E_SYNTAX
            i += 1
        if not _tok_is(body, i, T_OP, "="):
            return pc, i, False, E_SYNTAX
        if _is_stmt_end(body, i + 1):
            return pc, i, False, E_SYNTAX
        st["defns"][fname] = {"params": params, "body": body, "start": i + 1}
        return pc, _stmt_end(body, i + 1), False, None

    # READ v1, A(I), ... — DATA 풀에서 순서대로
    if hv == "READ":
        for _ in range(len(body)):
            target, i, err = parse_lvalue(body, i, st)
            if err: return pc, i, False, err
            if st["data_ptr"] >= len(st["data"]):
                return pc, i, False, "Out of DATA"
            item = st["data"][st["data_ptr"]]
            st["data_ptr"] = st["data_ptr"] + 1
            if target["name"].endswith("$"):
                v = item["text"]
            else:
                v, ok = _parse_number_strict(item["text"])
                if item["quoted"] or not ok:
                    st["err_ln"] = item["ln"]     # GW-BASIC: DATA 줄에서 Syntax error
                    return pc, i, False, E_SYNTAX
            err = _assign(st, target, v)
            if err: return pc, i, False, err
            if _tok_is(body, i, T_COMMA):
                i += 1
                continue
            break
        return pc, i, False, None

    # RESTORE [<line>] — <line> 이상인 첫 DATA 줄로
    if hv == "RESTORE":
        if _tok_is(body, i, T_NUMBER):
            target_ln = body[i]["num"]
            i += 1
            st["data_ptr"] = len(st["data"])
            for dl, di in st["data_starts"]:
                if dl >= target_ln:
                    st["data_ptr"] = di
                    break
        else:
            st["data_ptr"] = 0
        return pc, i, False, None

    # INPUT [;] ["prompt" {;|,}] v1, A(I), ...
    # stdin 이 없으므로 input_queue 에서 변수마다 하나씩 소비하고 입력을 에코한다.
    # 숫자 변수에 숫자가 아닌 값 → "?Redo from start" 후 큐의 다음 값으로 재시도.
    if hv == "INPUT":
        if _tok_is(body, i, T_SEMI):
            i += 1
        prompt = "? "
        if _tok_is(body, i, T_STRING) and (_tok_is(body, i + 1, T_SEMI) or _tok_is(body, i + 1, T_COMMA)):
            prompt = body[i]["value"] + ("? " if body[i + 1]["type"] == T_SEMI else "")
            i += 2
        targets = []
        for _ in range(len(body)):
            target, i, err = parse_lvalue(body, i, st)
            if err: return pc, i, False, err
            targets.append(target)
            if _tok_is(body, i, T_COMMA):
                i += 1
                continue
            break
        iq = st["iq"]
        for _ in range(len(iq) + 1):
            need = len(targets)
            if st["iq_ptr"] + need > len(iq):
                return pc, i, False, "Input past end"
            raws = iq[st["iq_ptr"]:st["iq_ptr"] + need]
            st["iq_ptr"] = st["iq_ptr"] + need
            vals = []
            ok = True
            for k in range(need):
                raw = raws[k]
                if targets[k]["name"].endswith("$"):
                    vals.append(_fmt_plain(raw) if _is_num(raw) else str(raw))
                elif _is_num(raw):
                    vals.append(raw)
                else:
                    v, good = _parse_number_strict(str(raw))
                    if not good:
                        ok = False
                        break
                    vals.append(v)
            _out(st, prompt + ",".join([_fmt_plain(r) for r in raws]))
            _newline(st)
            if not ok:
                _log_line(st, "?Redo from start")
                continue
            for k in range(need):
                err = _assign(st, targets[k], vals[k])
                if err: return pc, i, False, err
            return pc, i, False, None
        return pc, i, False, "Input past end"

    # GOTO n
    if hv == "GOTO":
        tpc, err = _goto_target(st, body, i)
        if err: return pc, i, False, err
        return tpc, 0, True, None

    # GOSUB n — 복귀 위치는 이 문장 바로 뒤
    if hv == "GOSUB":
        tpc, err = _goto_target(st, body, i)
        if err: return pc, i, False, err
        if not _is_stmt_end(body, i + 1):
            return pc, i + 1, False, E_SYNTAX
        if len(st["gosub"]) >= 1000:
            return pc, i, False, "Out of memory"
        st["gosub"].append((pc, i + 1))
        return tpc, 0, True, None

    if hv == "RETURN":
        if len(st["gosub"]) == 0:
            return pc, i, False, "RETURN without GOSUB"
        rpc, rpos = st["gosub"].pop()
        return rpc, rpos, True, None

    # ON n GOTO|GOSUB l1, l2, ... — n 이 범위 밖이면 다음 문장으로
    if hv == "ON":
        v, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        n, err = _to_int(v)
        if err: return pc, i, False, err
        if n < 0 or n > 255:
            return pc, i, False, E_ILLEGAL
        if _tok_is(body, i, T_KEYWORD, "GOTO") or _tok_is(body, i, T_KEYWORD, "GOSUB"):
            kind = body[i]["value"]
            i += 1
        else:
            return pc, i, False, E_SYNTAX
        targets = []
        for _ in range(len(body)):
            if not _tok_is(body, i, T_NUMBER):
                return pc, i, False, E_SYNTAX
            targets.append(i)
            i += 1
            if _tok_is(body, i, T_COMMA):
                i += 1
                continue
            break
        if n >= 1 and n <= len(targets):
            tpc, err = _goto_target(st, body, targets[n - 1])
            if err: return pc, i, False, err
            if kind == "GOSUB":
                if not _is_stmt_end(body, i):
                    return pc, i, False, E_SYNTAX
                st["gosub"].append((pc, i))
            return tpc, 0, True, None
        return pc, i, False, None

    # FOR var = a TO b [STEP s]
    if hv == "FOR":
        if not _tok_is(body, i, T_IDENT) or not _tok_is(body, i + 1, T_OP, "="):
            return pc, i, False, E_SYNTAX
        var = body[i]["value"]
        if var.endswith("$"):
            return pc, i, False, E_TYPE
        sv, i, err = parse_expr(body, i + 2, st)
        if err: return pc, i, False, err
        if not _tok_is(body, i, T_KEYWORD, "TO"):
            return pc, i, False, E_SYNTAX
        ev, i, err = parse_expr(body, i + 1, st)
        if err: return pc, i, False, err
        step = 1
        if _tok_is(body, i, T_KEYWORD, "STEP"):
            step, i, err = parse_expr(body, i + 1, st)
            if err: return pc, i, False, err
        if not _is_num(sv) or not _is_num(ev) or not _is_num(step):
            return pc, i, False, E_TYPE
        if not _is_stmt_end(body, i):
            return pc, i, False, E_SYNTAX
        err = _assign(st, {"name": var, "idx": None}, sv)
        if err: return pc, i, False, err
        v = st["vars"][var]
        # 같은 변수의 기존 프레임(과 그 안쪽 프레임)은 제거 — 루프 재진입
        fs = st["for"]
        for k in range(len(fs) - 1, -1, -1):
            if fs[k]["var"] == var:
                st["for"] = fs[:k]
                break
        if (step >= 0 and v > ev) or (step < 0 and v < ev):
            # 시작값이 이미 끝을 넘음 → 본문을 건너뛰고 짝 NEXT 다음으로
            npc, npos, err = _find_next(st, pc, i)
            if err: return pc, i, False, err
            return npc, npos, True, None
        st["for"].append({"var": var, "end": ev, "step": step, "pc": pc, "pos": i})
        return pc, i, False, None

    # NEXT [v1 [, v2 ...]] — 변수 생략 시 가장 안쪽 루프
    if hv == "NEXT":
        names = []
        for _ in range(len(body)):
            if not _tok_is(body, i, T_IDENT):
                break
            names.append(body[i]["value"])
            i += 1
            if _tok_is(body, i, T_COMMA):
                i += 1
                continue
            break
        if len(names) == 0:
            names = [None]
        for nm in names:
            fs = st["for"]
            k = len(fs) - 1
            if nm != None:
                for _ in range(len(fs)):
                    if k < 0 or fs[k]["var"] == nm:
                        break
                    k -= 1
            if k < 0:
                return pc, i, False, "NEXT without FOR"
            frame = fs[k]
            st["for"] = fs[:k + 1]          # 안쪽 프레임 정리
            nv, err = _chk(_get_var(st, frame["var"]) + frame["step"])
            if err: return pc, i, False, err
            err = _assign(st, {"name": frame["var"], "idx": None}, nv)
            if err: return pc, i, False, err
            v = st["vars"][frame["var"]]
            step = frame["step"]
            done = (step >= 0 and v > frame["end"]) or (step < 0 and v < frame["end"])
            if not done:
                return frame["pc"], frame["pos"], True, None
            st["for"] = fs[:k]
        return pc, i, False, None

    # WHILE expr ... WEND
    if hv == "WHILE":
        cond, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        if not _is_num(cond):
            return pc, i, False, E_TYPE
        ws = st["while"]
        for k in range(len(ws) - 1, -1, -1):
            if ws[k][0] == pc and ws[k][1] == start:
                st["while"] = ws[:k]
                break
        if cond != 0:
            st["while"].append((pc, start))
            return pc, i, False, None
        npc, npos, err = _find_wend(st, pc, i)
        if err: return pc, i, False, err
        return npc, npos, True, None

    if hv == "WEND":
        if len(st["while"]) == 0:
            return pc, i, False, "WEND without WHILE"
        wpc, wpos = st["while"].pop()
        return wpc, wpos, True, None

    # IF cond THEN <stmts | n> [ELSE <stmts | n>]   /   IF cond GOTO n [ELSE ...]
    if hv == "IF":
        cond, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        if not _is_num(cond):
            return pc, i, False, E_TYPE
        if _tok_is(body, i, T_KEYWORD, "THEN"):
            i += 1
        elif _tok_is(body, i, T_KEYWORD, "GOTO"):
            i += 1
            if not _tok_is(body, i, T_NUMBER):
                return pc, i, False, E_SYNTAX
        else:
            return pc, i, False, E_SYNTAX
        if cond != 0:
            b = i
        else:
            e = _find_else(body, i)
            if e < 0:
                return pc + 1, 0, True, None     # 거짓 + ELSE 없음 → 다음 줄
            b = e + 1
        if _tok_is(body, b, T_NUMBER):           # THEN n / ELSE n → GOTO 약식
            tpc, err = _goto_target(st, body, b)
            if err: return pc, b, False, err
            return tpc, 0, True, None
        # 분기 문장들을 같은 줄에서 이어서 실행 (THEN 쪽은 ELSE 를 만나면 줄 종료)
        return pc, b, True, None

    if hv == "RANDOMIZE":
        if not _is_stmt_end(body, i):
            v, i, err = parse_expr(body, i, st)
            if err: return pc, i, False, err
            if not _is_num(v): return pc, i, False, E_TYPE
            st["rnd"] = int((v if v >= 0 else -v) * 1000 + 7) % 2147483648
        return pc, i, False, None

    # DIM A(n) [, B$(n, m) ...] — 인덱스 0..n
    if hv == "DIM":
        for _ in range(len(body)):
            if not _tok_is(body, i, T_IDENT) or not _tok_is(body, i + 1, T_LPAREN):
                return pc, i, False, E_SYNTAX
            name = body[i]["value"]
            args, i, err = _parse_call_args(body, i + 1, st)
            if err: return pc, i, False, err
            if len(args) == 0:
                return pc, i, False, E_SYNTAX
            dims = []
            for a in args:
                d, err = _to_int(a)
                if err: return pc, i, False, err
                dims.append(d)
            err = _array_dim(st, name, dims)
            if err: return pc, i, False, err
            if _tok_is(body, i, T_COMMA):
                i += 1
                continue
            break
        return pc, i, False, None

    # ── 그래픽 / 사운드 (ASCII 버퍼 + 텍스트 로그) ──
    gfx = st["gfx"]

    # SCREEN <mode> — mode 0=텍스트, 그 외=그래픽 활성
    if hv == "SCREEN":
        v, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        m, err = _to_int(v)
        if err: return pc, i, False, err
        gfx["mode"] = m
        gfx["active"] = (m != 0)
        _log_line(st, "[SCREEN %d]" % m)
        return pc, _stmt_end(body, i), False, None

    # COLOR fg [, bg]
    if hv == "COLOR":
        fg, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        fgi, err = _to_int(fg)
        if err: return pc, i, False, err
        st["fg"] = fgi
        if _tok_is(body, i, T_COMMA):
            bg, i, err = parse_expr(body, i + 1, st)
            if err: return pc, i, False, err
            bgi, err = _to_int(bg)
            if err: return pc, i, False, err
            st["bg"] = bgi
        _log_line(st, "[COLOR fg=%d bg=%d]" % (st["fg"], st["bg"]))
        return pc, _stmt_end(body, i), False, None

    # CLS — 그래픽이면 flush, 텍스트면 로그
    if hv == "CLS":
        _flush_cur(st)
        if gfx["active"]:
            _gfx_flush(gfx, st["lines"])
        _log_line(st, "[CLS]")
        return pc, i, False, None

    # PSET/PRESET (x, y) [, color]
    if hv == "PSET" or hv == "PRESET":
        x, y, i, err = _parse_coord_env(body, i, st)
        if err: return pc, i, False, err
        _gfx_plot(gfx, x, y, "*" if hv == "PSET" else ".")
        return pc, _stmt_end(body, i), False, None

    # LINE (x1,y1)-(x2,y2) [, ...]
    if hv == "LINE":
        x1, y1, i, err = _parse_coord_env(body, i, st)
        if err: return pc, i, False, err
        if not _tok_is(body, i, T_OP, "-"):
            return pc, i, False, E_SYNTAX
        x2, y2, i, err = _parse_coord_env(body, i + 1, st)
        if err: return pc, i, False, err
        _gfx_line(gfx, x1, y1, x2, y2, "#")
        return pc, _stmt_end(body, i), False, None

    # CIRCLE (x, y), r [, ...]
    if hv == "CIRCLE":
        cx, cy, i, err = _parse_coord_env(body, i, st)
        if err: return pc, i, False, err
        if not _tok_is(body, i, T_COMMA):
            return pc, i, False, E_SYNTAX
        r, i, err = parse_expr(body, i + 1, st)
        if err: return pc, i, False, err
        if not _is_num(r): return pc, i, False, E_TYPE
        _gfx_circle(gfx, cx, cy, r, "o")
        return pc, _stmt_end(body, i), False, None

    # SOUND freq, duration — 텍스트 로그
    if hv == "SOUND":
        f, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        if not _tok_is(body, i, T_COMMA):
            return pc, i, False, E_SYNTAX
        d, i, err = parse_expr(body, i + 1, st)
        if err: return pc, i, False, err
        fi, err = _to_int(f)
        if err: return pc, i, False, err
        if not _is_num(d): return pc, i, False, E_TYPE
        _log_line(st, "[SOUND %dHz %s]" % (fi, _fmt_plain(d)))
        return pc, i, False, None

    # PLAY "string"
    if hv == "PLAY":
        v, i, err = parse_expr(body, i, st)
        if err: return pc, i, False, err
        if type(v) != "string": return pc, i, False, E_TYPE
        _log_line(st, "[PLAY %s]" % v)
        return pc, i, False, None

    return pc, start, False, E_SYNTAX


# ─── 인터프리터 메인 루프 ─────────────────────────────────────────────────────

def execute(tokens, max_steps = 10000, input_queue = None, trace = False):
    """tokens 실행. input_queue: INPUT 문장이 소비할 값(list of str/num).
    trace=True 면 라인 진입 시 [TRACE ln=N] 로그 추가 (디버거 대안).
    반환: (출력, err). 런타임 오류 시 출력은 지금까지의 내용 + "<오류> in <라인>" 줄."""
    lines, line_order, err = split_lines(tokens)
    if err:
        return err, err
    data_pool, data_starts = build_data_pool(lines, line_order)
    line_idx = {}
    for i, ln in enumerate(line_order):
        line_idx[ln] = i

    st = {
        "vars": {}, "arrays": {}, "defns": {},
        "lines": [], "cur": "",
        "prog": lines, "order": line_order, "line_idx": line_idx,
        "for": [], "gosub": [], "while": [],
        "data": data_pool, "data_starts": data_starts, "data_ptr": 0,
        "iq": list(input_queue) if input_queue != None else [], "iq_ptr": 0,
        "rnd": 12345, "rnd_last": 0.0, "fn_depth": 0,
        "gfx": _gfx_new(), "fg": 7, "bg": 0,
        "err_ln": None,
    }

    pc = 0
    pos = 0
    steps = 0
    err = None
    err_ln = 0
    while pc < len(line_order):
        ln = line_order[pc]
        body = lines[ln]
        if pos == 0 and trace:
            _log_line(st, "[TRACE ln=%d]" % ln)
        if pos >= len(body):
            pc += 1
            pos = 0
            continue
        t = body[pos]
        if t["type"] == T_COLON:
            pos += 1
            continue
        if t["type"] == T_KEYWORD and t["value"] == "ELSE":
            # THEN 분기 실행 후 ELSE 도달 → 줄의 나머지는 건너뜀
            pc += 1
            pos = 0
            continue
        if steps >= max_steps:
            err = "Step limit exceeded (infinite loop?)"
            err_ln = ln
            break
        steps += 1
        npc, npos, jump, serr = exec_stmt(st, body, pos, ln, pc)
        if serr:
            err = serr
            err_ln = st["err_ln"] if st["err_ln"] != None else ln
            break
        if npc == None:
            break
        if not jump and not _is_stmt_end(body, npos):
            err = E_SYNTAX
            err_ln = ln
            break
        pc = npc
        pos = npos

    # 5단계: 종료 시 그래픽 버퍼가 활성이면 flush
    if st["gfx"]["active"]:
        _flush_cur(st)
        _gfx_flush(st["gfx"], st["lines"])

    out = _output(st)
    if err:
        msg = "%s in %d" % (err, err_ln)
        return (out + "\n" + msg if out != "" else msg), msg
    return out, None


def run_program(src, input_queue = None, max_steps = 10000):
    """BASIC 소스 문자열을 실행해 출력 문자열 반환 (오류도 출력에 포함)."""
    tokens, err = tokenize(src)
    if err:
        return err
    out, _ = execute(tokens, max_steps = max_steps, input_queue = input_queue)
    return out


# ─── 데모 프로그램 ────────────────────────────────────────────────────────────

# Stage 1 회귀 데모 (1단계 기능 유지 검증)
DEMO_STAGE1 = '''10 REM stage 1
20 PRINT "HELLO, GW-BASIC!"
30 LET A = 7
40 LET B = 6
50 PRINT "A * B ="; A * B
60 PRINT "(A + B) * 2 ="; (A + B) * 2
70 PRINT "EQ:"; (A * B) = 42
80 PRINT "NEQ:"; (A * B) <> 42
'''

# Stage 2 데모: IF / FOR / GOSUB / WHILE 모두 검증
DEMO_STAGE2 = '''10 REM stage 2 control flow
20 PRINT "=== IF ==="
30 LET A = 5
40 IF A > 3 THEN 60
50 PRINT "WRONG"
60 PRINT "A > 3 OK"
70 IF A = 5 THEN PRINT "INLINE THEN" ELSE PRINT "WRONG"
80 IF A = 9 THEN PRINT "WRONG" ELSE PRINT "INLINE ELSE"
90 PRINT "=== FOR ==="
100 FOR I = 1 TO 3
110 PRINT I
120 NEXT I
130 LET S = 0
140 FOR J = 1 TO 5 STEP 2
150 LET S = S + J
160 NEXT J
170 PRINT "SUM ODD"; S
180 PRINT "=== GOSUB ==="
190 GOSUB 1000
200 PRINT "BACK"
210 PRINT "=== WHILE ==="
220 LET K = 1
230 WHILE K < 4
240 PRINT K
250 LET K = K + 1
260 WEND
270 PRINT "WEND DONE"
280 END
1000 PRINT "IN SUB"
1010 RETURN
'''


# Stage 3 데모: 부동소수점, 16/8진수, 문자열·수학 함수, DIM/배열
DEMO_STAGE3 = '''10 REM stage 3 numbers strings arrays
20 PRINT "PI:"; 3.14
30 PRINT "HEX:"; &H1F
40 PRINT "OCT:"; &O17
50 LET S$ = "HELLO WORLD"
60 PRINT "LEN:"; LEN(S$)
70 PRINT "LEFT:"; LEFT$(S$, 5)
80 PRINT "RIGHT:"; RIGHT$(S$, 5)
90 PRINT "MID:"; MID$(S$, 7, 5)
100 PRINT "INSTR:"; INSTR(S$, "WORLD")
110 PRINT "INT:"; INT(3.7)
120 PRINT "INTNEG:"; INT(-3.2)
130 PRINT "ABS:"; ABS(-5)
140 DIM A(4)
150 FOR I = 0 TO 4
160 LET A(I) = I * I
170 NEXT I
180 PRINT "SQUARES:"; A(0); A(1); A(2); A(3); A(4)
190 END
'''


# Stage 4 데모: DATA/READ/RESTORE, INPUT(queue), DEF FN
DEMO_STAGE4 = '''10 REM stage 4 data input deffn
20 DATA 10, 20, 30, "ALICE"
30 READ A, B, C, N$
40 PRINT "READ:"; A; B; C
50 PRINT "NAME:"; N$
60 RESTORE
70 READ X
80 PRINT "RESTORED:"; X
90 INPUT "ENTER:"; Q$
100 PRINT "GOT:"; Q$
110 DEF FNSQ(X) = X * X
120 DEF FNDBL(Y) = Y + Y
130 PRINT "SQ(7):"; FNSQ(7)
140 PRINT "DBL(11):"; FNDBL(11)
150 PRINT "NESTED:"; FNSQ(FNDBL(3))
160 END
'''


# Stage 5 데모: SCREEN/COLOR/CLS/PSET/LINE/CIRCLE/SOUND/PLAY
# (Starlark에는 그래픽/사운드가 없어 ASCII 버퍼와 텍스트 로그로 시뮬레이션)
DEMO_STAGE5 = '''10 REM stage 5 graphics + sound
20 SCREEN 1
30 COLOR 4, 0
40 PSET (5, 5)
50 PSET (10, 10)
60 LINE (0, 0)-(20, 12)
70 CIRCLE (20, 10), 6
80 SOUND 440, 1
90 PLAY "C D E F G"
100 END
'''


# Stage 6 예제 프로그램: 1·2·3·4·5단계 기능을 종합 활용
# - 피보나치 수열
EXAMPLE_FIB = '''10 REM Fibonacci first 10 terms
20 LET A = 0
30 LET B = 1
40 FOR I = 1 TO 10
50 PRINT A
60 LET C = A + B
70 LET A = B
80 LET B = C
90 NEXT I
100 END
'''

# - 소수 판별 (2..20) — MOD 연산자 사용
# (GW-BASIC 클래식 식별자는 알파넘만 — `_` 미지원이므로 ISP 사용)
EXAMPLE_PRIMES = '''10 REM Primes up to 20
20 FOR N = 2 TO 20
30 LET ISP = 1
40 FOR D = 2 TO N - 1
50 IF N MOD D = 0 THEN ISP = 0
60 NEXT D
70 IF ISP THEN PRINT N
80 NEXT N
90 PRINT "DONE"
100 END
'''

# - 별 그리기 (CIRCLE + LINE)
EXAMPLE_STAR = '''10 REM Star drawing
20 SCREEN 1
30 CIRCLE (20, 10), 8
40 LINE (12, 6)-(28, 14)
50 LINE (28, 6)-(12, 14)
60 LINE (20, 2)-(20, 18)
70 PSET (20, 10)
80 END
'''


def run_demo():
    print("=== GW-BASIC 1~6단계 데모 ===")
    stages = [
        ("Stage 1",     DEMO_STAGE1,    None, False),
        ("Stage 2",     DEMO_STAGE2,    None, False),
        ("Stage 3",     DEMO_STAGE3,    None, False),
        ("Stage 4",     DEMO_STAGE4,    ["WORLD"], False),
        ("Stage 5",     DEMO_STAGE5,    None, False),
        ("Fibonacci",   EXAMPLE_FIB,    None, False),
        ("Primes 1-20", EXAMPLE_PRIMES, None, False),
        ("Star",        EXAMPLE_STAR,   None, False),
    ]
    for label, src, iq, tr in stages:
        print("--- %s ---" % label)
        tokens, err = tokenize(src)
        if err:
            print("LEX ERROR:", err)
            continue
        # 런타임 오류가 나도 출력(오류 줄 포함)은 그대로 보여준다
        output, err = execute(tokens, input_queue = iq, trace = tr)
        print(output)
    # trace=True 데모 (작은 프로그램으로)
    print("--- TRACE demo ---")
    src = '''10 LET A = 1
20 LET B = 2
30 PRINT A + B
40 END
'''
    tokens, err = tokenize(src)
    if err == None:
        out, err = execute(tokens, trace = True)
        print(out)
    print("=== 끝 ===")


run_demo()
