package main

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// GW-BASIC 인터프리터(examples/gwbasic.star) 의미론 회귀 테스트.
// 인터프리터 소스에서 마지막 run_demo() 호출을 제거하고, run_program(...) 결과를
// 마커로 감싸 출력하는 한 줄을 덧붙여 RunStarlarkFile 로 실행한다.

func gwbasicSource(t *testing.T) string {
	t.Helper()
	path, err := filepath.Abs(filepath.Join("..", "examples", "gwbasic.star"))
	if err != nil {
		t.Fatalf("abs path: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Skipf("examples/gwbasic.star 없음: %v", err)
	}
	src := strings.ReplaceAll(string(data), "\r\n", "\n")
	idx := strings.LastIndex(src, "\nrun_demo()")
	if idx < 0 {
		t.Fatalf("run_demo() 호출을 찾을 수 없음")
	}
	return src[:idx+1]
}

func runGWBasic(t *testing.T, base string, prog string, inputs []string) string {
	t.Helper()
	var sb strings.Builder
	sb.WriteString(base)
	sb.WriteString("\nprint(\"<<<\" + run_program(")
	sb.WriteString(strconv.Quote(prog))
	sb.WriteString(", [")
	for i, in := range inputs {
		if i > 0 {
			sb.WriteString(", ")
		}
		sb.WriteString(strconv.Quote(in))
	}
	sb.WriteString("]) + \">>>\")\n")

	script := filepath.Join(t.TempDir(), "gw.star")
	if err := os.WriteFile(script, []byte(sb.String()), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}
	out, err := newTestFM().RunStarlarkFile(script)
	if err != nil {
		t.Fatalf("RunStarlarkFile error: %v", err)
	}
	s := strings.Index(out, "<<<")
	e := strings.LastIndex(out, ">>>")
	if s < 0 || e < s {
		t.Fatalf("마커 없음 (Starlark 호스트 오류?): %s", out)
	}
	return out[s+3 : e]
}

func TestGWBasicSemantics(t *testing.T) {
	base := gwbasicSource(t)
	sp := strings.Repeat
	cases := []struct {
		name   string
		prog   string
		inputs []string
		want   string
	}{
		// 1. ':' 다중 문장
		{"colon", "10 A=1: B=2: PRINT A+B", nil, " 3 "},
		{"if-then-colon-true", "10 A=5: IF A=5 THEN PRINT \"X\": PRINT \"Y\"\n20 PRINT \"Z\"", nil, "X\nY\nZ"},
		{"if-then-colon-false", "10 IF 0 THEN PRINT \"X\": PRINT \"Y\"\n20 PRINT \"Z\"", nil, "Z"},
		{"if-else-colon", "10 IF 1 THEN PRINT \"A\": PRINT \"B\" ELSE PRINT \"C\"\n20 IF 0 THEN PRINT \"A\" ELSE PRINT \"C\": PRINT \"D\"", nil, "A\nB\nC\nD"},
		{"if-else-goto", "10 IF 0 THEN 30 ELSE 40\n30 PRINT \"T\": END\n40 PRINT \"E\"", nil, "E"},
		{"gosub-colon", "10 GOSUB 100: PRINT \"B\": END\n100 PRINT \"A\": RETURN", nil, "A\nB"},
		{"while-colon", "10 I=0: WHILE I<3: I=I+1: PRINT I;: WEND: PRINT \"D\"", nil, " 1  2  3 D"},

		// 2. 연산자 / 우선순위
		{"pow", "10 PRINT 2^3; -2^2; 2^-1; 2^3^2", nil, " 8 -4  .5  64 "},
		{"mod-intdiv", "10 PRINT 7 MOD 3; -7 MOD 3; 7\\2; -7\\2", nil, " 1 -1  3 -3 "},
		{"logic", "10 PRINT 5 AND 3; 5 OR 3; NOT 0; 1=1 AND 2=2; 1=1 OR 0; 5 XOR 1", nil, " 1  7 -1 -1 -1  4 "},
		{"precedence", "10 PRINT 2+3*4; (2+3)*4; 10-4-3; 2*3^2; 1+10 MOD 3; 10\\3*2", nil, " 14  20  3  18  2  1 "},
		{"not-vs-rel", "10 PRINT NOT 1=2; 1<2<3", nil, "-1 -1 "},
		// 3. 나눗셈
		{"div", "10 PRINT 7/2; 10/4*2; 1/3", nil, " 3.5  5  .3333333 "},
		// 4. 비교 결과 -1/0
		{"relational", "10 PRINT 1=1; 1=2; 2>1; \"A\"<\"B\"; 3<>3", nil, "-1  0 -1 -1  0 "},
		// 5. FOR 시작값이 이미 끝을 넘음
		{"for-skip", "10 FOR I=5 TO 1: PRINT I: NEXT I\n20 PRINT \"END\"", nil, "END"},
		{"for-skip-nested", "10 FOR I=1 TO 0\n20 PRINT \"IN\"\n30 FOR J=1 TO 2\n40 NEXT J\n50 NEXT I\n60 PRINT \"OUT\"", nil, "OUT"},
		{"for-neg-step", "10 FOR I=3 TO 1 STEP -1: PRINT I;: NEXT", nil, " 3  2  1 "},
		{"for-skip-neg-step", "10 FOR I=1 TO 3 STEP -1: PRINT I: NEXT: PRINT \"N\"", nil, "N"},
		// 6. READ/INPUT 배열 원소
		{"read-array", "10 DIM A(3)\n20 FOR I=1 TO 3: READ A(I): NEXT\n30 PRINT A(1);A(2);A(3)\n40 DATA 4,5,6", nil, " 4  5  6 "},
		{"input-array", "10 INPUT A(2)\n20 PRINT A(2); A", []string{"7"}, "? 7\n 7  0 "},
		// 7. PRINT 서식
		{"print-semi", "10 PRINT \"A\";\n20 PRINT \"B\"", nil, "AB"},
		{"print-zone", "10 PRINT 1,2", nil, " 1 " + sp(" ", 11) + " 2 "},
		{"print-trailing-comma", "10 PRINT \"X\",\n20 PRINT \"Y\"", nil, "X" + sp(" ", 13) + "Y"},
		{"print-float", "10 PRINT .1+.2; 5.0; -1.5; 1E10; 1/300; 100000*1000", nil, " .3  5 -1.5  1E+10  3.333333E-03  1E+08 "},
		{"print-neg", "10 PRINT -5; 0", nil, "-5  0 "},
		{"print-tab-spc", "10 PRINT \"A\"; TAB(5); \"B\"; SPC(2); \"C\"", nil, "A   B  C"},
		// 8. 런타임 오류 시 부분 출력 보존
		{"err-keeps-output", "10 PRINT \"BEFORE\"\n20 PRINT 1/0\n30 PRINT \"AFTER\"", nil, "BEFORE\nDivision by zero in 20"},
		{"err-partial-line", "10 PRINT \"A\";\n20 X=1/0", nil, "A\nDivision by zero in 20"},
		{"step-limit", "10 PRINT \"X\"\n20 GOTO 20", nil, "X\nStep limit exceeded (infinite loop?) in 20"},
		// 9. 0 나누기 / 타입 불일치 / INPUT 비숫자
		{"tm-mul", "10 PRINT \"A\"*2", nil, "Type mismatch in 10"},
		{"tm-add", "10 PRINT \"A\"+1", nil, "Type mismatch in 10"},
		{"tm-cmp", "10 PRINT \"A\"<1", nil, "Type mismatch in 10"},
		{"tm-assign-str", "10 A$=5", nil, "Type mismatch in 10"},
		{"tm-assign-num", "10 A=\"X\"", nil, "Type mismatch in 10"},
		{"tm-len", "10 PRINT LEN(5)", nil, "Type mismatch in 10"},
		{"input-redo", "10 INPUT A\n20 PRINT A", []string{"abc", "5"}, "? abc\n?Redo from start\n? 5\n 5 "},
		{"input-exhausted", "10 INPUT A", []string{"abc"}, "? abc\n?Redo from start\nInput past end in 10"},
		{"input-prompt", "10 INPUT \"N\"; N\n20 INPUT \"S\", S$\n30 PRINT N; S$", []string{"3", "hi"}, "N? 3\nShi\n 3 hi"},
		// 19. MOD / \ 0 나누기
		{"mod-zero", "10 PRINT 5 MOD 0", nil, "Division by zero in 10"},
		{"intdiv-zero", "10 PRINT 5\\0", nil, "Division by zero in 10"},
		// 10. FOR/NEXT 스택
		{"next-multi", "10 FOR I=1 TO 2: FOR J=1 TO 2: PRINT I;J: NEXT J,I", nil, " 1  1 \n 1  2 \n 2  1 \n 2  2 "},
		{"next-novar", "10 FOR I=1 TO 2: FOR J=1 TO 2: NEXT: NEXT: PRINT I;J", nil, " 3  3 "},
		{"for-replace", "10 FOR I=1 TO 2\n20 FOR I=1 TO 3\n30 NEXT I\n40 PRINT I\n50 NEXT I", nil, " 4 \nNEXT without FOR in 50"},
		{"next-unwind", "10 FOR I=1 TO 2: FOR J=1 TO 5\n20 IF J=2 THEN NEXT I\n30 PRINT I;J: NEXT J", nil, " 1  1 \n 2  1 \n 3  2 \nNEXT without FOR in 30"},
		// 11. REM / ' 뒤 텍스트 무시
		{"rem", "10 REM cost $5 & \"quote\n20 PRINT \"OK\" ' tail & $\n30 REMARK x", nil, "OK"},
		// 12. 미정의 문자열 변수
		{"undef-str", "10 PRINT LEN(B$); B$; \"|\"", nil, " 0 |"},
		// 13. 배열 자동 DIM / 별도 네임스페이스
		{"array-autodim", "10 A(3)=7: PRINT A(3); A(10)", nil, " 7  0 "},
		{"array-bounds", "10 PRINT A(11)", nil, "Subscript out of range in 10"},
		{"array-namespace", "10 DIM A(3): A=5: A(1)=2: PRINT A; A(1)", nil, " 5  2 "},
		{"array-2d", "10 DIM B(2,3): B(2,3)=9: PRINT B(2,3); B(1,1)", nil, " 9  0 "},
		{"array-dup-dim", "10 DIM A(3)\n20 DIM A(4)", nil, "Duplicate Definition in 20"},
		// 14. SIN/COS
		{"sin-cos", "10 PRINT SIN(3); COS(0); SIN(0); INT(COS(3.14159)*1000)", nil, " .14112  1  0 -1000 "},
		{"sin-huge", "10 X=SIN(1E30): PRINT \"OK\"", nil, "OK"},
		// 15. RND (괄호 없음)
		{"rnd-bare", "10 X=RND: Y=RND(1): IF X>=0 AND X<1 AND Y>=0 AND Y<1 THEN PRINT \"OK\"", nil, "OK"},
		// 16. ON GOTO/GOSUB, IF GOTO, 단항 +, =< => ><, 빌트인
		{"on-goto", "10 ON 2 GOTO 100,200,300\n100 PRINT \"A\": END\n200 PRINT \"B\": END\n300 PRINT \"C\"", nil, "B"},
		{"on-gosub", "10 FOR K=1 TO 3: ON K GOSUB 100,200,300: NEXT: END\n100 PRINT \"A\": RETURN\n200 PRINT \"B\": RETURN\n300 PRINT \"C\": RETURN", nil, "A\nB\nC"},
		{"on-fallthrough", "10 ON 5 GOTO 100\n20 PRINT \"F\"\n100 PRINT \"T\"", nil, "F\nT"},
		{"if-goto", "10 IF 1 GOTO 30\n20 PRINT \"NO\"\n30 PRINT \"YES\"", nil, "YES"},
		{"alt-ops", "10 PRINT +5; 3=<3; 3=>4; 1><2", nil, " 5 -1  0 -1 "},
		{"str-funcs", "10 PRINT CHR$(65); STR$(5); STR$(-5); VAL(\" 12.5abc\"); ASC(\"A\")", nil, "A 5-5 12.5  65 "},
		{"num-funcs", "10 PRINT CINT(2.5); CINT(-2.5); CINT(2.4); FIX(-3.7); INT(-3.7); SGN(-2); SGN(0); SGN(9)", nil, " 3 -3  2 -3 -4 -1  0  1 "},
		{"exp-log-sqr", "10 PRINT EXP(0); EXP(1); LOG(1); LOG(EXP(2)); SQR(16); SQR(2)", nil, " 1  2.718282  0  2  4  1.414214 "},
		{"log-zero", "10 PRINT LOG(0)", nil, "Illegal function call in 10"},
		// 17. DATA 파싱 / RESTORE n
		{"data-parse", "10 READ A$, B$, C, D, E$, F\n20 PRINT \"[\";A$;\"][\";B$;\"]\";C;D;\"[\";E$;\"]\";F\n30 DATA  Hello World , PRINT ,,+5, \"q,x\", -5", nil, "[Hello World][PRINT] 0  5 [q,x]-5 "},
		{"restore-n", "10 DATA 1,2\n20 DATA 3,4\n30 RESTORE 15: READ A: PRINT A\n40 RESTORE 20: READ B: PRINT B\n50 RESTORE: READ C: PRINT C", nil, " 3 \n 3 \n 1 "},
		{"data-colon", "10 DATA 1,2: PRINT \"X\"\n20 READ A,B: PRINT A+B", nil, "X\n 3 "},
		{"out-of-data", "10 READ A", nil, "Out of DATA in 10"},
		{"data-bad-num", "10 READ A\n20 DATA abc", nil, "Syntax error in 20"},
		// 18. 중복 라인 번호
		{"dup-line", "10 PRINT \"OLD\"\n10 PRINT \"NEW\"", nil, "NEW"},
		// 기타
		{"deffn-multi", "10 DEF FNA(X,Y)=X*Y+1: PRINT FNA(2,3); X", nil, " 7  0 "},
		{"fn-undefined", "10 PRINT FNZ(1)", nil, "Undefined user function in 10"},
		{"concat", "10 A$=\"AB\"+\"CD\": PRINT A$; LEN(A$)", nil, "ABCD 4 "},
		{"undef-line", "10 GOTO 99", nil, "Undefined line number in 10"},
		{"syntax-junk", "10 X=1 Y", nil, "Syntax error in 10"},
		{"int-var", "10 A%=2.6: PRINT A%", nil, " 3 "},
		{"primes-mod", "10 FOR N=2 TO 10: P=1: FOR D=2 TO N-1: IF N MOD D=0 THEN P=0\n20 NEXT D: IF P THEN PRINT N;\n30 NEXT N", nil, " 2  3  5  7 "},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := runGWBasic(t, base, tc.prog, tc.inputs)
			if got != tc.want {
				t.Errorf("program:\n%s\n got: %q\nwant: %q", tc.prog, got, tc.want)
			}
		})
	}
}

// 어떤 프로그램도 Starlark 호스트 오류(마커 누락)를 일으키지 않고 BASIC 오류로 끝나야 한다.
func TestGWBasicNoHostCrash(t *testing.T) {
	base := gwbasicSource(t)
	progs := map[string]string{
		"lex-overflow":   "10 PRINT 1E39",
		"pow-overflow":   "10 PRINT 2^200",
		"mul-overflow":   "10 X=1E38*1E38",
		"sqr-neg":        "10 PRINT SQR(-1)",
		"left-neg":       "10 PRINT LEFT$(\"A\",-1)",
		"chr-range":      "10 PRINT CHR$(300)",
		"mid-zero":       "10 PRINT MID$(\"ABC\",0)",
		"val-huge":       "10 PRINT VAL(\"1E999\")",
		"intdiv-big":     "10 PRINT 1E30\\1",
		"gosub-deep":     "10 GOSUB 10",
		"fn-recursive":   "10 DEF FNA(X)=FNA(X)\n20 PRINT FNA(1)",
		"return-bare":    "10 RETURN",
		"next-bare":      "10 NEXT",
		"wend-bare":      "10 WEND",
		"while-no-wend":  "10 WHILE 0",
		"for-no-next":    "10 FOR I=2 TO 1",
		"input-no-queue": "10 INPUT A",
		"paren-open":     "10 PRINT (1",
		"for-empty":      "10 FOR",
		"if-empty":       "10 IF",
		"on-empty":       "10 ON",
		"dim-neg":        "10 DIM A(-1)",
		"neg-pow-frac":   "10 PRINT (-8)^(1/3)",
		"zero-pow-neg":   "10 PRINT 0^-1",
		"tan-pole":       "10 PRINT TAN(3.14159265/2)",
		"exp-big":        "10 PRINT EXP(100)",
		"str-too-long":   "10 A$=\"X\": FOR I=1 TO 9: A$=A$+A$: NEXT",
		"no-line-number": "PRINT 1",
		"bad-char":       "10 PRINT 1 @ 2",
		"goto-float":     "10 GOTO 1.5",
		"array-str-num":  "10 A$(1)=5",
		"empty":          "",
	}
	for name, prog := range progs {
		prog := prog
		t.Run(name, func(t *testing.T) {
			got := runGWBasic(t, base, prog, nil)
			t.Logf("%q -> %q", prog, got)
		})
	}
}
