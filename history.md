# 변경 이력

> 이전 이력: [history_20261025_215114.md](history_20261025_215114.md) → [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-25 Todo.md #133-3: Alt+글자 빠른 검색
- 패널 아래 검색 칸: 입력한 글자로 시작하는 파일로 커서 이동(대소문자 무시), `*` `?`가 있으면 어디든. 맞는 파일이 없는 글자는 받지 않음(TC와 같게)
- ↑↓ 이전/다음 일치(끝에서 처음으로), Enter 닫고 열기, Esc · Tab · 포커스 이동 시 닫기. Ctrl+Alt(AltGr)·Alt+Shift는 검색 아님
- 테스트: FilePanel.quicksearch.test.js(QS-01~04, QP-01~06) — 프론트 1272개 통과

## 2026-10-25 Todo.md #133-2: 와일드카드 선택 (Num+ / Num- / Num*)
- `utils/mask.js`: TC 마스크 문법 — `*` `?`, 여러 개는 `;`/공백, `|` 뒤는 제외, `*.*`는 확장자 없는 이름도, 대소문자 무시
- Num+ 선택 창 / Num- 해제 창(`SelectMaskDialog`, 마지막 마스크 기억, "폴더도" 선택), Num* 반전(파일만), Ctrl+Num+ 모두 선택, Ctrl+Num- 모두 해제. 주 키보드 `-`(뒤로)는 그대로
- 테스트: selectMask.test.js(MK·SM·SK·SD 14개) — 프론트 1262개 통과

## 2026-10-25 Todo.md #133-1: Space로 폴더 크기 계산 (Total Commander와 같게)
- Go `DirSize`(dirsize.go): 하위까지 파일 크기 합 · 파일 수 · 폴더 수, 읽을 수 없는 하위 항목은 건너뜀
- 패널: 폴더에서 Space → 선택 + 크기 계산, `<DIR>` 자리에 크기 표시, 선택 합계에 포함. Alt+Shift+Enter → 보이는 모든 폴더
- 계산한 크기는 같은 폴더 새로 고침에선 유지, 다른 폴더로 가면 지움. 상태 표시줄에 "이름: 크기 (파일 N개, 폴더 M개)"
- 테스트: dirsize_test.go 4개, FilePanel.dirsize.test.js(DS-01~07) — Go 전체 · 프론트 1248개 통과

## 2026-10-25 README 전체 갱신 + 아키텍처 다이어그램
- `docs/architecture.svg` 신규: 실행 파일(창 · 브라우저 · 헤드리스) → 프론트엔드(App.jsx, 파일 관리자, 터미널, wailsjs ⇄ web_shim.js) → 백엔드(package main, internal/termapp Host와 연결·전송·web·luahost·설정, 공용 internal) → 디스크 · 외부. 불투명 배경이라 GitHub 다크 모드에서도 읽힘, Edge 헤드리스로 렌더링해 겹침 확인
- README: "아키텍처" 섹션(그림 + 층별 표 + 프론트↔백엔드 통신), 기능 목록 갱신(vim/WASD, 빠른 이동, 뷰어·에디터, 명령 실행 창, 웹 서버, FTPS, F1 도움말), 단축키 표에 뷰어·에디터 추가, 프로젝트 구조를 실제 파일·패키지로, Node 24·CI 단계·버전 관리·헤드리스 직접 빌드 명령, 기술 스택(pty, websocket, Starlark, marked, Vitest)
- 확인: Go 전체 · 프론트 1241개 통과

## 2026-10-25 F1 도움말 전체 갱신
- 파일 관리자 F1(`HelpDialog.jsx`): 실제 키 처리와 대조해 빠진 단축키 추가
  - 탐색: vim(j/k, h/l)·WASD(w/s, a/d) 이동, Shift+글자 빠른 이동, `-` 이전 폴더, Ctrl/Shift+클릭
  - 새 섹션 "보기 · 편집 (F3 / F4)": F3↔F4 전환, Ctrl+F 찾기, Ctrl+S 저장, .star 실행(F5 / Ctrl+Enter), 이미지 ←/→ · 확대/축소 · hjkl 스크롤
  - "터미널" 섹션: 도크 키 + Terminal 보기의 F1 전체 도움말 안내, 사용자 화면에 보이던 "Todo #122" 제거
  - 기타: Ctrl+O 명령 실행 창, 보기 전환 단추(FTP 단추 숨기기)
- 터미널 F1(`helpText.ts`): 새 섹션 "파일 관리자와 함께"(F9 도크·패널 따라가기, 경로 붙여넣기, 원격 파일 ↔ 패널, 웹 서버·헤드리스, FTP 버튼 설정), 한국어·영어 같은 구성
- 버그: 라이선스·서드파티 링크가 `blob/main`(없는 브랜치)을 가리킴 → `blob/master`

### 테스트
- HD-01 섹션 목록 갱신, HD-05(실제 단축키가 도움말에 모두 있음, "Todo #" 노출 없음), HL-01b(링크 브랜치, 새 섹션) — 프론트 1241개·타입 검사 통과
