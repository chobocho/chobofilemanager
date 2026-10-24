# 변경 이력

> 이전 이력: [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-25 (Todo.md #121 — T5 4차: 터미널 설정 창 · 단어 강조)

### 변경
- `core/prefs.ts` 신규: 설정 ↔ 입력값, 숫자 범위 검사(글꼴 8~40, 스크롤백 1000~100000, 연결 유지 0~3600), 테마 미리보기(프롬프트·ls·오류/경고/완료, 16색)
- `PrefsDialog.jsx` 신규 (Ctrl+Shift+O, 탭 막대 ⚙): 글꼴·EUC-KR 글꼴, 붙여넣기 확인, 색 테마 미리보기, 커서·깜박임, 스크롤백,
  연결 유지·자동 재접속, 단어 강조(빨강/노랑/초록), 세션 로그 옵션·폴더 찾아보기. 확인 = 저장 + 열린 탭에 바로 적용, 잘못된 값은 그 칸으로 포커스
- 단어 강조 연결: 실제 xterm 칸에 `attachHighlight`, 출력을 그린 뒤 다시 계산, 설정 확인 시 규칙 재생성
- 반투명·웹 서버·업데이트·고양이·언어 항목은 #124로 미룸 (Todo.md에 기록)

### 테스트
- `prefs.test.ts`(PF-01~06), `PrefsDialog.test.jsx`(PD-01~09), TA-09/10 — 프론트 960개 통과

## 2026-10-25 (Todo.md #121 — T5 3차: 세션 저장 · 세션 관리자)

### 변경
- `core/sessions.ts` 신규: 세션 찾기(낱말 모두 일치), 그룹별 목록 줄, 연결 설명, 가져오기 결과 문구, 입력값 → 저장 형식
- `SaveSessionDialog.jsx` 신규: 접속 창 `☆ 저장`(Alt+S)·탭 메뉴 "세션으로 저장" — 이름/그룹/비밀번호 저장, 고른 세션이면 그 세션을 고침
- `SessionManager.jsx` 신규 (Ctrl+Shift+H, 탭 막대 ☆ 버튼): 찾기, 그룹별 목록, 고치면 자동 저장(0.6초/다른 세션 선택/닫기),
  Host 비면 저장 안 하고 그 세션에 머묾, 추가·복제·삭제(확인), 접속(더블클릭/Enter), 그룹 전체 열기, PuTTY·파일 가져오기, 파일로 내보내기
- `termStore`: openSaveSession(Promise), saveTabSession(같은 세션 탭 이름 갱신), openSessions(첫 세션은 지금 칸, 나머지 새 탭), 탭에 연결한 세션(`saved`) 기억

### 테스트
- `sessions.test.ts`(SS-01~08), `SessionManager.test.jsx`(SM-01~11, SV-10~13), TA-20/21 세션 저장 항목 — 프론트 943개, Go 통과

## 2026-10-25 (Todo.md #121 — T5 2차: 탭 우클릭 메뉴)

### 변경
- `core/tabActions.ts` 신규: 인코딩 적용(EUC-KR은 넓은 폭·EUC-KR 글꼴), 인코딩 전환(로컬 셸은 UTF-8 고정), 서버별 색 테마 저장/불러오기, 시리얼 Break, 연결 끊기(예약된 자동 재접속 취소)
- `core/tabMenu.ts` 신규: 탭 상태별 메뉴 항목(다시 연결·복제·분할·색 테마·인코딩·Break·끊기·닫기/분할 창 닫기)
- `TabMenu.jsx` 신규: 탭 칩 우클릭 메뉴, 색 테마 하위 메뉴(미리보기 견본), Esc/바깥 클릭으로 닫기
- `termStore`: reconnect/duplicate(새 탭에서 같은 서버 자동 접속)/disconnect/toggleEncoding/chooseTheme/sendBreak, 연결 후 인코딩·서버 테마 적용
- `TermSession`: `theme`, `reconnector`, `markIdle()` 추가

### 테스트
- `tabActions.test.ts`(TA-01~08, 20~22, 30), `TabMenu.test.jsx`(TB-01~07) 추가 — 프론트 920개, Go 전체 통과

## 2026-10-25 (Todo.md #121 — T5 1차: 터미널 화면 분할)

### 변경
- `core/layout.ts` 신규: 분할 트리(choboTerm split.ts 이식) — 분할/제거/칸 좌표/경계선/비율(10~90%)/Alt+방향키 이웃 칸/분할 단축키(물리 키, ₩ 포함)
- `termStore`: 그룹(탭 막대 한 칸) 도입 — `splitPane`, 임시 칸(연결 전 Esc/취소면 칸째 닫힘), 분할 칸 닫으면 같은 그룹 칸 활성,
  `focusDir`, `setRatio`, 그룹 순서 → 칸 순서 순환
- `TerminalWorkspace`: 모든 칸을 한 부모 아래 평평하게 마운트하고 계산한 위치(%)에 배치 — 분할해도 기존 xterm을 다시 만들지 않음(화면 유지),
  경계선 끌기/더블클릭 반반, Ctrl+Shift+\ 옆으로·Ctrl+Shift+- 아래로, Alt+방향키 칸 이동(분할된 탭에서만, 아니면 셸로)
- 테스트 경쟁 조건 수정: AP-19가 지연 로딩 뷰어를 한 번의 flush만 기다리던 문제 → waitFor (마지막 커밋에서도 실패 재현 후 수정)

### 테스트
- layout 6건, 분할 스토어 8건, 분할 화면 5건(기존 터미널 재생성 없음 확인 포함) — 프론트 901건 통과

## 2026-10-25 (Todo.md #120 — T4 완료: 로그인 질문, 닫기 확인, 재접속, 붙여넣기 확인, 검색)

### 변경
- `core/reconnect.ts`: choboTerm 자동 재접속 이식 — 끊김(lost) 시 3/5/10/20/30초 간격 최대 10회, 화면 유지 재연결,
  대기 중 Enter 즉시 연결·Esc 취소, 정상 종료면 "Enter: 다시 접속" 안내, 탭 닫으면 예약 취소
- `AuthPrompt.jsx`: auth:prompt/auth:promptDone (키 암호·OTP·keyboard-interactive), 차례 대기, Enter 다음 칸/응답, Esc 취소, 버튼 이름 지정
- `TerminalModals.jsx`: app:close → "모두 끊고 종료" 확인(Quit), 여러 줄 붙여넣기 확인(미리보기, 다시 묻지 않기 → 설정 저장)
  — 모두 document.body에 그려 터미널 보기가 숨겨져 있어도 표시
- `SearchBar.jsx` + 세션 `find/clearSearch`: Ctrl+Shift+S, Enter/Shift+Enter, 대소문자·정규식, 없음 표시
- 연결 대화상자: 다시 접속할 때 이 탭의 마지막 연결 정보로 채움
- Go 이벤트 계약: auth:prompt, auth:promptDone, app:close를 보류 목록에서 제거 (계약 테스트가 먼저 제거를 요구함 확인)

### 테스트
- reconnect 6건, TerminalPrompts 9건, 실제 xterm SearchAddon 검색 1건 — 프론트 882건, typecheck, Go 전체 통과
- `wails dev` + 헤드리스 Edge 종단 점검 재통과 (실제 cmd 연결·명령 실행)

## 2026-10-25 (Todo.md #120 — T4 1차: Terminal 보기, 탭, 연결 대화상자)

### 변경
- 상단 보기 전환에 **Terminal** 추가: 처음 열 때 지연 로딩(별도 382KB 조각, 초기 번들 변화 없음), 다른 보기로 가도 세션 유지(숨김)
- `terminal/core/connect.ts`: choboTerm 연결 규칙 이식 — 로컬 셸(cmd/powershell/pwsh/wsl)·시리얼(COMn, /dev/…) 판별,
  포트별 프로토콜 표시, 호스트 목록(저장 세션 → 히스토리 → ssh_config → 로컬 셸 → 시리얼, 중복 제거)·필터, 요청 생성, 탭 이름/설명
- `terminal/core/look.ts`: 설정 → xterm 옵션(글꼴·테마·커서·스크롤백), 작업 공간 단축키 판별
- `terminal/store/termStore.js`: 탭 목록·활성 탭·활동 표시·대화상자·연결(중복 방지, 실패 시 오류 유지)
- `TerminalWorkspace`/`TerminalPane`/`ConnectDialog` (React) + 테마 변수 기반 CSS
  - 탭: Ctrl+Shift+T 새 탭, Ctrl+Shift+W 닫기, Ctrl+Tab/Ctrl+PageUp·Down 순환, 비활성 탭 출력 시 활동 표시, 연결 안 된 탭에서 Enter → 대화상자
- 세션 코어: 출력/미연결 입력 알림 추가, jsdom에 matchMedia 대체 → **실제 xterm**을 화면에 붙이는 테스트 가능

### 테스트
- connect 11건, termStore 10건, TerminalWorkspace 10건, 실제 xterm 애드온 로드 1건, App Terminal 보기 3건 — 프론트 866건 통과, typecheck, build
- **실제 Go 백엔드 종단 점검** `bench/e2e-terminal.mjs` (`wails dev` 실행 중 `npm run e2e:terminal`): 브라우저용 dev 서버(실제 바인딩)를 헤드리스 Edge로 열어
  Terminal 보기 → cmd(ConPTY) 연결 → `echo` 실행 결과 수신 → 탭 이름 → 탭 닫기까지 통과
- 남은 #120 항목: 인증 프롬프트, 창 닫기 확인(app:close), 자동 재접속, 여러 줄 붙여넣기 확인, 검색

## 2026-10-25 (Todo.md #119 — T3: 터미널 프론트 기반)

### 변경
- 의존성: `@xterm/xterm` 6.0.0 + fit/search/unicode11/web-links/webgl 애드온(choboTerm과 같은 버전), 개발 의존성 `typescript`
- `src/terminal/core/` (TypeScript, React 무관):
  - choboTerm에서 그대로 이식: `cjkwidth.ts`(모호 폭 문자 2칸), `themes.ts`, `highlight.ts`
  - `termApi.ts`: `window.go.termapp.App` 바인딩·이벤트·클립보드 래퍼 (테스트용 교체 가능)
  - `settings.ts`: Go 설정 읽기/300ms 지연 저장 (생성 모델 타입 대신 구조 타입)
  - `session.ts`: `TermSession` — 입력 큐(순서 보장), term:data base64 디코드, term:open 화면 1회 초기화, 로컬=UTF-8/FTP 상태,
    연결 중 탭 닫힘 처리, OSC 52(클립보드)/OSC 7(현재 폴더), 제목, 크기 변경, 이벤트 라우터(탭 id별 분배)
- 키보드 소유권: `utils/keyboard.js` `isTerminalTarget` — 포커스가 터미널 안이면 Toolbar·App 전역 단축키(F키, Tab, Delete, Ctrl+문자, F9, Ctrl+O/M) 양보
- `tsconfig.json` + `npm run typecheck`(strict), 지연 로딩 테스트에 `@xterm/*`·`src/terminal/` 추가
- Go `TestEventsMatchThePage`: 이식된 페이지(`onTermEvent`)도 인식, 아직 이식 전 이벤트 15개를 Todo 번호와 함께 `pendingPageEvents`로 관리
  (처리되면 목록에서 빼야 통과 — 줄어들기만 가능)

### 테스트
- `session.test.ts` 18건(가짜 xterm), `pure.test.ts` 9건(실제 xterm으로 CJK 폭 검증 포함), 키보드 소유권 5건(구현 제거 시 실패 확인)
- 프론트 831건 통과, `vite build`, typecheck, Go 전체 통과

## 2026-10-25 (Todo.md #118 — T2: 터미널 바인딩 + 창 생명주기 + 설정 경로)

### 변경
- `internal/termapp/host.go` 신규 `Host`(바인딩되지 않는 별도 타입 — App의 공개 메서드는 모두 바인딩되므로 분리):
  `RunSubprocess`(--lua-host면 Lua 호스트 실행 후 종료), `UseConfigDir`, `LegacyConfigDir`, `MigrateConfig`(최초 1회 기존 choboTerm 설정 복사),
  `NewHost`/`Bindings`/`Startup`/`BeforeClose`(연결된 탭이 있으면 app:close로 확인 요청, 창 위치는 저장 안 함)/`Shutdown`(세션 정리)
- `main.go`: `--lua-host` 분기 → 터미널 설정 폴더 `~/.chobocho-commander/term` 지정·이전 → `newAppOptions`(파일 관리자 App + 터미널 App 바인딩,
  OnStartup/OnBeforeClose/OnShutdown, 파일 드롭, WindowClassName)
- `internal/version.Version` = 앱 버전(0.2.12), `osutil.WindowClass` = `ChobochoCommanderWindow`
- `wails generate module`로 `wailsjs/go/termapp` 생성 → 보류였던 생성 바인딩 비교 테스트 활성화(80개 메서드 일치)

### 검증
- termapp `host_test.go` 8건, `main_options_test.go` 5건 추가, wire.golden 변화 없음, 전체 Go 테스트 통과
- `wails build` 성공(17MB), 빌드된 exe를 `--lua-host`로 실행하면 창 없이 즉시 종료 확인
- 웹/헤드리스 CLI 옵션(--web, --headless)은 #124에서 연결

## 2026-10-25 (Todo.md #117 — T1: choboTerm Go 패키지 이식)

### 변경
- `C:\github3\choboterm\internal\*` 20개 패키지를 `src/internal/`로 이식, `internal/app` → `internal/termapp`(패키지명 termapp),
  import 경로 `choboterm/...` → `totalcmd/...` (98개 파일)
- choboTerm의 Go `frontend` 패키지(`assets.go`, `assets_termux.go`, `i18n_dict.go`, `doc.go`)를 `src/frontend/`에 추가,
  영어 사전은 `src/frontend/src/terminal/i18n_en.json`
- go 1.25 → 1.26, 의존성 병합: jlaffaye/ftp 0.2.0 → 0.2.4, x/text 0.22 → 0.42, x/crypto 0.57, x/sys 0.48,
  신규 creack/pty, pkg/sftp, kevinburke/ssh_config, gopher-lua, go-keyring
- `wire_test.go`: 고정 대상을 `internal/`로 한정, 표준 라이브러리 판별의 모듈명 수정 → choboTerm 원본 `wire.golden`과 바이트 단위로 동일
- 프론트 의존 테스트 2건은 보류 처리(사유 명시): 생성 바인딩 비교(#118), 이벤트 ↔ 페이지 일치(#120)

### 검증
- choboTerm 원본: 통과 204 / 환경 의존 skip 13 → 이식본: 통과 202 + 보류 2 / 같은 skip 13 (차이 없음)
- 파일 관리자 기존 테스트 전부 통과 (FTP 0.2.4 포함), `go vet` Windows/Linux/headless 태그 통과
