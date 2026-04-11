# 변경 이력

## 2026-04-11 (19)

### TAB키로 양쪽 패널 전환

- `src/frontend/src/components/Toolbar.jsx`
  - `onSwitchPanel` prop 추가
  - 전역 `keydown` 핸들러에 `Tab` 케이스 추가 → `e.preventDefault()` 후 `onSwitchPanel?.()` 호출
  - 의존성 배열에 `onSwitchPanel` 추가
- `src/frontend/src/App.jsx`
  - `handleSwitchPanel` 콜백 추가: 활성 패널을 반대 측으로 전환 후 `requestAnimationFrame`으로 포커스 이동
  - Toolbar에 `onSwitchPanel={handleSwitchPanel}` 전달
- `src/frontend/src/components/FilePanel.jsx`
  - `handleKeyDown`에 `Tab` 케이스 추가: `store.setActivePanel(반대 side)` 직접 호출
  - `isActive` 변경 시 자동 포커스 `useEffect` 추가 (TAB 전환 후 포커스 자동 이동)

**테스트 결과**: JS 73개 전체 통과

## 2026-04-11 (18)

### Todo #10 - F8 삭제 팝업에 파일명 목록 표시

- `src/frontend/src/components/ConfirmDialog.jsx`
  - `ConfirmDialog`에 `items` prop 추가 (파일명 배열)
  - `items`가 있으면 메시지 아래에 스크롤 가능한 파일명 목록 렌더링
- `src/frontend/src/styles/Dialogs.module.css`
  - `.deleteList`: 최대 높이 160px, 스크롤, 테두리
  - `.deleteItem`: 각 행 패딩, 하단 구분선
  - `.deleteItemName`: mono 폰트, 말줄임 처리
- `src/frontend/src/App.jsx`
  - 삭제 다이얼로그에 `items={deleteTarget.paths.map(p => p.split(/[/\\]/).pop())}` 전달

**테스트 결과**: JS 73개 전체 통과

## 2026-04-11 (17)

### Todo #9 - 종료 시 패널 경로 저장 → 재시작 시 복원

- `src/settings.go` 신규 생성
  - `AppSettings` 구조체: `LeftPath`, `RightPath`
  - `settingsFilePath()`: `~/.totalcmd/settings.json` 경로 반환
  - `SavePanelPaths(left, right string) error`: JSON으로 저장
  - `LoadPanelPaths() AppSettings`: JSON 로드, 경로 존재 여부 검증 (없으면 빈 문자열 반환)
- `src/frontend/src/stores/fileStore.js`
  - `init()`: `LoadPanelPaths()` 병렬 호출 → 저장된 경로가 있으면 해당 경로로, 없으면 홈으로 이동
  - `navigate()`: 탐색 완료 후 `SavePanelPaths(left, right)` 비동기 호출 (에러 무시)
- `src/filemanager_test.go`
  - `TestSavePanelPaths_AndLoad`: 저장 후 로드 왕복 검증
  - `TestLoadPanelPaths_NonexistentPathReturnsEmpty`: 존재하지 않는 경로는 빈 문자열로 반환
  - `TestLoadPanelPaths_NoFileReturnsEmpty`: settings.json 없을 때 빈 구조체 반환

**테스트 결과**: Go 전체 통과

## 2026-04-11 (16)

### Todo #8 - 압축 풀기 시 파일명으로 서브폴더 생성

- `src/filemanager.go` — `ExtractArchive` 수정
  - 압축 파일명에서 확장자를 제거한 이름으로 `destDir` 하위에 서브폴더 생성
  - 예: `archive.zip` → `destDir/archive/` 에 압축 해제
  - `os.MkdirAll`로 서브폴더 생성 실패 시 에러 반환
- `src/filemanager_test.go` — 테스트 업데이트
  - `TestExtractArchive_ValidZip`: `destDir/test/` 하위에서 파일 확인하도록 수정
  - `TestExtractArchive_ZipSlipBlocked`: 서브폴더 경로 기준으로 탈출 방지 검증 강화
  - `TestExtractArchive_CreatesSubfolder` 신규 추가: `myarchive.zip` → `output/myarchive/` 서브폴더 생성 검증

**테스트 결과**: Go 전체 통과

## 2026-04-11 (15)

### 버그수정: F3 키로 파일 뷰어가 열리지 않는 문제

**원인**: F3 핸들러가 패널 div의 `onKeyDown`에만 등록되어 있어 포커스 위치에 따라 이벤트를 받지 못하는 경우 발생. F5/F6/F8처럼 `window` 레벨 전역 핸들러가 없었음.

- `src/frontend/src/components/Toolbar.jsx`
  - `onView` prop 추가
  - `useEffect` 전역 핸들러에 `case 'F3'` 추가 → `onView?.()` 호출
  - 의존성 배열에 `onView` 추가
- `src/frontend/src/App.jsx`
  - Toolbar에 `onView` 핸들러 전달 (활성 패널 커서 파일 뷰어로 열기)
- `src/frontend/src/components/FilePanel.jsx`
  - 패널 `onKeyDown`의 F3 케이스 제거 (전역 핸들러로 통합)
  - `onView` prop 제거 (더 이상 불필요)

**테스트 결과**: 62개 전체 통과

## 2026-04-11 (14)

### Todo #7 - F3 내장 파일 뷰어 구현

- `src/frontend/src/components/FileViewer.jsx` 신규 생성
  - 읽기 전용(read-only) 파일 뷰어 (`<pre>` 태그, 수정 불가)
  - 글자 크기 조절 버튼 (A- / A+), `MIN_FONT=10`, `MAX_FONT=28`
  - ESC 또는 F3 키로 닫기
  - 헤더에 `READ ONLY` 배지 표시
  - `isViewableFile(ext)`: 뷰어로 열 수 있는 확장자 여부 확인 (23개 텍스트 확장자)
  - `clampFontSize(current, delta)`: 글자 크기 최소/최대 범위 클램프
- `src/frontend/src/styles/FileViewer.module.css` 신규 생성
  - TextEditor와 동일한 레이아웃, 글자 크기 컨트롤 버튼 스타일 추가
- `src/frontend/src/components/FKeyBar.jsx`
  - F3 View 버튼 활성화 (`onView` prop 연결)
- `src/frontend/src/components/FilePanel.jsx`
  - `onView` prop 추가
  - `handleKeyDown` — F3 키: 커서 파일(비디렉토리)에 `onView()` 호출
- `src/frontend/src/App.jsx`
  - `FileViewer` import 및 `viewerFile` 상태 추가
  - FilePanel에 `onView={setViewerFile}` 연결
  - FKeyBar `onView` 핸들러 추가 (활성 패널 커서 파일 뷰어로 열기)
  - 뷰어 닫힐 때 `focusActivePanel()` 호출
- `src/frontend/src/components/FileViewer.test.js` 신규 생성
  - `isViewableFile` 테스트 8개 (FV-01~FV-08)
  - `clampFontSize` 테스트 5개 (FV-09~FV-13)

**테스트 결과**: 3개 파일, 62개 전체 통과

## 2026-04-11 (13)

### 테스트 추가: fileStore 동기 작업 단위 테스트

- `src/frontend/src/stores/fileStore.test.js`
  - `vi.mock('../wailsjs/runtime')` 추가 — API 없이 스토어 동기 로직 테스트 가능
  - `fileStore 동기 작업` describe 블록 신규 추가 (SS-01~SS-15, 15개)
    - toggleSelect: 추가(SS-01), 해제(SS-02), 복수 선택(SS-03)
    - selectAll: 전체 파일 선택(SS-04)
    - clearSelection: 선택 전체 해제(SS-05)
    - setCursor: 인덱스 이동(SS-06), 0으로 복귀(SS-07)
    - toggleHidden: false→true(SS-08), true→false(SS-09)
    - setSort: 이름 오름차순(SS-10), 재클릭 시 내림차순 토글(SS-11), 디렉토리 우선(SS-12)
    - delete(동기): selected 반환(SS-13), 커서 파일 반환(SS-14), 빈 목록(SS-15)

**테스트 결과**: 2개 파일, 49개 전체 통과

## 2026-04-11 (12)

### Todo #6 - 파일 목록에 [..] 추가하여 상위 폴더 이동

- `src/frontend/src/components/FilePanel.jsx`
  - `cursorOnParent` 상태 추가 (경로 변경 시 `false`로 초기화)
  - `isAtRoot` 계산: `'/'` 또는 `'^[A-Za-z]:[\\\/]?$'` 패턴이면 루트로 판단
  - `showParent = !isAtRoot`: 루트가 아닐 때 `[..]` 행 표시
  - `handleKeyDown` 수정
    - ArrowUp: 커서가 0이고 `showParent`이면 `cursorOnParent=true` + 스크롤
    - ArrowDown: `cursorOnParent`일 때 `false`로 해제 + 커서를 파일 0번으로 이동
    - Enter: `cursorOnParent`이면 `store.navigateUp(side)` 호출
  - 파일 목록 최상단에 `[..]` 행 렌더링 (`showParent` 조건부)
    - 클릭: `cursorOnParent=true`
    - 더블클릭: `store.navigateUp(side)` 호출
    - `cursorOnParent`일 때 커서 강조 스타일 적용
  - `scrollToCursor` + `scrollToParentRow` 헬퍼 추가
- `src/frontend/src/stores/fileStore.test.js`
  - `[..] 표시 로직 (isAtRoot)` 테스트 6개 추가 (PR-01~PR-06)

**테스트 결과**: 2개 파일, 34개 전체 통과

## 2026-04-11 (11)

### 버그수정: 모달 닫힌 후 방향키 미동작 (포커스 복원)

**원인**: 모달 닫힐 때 DOM에서 제거되면서 포커스가 `<body>`로 이동, FilePanel의 `onKeyDown`이 동작 안 함

- `src/frontend/src/components/FilePanel.jsx`
  - `forwardRef` + `useImperativeHandle`로 외부에서 `focus()` 호출 가능하도록 변경
- `src/frontend/src/App.jsx`
  - `leftPanelRef`, `rightPanelRef` 추가
  - `focusActivePanel()` 헬퍼 추가 (`requestAnimationFrame`으로 DOM 업데이트 후 포커스)
  - 모든 모달/다이얼로그의 `onConfirm`, `onClose` 에 `focusActivePanel()` 호출 추가
    - NewItemDialog(newdir/newfile), RenameDialog, SearchDialog, ConfirmDialog(delete), TextEditor

**테스트 결과**: 28개 통과

## 2026-04-11 (10)

### 버그수정: Windows 경로에서 읽기 오류 발생 (`/C:/...` 잘못된 경로)

**원인**: `BreadcrumbPath` 컴포넌트에서 Windows 드라이브 문자(`C:`)를 일반 세그먼트로 처리해 `/C:/github/temp` 형태의 잘못된 경로 생성

- `src/frontend/src/components/FilePanel.jsx` — `BreadcrumbPath` 수정
  - Windows 드라이브 문자(`/^[A-Za-z]:$/`) 감지 시 `acc = 'C:/'` 로 시작 (`'/C:'` 아님)
  - 이후 세그먼트는 `C:/github`, `C:/github/temp` 등으로 올바르게 누적
- `src/frontend/src/components/ConfirmDialog.jsx` — `SearchDialog.handleOpenResult` 수정
  - `file.path.lastIndexOf('/')` → `Math.max(lastIndexOf('/'), lastIndexOf('\\'))` 로 변경
  - Windows 역슬래시 경로에서도 부모 디렉토리를 올바르게 추출
- `src/frontend/src/stores/fileStore.test.js` — BreadcrumbPath 경로 구성 테스트 6개 추가 (BC-01~BC-06)

**테스트 결과**: 2개 파일, 28개 전체 통과

## 2026-04-11 (9)

### 테스트 추가: joinPath 및 rename 경로 구성 로직

- `src/frontend/src/stores/fileStore.js`
  - `joinPath` 함수에 `export` 추가 (테스트 가능하도록)
- `src/frontend/src/stores/fileStore.test.js` 신규 생성
  - `joinPath` 단위 테스트 8개 (JP-01~JP-08): Unix/Windows 경로, 후행 구분자, 루트 경로
  - `rename 경로 구성` 테스트 6개 (RP-01~RP-06): Unix/Windows 파일명·디렉토리명 교체

**테스트 결과**: 2개 파일, 22개 전체 통과

## 2026-04-11 (8)

### 버그수정: Windows에서 파일 이름 변경이 동작하지 않는 문제

**원인**: `api.JoinPath(parts ...string)` 가 Wails v2 JavaScript 바인딩에서 variadic 인자를 제대로 처리하지 못함. `rename`, `createDirectory`, `compress` 세 곳에서 동일한 문제 발생.

- `src/frontend/src/stores/fileStore.js`
  - 파일 상단에 `joinPath(base, name)` 헬퍼 함수 추가 (Windows `\` / Unix `/` 모두 처리)
  - `rename`: `api.GetParentPath` + `api.JoinPath` 제거 → JS 문자열 연산으로 대체, try/catch 추가 (에러 시 상태바에 표시)
  - `createDirectory`: `api.JoinPath` → `joinPath()` 교체, try/catch 추가
  - `compress`: `api.JoinPath` → `joinPath()` 교체, try/catch 추가
- `src/frontend/src/App.jsx`
  - `handleNewFile`: 하드코딩된 `'/'` 구분자 → 경로 기반 자동 감지 (`\` vs `/`)

**테스트 결과**: 8개 통과

## 2026-04-11 (7)

### Todo #4 - Ctrl+R 단축키로 파일 이름 바꾸기 모달

- `src/frontend/src/components/Toolbar.jsx`
  - 키보드 핸들러에 `Ctrl+R` / `Ctrl+r` 추가 → `onRename()` 호출
  - 기존 F2 단축키와 동일한 동작

**테스트 결과**: 8개 통과

## 2026-04-11 (6)

### 상단 툴바 중복 메뉴 제거 + 압축하기/압축 풀기 추가

- `src/frontend/src/components/Toolbar.jsx`
  - 하단 FKeyBar와 겹치는 버튼 제거: Rename(F2), Copy(F5), Move(F6), NewDir(F7), Delete(F8)
  - fkeyBadge 관련 코드 제거 (상단 버튼에는 F키 표시 불필요)
  - **압축하기** 버튼 추가 (Archive 아이콘)
  - **압축 풀기** 버튼 추가 (PackageOpen 아이콘)
  - 키보드 단축키(F2/F5~F8)는 계속 동작하도록 useEffect 유지
- `src/frontend/src/App.jsx`
  - `handleCompress`: 활성 패널의 선택 파일을 압축
  - `handleExtract`: 커서 위치 파일을 현재 패널 경로에 압축 해제
  - Toolbar props 업데이트 (겹치는 핸들러 제거, compress/extract 추가)

**테스트 결과**: 8개 통과

## 2026-04-11 (5)

### Todo #3 - Total Commander 스타일 메뉴 레이아웃

- `src/frontend/src/components/FKeyBar.jsx` 신규 생성
  - F1~F10 전체 키 표시 (F1 Help, F2 Rename, F3 View, F4 Edit, F5 Copy, F6 Move, F7 NewDir, F8 Delete, F9 Menu, F10 Quit)
  - 미구현 키(F3 View, F4 Edit, F9 Menu, F10 Quit)는 비활성(opacity) 처리
  - 위험 동작(F8 Delete)은 별도 danger 스타일
- `src/frontend/src/styles/FKeyBar.module.css` 신규 생성
  - TC 스타일: 전체 너비, 각 키가 flex:1 균등 분할, 번호/레이블 구분
- `src/frontend/src/App.jsx`
  - FKeyBar 컴포넌트 import 및 StatusBar 아래에 배치
- `src/frontend/src/components/Toolbar.jsx`
  - 상단 툴바에서 fkeys 스트립 블록 완전 제거
  - 불필요했던 TOOL_BUTTONS 배열 제거
  - Zip 버튼 제거 (require() ESM 불호환 코드)
  - F2 단축키 핸들러 추가 (기존 F5~F8 유지)
- `src/frontend/src/styles/Toolbar.module.css`
  - fkeys 관련 스타일 전체 제거

**테스트 결과**: JS 8개, Go 전체 통과

## 2026-04-11 (4)

### 버그수정: Windows에서 Eye 버튼 클릭해도 dot 파일이 숨겨지지 않던 문제

- `src/filemanager.go` — `isHiddenFile()` 수정
  - 기존: Windows에서 항상 `false` 반환 (`.`으로 시작하는 파일을 hidden 처리 안 함)
  - 변경: OS와 무관하게 이름이 `.`으로 시작하면 `true` 반환
- `src/filemanager_test.go` — `TestIsHiddenFile` 테스트 수정
  - Windows 분기(항상 false 기대) 제거
  - 모든 플랫폼에서 dot-prefix 파일이 hidden 처리되는지 검증하도록 변경

**Go 테스트 결과**: 전체 통과

## 2026-04-11 (3)

### 눈 아이콘으로 숨김 파일 토글 버튼 교체

- `src/frontend/src/components/FilePanel.jsx`
  - `Eye`, `EyeOff` 아이콘 import 추가 (lucide-react)
  - 각 패널 헤더의 `.` 텍스트 버튼 → `<Eye>` / `<EyeOff>` 아이콘 버튼으로 교체
  - 숨김 표시 중일 때 `EyeOff`, 숨김 처리 중일 때 `Eye` 아이콘 표시
  - tooltip도 현재 상태에 맞게 동적 변경 ("Show dotfiles" / "Hide dotfiles")
- 기존 Ctrl+H 단축키 및 `toggleHidden` 동작 유지

**테스트 결과**: 8개 통과

## 2026-04-11 (2)

### Todo #1 - Light Theme 구현 (관리자/기획/디자인/개발/검증 에이전트 협업)

**기획**: CSS 변수 기반 테마 시스템 분석 → data-theme 방식 + Zustand store + localStorage 영속성으로 방향 결정

**디자인**: 라이트 테마 색상값 설계 (흰색~회백색 배경, 진한 남색 텍스트, 파란 액센트 유지), 변수 누락/하드코딩 위치 파악

**개발**:
- `src/frontend/src/stores/themeStore.js` 신규 생성
  - dark/light 토글, localStorage 저장/복원, 유효하지 않은 값 방어
- `src/frontend/src/stores/themeStore.test.js` 신규 생성 (TDD, 8개 테스트 전체 통과)
- `src/frontend/src/styles/global.css`
  - `--bg-editor`, `--text-accent-hover`, `--scrollbar-thumb` 등 신규 변수 추가
  - `[data-theme="light"]` 블록 추가 (배경/텍스트/경계선/그림자 전체 오버라이드)
  - 스크롤바 하드코딩 색상 → CSS 변수로 교체
- `src/frontend/src/styles/FilePanel.module.css` - `#7ab8ff` → `var(--text-accent-hover)`
- `src/frontend/src/styles/TextEditor.module.css` - `#0a0a10` 2곳 → `var(--bg-editor)`
- `src/frontend/src/App.jsx` - `useThemeStore` import, 최상위 div에 `data-theme={theme}` 바인딩
- `src/frontend/src/components/Toolbar.jsx` - Sun/Moon 아이콘 테마 토글 버튼 추가
- `src/frontend/src/styles/Toolbar.module.css` - `.themeBtn` 스타일 추가, 호버 색상 변수화
- `src/frontend/vite.config.js` - vitest 테스트 환경 설정 (jsdom)
- `src/frontend/package.json` - vitest, @testing-library/react, jsdom 개발 의존성 추가

**검증**: 8개 테스트 전체 통과, T-02(localStorage 복원) 테스트 누락 발견 후 추가 완료

## 2026-04-11

### TDD 테스트 코드 추가
- `src/filemanager_test.go` 신규 작성
  - ListDirectory: 디렉토리 우선 정렬, 알파벳 순, 빈 디렉토리, 잘못된 경로, 확장자 소문자, 숨김 파일(Linux)
  - CopyItems: 단일 파일, 디렉토리 재귀, 누락 소스, 빈 목록
  - MoveItems: 파일 이동 후 원본 삭제, 누락 소스
  - DeleteItems: 파일, 디렉토리 재귀, 이미 없는 경로, 빈 목록
  - CreateDirectory: 중첩 경로, 이미 존재
  - CreateFile: 신규 생성
  - RenameItem: 이름 변경
  - ReadTextFile / WriteTextFile: 왕복 검증 (한글, 이모지 포함), 파일 없음
  - SearchFiles: 대소문자 무시, 재귀/비재귀
  - CompressItems: 단일 파일, .zip 자동 추가, 중복 .zip 방지
  - ExtractArchive: 정상 압축 해제, zip slip 공격 차단, 잘못된 zip
  - GetPathParts: Windows/Linux 경로 분기
  - isHiddenFile: OS별 동작
  - JoinPath / GetParentPath / GetFileSize
- `src/ftpmanager_test.go` 신규 작성
  - SaveBookmark: 신규, 자동 ID, 업데이트, 복수 저장, 타임스탬프
  - DeleteBookmark: 존재, 없는 ID, 빈 목록
  - 북마크 파일 퍼시스턴스: 저장, 로드, 삭제 후 파일 반영
  - GetConnections: 빈 목록, 스레드 안전성
  - getConn: 없는 연결 ID 에러

**테스트 결과**: 49개 통과, 3개 skip (플랫폼 차이 - Linux 전용 테스트)

### Go + React 기반으로 프로젝트 전면 재구성
- Python(tkinter) 구현 제거, Wails v2(Go + React) 스택으로 전환
- 이중 패널 파일 관리자, FTP 클라이언트, 내장 텍스트 에디터 구현
- .gitignore 추가
- CLAUDE.md 작업 규칙 문서 추가
- README.md 한글로 작성
