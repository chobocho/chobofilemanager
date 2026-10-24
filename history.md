# 변경 이력

> 이전 이력: [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

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
