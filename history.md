# 변경 이력

> 이전 이력: [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-25 Todo.md #130-3c: 복사·이동 충돌 창 단추 연타 시 작업이 두 번 실행되던 문제
- 문제: 충돌 창의 덮어쓰기/이름 바꾸기/건너뛰기 단추가 작업이 끝날 때까지 열려 있어, 연타하거나 다른 단추를 누르면 백엔드 복사·이동이 동시에 두 번 실행됨 (덮어쓴 파일과 "x (1).txt"가 함께 생기는 등).
- 수정: 공용 훅 utils/useBusyGuard(같은 틱 두 번째 클릭도 막도록 ref로 판단) — 진행 중에는 모든 단추·취소·바깥 클릭 비활성, 끝나면 다시 가능.
- 테스트: CC-09, MC-02 (진행 중 연타·다른 단추·취소 무시). CC-01·MC-01은 클릭마다 완료를 기다리도록 수정.

## 2026-10-25 Todo.md #130-3b: FTP 다운로드·업로드가 같은 이름을 묻지 않고 덮어쓰던 문제
- 문제: FTP 창의 Download는 로컬 같은 이름 파일을, Upload는 원격 같은 이름 파일을 확인 없이 교체 (로컬 F5/F6에는 충돌 창이 있음).
- 수정: 전송 전에 받는 쪽 목록과 이름을 비교해 겹치면 "N개 항목이 이미 있습니다. 덮어쓸까요?" 확인, 취소면 전송하지 않음. 로컬 비교는 대소문자 무시.
- 테스트: FM-30(다운로드 취소/승인), FM-31(업로드 취소/승인), FM-32(겹침 없으면 묻지 않음).

## 2026-10-25 Todo.md #130-3a: 이름 바꾸기 창이 열린 뒤 커서가 움직이면 다른 파일을 바꾸던 버그
- 문제: 이름 바꾸기 창(F2)이 그릴 때마다 현재 커서 파일을 다시 구해, 창이 열린 동안 복사 완료 새로 고침 등으로 커서가 옮겨지면 엉뚱한 파일의 이름이 바뀜. 커서가 [..]로 가면 창이 안 보이는데 모달은 남아 단축키가 막힘.
- 수정: 창을 연 순간의 파일로 고정.
- 테스트: RN-06. (코드 리뷰 에이전트 결과 a~h를 Todo.md 130-3에 정리, 하나씩 처리 중)

## 2026-10-25 Todo.md #130-4: 원격 파일 창 새로 고침이 선택을 잃던 버그 + 테스트 보강
- 버그: 원격 파일 창에서 F5(새로 고침)·메뉴 새로 고침 후 고른 항목이 첫 줄로 돌아가, 이어서 "패널로 받기" 등을 하면 엉뚱한 항목(첫 폴더)이 대상이 됨. 새로 고침이 고른 이름을 유지하도록 수정.
- 테스트 RFV-23~29 추가: 화살표·Home·End·Shift 범위·Ctrl+A, Alt+↑/← 상위 폴더, 우클릭 메뉴 비활성·폴더 "열기"·Esc는 메뉴만 닫기, 새로 고침 뒤 패널로 받기, Ctrl+숫자 즐겨찾기·✕ 빼기, 보기·편집 단추 활성 조건, Explorer 끌어 놓기 올리기·해제.

## 2026-10-25 Todo.md #130-4: 터미널 키워드 강조를 실제 xterm으로 검사
- highlight.ts는 단어 분리만 검사돼 커버리지 20%였음. jsdom의 실제 xterm에 출력을 쓰고 장식(decoration)을 확인하는 테스트 7개(HL-01~07) 추가 → 87%.
- 검사 내용: ASCII는 단어 단위·대소문자 무시, 한글은 단어 안에서도 강조, 넓은 문자 뒤 열 위치, 다시 그려진 줄의 표시 제거, 전체 화면 프로그램(대체 화면) 제외, 규칙 끄고 reset 시 전부 제거, 줄당 최대 20개, 여러 번 요청해도 한 번만 검사.
- 검토 결과 코드 버그는 없음.

## 2026-10-25 Todo.md #130-2: Telnet 옵션 협상이 서버와 끝없이 주고받지 않게
- 문제: DO/DONT/WILL/WONT에 상태와 상관없이 매번 답해, 우리가 거절(DONT)한 옵션을 서버가 WONT로 확인하면 또 DONT를 보내는 식으로 단순한 서버와 무한 반복될 수 있었음. DONT NAWS 뒤에도 창 크기 변경이 계속 전송됨.
- 수정: 옵션별 우리 쪽/서버 쪽 상태를 기억해 상태가 바뀔 때만 답함(RFC 1143). 모르는 옵션 요청의 거절은 매번 보냄. DONT NAWS 뒤 크기 전송 중지.
- 테스트: TestNegotiationAnswersOnlyChanges(6개 시나리오), TestBinaryAndNAWSFollowTheNegotiation(바이너리 켜고 끄기, NAWS의 255 이중화, DONT 뒤 전송 없음).

## 2026-10-25 Todo.md #130-2: 손상된 설정·세션·호스트 파일이 다음 저장에 지워지지 않게
- 문제: 터미널 settings.json·sessions.json(저장된 세션)·hosts.json이 깨지면 읽기가 기본값/빈 목록으로 대신하고, 다음 저장이 원본을 덮어써 사용자 데이터가 사라졌음. settings·hosts는 제자리 쓰기라 저장 중 중단되면 반쪽 파일이 남을 수 있었음.
- 새 패키지 internal/atomicfile: Write(같은 폴더 임시 파일 → rename 교체), BackupCorrupt(<이름>.corrupt-<시각>으로 보관).
- config·store가 이를 사용 (store의 자체 writeFileAtomic 제거).
- 테스트: atomicfile 3개, config 4개(기본값·부분 갱신·null macros·손상 백업), store 2개(세션·호스트 손상 백업).

## 2026-10-25 Todo.md #130-2: SCP 폴백을 WSL 없이도 검사하는 가짜 서버 테스트
- 기존 SCP 테스트(TestSCPFallback)는 CHOBOTERM_WSL이 있을 때만 돌아 CI에서 SCP 코드가 한 번도 실행되지 않았음(0%).
- Go로 만든 가짜 SSH exec 서버(ls·scp -f·scp -t·rm·mv·mkdir 응답, 임시 폴더를 / 로 사용)를 추가해 어디서나 검사: 목록(공백·한글 이름, 날짜), 받기(작은따옴표 이름, 없는 파일, 폴더 거부), 올리기(100KB, 없는 폴더), 이름 바꾸기·폴더 만들기·삭제, scp 없는 서버 거부, shellQuote 왕복.
- 검토 결과 SCP 코드 자체의 버그는 없음.

## 2026-10-25 Todo.md #130-1: 텍스트 읽기의 닿지 않는 폴백 정리 + 테스트
- x/text EUC-KR 디코더는 잘못된 바이트를 U+FFFD로 바꿀 뿐 오류를 내지 않음을 확인 → ReadTextFileWithEncoding의 "EUC-KR 관용 모드"/자모 조합 폴백은 실행되지 않는 코드라 제거 (쓰지 않게 된 import도 제거).
- 테스트: 깨진 CP949 바이트가 오류 없이 �로 보임, 32MB 초과 파일 거부.
- 원자적 쓰기·GetFileInfo 오류 경로는 기존 테스트가 이미 다루고 있어 중복 추가하지 않음.

## 2026-10-25 Todo.md #130-1: F6 이동도 같은 이름 파일을 조용히 덮어쓰지 않게
- 앞쪽 충돌 검사 뒤에 대상에 같은 이름 파일이 생기면, Windows os.Rename이 그 파일을 말없이 덮어쓰던 구멍을 막음. 이제 "같은 이름이 이미 있습니다" 오류가 나고 원본은 그대로 남음.
- 이름 바꾸기와 이동이 같은 검사(refuseOtherAt)를 씀. 덮어쓰기·새 이름 모드는 그대로 동작.
- 테스트: TestMoveItemsRefusesToOverwriteAnExistingFile, TestMoveItemsOverwriteAndRenameStillWork.

## 2026-10-25 Todo.md #130-1: FTP 보기 이름 바꾸기도 같은 이름이면 거부
- 파일 관리자 FTP 보기의 이름 바꾸기(RNFR/RNTO)가 같은 폴더의 같은 이름 파일을 덮어쓰던 문제 수정. 바꾸기 전에 목록을 확인해 있으면 "같은 이름이 이미 있습니다" 오류.
- 대소문자만 바꾸는 이름 바꾸기는 그대로 허용.
- 테스트: TestFTPRenameRefusesAnExistingName (가짜 FTP 서버, RNFR 미전송 확인).

## 2026-10-25 (Todo.md #130-1·2 리뷰: 이름 바꾸기가 다른 파일을 덮어쓰던 버그)

### 변경
- 측정부터: Go 전체 문장 커버리지 78.8%(약한 곳 transfer 62·telnet 70·config 74), 프론트 88%(highlight 20·RemoteFiles 63·cat 53·SessionManager 76·filesStore 80) — 이 순서로 리뷰·보강
- **버그 수정(데이터 손실)**: 파일 패널 F2 이름 바꾸기에서 이미 있는 이름을 쓰면 Windows `os.Rename`이 그 파일을 말없이 덮어써 지워짐 → `RenameItem`이 같은 이름의 다른 항목이 있으면 거부(대소문자만 바꾸기는 같은 파일이라 허용)
- **같은 버그(원격)**: 원격 파일 창 이름 바꾸기 — SCP(mv)·FTP(RNTO)는 덮어씀 → 폴더 목록에 같은 이름이 있으면 거부
- 커버리지 결과 폴더를 .gitignore에

### 테스트
- `rename_guard_test.go`(덮어쓰기 거부·폴더·대소문자만·새 이름), `rename_remote_test.go` — 수정 전 실패 확인, Go 전체 통과

## 2026-10-25 (Todo.md #128: 두 번째 실행 때 웹 서버)

### 변경
- 터미널 웹 서버를 켜 둔 상태에서 Chobocho Commander를 다시 실행하면, 이미 떠 있는 쪽에 창을 보이라고 하고(숨겨 둔 창 포함, `web.Handoff`) 새 실행은 끝냄 — `Host.HandoffToRunning`, main.go (전에는 두 번째가 같은 포트를 못 써 디버그 기록에만 남김)
- 그래도 시작하지 못했으면(다른 프로그램이 포트를 씀 등) 시작할 때 상태 줄에 이유 표시 (`components/WebStartNotice.jsx`)

### 테스트
- Go `host_handoff_test.go`(서버 없음 → 그냥 시작, 떠 있는 쪽이 있으면 창 보이기), `WebStartNotice.test.jsx`(WN-01~02) — Go 전체·프론트 1203개 통과

## 2026-10-25 (Todo.md #127: 메모장·Lua 콘솔 입력 중에도 작업 공간 단축키)

### 변경
- `passesThroughInput`(core/workspaceKeys): 메모장·Lua 콘솔 입력 칸에서 작업 공간 단축키(Ctrl+Shift+B/K/W/T, Ctrl+Tab 등)는 작업 공간으로 통과, 복사·붙여넣기(Ctrl+Shift+C/V)는 입력 칸이 그대로 씀
- 이제 메모장 안에서 Ctrl+Shift+B로 닫고, 콘솔 안에서 Ctrl+Shift+K로 닫을 수 있음

### 테스트
- WK-05, MM-09, LC-09 (수정 전 실패 확인) — 프론트 1201개, 빌드 성공

## 2026-10-25 (Todo.md #126 완료: 전체 설계 재검토 후 리팩터링)

### 정리
- 리뷰 에이전트 3개(터미널 프론트·앱 프론트·Go)의 제안 중 버그 3건과 리팩터링 10건을 하나씩 테스트와 함께 반영 (#126 (1)~(13))
- 최종 확인: Go vet(헤드리스 태그 포함)·Go 전체 테스트, 프론트 1198개·타입 검사·빌드(초기 번들 260KB), 실제 백엔드 E2E(`wails dev` + `npm run e2e:terminal`: cmd 접속·명령 실행·출력) 통과
- 보류: 파일 관리자 FTP를 터미널 transfer로 통합(L, FTPS 동작 변경), package main을 internal로 분리(L, 바인딩 경로 변경), 칸/도크 세션 공용 훅
- 사용자 결정 필요: 메모장·Lua 콘솔 입력 중 작업 공간 단축키 통과 여부, 두 번째 실행 때 웹 서버 넘겨받기

## 2026-10-25 (Todo.md #126 리팩터링 13: 쓰지 않는 바인딩 제거)

### 변경
- 프론트가 부르지 않는 `GetPathParts`(경로 조각 — 경로 표시줄은 JS로 계산)·`GetFileSize` 바인딩과 구현·테스트·모의 런타임 항목 제거 — 브라우저 쪽에서 부를 수 있는 Go 함수 면을 줄임, wailsjs 다시 생성

### 테스트
- Go 전체, 프론트 1198개 통과, 빌드 성공

## 2026-10-25 (Todo.md #126 리팩터링 12: TerminalWorkspace 나누기)

### 변경
- `TabBar.jsx`(탭 막대·칩·스크립트 배지 시간·끌어서 순서·웹 서버 표시), `workspaceHooks.js`(`useTerminalBootstrap`·`useWindowTitle`·`useCat`)로 나눔 — 작업 공간은 키 처리·칸 배치·창 띄우기만 (308 → 약 200줄)
- `core/drag.ts`: `startWindowDrag`(분할 경계선·도크 높이 끌기가 함께 씀), `pct`·`rectStyle`(칸 좌표 → 위치, 작업 공간·칸·메모장·스크립트 상자에 같던 계산)
- 메모장·스크립트 상자를 칸 위에 띄우는 같은 코드 두 벌을 하나로

### 테스트
- `drag.test.ts`(DR-01~03), 기존 작업 공간 테스트 그대로 통과 — 프론트 1198개, 빌드 성공

## 2026-10-25 (Todo.md #126 리팩터링 11: 뷰어·에디터 찾기 하나로, 인코딩 목록 옮김)

### 변경
- `utils/textSearch.js`(다음/이전 찾기, 끝↔처음 돌아감) + `components/SurfaceSearch.jsx`(`useSurfaceSearch` 훅·`SurfaceSearchBar`): FileViewer·TextEditor에 같던 상태·찾기·키·막대(각 약 80줄)를 하나로. 소문자 문서는 부르는 쪽이 보관(큰 파일에서 찾을 때마다 바꾸지 않음)
- 인코딩 목록을 `utils/encodings.js`로 — 에디터가 뷰어 컴포넌트를 가져오던 의존을 없앰 (FileViewer는 예전 import를 위해 다시 내보냄)

### 테스트
- `textSearch.test.js`(TS-01~02), 기존 뷰어·에디터 찾기 테스트 그대로 통과 — 프론트 1195개, 빌드 성공

## 2026-10-25 (Todo.md #126 리팩터링 6 보완: 빌드 오류 수정)

### 변경
- **버그 수정(리팩터링 6에서 생김)**: filesStore·scriptStore의 지역 `errText`를 지우는 치환이 순서가 꼬여 `const errText = (e) => errText(e)`가 남음 — 같은 이름 중복 선언으로 `vite build` 실패(자기 호출이라 실행되면 무한 재귀). vitest는 import를 바꿔 써서 통과했던 것
- 앞으로 단계마다 `npm run build`도 확인 (CI는 이미 빌드함)

### 테스트
- `npm run build` 성공, 프론트 1195개 통과

## 2026-10-25 (Todo.md #126 리팩터링 10: 앱 대화상자 닫기 한 곳)

### 변경
- App의 대화상자 닫기 10곳이 같던 `setModal(null); focusActivePanel()`을 `closeModal()` 하나로
- 리뷰가 지적한 "다른 보기에서 연 도움말을 닫으면 포커스가 body로" 는 확인해 보니 도움말이 포커스를 가져가지 않아 생기지 않음 — 회귀 테스트로 남김

### 테스트
- App AF-01~02 (FTP 보기의 도움말 닫은 뒤 포커스 그대로, 연 곳이 사라지면 파일 패널) — 프론트 1193개

## 2026-10-25 (Todo.md #126 리팩터링 9: Go 이벤트 구독 수명)

### 변경
- `store/termEvents.js` 신규 `acquireTerminalEvents()`: Terminal 보기와 하단 도크가 함께 쓰는 구독(출력·전송·스크립트)을 잡는 쪽마다 release, 마지막이 놓으면 끊음
- 이전: 작업 공간은 전송·스크립트만 끊고 출력 구독은 남겼고, 도크는 시작만 하고 끊지 않음 — 이제 대칭

### 테스트
- `termEvents.test.js`(TEV-01~03: 모두 구독, 둘이 쓰면 마지막에 끊음, release 두 번 안전) — 프론트 1191개

## 2026-10-25 (Todo.md #126 리팩터링 8: 터미널 대화상자 틀·확인 창 하나로)

### 변경
- `components/Modal.jsx` 신규: 덮개·role·이름·제목 줄(✕)·Esc·키 새지 않게 — 설정·매크로·포트 포워딩·도커·세션으로 저장·세션 관리·도움말이 같은 틀 (손으로 만든 복사본 7개 제거). 대화상자가 Esc를 쓰면(안쪽 메뉴 닫기 등) 창은 그대로
- `ConfirmBox` 하나: 붙여넣기 확인, 원격 파일 삭제·이름 입력(Ask), 세션 삭제 확인이 함께 씀 (복사본 3개 → 1개)

### 테스트
- `Modal.test.jsx`(MO-01~04), 기존 대화상자 테스트 그대로 통과 — 프론트 1188개

## 2026-10-25 (Todo.md #126 리팩터링 7: 터미널 단축키 표 하나)

### 변경
- `core/workspaceKeys.ts` 신규: 키 → 동작 이름(`workspaceAction`) 한 표. `isWorkspaceKey`(xterm에 보내지 않을 키)와 작업 공간의 실행이 같은 표를 써서 둘이 어긋날 수 없음
- `TerminalWorkspace`의 긴 if 사슬을 동작 → 할 일 표로, 글자 키는 Ctrl+Shift(+Alt 아님)로 규칙 통일

### 테스트
- `workspaceKeys.test.ts`(WK-01~04: 모든 동작, 셸로 가야 하는 키) — 프론트 1184개 통과

## 2026-10-25 (Todo.md #126 리팩터링 6: 터미널 공용 도우미 정리)

### 변경
- `core/errText.ts` 신규: 실패 문구 — 24곳에 흩어져 있던 `String(e?.message ?? e)`와 store 두 곳의 지역 `errText`를 하나로
- 화면 안내 줄은 `TermSession.notice` 하나로 (tabActions·macros의 복사본 `notice` 제거)
- 저장된 창 투명도 적용 `applySavedTranslucency()` (작업 공간 시작·설정 취소·설정 확인 세 곳의 같은 줄을 하나로)

### 테스트
- `errText.test.ts`(UT-01~02) — 프론트 1180개 통과

## 2026-10-25 (Todo.md #126 리팩터링 5: 사용자에게 보이는 "choboterm" → 제품 이름)

### 변경
- 오류·안내 문구(원격 브라우저에서 안 되는 기능, Lua 응답 없음, 세션 파일 아님, 창에서만 가능, 웹 접속 토큰)를 Chobocho Commander로 — 공용 영어 사전(i18n_en.json) 키도 함께 바꿈
- 헤드리스 배너·사용법·콘솔 오류 접두어(`chobocho-term:`), 웹 다운로드 zip 이름, TLS 인증서 CN, 세션 내보내기 기본 파일 이름
- 호환을 위해 그대로 둔 것: 설정·로그·스크립트 폴더 이름, Linux 키링 이름, 세션 내보내기 형식 ID(`choboterm-sessions`, 옛 파일도 읽음), 테마 ID, 디버그 환경 변수

### 테스트
- Go 전체(웹 zip 이름 기대값 갱신), 터미널 프론트 344개 통과

## 2026-10-25 (Todo.md #126 리팩터링 4: 버전 한 곳 · FTP 설정 폴더 · 종료 때 FTP 닫기)

### 변경
- 버전은 `internal/version.Version`(var) 하나 — 창 제목(`AppTitle`)·터미널·업데이트 확인·웹 배너가 같은 값, 빌드 때 `-ldflags "-X totalcmd/internal/version.Version=…"` 하나로 (이전엔 main과 internal에 따로, internal은 const라 ldflags가 닿지 않음)
- FTP 북마크·기록 폴더: `NewFTPManagerIn(dir)`, 기본은 `appdir.Dir()` — **테스트가 실제 홈 폴더의 FTP 북마크를 읽던 문제**도 고침 (`newTestApp`)
- 창이 닫힐 때 FTP 보기의 연결에 QUIT (`App.shutdown`, OnShutdown이 파일 관리자·터미널 둘 다 정리)
- 쓰지 않던 `FileManager.ctx`·`FTPManager.ctx` 제거, 독립 터미널 창 제목도 제품 이름

### 테스트
- `cleanup_test.go`(버전 한 곳·ldflags 반영, FTP 폴더, 종료 때 QUIT, 종료 훅) — Go 전체 통과

