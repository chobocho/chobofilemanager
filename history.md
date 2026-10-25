# 변경 이력

> 이전 이력: [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

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

