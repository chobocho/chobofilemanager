# 변경 이력

> 이전 이력: [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-25 (Todo.md #125 — T9: 성능 측정 · 헤드리스 빌드 · 빌드 스크립트 · CI · README)

### 변경
- `npm run bench:term` (bench/term.html, termBench.js, run-term.mjs): 실제 xterm + TermSession으로 출력 처리량·키 입력 지연을 헤드리스 Edge에서 측정
  - 기준선(이 PC): 출력 1MB 71ms(14MB/s) · 5MB 128ms(39MB/s) · 10MB 226ms(44MB/s), 색 섞인 출력 10MB 208ms(48MB/s), 키 → Send 중앙값 0.2ms · 최대 6.4ms
- `cmd/chobocho-term`: 창 없는 터미널 웹 서버(`-tags headless`), 설정·세션은 앱과 같은 `~/.chobocho-commander/term` — 실제로 띄워 우리 페이지(shim 포함) 제공 확인
- 리팩터링: 설정 폴더를 `internal/appdir`로 (앱과 헤드리스가 함께 씀)
- `build.bat` / `build_linux.sh`: 프론트·Go 테스트 → wails build → `release/` + 헤드리스 빌드
- `.github/workflows/ci.yml`: Windows·Linux에서 프론트(타입 검사·테스트·빌드), Go vet(헤드리스 태그 포함)·테스트, 헤드리스 빌드
- `tools/gen_notices.py` + `THIRD_PARTY_NOTICES.txt`(Go·npm 83개 라이선스), README 전면 갱신(터미널·도크·빌드·테스트·구조·단축키)
- 바인딩 비교 테스트의 건너뛰기 문구를 지금 상황에 맞게

### 테스트
- Go `appdir_test.go`, `cmd/chobocho-term/main_test.go` — Go 전체 통과

## 2026-10-25 (Todo.md #122 보완: 셸의 지금 폴더 → 파일 패널, WSL 시작 폴더)

### 변경
- 설계 2.3 "터미널의 현재 폴더 → 패널을 이 폴더로": 도크에 📁 버튼 — 셸이 알려 준 폴더(OSC 7, cmd는 OSC 9;9)를 활성 파일 패널에서 엶 (`localPathFromCwd`: `/C:/x`, `C:\x`, WSL `/mnt/c/x`)
- Go `localshell.CommandIn`: cmd는 사용자가 PROMPT를 정하지 않았으면 `prompt $E]9;9;$P$E\$P$G`(Windows Terminal 방식, 보이는 프롬프트는 그대로)로 폴더를 알림 — 실제 cmd로 ConPTY 통과 확인
- **버그 수정**: WSL은 `--cd ~`로 시작해 도크가 패널 폴더에서 시작하지 못하던 문제 → 시작 폴더가 있으면 그 폴더에서
- `TermSession`: OSC 9;9 처리, `onCwd` 알림

### 테스트
- Go `command_windows_test.go`, DK-08, DKV-11 — 프론트 1174개, Go 전체 통과

## 2026-10-25 (Todo.md #124 보완 2: F1 터미널 도움말 · 창 제목 · 디버그 기록)

### 변경
- `core/helpText.ts`(choboTerm help.ts 내용, 한국어·English, 링크는 이 앱 저장소) + `TerminalHelp.jsx`: Terminal 보기에서 F1, English 버튼·Alt+L 전환(기억), 링크는 기본 브라우저, 화면 번역 대상에서 제외(`data-no-i18n`)
- `core/title.ts`: Terminal 보기가 보이는 동안 창 제목 = 앱 제목 + 활성 연결(host:port [인코딩] / ftp:// / 로컬 / 시리얼 baud / 도커), 다른 보기로 가면 원래 제목
- `core/debug.ts`: CHOBOTERM_DEBUG=1 또는 debug.on일 때 화면의 console 경고·오류·페이지 오류를 Go의 debug.log로 (켜지기 전 것도 보냄)

### 테스트
- `TerminalHelp.test.jsx`(HL-01~04, TT-01~02, DB-01~02) — 프론트 1172개 통과

## 2026-10-25 (Todo.md #124 보완 1: 복사·붙여넣기, 빠진 단축키, 글꼴 크기, 탭 막대 마우스)

### 변경
- choboTerm에 있던 동작 중 빠진 것 이식 (`core/clipboard.ts` 신규):
  마우스로 선택하면 놓을 때 바로 복사(프로그램이 마우스를 쓰면 Shift+드래그 안내), 우클릭 붙여넣기(마우스 쓰는 프로그램은 Shift+우클릭, 여러 줄은 확인),
  Ctrl+Shift+C / V, 로컬 셸의 Ctrl+V는 브라우저 붙여넣기(Win+V 기록 포함, 전체 화면 프로그램은 ^V)
- 단축키: Ctrl+Shift+N 새 탭, Ctrl+Shift+D 연결 끊기, Ctrl+Shift+E 인코딩 전환, 접속 창 Alt+C 연결 / Alt+A 취소
- 글꼴 크기: Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+휠 (모든 탭, 8~40, 기억)
- 탭 막대: 빈 곳 더블클릭 = 새 탭, 가운데 클릭 = 닫기, 끌어서 순서 바꾸기
- 테스트 도구: FakeTerminal에 선택·붙여넣기·마우스 모드

### 테스트
- `TerminalInput.test.jsx`(CP-01~05, KY-01~03, TM-01~02) — 프론트 통과

## 2026-10-25 (Todo.md #124 — T8 7차: 고양이, T8 완료)

### 변경
- `core/cat.ts`: choboTerm 고양이(걷기·앉기·기지개·구르기·뛰기, 입력 지켜보기·덮치기, 30초 쉬면 잠, 끌어 옮기기, 클릭하면 탭 없이 Lua·웹 주소·폴더 열기, 결과 창)를
  `mountCat(deps)`로 감싸 이식 — 탭 정보는 의존성으로 받고 `dispose()`로 요소·리스너를 모두 치움. 그림(cat.png)은 고양이를 띄울 때만 받음
- Terminal 보기 아래쪽(칸들의 바닥)을 걸어 다니고 파일 관리자 화면에서는 숨김, 설정 > 고양이 보이기(확인하면 바로 적용), 처음 한 번 안내
- `core/toast.ts` 신규: 터미널 밖에서 쓰는 짧은 안내
- T8(#124) 완료: 포트 포워딩, 도커, Lua 콘솔·스크립트·매크로, Zmodem, 영어 화면, 업데이트 확인, 웹 서버·웹 화면, 창 투명도, 고양이

### 테스트
- `cat.test.ts`(CT-01~06), CTW-01~02 — 프론트 1154개 통과

## 2026-10-25 (Todo.md #124 — T8 6차: 업데이트 확인 · 웹 서버 · 창 투명도 · 웹 화면 · 닫기 확인 버그)

### 변경
- **버그 수정**: 창 닫기 확인(`app:close`)이 지연 로딩되는 터미널 보기 안에만 있어, 터미널 보기를 열지 않고 하단 도크만 연결된 채 창을 닫으면 아무도 답하지 않아 창이 닫히지 않던 문제 →
  `components/CloseGuard.jsx`로 옮겨 앱에 항상 붙임, `app:closeWeb`(모두 종료 / 창만 닫기·웹 서버 유지)도 처리
- 업데이트 확인: Go가 Chobocho Commander 저장소의 릴리스를 보도록 수정(이전엔 choboterm), 시작할 때(설정) 새 버전이면 다운로드 페이지, 설정 > 지금 확인
- 설정 > 웹 서버: 주소·켜기/다시 시작/끄기·상태(이 PC만/다른 PC, 브라우저 수, TLS 지문)·접속 주소 복사·새 토큰·브라우저로 열기, 탭 막대에 🌐 표시(`web:status`)
- 설정 > 창 투명도(끄기/창 전체/배경만, 불투명도, GPU): 고르는 동안 미리 보기, 취소하면 원래대로. Go 창을 투명 웹뷰로(`main.go`), 페이지 배경은 터미널 보기일 때만 비움
- 브라우저 화면(웹 서버가 주는 페이지)은 터미널만 표시, web_shim이 `window.go.termapp.App` 제공
- Go `pendingPageEvents`가 비었음 — Go가 보내는 모든 이벤트를 화면이 처리 (검사 범위를 frontend/src 전체로)

### 테스트
- `CloseGuard.test.jsx`(CG-01~04), `TerminalExtras.test.jsx`(UP-01~04, WB-01~03, TL-01~02), App WM-01~02, Go 창 옵션·업데이트 저장소·shim 이름공간 — 프론트 1146개, Go 전체 통과

## 2026-10-25 (Todo.md #124 — T8 5차: 영어 화면)

### 변경
- `core/i18n.ts` 신규 (choboTerm i18n.ts 이식): 사전(i18n_en.json) 정확 일치 → `{}` 자리 패턴(순서 바뀜 `{0} {1}`) → 줄마다, Lua 오류의 위치 앞머리 보존
- 화면 번역은 터미널 영역(`[data-terminal-root]`, 탭 메뉴 `[data-term-i18n]`)만 — 파일 관리자는 한국어 유지, 터미널 출력·파일 내용은 그대로. 글자·title·placeholder·aria-label, 나중에 생긴 글자도(MutationObserver)
- 언어: 설정 > 언어(시스템 따라/한국어/English), 비면 Go `GetLanguage`. 영어로 바꾸면 바로 적용

### 테스트
- `i18n.test.ts`(IN-01~06), PF-07, PD-10~11 — 프론트 1132개 통과

## 2026-10-25 (Todo.md #124 — T8 4차: Zmodem 진행 표시)

### 변경
- 리팩터링: 전송 진행 표시를 `TransferProgress.jsx`로 분리 (원격 파일 창과 함께 씀)
- Zmodem(sz/rz)처럼 파일 창 없이 오는 `xfer:progress`는 활성 탭 칸 구석에 떠 있는 진행 상자(이름·막대·속도·취소), 전송 중인 탭 칩에 ⇅ 표시
- 시리얼 탭에서 파일 전송(Ctrl+Shift+F) → "sz / rz(Zmodem)를 쓰세요" 안내

### 테스트
- `Zmodem.test.jsx`(ZM-01~04) — 프론트 1123개 통과

## 2026-10-25 (Todo.md #124 — T8 3차: Lua 콘솔 · 스크립트 · Lua 매크로)

### 변경
- `core/luaScript.ts` 신규: 경과 시간, 탭 배지(▶ 시간 / Lua), 상자 제목(실행 중·끝·멈춤·오류), 줄 보관(화면 200줄·저장용 2만 줄), 입력 기록 ↑↓
- `store/scriptStore.js` 신규: `script:start/print/result/end/screen/open` 처리, 콘솔 실행(ConsoleEval·중지·이전 입력), 파일 불러오기(Ctrl+O)·저장(Ctrl+S), 끝난 상자는 5초 뒤 닫힘(오류는 남김)
- `ScriptBox.jsx` 신규: 칸 구석의 스크립트 상자 / Lua 콘솔(Ctrl+Shift+K) 입력 줄, 탭 칩에 실행 배지
- 탭 메뉴: Lua 스크립트 실행... / Lua 콘솔 / 스크립트 중지 / 스크립트 폴더 열기, Lua 매크로는 이제 `RunScript`로 실행
- `TermSession.screenText()`(screen() 응답), Go `pendingPageEvents`에서 `script:*` 6개 제거

### 테스트
- `luaScript.test.ts`(LS-01~05), `ScriptBox.test.jsx`(LC-01~08, LR-01~07), MC-12 갱신, TA-20 — 프론트 1119개 통과

## 2026-10-25 (Todo.md #124 — T8 2차: 도커 컨테이너)

### 변경
- `core/docker.ts` 신규: 곳(서버 host:port / 이 PC)별 엔진 기억, 도커 탭 이름(🐳 셸 / 📜 로그)·툴팁, 연결된 SSH 탭 → 컨테이너 위치, 포트 열기 계획(이 PC는 바로, 서버는 같은 포트 -L — 있으면 재사용, 다른 규칙이 쓰면 안내)
- `ContainersDialog.jsx` 신규 (Ctrl+Shift+J, 탭 메뉴): 위치·엔진(docker/podman/자동)·중지된 것도 표시, 셸 열기/로그 보기/시작/중지(확인)/재시작, 게시 포트 열기, F5·Esc·Enter·화살표
- `TermSession.openDocker` + termStore 도커 탭: 새 탭에서 DockerOpen, 다시 연결·복제·끝난 뒤 Enter는 같은 컨테이너로, 열었던 서버 탭이 없어지면 같은 서버의 다른 탭 사용

### 테스트
- `docker.test.ts`(DC-01~05), `ContainersDialog.test.jsx`(DCV-01~11), TA-20 — 프론트 통과

## 2026-10-25 (Todo.md #124 — T8 1차: SSH 포트 포워딩)

### 변경
- `core/forwards.ts` 신규: 규칙 → ssh 옵션(-L/-R/-D, IPv6 대괄호), 같은 연결을 여는 ssh 명령(-J, -p), 상태(오류/대기/수신 중·연결 수)
- `ForwardsDialog.jsx` 신규 (Ctrl+Shift+P, 탭 메뉴 "포트 포워딩"): 규칙 목록·추가(Enter)·삭제(Delete)·ssh 명령 복사, `fwd:changed`로 다시 읽기
- `termStore`: 탭에 딸린 창 자리(`panel`) 도입 — 포워딩·도커·Lua 콘솔이 함께 씀, SSH가 아니면 터미널에 안내, 탭을 닫으면 창도 닫힘
- Go `pendingPageEvents`에서 `fwd:changed` 제거

### 테스트
- `forwards.test.ts`(FW-01~04), `ForwardsDialog.test.jsx`(FD-01~08), TA-20 — 프론트 통과

## 2026-10-25 (Todo.md #123 — T7 2차: 원격 파일 보기·편집, T7 완료)

### 변경
- `core/remoteSource.ts` 신규: 원격 파일을 뷰어·에디터의 "파일 소스"로 — FileView 읽기(자동 판별 UTF-8/CP949, 명시 인코딩), FileImage(data URL),
  FileSaveText 저장(읽을 때의 크기·시각으로 충돌 검사 → 덮어쓸지 확인, 인코딩에 없는 글자 → 확인 후 '?'), 앞부분만 받은 큰 파일은 저장 거부·안내
- 리팩터링: `TextEditor`·`FileViewer`가 `source`(읽기/쓰기/이미지/이름표/안내)를 받음 — 없으면 이 PC의 파일. 원격 .star는 실행 버튼 없음, 원격 마크다운은 로컬 저장소 이미지 찾기 안 함
- 리팩터링: 뷰어/에디터 열림 상태를 App 지역 상태에서 `stores/editorStore.js`로 — 파일 패널과 원격 파일 창이 함께 쓰고, 닫은 뒤 포커스는 연 쪽(onClose)
- 원격 파일 창: F3 보기 / F4 편집 / 버튼·우클릭 메뉴, 이미지는 폴더의 다른 이미지와 ←/→, 저장하면 목록 새로 고침
- T7(#123) 완료: SFTP/SCP/FTP 원격 파일 창, 파일 패널로 받기/올리기, 원격 보기·편집

### 테스트
- `remoteSource.test.ts`(RS-01~09), `RemoteEdit.test.jsx`(RE-01~06), `editorStore.test.js`(ES-01~04), RFV-18~21, App AV-01~03 — 프론트 1071개 통과

## 2026-10-25 (Todo.md #123 — T7 1차: 원격 파일 창 + 파일 패널 연동)

### 변경
- Go: `FileDownloadTo`(대화상자 없이 지정 폴더로 받기) 추가, `FileDownloadMany`와 받기 로직을 `downloadEntries`로 묶음, wire.golden·바인딩 갱신
- `core/remoteFiles.ts` 신규: 목록(.. 상위 줄)·선택(하나/Ctrl/Shift/전체)·최근 폴더·삭제 뒤 선택·진행 문구
- `store/filesStore.js` 신규: 탭마다 원격 파일 창 상태, 받기/여러 개 받기/올리기/끌어 놓기 올리기/삭제/이름 바꾸기/새 폴더/새 파일, 서버별 즐겨찾기, 전송 진행(`xfer:progress`·`xfer:end`)
- `RemoteFiles.jsx` 신규 (Ctrl+Shift+F, 탭 메뉴 "파일 전송"): 키보드(Enter·Backspace·Alt+↑·F2·F5·F7·Shift+F4·Delete·Ctrl+A/D/B/1~9), 우클릭 메뉴, 즐겨찾기 메뉴, 진행 막대·취소
- 파일 관리자 연동: "⬇ 패널로"(활성 패널 폴더로 받고 패널 새로 고침), "⬆ 패널에서"(활성 패널의 선택 항목 올리기)
- FTP 연결은 파일 창을 바로 엶, 터미널 현재 폴더(OSC 7)에서 시작, 탭을 닫으면 창 정리
- Go `pendingPageEvents`에서 `xfer:progress`·`xfer:end` 제거

### 테스트
- Go `panelxfer_test.go`, `remoteFiles.test.ts`(RF-01~11), `RemoteFiles.test.jsx`(RFV-01~17), TA-20 — 프론트 1045개, Go 통과

## 2026-10-25 (Todo.md #122 — T6: 하단 터미널 도크 + 패널 연동)

### 변경
- Go: `ConnectRequest.dir`(로컬 셸 시작 폴더) 추가 — 있는 폴더일 때만 쓰고 아니면 홈 (`localStartDir`), wire.golden 갱신
- `TerminalDock.jsx` 신규 (F9, 처음 열 때 지연 로딩): 활성 패널 폴더에서 cmd/PowerShell/WSL 시작, 셸 선택·다시 시작, 셸이 끝나거나 시작 실패 시 Enter로 다시,
  경계선 끌어 높이 조절, 닫아도 셸 유지(숨김), 도크 안 F9 = 닫고 패널로
- 패널 따라가기(선택): 패널 폴더·활성 패널이 바뀌면 셸에 맞는 cd (`cd /d`, `Set-Location -LiteralPath`, WSL은 `wslpath`)
- 경로 붙여넣기: 패널에서 Ctrl+Enter 파일 이름 / Ctrl+Shift+Enter 전체 경로 — 셸별 따옴표, 도크가 닫혀 있으면 열고 셸이 뜬 뒤 입력
- `stores/dockStore.js` 신규(열림·높이·따라가기·셸 기억), F키 막대 F9 = Term, 바깥 명령 창은 Shift+F9로 이동, 도움말·README 단축키 갱신

### 테스트
- Go `dock_test.go`, `dock.test.ts`(DK-01~07), `TerminalDock.test.jsx`(DKV-01~10), App `DKA-01~05`, AP-29/30/31 갱신 — 프론트 1017개, Go 전체 통과

## 2026-10-25 (Todo.md #121 — T5 7차: 메모장, T5 완료)

### 변경
- `MemoPad.jsx` 신규 (Ctrl+Shift+B, 탭 메뉴 "메모장"): 칸 오른쪽 아래에 뜨는 메모장, 모든 탭 공용 내용, 입력하는 대로 브라우저 저장소에 저장(실패하면 안내),
  "다른 이름으로 저장"(MemoSave, 결과·오류 표시), Esc/✕ 닫기, 탭을 닫으면 그 칸의 메모장도 닫힘
- T5(#121) 완료: 화면 분할, 탭 메뉴, 세션 저장·관리자, 설정 창, 매크로, 세션 로그, 메모장

### 테스트
- `MemoPad.test.jsx`(MM-01~08), TA-20 메뉴 항목 — 프론트 995개 통과

## 2026-10-25 (Todo.md #121 — T5 6차: 세션 로그)

### 변경
- `log:changed` 이벤트 처리: 세션에 로그 경로 기록, 화면 안내(시작/중지), 연결 중 자동 시작(설정 "접속할 때마다 기록")은 화면을 지운 뒤 한 번만 안내
- `toggleLog`(연결 안 됨이면 안내, 실패 시 오류 표시)·`showLogs` — Ctrl+Shift+L, 탭 메뉴 "로그 기록 시작/중지"·"로그 폴더 열기"
- 기록 중인 탭: 칩에 빨간 점, 툴팁에 "로그 기록 중: 경로"
- Go `pendingPageEvents`에서 `log:changed` 제거 (화면이 이제 처리)

### 테스트
- `sessionlog.test.ts`(SL-01~06), `SessionLog.test.jsx`(SLV-01~02), TA-20 메뉴 항목 — 프론트 987개, Go termapp 통과

## 2026-10-25 (Todo.md #121 — T5 5차: 매크로)

### 변경
- `core/macros.ts` 신규: 쓸 수 있는 키(F2~F12, Shift/Ctrl+F1~F12), 키 이름, 이스케이프 펼치기(줄바꿈=Enter, \t \e \xHH \), 단축키 선택지(다른 매크로가 쓰는 키 비활성), 보내기
- `MacrosDialog.jsx` 신규 (Ctrl+Shift+M, 탭 막대 ⌘): 목록·이름·단축키·종류·내용, 고치면 바로 저장, 추가/삭제, 보내기(Enter/더블클릭/Ctrl+Enter), 마지막 선택 기억
- 지정한 F키는 xterm으로 보내지 않고 활성 탭에 매크로 전송 (연결 창·다른 창이 열려 있으면 그 창의 키), 연결 안 됨이면 안내
- Lua 매크로 실행은 #124(Lua 콘솔)로 미룸 — 지금은 안내만

### 테스트
- `macros.test.ts`(MC-01~06, 10~12), `MacrosDialog.test.jsx`(MD-01~10) — 프론트 979개 통과

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
