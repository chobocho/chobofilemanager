# 변경 이력

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
