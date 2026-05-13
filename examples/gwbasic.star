# GW-BASIC 인터프리터 - 1·2·3단계 (Todo #62 → Todo.md #66)
#
# 1단계: 렉서 + PRINT/LET/REM/GOTO + 산술·비교
# 2단계: IF/THEN/ELSE, FOR/NEXT, GOSUB/RETURN, WHILE/WEND
# 3단계:
#   - 부동소수점 NUMBER 토큰 (`1.5`, `.5`, `1.5E2`)
#   - 16진수(`&H1F`) / 8진수(`&O17`) 리터럴
#   - `$` 접미사를 가진 IDENT (`A$`, `LEFT$`)
#   - 빌트인 함수: LEN / LEFT$ / RIGHT$ / MID$ / INSTR /
#                  INT / ABS / SIN / COS / TAN / SQR / RND
#   - 배열: 1차원 DIM A(N), 참조/대입 `A(I)` (정수 인덱스)
#
# 미구현(향후 단계):
#   - 다차원 배열, DEF FN, DATA/READ, INPUT, 그래픽/사운드
#
# Starlark 제약: 클래스 없음 → 모든 상태는 dict로, 전역 mutable 금지 → list/dict 변형 사용.

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
T_EOL     = "EOL"
T_EOF     = "EOF"

KEYWORDS = {
    "PRINT": True, "LET": True, "REM": True, "GOTO": True,
    "IF": True, "THEN": True, "ELSE": True,
    "FOR": True, "TO": True, "STEP": True, "NEXT": True,
    "GOSUB": True, "RETURN": True,
    "WHILE": True, "WEND": True,
    "DIM": True,
    "END": True, "STOP": True,
    "AND": True, "OR": True, "NOT": True, "MOD": True,
}

TWO_CHAR_OPS = {"<=": True, ">=": True, "<>": True}
SINGLE_OPS   = {"+": True, "-": True, "*": True, "/": True, "=": True, "<": True, ">": True}


def is_digit(c):
    return len(c) == 1 and c >= "0" and c <= "9"

def is_alpha(c):
    return len(c) == 1 and ((c >= "A" and c <= "Z") or (c >= "a" and c <= "z"))

def is_alnum(c):
    return is_digit(c) or is_alpha(c)

def make_tok(typ, value, line, col, num = None):
    return {"type": typ, "value": value, "line": line, "col": col, "num": num}


# ─── Lexer ────────────────────────────────────────────────────────────────────

def tokenize(src):
    """src 문자열을 토큰 리스트로 변환. 에러 시 (None, 에러문자열) 반환."""
    tokens = []
    pos = 0
    line = 1
    col = 1
    n = len(src)

    def peek(off):
        idx = pos + off
        if idx < n:
            return src[idx]
        return ""

    while pos < n:
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

        # ' 코멘트 → EOL까지 무시 (REM_TEXT 토큰 대신 단순 skip)
        if ch == "'":
            while pos < n and src[pos] != "\n":
                pos += 1
                col += 1
            continue

        # 16진수 / 8진수 리터럴: &H... / &O...
        if ch == "&" and pos + 1 < n and (src[pos + 1] == "H" or src[pos + 1] == "h" or
                                          src[pos + 1] == "O" or src[pos + 1] == "o"):
            start_col = col
            base_ch = src[pos + 1]
            pos += 2; col += 2
            s = ""
            if base_ch == "H" or base_ch == "h":
                # 16진수
                while pos < n and ((src[pos] >= "0" and src[pos] <= "9") or
                                   (src[pos] >= "A" and src[pos] <= "F") or
                                   (src[pos] >= "a" and src[pos] <= "f")):
                    s += src[pos]; pos += 1; col += 1
                if s == "":
                    return None, "Empty &H literal at line %d" % line
                num = int(s, 16)
                tokens.append(make_tok(T_NUMBER, "&H" + s, line, start_col, num = num))
            else:
                # 8진수
                while pos < n and src[pos] >= "0" and src[pos] <= "7":
                    s += src[pos]; pos += 1; col += 1
                if s == "":
                    return None, "Empty &O literal at line %d" % line
                num = int(s, 8)
                tokens.append(make_tok(T_NUMBER, "&O" + s, line, start_col, num = num))
            continue

        # 숫자 (정수 / 부동소수점). `.5` 도 받기 위해 `.` 으로 시작하는 케이스도 처리.
        if is_digit(ch) or (ch == "." and pos + 1 < n and is_digit(src[pos + 1])):
            start_col = col
            s = ""
            is_float = False
            # 정수 부분
            while pos < n and is_digit(src[pos]):
                s += src[pos]; pos += 1; col += 1
            # 소수점
            if pos < n and src[pos] == "." and pos + 1 < n and is_digit(src[pos + 1]):
                is_float = True
                s += "."; pos += 1; col += 1
                while pos < n and is_digit(src[pos]):
                    s += src[pos]; pos += 1; col += 1
            elif pos < n and src[pos] == "." and (pos + 1 >= n or not is_digit(src[pos + 1])):
                # `5.` 형태도 부동소수점으로 허용
                is_float = True
                s += "."; pos += 1; col += 1
            # 지수부 E[+/-]digits
            if pos < n and (src[pos] == "E" or src[pos] == "e"):
                is_float = True
                s += src[pos]; pos += 1; col += 1
                if pos < n and (src[pos] == "+" or src[pos] == "-"):
                    s += src[pos]; pos += 1; col += 1
                while pos < n and is_digit(src[pos]):
                    s += src[pos]; pos += 1; col += 1
            num = float(s) if is_float else int(s)
            tokens.append(make_tok(T_NUMBER, s, line, start_col, num = num))
            continue

        # 문자열
        if ch == '"':
            start_col = col
            pos += 1
            col += 1
            s = ""
            while pos < n and src[pos] != '"' and src[pos] != "\n":
                s += src[pos]
                pos += 1
                col += 1
            if pos >= n or src[pos] != '"':
                return None, "Unterminated string at line %d" % line
            pos += 1
            col += 1
            tokens.append(make_tok(T_STRING, s, line, start_col))
            continue

        # 식별자 / 키워드. 끝에 `$` (문자열) 또는 `%` (정수) 한 글자 타입 sigil 허용.
        # GW-BASIC: A$ = 문자열 변수, LEFT$ = 문자열 반환 함수.
        if is_alpha(ch):
            start_col = col
            s = ""
            while pos < n and is_alnum(src[pos]):
                s += src[pos]
                pos += 1
                col += 1
            # 타입 sigil
            if pos < n and (src[pos] == "$" or src[pos] == "%"):
                s += src[pos]; pos += 1; col += 1
            up = s.upper()
            # `$`를 포함한 이름은 KEYWORDS에 없으므로 IDENT로 분기. 단 LEFT$/RIGHT$/MID$/CHR$
            # 등은 빌트인 함수명으로 parse_primary에서 인식.
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
        two = ch + peek(1)
        if two in TWO_CHAR_OPS:
            tokens.append(make_tok(T_OP, two, line, col))
            pos += 2; col += 2
            continue

        # 한 글자 연산자
        if ch in SINGLE_OPS:
            tokens.append(make_tok(T_OP, ch, line, col))
            pos += 1; col += 1
            continue

        return None, "Unexpected character %r at line %d col %d" % (ch, line, col)

    tokens.append(make_tok(T_EOF, "", line, col))
    return tokens, None


# ─── 빌트인 함수 ──────────────────────────────────────────────────────────────
#
# 이름 → (인자 갯수 검증 함수, 실행 함수). 인자는 모두 평가된 값(list).

def _b_len(args):
    if len(args) != 1: return None, "LEN expects 1 arg"
    return len(str(args[0])), None

def _b_left(args):
    if len(args) != 2: return None, "LEFT$ expects (s, n)"
    s = str(args[0]); n = int(args[1])
    return s[:max(0, n)], None

def _b_right(args):
    if len(args) != 2: return None, "RIGHT$ expects (s, n)"
    s = str(args[0]); n = int(args[1])
    if n <= 0: return "", None
    return s[-n:], None

def _b_mid(args):
    # MID$(s, start [, len]). GW-BASIC은 1-based start.
    if len(args) < 2 or len(args) > 3:
        return None, "MID$ expects (s, start [, len])"
    s = str(args[0])
    start = int(args[1]) - 1
    if start < 0: start = 0
    if len(args) == 2:
        return s[start:], None
    n = int(args[2])
    return s[start:start + max(0, n)], None

def _b_instr(args):
    # INSTR([start,] haystack, needle) → 1-based pos, 못 찾으면 0
    if len(args) == 2:
        h = str(args[0]); needle = str(args[1]); start = 0
    elif len(args) == 3:
        start = int(args[0]) - 1
        h = str(args[1]); needle = str(args[2])
        if start < 0: start = 0
    else:
        return None, "INSTR expects (h,n) or (start,h,n)"
    pos = h.find(needle, start)
    return pos + 1 if pos >= 0 else 0, None

def _b_int(args):
    if len(args) != 1: return None, "INT expects 1 arg"
    v = args[0]
    if type(v) == "float":
        # GW-BASIC INT은 음의 무한대로의 floor
        iv = int(v)
        if v < 0 and float(iv) != v: iv -= 1
        return iv, None
    return int(v), None

def _b_abs(args):
    if len(args) != 1: return None, "ABS expects 1 arg"
    v = args[0]
    if v < 0: return -v, None
    return v, None

# math.sin 등은 starlark에 기본 제공 안되므로 Taylor 급수 근사로 충분히 작은 범위에서 구현.
# (학습용 데모 — 정밀도는 5~6자리)
def _approx_sin(x):
    # x 를 [-pi, pi] 로 wrap
    PI = 3.141592653589793
    while x >  PI: x -= 2 * PI
    while x < -PI: x += 2 * PI
    # Taylor: x - x^3/3! + x^5/5! - x^7/7! + x^9/9!
    x2 = x * x
    return x * (1 - x2 / 6.0 * (1 - x2 / 20.0 * (1 - x2 / 42.0 * (1 - x2 / 72.0))))

def _approx_cos(x):
    PI = 3.141592653589793
    return _approx_sin(x + PI / 2)

def _b_sin(args):
    if len(args) != 1: return None, "SIN expects 1 arg"
    return _approx_sin(float(args[0])), None

def _b_cos(args):
    if len(args) != 1: return None, "COS expects 1 arg"
    return _approx_cos(float(args[0])), None

def _b_tan(args):
    if len(args) != 1: return None, "TAN expects 1 arg"
    x = float(args[0])
    c = _approx_cos(x)
    if c == 0: return None, "TAN domain error"
    return _approx_sin(x) / c, None

def _b_sqr(args):
    if len(args) != 1: return None, "SQR expects 1 arg"
    x = float(args[0])
    if x < 0: return None, "SQR negative"
    # 뉴턴법
    if x == 0: return 0.0, None
    g = x
    for _ in range(40):
        g = (g + x / g) / 2.0
    return g, None

# RND: 인자 없으면 0~1 사이 random. 시드 고정으로 재현 가능 (LCG)
_RND_STATE = [12345]
def _b_rnd(args):
    _RND_STATE[0] = (_RND_STATE[0] * 1103515245 + 12345) % 2147483648
    return _RND_STATE[0] / 2147483648.0, None

BUILTINS = {
    "LEN":    _b_len,
    "LEFT$":  _b_left,
    "RIGHT$": _b_right,
    "MID$":   _b_mid,
    "INSTR":  _b_instr,
    "INT":    _b_int,
    "ABS":    _b_abs,
    "SIN":    _b_sin,
    "COS":    _b_cos,
    "TAN":    _b_tan,
    "SQR":    _b_sqr,
    "RND":    _b_rnd,
}


def _parse_call_args(tokens, idx, env):
    """tokens[idx] 가 '(' 인 경우 인자 리스트 파싱. 반환: (args_list, next_idx, err)."""
    if idx >= len(tokens) or tokens[idx]["type"] != T_LPAREN:
        return None, idx, "expected ("
    idx += 1
    args = []
    if idx < len(tokens) and tokens[idx]["type"] == T_RPAREN:
        return args, idx + 1, None
    for _ in range(64):  # 인자 64개 제한
        v, idx, err = parse_expr(tokens, idx, env)
        if err: return None, idx, err
        args.append(v)
        if idx < len(tokens) and tokens[idx]["type"] == T_COMMA:
            idx += 1
            continue
        if idx < len(tokens) and tokens[idx]["type"] == T_RPAREN:
            return args, idx + 1, None
        return None, idx, "expected , or )"
    return None, idx, "too many args"


# ─── 표현식 평가 (재귀 하강) ──────────────────────────────────────────────────
#
# 우선순위 (낮음 → 높음):
#   비교: = <> < > <= >=
#   더하기빼기: + -
#   곱셈나눗셈: * /
#   단항: -
#   원시: NUMBER / STRING / IDENT [ '(' args ')' ] / "(" expr ")"

def parse_primary(tokens, idx, env):
    if idx >= len(tokens):
        return None, idx, "unexpected end"
    tok = tokens[idx]
    if tok["type"] == T_NUMBER:
        return tok["num"], idx + 1, None
    if tok["type"] == T_STRING:
        return tok["value"], idx + 1, None
    if tok["type"] == T_IDENT:
        name = tok["value"]
        # 다음 토큰이 '(' 이면 함수 호출 또는 배열 참조
        if idx + 1 < len(tokens) and tokens[idx + 1]["type"] == T_LPAREN:
            args, next_idx, err = _parse_call_args(tokens, idx + 1, env)
            if err: return None, next_idx, err
            # 빌트인 우선
            if name in BUILTINS:
                v, err = BUILTINS[name](args)
                if err: return None, next_idx, err
                return v, next_idx, None
            # 배열 참조 — env[name] 이 list 이고 인덱스 1개라고 가정 (1차원)
            arr = env.get(name)
            if type(arr) == "list":
                if len(args) != 1: return None, next_idx, "array %s expects 1 index" % name
                i = int(args[0])
                if i < 0 or i >= len(arr):
                    return None, next_idx, "array %s index %d out of bounds" % (name, i)
                return arr[i], next_idx, None
            return None, next_idx, "undefined function or array %s" % name
        return env.get(name, 0), idx + 1, None
    if tok["type"] == T_LPAREN:
        v, idx2, err = parse_expr(tokens, idx + 1, env)
        if err: return None, idx2, err
        if idx2 >= len(tokens) or tokens[idx2]["type"] != T_RPAREN:
            return None, idx2, "expected )"
        return v, idx2 + 1, None
    if tok["type"] == T_OP and tok["value"] == "-":
        v, idx2, err = parse_primary(tokens, idx + 1, env)
        if err: return None, idx2, err
        return -v, idx2, None
    return None, idx, "unexpected token %r" % tok["value"]


def parse_mul(tokens, idx, env):
    left, idx, err = parse_primary(tokens, idx, env)
    if err: return None, idx, err
    while idx < len(tokens) and tokens[idx]["type"] == T_OP and tokens[idx]["value"] in ("*", "/"):
        op = tokens[idx]["value"]
        right, idx, err = parse_primary(tokens, idx + 1, env)
        if err: return None, idx, err
        if op == "*": left = left * right
        else:         left = left // right if (type(left) == "int" and type(right) == "int") else left / right
    return left, idx, None


def parse_add(tokens, idx, env):
    left, idx, err = parse_mul(tokens, idx, env)
    if err: return None, idx, err
    while idx < len(tokens) and tokens[idx]["type"] == T_OP and tokens[idx]["value"] in ("+", "-"):
        op = tokens[idx]["value"]
        right, idx, err = parse_mul(tokens, idx + 1, env)
        if err: return None, idx, err
        if op == "+":
            if type(left) == "string" or type(right) == "string":
                left = str(left) + str(right)
            else:
                left = left + right
        else:
            left = left - right
    return left, idx, None


def parse_cmp(tokens, idx, env):
    left, idx, err = parse_add(tokens, idx, env)
    if err: return None, idx, err
    if idx < len(tokens) and tokens[idx]["type"] == T_OP and tokens[idx]["value"] in ("=", "<>", "<", ">", "<=", ">="):
        op = tokens[idx]["value"]
        right, idx, err = parse_add(tokens, idx + 1, env)
        if err: return None, idx, err
        if op == "=":  return (1 if left == right else 0), idx, None
        if op == "<>": return (1 if left != right else 0), idx, None
        if op == "<":  return (1 if left <  right else 0), idx, None
        if op == ">":  return (1 if left >  right else 0), idx, None
        if op == "<=": return (1 if left <= right else 0), idx, None
        if op == ">=": return (1 if left >= right else 0), idx, None
    return left, idx, None


def parse_expr(tokens, idx, env):
    return parse_cmp(tokens, idx, env)


# ─── 라인 분리 ───────────────────────────────────────────────────────────────

def split_lines(tokens):
    """{line_no: [tokens..]} 형태의 dict + 정렬된 line_no 리스트 반환.
    각 줄은 라인번호로 시작해야 함. 문장 사이 ':'는 다음 단계에 처리."""
    lines = {}
    line_order = []
    i = 0
    n = len(tokens)
    while i < n:
        if tokens[i]["type"] == T_EOL:
            i += 1
            continue
        if tokens[i]["type"] == T_EOF:
            break
        if tokens[i]["type"] != T_NUMBER:
            return None, None, "line must start with line number at token %d" % i
        ln = tokens[i]["num"]
        i += 1
        body = []
        while i < n and tokens[i]["type"] != T_EOL and tokens[i]["type"] != T_EOF:
            body.append(tokens[i])
            i += 1
        lines[ln] = body
        line_order.append(ln)
    line_order = sorted(line_order)
    return lines, line_order, None


# ─── WHILE/WEND 페어 사전 계산 ────────────────────────────────────────────────
#
# WHILE은 조건이 거짓일 때 매칭 WEND 다음 라인으로 점프해야 한다. 매번 스캔하지
# 않도록 line_order 인덱스 기준 페어 dict를 만든다. 중첩도 스택으로 처리.

def build_while_pairs(lines, line_order):
    while_to_wend = {}
    wend_to_while = {}
    stack = []
    for i in range(len(line_order)):
        body = lines[line_order[i]]
        if len(body) == 0:
            continue
        h = body[0]
        if h["type"] == T_KEYWORD and h["value"] == "WHILE":
            stack.append(i)
        elif h["type"] == T_KEYWORD and h["value"] == "WEND":
            if len(stack) == 0:
                return None, None, "WEND without WHILE at line %d" % line_order[i]
            w = stack.pop()
            while_to_wend[w] = i
            wend_to_while[i] = w
    if len(stack) != 0:
        return None, None, "WHILE without WEND at line %d" % line_order[stack[-1]]
    return while_to_wend, wend_to_while, None


# ─── PRINT 실행 (statement 단위, IF의 인라인에서도 재사용) ────────────────────
#
# body 토큰 슬라이스를 받아 PRINT를 처리해 output_lines에 한 줄 append.
# 반환: (소비된 토큰 수, err)

def exec_print(body, start, env, output_lines):
    buf = ""
    i = start
    while i < len(body):
        # IF ... THEN PRINT ... ELSE ... 형태에서는 ELSE가 PRINT를 끝냄
        if body[i]["type"] == T_KEYWORD and body[i]["value"] == "ELSE":
            break
        if body[i]["type"] == T_SEMI:
            i += 1
            continue
        if body[i]["type"] == T_COMMA:
            buf += "\t"
            i += 1
            continue
        v, i, err = parse_expr(body, i, env)
        if err: return i, err
        buf += str(v)
    output_lines.append(buf)
    return i, None


def exec_let(body, start, env, ln):
    """body[start:] 가 [IDENT [( idx )] '=' expr ...] 형태일 때 대입.
    배열 대입 `A(I) = expr` 도 지원. 반환: (next idx, err)."""
    if start + 2 >= len(body):
        return start, "LET form needs IDENT = expr at line %d" % ln
    if body[start]["type"] != T_IDENT:
        return start, "LET form needs IDENT at line %d" % ln
    name = body[start]["value"]
    # 배열 대입?
    if start + 1 < len(body) and body[start + 1]["type"] == T_LPAREN:
        idx_args, i, err = _parse_call_args(body, start + 1, env)
        if err: return i, "LET array index err at line %d: %s" % (ln, err)
        if i >= len(body) or body[i]["type"] != T_OP or body[i]["value"] != "=":
            return i, "LET array expected '=' at line %d" % ln
        v, j, err = parse_expr(body, i + 1, env)
        if err: return j, "LET array rhs err at line %d: %s" % (ln, err)
        arr = env.get(name)
        if type(arr) != "list":
            return j, "array %s not DIMmed at line %d" % (name, ln)
        if len(idx_args) != 1:
            return j, "array %s expects 1 index at line %d" % (name, ln)
        ai = int(idx_args[0])
        if ai < 0 or ai >= len(arr):
            return j, "array %s index %d out of bounds at line %d" % (name, ai, ln)
        arr[ai] = v
        return j, None
    if body[start + 1]["type"] != T_OP or body[start + 1]["value"] != "=":
        return start, "LET expected '=' at line %d" % ln
    v, i, err = parse_expr(body, start + 2, env)
    if err: return i, "LET err at line %d: %s" % (ln, err)
    env[name] = v
    return i, None


# ─── 인터프리터 (라인 단위 실행 + GOTO/IF/FOR/GOSUB/WHILE) ────────────────────

def execute(tokens, max_steps = 10000):
    env = {}
    output_lines = []
    # 2단계 상태:
    for_stack    = []  # 각: {"var": str, "end": num, "step": num, "return_pc": int}
    gosub_stack  = []  # 각: int (RETURN 시 돌아갈 pc)

    lines, line_order, err = split_lines(tokens)
    if err:
        return None, err
    if len(line_order) == 0:
        return "", None

    line_idx = {}
    for i, ln in enumerate(line_order):
        line_idx[ln] = i

    while_to_wend, wend_to_while, err = build_while_pairs(lines, line_order)
    if err:
        return None, err

    # 라인 한 줄을 처리하는 내부 함수.
    # 반환: (next_pc, err). next_pc == None 이면 break(END/STOP).
    def exec_stmt(body, start, ln, pc):
        """body[start:] 의 첫 statement를 실행. IF의 THEN/ELSE 분기에서 재귀 호출.
        반환: (next_pc, err). next_pc == -1 이면 같은 라인 내 다음 statement는 없음(처리됨).
        next_pc == None 이면 종료(END/STOP)."""
        if start >= len(body):
            return pc + 1, None
        head = body[start]

        if head["type"] == T_KEYWORD and head["value"] == "REM":
            return pc + 1, None
        if head["type"] == T_KEYWORD and head["value"] == "END":
            return None, None
        if head["type"] == T_KEYWORD and head["value"] == "STOP":
            return None, None

        # GOTO
        if head["type"] == T_KEYWORD and head["value"] == "GOTO":
            if start + 1 >= len(body) or body[start + 1]["type"] != T_NUMBER:
                return -1, "GOTO needs line number at line %d" % ln
            target = body[start + 1]["num"]
            if target not in line_idx:
                return -1, "Undefined line %d" % target
            return line_idx[target], None

        # GOSUB
        if head["type"] == T_KEYWORD and head["value"] == "GOSUB":
            if start + 1 >= len(body) or body[start + 1]["type"] != T_NUMBER:
                return -1, "GOSUB needs line number at line %d" % ln
            target = body[start + 1]["num"]
            if target not in line_idx:
                return -1, "Undefined line %d" % target
            gosub_stack.append(pc + 1)
            return line_idx[target], None

        # RETURN
        if head["type"] == T_KEYWORD and head["value"] == "RETURN":
            if len(gosub_stack) == 0:
                return -1, "RETURN without GOSUB at line %d" % ln
            return gosub_stack.pop(), None

        # PRINT
        if head["type"] == T_KEYWORD and head["value"] == "PRINT":
            _, err = exec_print(body, start + 1, env, output_lines)
            if err: return -1, "PRINT err at line %d: %s" % (ln, err)
            return pc + 1, None

        # FOR var = start TO end [STEP step]
        if head["type"] == T_KEYWORD and head["value"] == "FOR":
            # 형식: FOR IDENT '=' expr TO expr [STEP expr]
            if start + 4 >= len(body):
                return -1, "FOR malformed at line %d" % ln
            if body[start + 1]["type"] != T_IDENT:
                return -1, "FOR needs IDENT at line %d" % ln
            if body[start + 2]["type"] != T_OP or body[start + 2]["value"] != "=":
                return -1, "FOR expected '=' at line %d" % ln
            var = body[start + 1]["value"]
            start_val, i, err = parse_expr(body, start + 3, env)
            if err: return -1, "FOR start err at line %d: %s" % (ln, err)
            if i >= len(body) or body[i]["type"] != T_KEYWORD or body[i]["value"] != "TO":
                return -1, "FOR expected TO at line %d" % ln
            end_val, i, err = parse_expr(body, i + 1, env)
            if err: return -1, "FOR end err at line %d: %s" % (ln, err)
            step_val = 1
            if i < len(body) and body[i]["type"] == T_KEYWORD and body[i]["value"] == "STEP":
                step_val, i, err = parse_expr(body, i + 1, env)
                if err: return -1, "FOR step err at line %d: %s" % (ln, err)
            env[var] = start_val
            for_stack.append({
                "var": var, "end": end_val, "step": step_val,
                "return_pc": pc + 1,
            })
            # 시작값 자체가 종료 조건을 이미 충족하면 NEXT 다음으로 점프해야 하지만
            # 클래식 GW-BASIC은 1회는 무조건 본문 실행 후 NEXT에서 판정. 그 동작을 따른다.
            return pc + 1, None

        # NEXT [var]
        if head["type"] == T_KEYWORD and head["value"] == "NEXT":
            if len(for_stack) == 0:
                return -1, "NEXT without FOR at line %d" % ln
            frame = for_stack[-1]
            # NEXT 뒤에 변수명이 있으면 일치 검사 (생략 허용)
            if start + 1 < len(body) and body[start + 1]["type"] == T_IDENT:
                if body[start + 1]["value"] != frame["var"]:
                    return -1, "NEXT variable mismatch at line %d" % ln
            env[frame["var"]] = env.get(frame["var"], 0) + frame["step"]
            v = env[frame["var"]]
            done = (frame["step"] >= 0 and v > frame["end"]) or (frame["step"] < 0 and v < frame["end"])
            if done:
                for_stack.pop()
                return pc + 1, None
            return frame["return_pc"], None

        # WHILE expr
        if head["type"] == T_KEYWORD and head["value"] == "WHILE":
            cond, _, err = parse_expr(body, start + 1, env)
            if err: return -1, "WHILE expr err at line %d: %s" % (ln, err)
            if cond:
                return pc + 1, None
            # 거짓이면 매칭 WEND 다음으로 점프
            wend_pc = while_to_wend.get(pc)
            if wend_pc == None:
                return -1, "WHILE without matching WEND at line %d" % ln
            return wend_pc + 1, None

        # WEND → 매칭 WHILE로 점프 (WHILE이 cond 다시 평가)
        if head["type"] == T_KEYWORD and head["value"] == "WEND":
            while_pc = wend_to_while.get(pc)
            if while_pc == None:
                return -1, "WEND without WHILE at line %d" % ln
            return while_pc, None

        # IF expr THEN <action> [ELSE <action>]
        if head["type"] == T_KEYWORD and head["value"] == "IF":
            cond, i, err = parse_expr(body, start + 1, env)
            if err: return -1, "IF cond err at line %d: %s" % (ln, err)
            if i >= len(body) or body[i]["type"] != T_KEYWORD or body[i]["value"] != "THEN":
                return -1, "IF expected THEN at line %d" % ln
            then_start = i + 1
            # ELSE 위치 찾기 (같은 라인 내, 중첩 없다고 가정)
            else_idx = -1
            for j in range(then_start, len(body)):
                if body[j]["type"] == T_KEYWORD and body[j]["value"] == "ELSE":
                    else_idx = j
                    break
            branch_start = then_start if cond else (else_idx + 1 if else_idx >= 0 else -1)
            if branch_start < 0:
                # cond False이고 ELSE 없으면 다음 라인
                return pc + 1, None
            # branch_start 가 NUMBER 면 GOTO 약식
            if branch_start < len(body) and body[branch_start]["type"] == T_NUMBER:
                target = body[branch_start]["num"]
                if target not in line_idx:
                    return -1, "IF GOTO undefined line %d at line %d" % (target, ln)
                return line_idx[target], None
            # 그 외에는 inline statement로 재귀 실행 (THEN ELSE 한쪽만)
            # 단, ELSE를 만나면 멈추도록 branch slice 전달
            sub_end = else_idx if (cond and else_idx >= 0) else len(body)
            sub_body = body[:sub_end] if cond else body
            return exec_stmt(sub_body, branch_start, ln, pc)

        # DIM name(size) [, name2(size) ...] — 1차원 배열만 (0..size 인덱스, GW-BASIC 호환)
        if head["type"] == T_KEYWORD and head["value"] == "DIM":
            i = start + 1
            for _ in range(64):
                if i >= len(body): break
                if body[i]["type"] != T_IDENT:
                    return -1, "DIM expects IDENT at line %d" % ln
                name = body[i]["value"]
                if i + 1 >= len(body) or body[i + 1]["type"] != T_LPAREN:
                    return -1, "DIM expects '(' after %s at line %d" % (name, ln)
                size_args, j, err = _parse_call_args(body, i + 1, env)
                if err: return -1, "DIM size err at line %d: %s" % (ln, err)
                if len(size_args) != 1:
                    return -1, "DIM %s expects 1 dimension at line %d" % (name, ln)
                size = int(size_args[0]) + 1  # GW-BASIC: DIM A(10) → 인덱스 0..10
                # 문자열 배열($)이면 빈 문자열, 아니면 0
                default = "" if name.endswith("$") else 0
                env[name] = [default for _ in range(size)]
                if j < len(body) and body[j]["type"] == T_COMMA:
                    i = j + 1
                    continue
                i = j
                break
            return pc + 1, None

        # LET (명시) 또는 암묵 LET (IDENT = expr)  /  배열 대입 A(I) = expr
        if head["type"] == T_KEYWORD and head["value"] == "LET":
            _, err = exec_let(body, start + 1, env, ln)
            if err: return -1, err
            return pc + 1, None
        if head["type"] == T_IDENT:
            _, err = exec_let(body, start, env, ln)
            if err: return -1, err
            return pc + 1, None

        return -1, "Unknown statement at line %d: %s" % (ln, head["value"])

    pc = 0
    steps = 0
    while pc < len(line_order):
        if steps >= max_steps:
            return None, "too many steps (infinite loop?)"
        steps += 1
        ln = line_order[pc]
        body = lines[ln]
        if len(body) == 0:
            pc += 1
            continue
        next_pc, err = exec_stmt(body, 0, ln, pc)
        if err: return None, err
        if next_pc == None:
            break
        if next_pc < 0:
            return None, "internal: bad next_pc at line %d" % ln
        pc = next_pc

    return "\n".join(output_lines), None


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


def run_demo():
    print("=== GW-BASIC 1·2·3단계 데모 ===")
    for label, src in [("Stage 1", DEMO_STAGE1), ("Stage 2", DEMO_STAGE2), ("Stage 3", DEMO_STAGE3)]:
        print("--- %s ---" % label)
        tokens, err = tokenize(src)
        if err:
            print("LEX ERROR:", err)
            continue
        output, err = execute(tokens)
        if err:
            print("RUN ERROR:", err)
            continue
        print(output)
    print("=== 끝 ===")


run_demo()
