# 변경 이력

> 이전 이력: [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-25 (Todo.md #126 리팩터링 4: 버전 한 곳 · FTP 설정 폴더 · 종료 때 FTP 닫기)

### 변경
- 버전은 `internal/version.Version`(var) 하나 — 창 제목(`AppTitle`)·터미널·업데이트 확인·웹 배너가 같은 값, 빌드 때 `-ldflags "-X totalcmd/internal/version.Version=…"` 하나로 (이전엔 main과 internal에 따로, internal은 const라 ldflags가 닿지 않음)
- FTP 북마크·기록 폴더: `NewFTPManagerIn(dir)`, 기본은 `appdir.Dir()` — **테스트가 실제 홈 폴더의 FTP 북마크를 읽던 문제**도 고침 (`newTestApp`)
- 창이 닫힐 때 FTP 보기의 연결에 QUIT (`App.shutdown`, OnShutdown이 파일 관리자·터미널 둘 다 정리)
- 쓰지 않던 `FileManager.ctx`·`FTPManager.ctx` 제거, 독립 터미널 창 제목도 제품 이름

### 테스트
- `cleanup_test.go`(버전 한 곳·ldflags 반영, FTP 폴더, 종료 때 QUIT, 종료 훅) — Go 전체 통과

