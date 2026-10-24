# 변경 이력

> 이전 이력: [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

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
