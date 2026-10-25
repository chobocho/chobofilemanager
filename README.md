# Chobocho Commander

**Wails v2** (Go + React)로 만든 이중 패널 파일 관리자 (Total Commander Clone) + 내장 터미널 (choboTerm 통합)

![스크린샷](screenshot/screen_shot.png)

---

## 주요 기능

### 파일 관리자
- 이중 패널 레이아웃 (좌 / 우), 패널마다 탭
- 키보드 네비게이션 (방향키, Enter, Backspace, Insert)
- 복사 (F5), 이동 (F6), 휴지통 (F8) / 영구 삭제 (Shift+Del)
- 새 디렉토리 (F7), 새 파일 (Ctrl+N), 이름 변경 (F2)
- 다중 선택 (Ctrl+Click, Shift+Click, Insert, Ctrl+A)
- 파일 검색 (재귀 탐색), 북마크
- 숨김 파일 토글 (Ctrl+H)
- 내장 뷰어 (F3, 이미지·마크다운 포함) / 에디터 (F4, CodeMirror 6, 구문 강조, 32MB까지)
- ZIP 압축 / 압축 해제, Starlark 스크립트 (Ctrl+M)
- 경로 표시줄 (클릭 가능한 브레드크럼), 드라이브 / 마운트 포인트 선택기, 히스토리

### 터미널 (Terminal 보기 · 하단 도크)
- **Terminal 보기**: SSH(키·에이전트·ssh_config·ProxyJump), Telnet, FTP, 시리얼, 로컬 셸(cmd / PowerShell / pwsh / WSL) 탭
- 화면 분할(Ctrl+Shift+\\ / -), 탭 우클릭 메뉴, 검색(Ctrl+Shift+S), 단어 강조, 자동 재접속
- 세션 관리자(Ctrl+Shift+H, PuTTY 가져오기), 설정(Ctrl+Shift+O, 왼쪽 위 FTP 버튼 숨기기 포함), 매크로(Ctrl+Shift+M, F키), 세션 로그(Ctrl+Shift+L), 메모장(Ctrl+Shift+B)
- 원격 파일 창(Ctrl+Shift+F, SFTP/SCP/FTP): 받기/올리기, 즐겨찾기, **원격 파일 보기·편집(F3/F4)**, 파일 패널 폴더로 받기 / 패널의 선택 항목 올리기
- 포트 포워딩(Ctrl+Shift+P), 도커 컨테이너(Ctrl+Shift+J), Lua 콘솔(Ctrl+Shift+K)·스크립트, Zmodem(sz/rz)
- 영어 화면, 창 투명도, 웹 서버(다른 PC의 브라우저에서 터미널 사용), 업데이트 확인, 고양이 🐈
- **하단 도크 (F9)**: 활성 패널 폴더에서 셸 시작, 패널 따라가기(cd), Ctrl+Enter / Ctrl+Shift+Enter로 파일 이름 / 경로 붙여넣기, 셸 폴더를 패널에서 열기
- 터미널 도움말: Terminal 보기에서 **F1**

### FTP 클라이언트 (FTP 보기)
- FTP 서버 연결, 북마크 (`~/.chobocho-commander/ftp_bookmarks.json`)
- 다운로드 / 업로드 / 삭제 / 디렉토리 생성 / 이름 변경, 패시브 모드

### UI
- 다크 테마 + JetBrains Mono 폰트
- F-key 단축키 바 (Total Commander 클래식 스타일)
- 하단 상태 바 (파일 수, 선택 정보)

---

## 개발 환경 요구사항

| 도구 | 버전 |
|------|------|
| Go | 1.26+ |
| Node.js | 22 (18+) |
| Wails CLI | v2.11+ |

### Wails CLI 설치
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 플랫폼별 의존성
- **Windows**: WebView2 런타임 (Windows 10/11에 기본 포함), 로컬 셸은 Windows 10 1809 이상
- **Linux**: `webkit2gtk-4.0`, `gtk3`, `pkg-config`

```bash
# Ubuntu/Debian
sudo apt install libwebkit2gtk-4.0-dev libgtk-3-dev pkg-config

# Fedora
sudo dnf install webkit2gtk4.0-devel gtk3-devel
```

---

## 개발 실행

```bash
cd src

# 개발 모드 실행 (핫 리로드)
wails dev
```

---

## 빌드

```bash
# Windows: 테스트 → wails build → release\ 에 복사 (+ 헤드리스 터미널)
build.bat

# Linux
./build_linux.sh

# 직접 빌드
cd src
wails build -platform windows/amd64
wails build -platform linux/amd64
```

결과물: `release/chobocho-commander(.exe)`, `release/chobocho-term-headless(.exe)`

**헤드리스 터미널** (`chobocho-term-headless`): 창 없이 터미널 웹 서버만 띄웁니다 (WebView2·GTK 불필요).
`chobocho-term-headless --headless` → 출력된 주소(토큰 포함)를 브라우저로 열면 터미널을 씁니다. 설정·세션은 앱과 같은 `~/.chobocho-commander/term`.

---

## 테스트 · 측정

```bash
cd src && go test ./...                  # Go
cd src/frontend && npm test              # 프론트 (vitest)
cd src/frontend && npm run typecheck     # 터미널 코어 타입 검사
cd src/frontend && npm run bench         # 뷰어/에디터 성능 (헤드리스 Edge/Chrome)
cd src/frontend && npm run bench:term    # 터미널 출력 처리량·키 입력 지연
cd src/frontend && npm run e2e:terminal  # wails dev 실행 중일 때 실제 백엔드 종단 점검
```

CI(`.github/workflows/ci.yml`): PR과 master 푸시마다 Windows·Linux에서 프론트 테스트·빌드, Go vet·테스트, 헤드리스 빌드.

---

## 키보드 단축키

### 파일 관리자

| 키 | 동작 |
|----|------|
| `↑` / `↓` | 파일 탐색 |
| `Enter` | 열기 / 디렉토리 진입 |
| `Backspace` | 상위 디렉토리 이동 |
| `Space` | 선택 토글 |
| `Insert` | 선택 토글 + 이동 |
| `Ctrl+A` | 전체 선택 |
| `Ctrl+H` | 숨김 파일 토글 |
| `Ctrl+R` | 새로 고침 |
| `F2` | 이름 변경 |
| `F3` / `F4` | 보기 / 편집 |
| `F5` | 반대 패널로 복사 |
| `F6` | 반대 패널로 이동 |
| `F7` | 새 디렉토리 생성 |
| `F8` / `Del` | 휴지통 |
| `F9` | 하단 터미널 도크 (활성 패널 폴더의 cmd / PowerShell / WSL) |
| `Shift+F9` | 바깥 명령 창 열기 |
| `Ctrl+Enter` / `Ctrl+Shift+Enter` | 커서 파일 이름 / 전체 경로를 도크 셸에 붙여넣기 |
| `Ctrl+S` | 저장 (에디터) |
| `Esc` | 모달 / 에디터 닫기 |

### 터미널 (Terminal 보기)

| 키 | 동작 |
|----|------|
| `Ctrl+Shift+T` / `W` | 새 탭 / 탭 닫기 |
| `Ctrl+Tab` | 다음 탭 |
| `Ctrl+Shift+\` / `-` | 옆으로 / 아래로 분할, `Alt+방향키` 칸 이동 |
| `Ctrl+Shift+C` / `V` | 복사 / 붙여넣기 (선택하면 바로 복사, 우클릭 붙여넣기) |
| `Ctrl+Shift+F` | 원격 파일 창 |
| `Ctrl+Shift+H` / `O` / `M` | 세션 관리 / 설정 / 매크로 |
| `Ctrl+Shift+P` / `J` / `K` | 포트 포워딩 / 도커 / Lua 콘솔 |
| `Ctrl+Shift+L` / `B` / `S` | 세션 로그 / 메모장 / 찾기 |
| `Ctrl+Shift+D` / `E` | 연결 끊기 / UTF-8 ↔ EUC-KR |
| `Ctrl+=` / `-` / `0`, `Ctrl+휠` | 글꼴 크기 |
| `F1` | 터미널 도움말 (한국어 / English) |

---

## 프로젝트 구조

```
src/
├── main.go                # Wails 앱 진입점 (파일 관리자 App + 터미널 termapp.App 바인딩)
├── app.go                 # 파일 관리자 Go-JS API
├── filemanager.go         # 파일 목록·정보·검색
├── fileops.go filetext.go filearchive.go fileshell.go   # 복사/이동/삭제, 텍스트·이미지, ZIP, 열기·셸
├── ftpmanager.go          # FTP 보기 클라이언트
├── cmd/chobocho-term/     # 헤드리스 터미널 웹 서버 (-tags headless)
├── internal/              # 터미널 (choboTerm 이식)
│   ├── termapp/           # 터미널 탭·연결·파일 전송·뷰어·포워딩·도커·Lua·웹 호스트 (Wails 바인딩)
│   ├── sshconn/ telnet/ serial/ localshell/   # 연결 종류
│   ├── transfer/          # SFTP / SCP / FTP(S) 전송
│   ├── config/ store/ secret/ appdir/         # 설정·세션·비밀번호(DPAPI)·설정 폴더
│   ├── textenc/ atomicfile/                 # 텍스트 인코딩 판별·변환(조합형 포함), 원자적 저장·손상 파일 보관
│   ├── sessionlog/ luahost/ web/ i18n/ update/ ...
└── frontend/
    ├── bench/             # 성능 측정 (뷰어/에디터, 터미널), 실제 백엔드 종단 점검
    └── src/
        ├── App.jsx                # 최상위 (Files / FTP / Terminal 보기 + 하단 도크)
        ├── stores/                # fileStore, ftpStore, dockStore, editorStore ...
        ├── components/            # FilePanel, FileViewer, TextEditor, CloseGuard ...
        └── terminal/              # 터미널 화면 (처음 열 때 지연 로딩, xterm 6)
            ├── core/              # 프레임워크 무관 TS: 세션, 분할, 설정, 원격 파일·소스, 포워딩, 도커, Lua, i18n ...
            ├── store/             # termStore, filesStore, scriptStore (zustand)
            └── components/        # TerminalWorkspace, TerminalDock, ConnectDialog, RemoteFiles ...
docs/choboterm-integration.md      # 통합 설계·계획
tools/gen_notices.py               # THIRD_PARTY_NOTICES.txt 생성
```

---

## 기술 스택

| 분류 | 기술 | 버전 |
|------|------|------|
| 백엔드 | Go | 1.26 |
| 데스크톱 프레임워크 | Wails | v2.11 |
| FTP 라이브러리 | jlaffaye/ftp | v0.2.4 |
| SSH / SFTP | golang.org/x/crypto, pkg/sftp | |
| Lua | gopher-lua | v1.1 |
| UI 라이브러리 | React | 18 |
| 상태 관리 | Zustand | v4 |
| 에디터 | CodeMirror | 6 |
| 터미널 | xterm.js | 6 |
| 빌드 도구 | Vite | v4 |
| 아이콘 | lucide-react | v0.383 |

서드파티 라이선스: [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) (`python tools/gen_notices.py`로 다시 생성)

---

## 설정 파일

- 앱 설정·패널: `~/.chobocho-commander/`
- FTP 북마크: `~/.chobocho-commander/ftp_bookmarks.json`
- 터미널 설정·세션·접속 기록: `~/.chobocho-commander/term/` (처음 실행 때 기존 choboTerm 설정을 복사)
- 세션 로그 / Lua 스크립트: `문서\choboterm\logs`, `문서\choboterm\scripts`
