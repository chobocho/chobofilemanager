# 변경 이력

> 이전 이력: [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

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

