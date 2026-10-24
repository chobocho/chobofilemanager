# choboTerm 통합 설계 · 계획

작성: 2026-10-25 · 대상: `C:\github3\choboterm` (v0.2.34, 288파일 / 약 5.4만 줄) → Chobocho Commander

## 1. 현황 분석 요약

### 1.1 choboTerm 구성
| 영역 | 내용 | 규모 |
|---|---|---|
| Go `internal/*` 18개 패키지 | terminal(공통 타입), sshconn(SSH·인증·ssh_config·ProxyJump·레거시 알고리즘), telnet, serial, localshell(ConPTY/pty), transfer(FTP/FTPS·SFTP·SCP·Zmodem), codec(UTF-8/EUC-KR 스트림), config, store(히스토리·세션·PuTTY 가져오기), secret(DPAPI/keyring), sessionlog, luahost(별도 프로세스 Lua), web(브라우저 모드), i18n, osutil, dialog, update, dbg, version | 약 1.1만 줄 + 테스트 |
| Go `internal/app` | Wails에 바인딩되는 `App`(메서드 80개), 탭·출력 펌프·연결 라우팅·파일창·뷰어·포워딩·Docker·Lua·웹 호스트 | 약 5.6천 줄 + 테스트 7천 줄 |
| 프론트 | TypeScript + Vite 3 + xterm.js 6 + CodeMirror 6, React 없음. index.html 고정 id 약 300개 + 전역 상태(tabstate) + 오버레이 모달 | TS 9.1천 줄, CSS 2.5천 줄 |
| 테스트 | Go 테스트 함수 약 210개(가짜 SSH/FTP/Telnet 서버, 바인딩/이벤트 golden), 프론트 단위 테스트 없음, Playwright e2e(헤드리스 웹 모드 기반) | |

출력 경로: 세션 → 32KB 읽기 → 16ms/256KB 배치 → codec 디코드 → 로그/Lua → Wails 이벤트 `term:data`(base64). 입력: `Send` → codec 인코드 → 세션.

### 1.2 기능 중복과 선택
| 영역 | 파일 관리자(A) | choboTerm(B) | 결정 |
|---|---|---|---|
| FTP/FTPS 전송 | explicit TLS만, passive만 | explicit+implicit, 인증서 신뢰 확인·지문 기억, 데이터 채널 TLS 세션 재사용, 이어받기 | **B 전송 계층** + A의 패널 UI/북마크 |
| 원격 파일 탐색 | 양쪽 패널 | 터미널 탭에 붙은 단일 원격창 | **A의 패널**에 B의 SFTP/SCP/FTP 백엔드 연결 |
| 텍스트/이미지 뷰어 | CodeMirror·구문 강조·32MB | UTF-8/EUC-KR 원격 편집 저장 | **A**, B의 원격 저장 흐름만 이식 |
| 인코딩 | 파일용 감지(Johab 포함) | 터미널 스트림 코덱 | **둘 다** (용도 다름) |
| 셸 실행 | 1회성 `RunShellCommand`, 외부 cmd 창 | 앱 안 인터랙티브 PTY | **B**로 대체 |
| 스크립트 | Starlark(파일 실행) | Lua(터미널 매크로, 별도 프로세스) | **둘 다** |
| 설정 위치 | `~/.chobocho-commander/` | `UserConfigDir/choboterm/` | **A 위치 하위 `term/`**, 기존 choboTerm 설정은 첫 실행 시 복사 |
| 비밀번호 저장 | 저장 안 함(#86) | DPAPI/keyring 암호화 | **B의 secret** (FTP 북마크 비밀번호도 선택 저장 가능해짐) |

### 1.3 충돌·위험
- **모듈 경계:** `choboterm/internal/...`은 다른 모듈에서 import 불가 → `src/internal/` 아래로 복사하고 import 경로를 `totalcmd/internal/...`로 변경.
- **Go/의존성:** go 1.25 → 1.26, jlaffaye/ftp 0.2.0 → 0.2.4, x/text 0.22 → 0.42, x/crypto·x/sys 상향, 신규 pty/sftp/ssh_config/gopher-lua/go-keyring. 모두 같은 메이저 버전.
- **App 이름 충돌:** `package main`의 `App`과 별개로 `internal/termapp` 패키지의 `App`을 두 번째 바인딩으로 등록 → JS 네임스페이스 `go.main.App` / `go.termapp.App`로 분리.
- **창 생명주기:** OnDomReady/OnBeforeClose/OnShutdown·파일 드롭이 현재 없음. 종료 시 PTY/세션 정리 필요, 연결 중 닫기 확인 필요. `--lua-host` 자식 프로세스 분기를 `wails.Run` 전에 처리하지 않으면 Lua 실행마다 GUI가 하나씩 뜸.
- **키보드:** 터미널에 포커스가 있으면 Tab·화살표·Space·Insert·Delete·Backspace·Enter·Ctrl+문자·F키가 모두 셸로 가야 함 → 파일 관리자 전역 단축키와 정면 충돌. 포커스 기준 키보드 소유권 필요.
- **CSS/i18n:** B의 전역 id/class CSS와 MutationObserver 번역이 A 화면까지 건드림 → CSS 범위 한정(모듈화), 번역은 터미널 영역으로 제한하거나 보류.
- **프론트 구조:** B는 정적 DOM id + 전역 상태 → React로 그대로 옮길 수 없음. 순수 로직(xterm 제어, CJK 폭, 테마, 하이라이트, 입력 큐, 출력 디코드)은 재사용, UI는 React로 재작성.

## 2. 설계

### 2.1 백엔드
```
src/
  main.go                 ── --lua-host 분기 → wails.Run(Bind: app, termApp; OnDomReady/OnBeforeClose/OnShutdown)
  app.go ...              ── 기존 파일 관리자 (package main)
  internal/
    termapp/              ── choboTerm internal/app (웹·Termux·cat 관련 제외), 패키지명 termapp
    terminal/ sshconn/ telnet/ serial/ localshell/ transfer/ codec/
    store/ secret/ sessionlog/ luahost/ config/ i18n/ osutil/ dialog/ dbg/
```
- 설정 경로: `config.File`, `store.HistoryFile/SessionsFile` 교체 가능 함수로 `~/.chobocho-commander/term/` 지정.
- 버전: choboTerm `version` 패키지는 앱 `Version`(src/version.go)을 사용하도록 통합.
- 바인딩/이벤트 고정: choboTerm의 `wire.golden`을 이식해 `termapp` 바인딩·이벤트·JSON 형태를 계속 고정.

### 2.2 프론트엔드
```
src/frontend/src/
  terminal/            ── 지연 로딩 조각 (xterm·addon 포함, #115 방식)
    core/              ── 프레임워크 무관 TS: xtermSession(생성/폐기/fit/입력 큐/출력 디코드), cjkwidth, themes, highlight, paste, clipboard
    store/termStore    ── zustand: 탭·분할 트리·연결 상태·설정
    components/        ── React: TerminalView, TabBar, SplitPane, ConnectDialog, AuthPrompt, SearchBar, SessionManager, Prefs, Macros ...
  App.jsx              ── view: files | ftp | terminal, + 하단 도크
```
- **화면 배치(권장안: 둘 다):** ① 상단 보기 전환에 `Terminal` 보기 추가(SSH/Telnet/시리얼, 탭·분할) ② 패널 아래 접이식 **터미널 도크**(활성 패널 폴더의 로컬 셸, 패널 이동 시 cd 따라가기 선택).
- **키보드 소유권:** 포커스가 `.xterm` 안이면 `shortcutsDisabled`(#77 구조 확장)로 파일 관리자 단축키를 모두 양보. 터미널 ↔ 패널 전환 키는 하나만 예약(예: Ctrl+\` ).
- **TypeScript:** Vite/vitest가 .ts를 기본 지원하므로 tsc 없이 `.ts`(core)와 `.jsx`(UI) 혼용.
- **CSS:** CSS Modules + 기존 테마 변수(`--bg-*`, `--text-*`, `--syn-*`) 사용, 하드코딩 색 제거.

### 2.3 파일 관리자 연동
- 터미널 도크 = `OpenCmdWindow`/셸 실행 대화상자 대체.
- 터미널의 현재 폴더(OSC7/프롬프트) → "패널을 이 폴더로", 패널 선택 파일 → 터미널에 경로 붙여넣기(따옴표 처리).
- SFTP/SCP를 패널 소스로(FTP와 같은 방식), F5/F6 복사·이동에 B의 진행률·이어받기 사용.

## 3. 범위 (기본 제안)
| 포함 | 제외 제안 (사용자 결정) |
|---|---|
| 로컬 셸(cmd/PowerShell/pwsh/WSL), SSH(키·에이전트·ssh_config·ProxyJump·레거시), Telnet, 시리얼 | 웹/헤드리스 브라우저 모드, Termux 빌드, 단일 인스턴스 핸드오프 |
| 탭·분할·검색·하이라이트·붙여넣기 확인·클립보드·IME 보정 | 고양이 애니메이션 |
| 세션 관리자·히스토리·PuTTY 가져오기·설정·매크로·세션 로그 | 자동 업데이트 확인, 자동 릴리스 CI |
| SFTP/SCP/FTPS 전송 + 패널 연동, 원격 편집 저장 | 창 반투명 |
| 포트 포워딩, Docker, Lua 콘솔/매크로, Zmodem | 영어 i18n 사전(UI는 한국어 유지) |
| | choboTerm 자체 원격 파일창·뷰어·이미지뷰(파일 관리자 것으로 대체) |

## 4. 단계별 계획 (각 단계 = Todo 1건, 설계 → 테스트 → 구현 → 검증 → 커밋)
| 단계 | 내용 | 테스트 전략 |
|---|---|---|
| T1 | Go 패키지 이식: `src/internal/*` 복사, import 경로 변경, go 1.26·의존성 상향, Linux vet | choboTerm Go 테스트 약 210개를 그대로 이식해 전부 통과 + 기존 파일 관리자 테스트(FTP 0.2.4 포함) 통과 |
| T2 | `termapp` 바인딩 + main.go 생명주기(`--lua-host`, 종료 정리, 닫기 확인, 파일 드롭), 설정 경로 이전·마이그레이션, 웹 모드 제거 | wire.golden 재생성·고정, 생명주기/마이그레이션 단위 테스트, 이벤트 이름 ↔ 프론트 사용처 일치 테스트 |
| T3 | 프론트 기반: xterm 의존성(지연 로딩), terminal/core 이식, jsdom용 xterm 대체 객체, **키보드 소유권 계약 테스트 선작성** | core 단위 테스트(입력 큐 순서, base64 디코드, CJK 폭, 하이라이트), 단축키 소유권 계약, 정적 import 그래프(LZ 테스트 확장) |
| T4 | Terminal 보기: 탭, 로컬 셸, 연결 대화상자(SSH/Telnet/시리얼), 인증 프롬프트, 상태·재연결, 검색, 붙여넣기 | termStore 단위 + 컴포넌트 렌더 테스트(가짜 바인딩/이벤트), Go 쪽 가짜 서버 통합 테스트 |
| T5 | 분할, 탭 메뉴, 세션 관리자, 설정, 매크로, 세션 로그 | 각 기능 렌더/스토어 테스트 |
| T6 | 하단 터미널 도크 + 패널 연동(cwd 동기화, 경로 붙여넣기), 셸 실행·cmd 창 대체 | 도크 키보드/포커스 계약, 연동 시나리오 테스트 |
| T7 | 원격 패널: SFTP/SCP 소스, FTP 전송을 choboTerm transfer로 교체(FTPS implicit·인증서 신뢰·이어받기), 원격 편집 저장 | 기존 FTP 테스트를 새 전송으로 통과 + 가짜 SFTP 서버 테스트 |
| T8 | 포트 포워딩, Docker, Lua 콘솔, Zmodem | 이식된 Go 테스트 + UI 렌더 테스트 |
| T9 | 성능 측정(출력 처리량·키 입력 지연, bench 확장), README·빌드 스크립트 정리 | bench 기준선 |

## 5. 결정 사항 (2026-10-25 확정)
1. **제외 범위: 없음** — 웹/헤드리스·Termux·고양이·자동 업데이트·영어 i18n까지 모두 이식 (3장 "제외 제안"은 철회)
2. **화면 배치: Terminal 보기 + 하단 도크** (2.2 권장안)
3. **FTP 전송 계층: 유지** — 파일 관리자 FTP 패널은 기존 `ftpmanager.go` 사용. choboTerm `transfer`는 터미널 탭의 FTP/SFTP/SCP와 SFTP/SCP 패널 소스에만 사용 (T7에서 FTP 교체 항목 제외)
4. 커밋 메시지·주석: 저장소 규칙(한국어) 유지
