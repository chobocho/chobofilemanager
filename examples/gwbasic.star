# GW-BASIC 인터프리터 - 1·2단계 (Todo #62 → Todo.md #66)
#
# 1단계 범위:
#   - Lexer: NUMBER / STRING / IDENT / KEYWORD / OP / 구두점 / EOL / EOF
#   - Evaluator: 라인번호 + PRINT / LET / REM / GOTO + 산술/비교 표현식
#
# 2단계 추가:
#   - IF/THEN/ELSE        — `IF expr THEN <line>` 또는 `... THEN <stmt> [ELSE <stmt>]`
#   - FOR/NEXT            — STEP 양수/음수 모두, NEXT의 변수명은 선택적
#   - GOSUB/RETURN        — 단순 라인 점프 + 콜 스택
#   - WHILE/WEND          — 매칭 페어는 split_lines 후 사전 계산
#
# 미구현(향후 단계):
#   - 부동소수점, 문자열 함수, 배열 DIM
#   - DEF FN, DATA/READ, INPUT, 그래픽/사운드
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
    "FOR": True, "TO": True, "STEP": True, "NEXT": True,
    "GOSUB": True, "RETURN": True,
    "WHILE": True, "WEND": True,
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
    """body[start:] 가 [IDENT '=' expr ...] 형태일 때 대입. 반환: (next idx, err).
    표현식은 ELSE 또는 body 끝까지 (parse_expr가 자연스럽게 멈춤)."""
    if start + 2 >= len(body):
        return start, "LET form needs IDENT = expr at line %d" % ln
    if body[start]["type"] != T_IDENT:
        return start, "LET form needs IDENT at line %d" % ln
    if body[start + 1]["type"] != T_OP or body[start + 1]["value"] != "=":
        return start, "LET expected '=' at line %d" % ln
    name = body[start]["value"]
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

        # LET (명시) 또는 암묵 LET (IDENT = expr)
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


def run_demo():
    print("=== GW-BASIC 1·2단계 데모 ===")
    for label, src in [("Stage 1", DEMO_STAGE1), ("Stage 2", DEMO_STAGE2)]:
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
