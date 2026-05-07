# GW-BASIC 인터프리터 - 1단계 (Todo #62)
#
# 범위:
#   - Lexer: NUMBER / STRING / IDENT / KEYWORD / OP / 구두점 / EOL / EOF
#   - Evaluator: 라인번호 + PRINT / LET / REM / GOTO + 산술/비교 표현식
#                (정수만, 단순 좌결합, 우선순위 *, /, +, -, 비교)
#   - 데모 프로그램 내장 → F4 / 'wails build' 후 F5(또는 Ctrl+Enter)로 실행
#
# 미구현(향후 단계):
#   - 부동소수점, 문자열 함수, 배열 DIM
#   - IF/THEN/ELSE, FOR/NEXT, GOSUB/RETURN, WHILE/WEND, DEF FN
#   - DATA/READ, INPUT, 그래픽/사운드, 라인 편집
#   - 16/8진수 리터럴 (&H, &O), E-지수 표기 정규화
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

        # 숫자
        if is_digit(ch):
            start_col = col
            s = ""
            while pos < n and is_digit(src[pos]):
                s += src[pos]
                pos += 1
                col += 1
            tokens.append(make_tok(T_NUMBER, s, line, start_col, num = int(s)))
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

        # 식별자 / 키워드
        if is_alpha(ch):
            start_col = col
            s = ""
            while pos < n and is_alnum(src[pos]):
                s += src[pos]
                pos += 1
                col += 1
            # GW-BASIC은 대소문자 구분 없음 → 대문자 정규화
            up = s.upper()
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


# ─── 표현식 평가 (재귀 하강) ──────────────────────────────────────────────────
#
# 우선순위 (낮음 → 높음):
#   비교: = <> < > <= >=
#   더하기빼기: + -
#   곱셈나눗셈: * /
#   단항: -
#   원시: NUMBER / STRING / IDENT / "(" expr ")"

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


# ─── 인터프리터 (라인 단위 실행 + GOTO) ───────────────────────────────────────

def execute(tokens, max_steps = 10000):
    env = {}
    output_lines = []

    lines, line_order, err = split_lines(tokens)
    if err:
        return None, err
    if len(line_order) == 0:
        return "", None

    # line_no → list index
    line_idx = {}
    for i, ln in enumerate(line_order):
        line_idx[ln] = i

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
        head = body[0]

        if head["type"] == T_KEYWORD and head["value"] == "REM":
            pc += 1
            continue

        if head["type"] == T_KEYWORD and head["value"] == "END":
            break

        if head["type"] == T_KEYWORD and head["value"] == "STOP":
            break

        if head["type"] == T_KEYWORD and head["value"] == "GOTO":
            if len(body) < 2 or body[1]["type"] != T_NUMBER:
                return None, "GOTO needs line number at line %d" % ln
            target = body[1]["num"]
            if target not in line_idx:
                return None, "Undefined line %d" % target
            pc = line_idx[target]
            continue

        if head["type"] == T_KEYWORD and head["value"] == "PRINT":
            buf = ""
            i = 1
            first = True
            while i < len(body):
                if body[i]["type"] == T_SEMI:
                    i += 1
                    first = False
                    continue
                if body[i]["type"] == T_COMMA:
                    buf += "\t"
                    i += 1
                    first = False
                    continue
                v, i, err = parse_expr(body, i, env)
                if err: return None, "PRINT err at line %d: %s" % (ln, err)
                buf += str(v)
                first = False
            output_lines.append(buf)
            pc += 1
            continue

        # LET 또는 암묵 LET (IDENT = expr)
        if head["type"] == T_KEYWORD and head["value"] == "LET":
            body = body[1:]
            head = body[0] if len(body) > 0 else None

        if head and head["type"] == T_IDENT:
            if len(body) < 3 or body[1]["type"] != T_OP or body[1]["value"] != "=":
                return None, "LET form needs IDENT = expr at line %d" % ln
            name = head["value"]
            v, _, err = parse_expr(body, 2, env)
            if err: return None, "LET err at line %d: %s" % (ln, err)
            env[name] = v
            pc += 1
            continue

        return None, "Unknown statement at line %d: %s" % (ln, head["value"])

    return "\n".join(output_lines), None


# ─── 데모 프로그램 ────────────────────────────────────────────────────────────

DEMO = '''10 REM hello world demo
20 PRINT "HELLO, GW-BASIC!"
30 LET A = 7
40 LET B = 6
50 PRINT "A * B ="; A * B
60 LET I = 1
70 PRINT "Counting..."
80 PRINT I
90 LET I = I + 1
100 IF I < 4 THEN 80
110 PRINT "DONE."
120 END
'''

# IF/THEN은 1단계에서 미구현이므로 데모에서는 GOTO만 사용:
DEMO_SIMPLE = '''10 REM gw-basic 1단계 데모
20 PRINT "HELLO, GW-BASIC!"
30 LET A = 7
40 LET B = 6
50 PRINT "A * B ="; A * B
60 PRINT "(A + B) * 2 ="; (A + B) * 2
70 LET I = 1
80 PRINT I
90 LET I = I + 1
100 LET STOP_FLAG = (I = 4)
110 GOTO 130
120 GOTO 80
130 PRINT "loop ended at I="; I
140 END
'''
# (위 DEMO_SIMPLE의 GOTO 130 / GOTO 120은 IF가 없어 실제 루프 미동작
#  — 1단계 검증은 직선 흐름과 대입/연산만 수행)


def run_demo():
    print("=== GW-BASIC 1단계 데모 ===")
    src = '''10 REM hello demo
20 PRINT "HELLO, GW-BASIC!"
30 LET A = 7
40 LET B = 6
50 PRINT "A * B ="; A * B
60 PRINT "(A + B) * 2 ="; (A + B) * 2
70 PRINT "EQ:"; (A * B) = 42
80 PRINT "NEQ:"; (A * B) <> 42
'''
    tokens, err = tokenize(src)
    if err:
        print("LEX ERROR:", err)
        return
    print("(토큰 %d개)" % len(tokens))
    output, err = execute(tokens)
    if err:
        print("RUN ERROR:", err)
        return
    print(output)
    print("=== 끝 ===")


run_demo()
