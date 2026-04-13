# 변경 이력

## 2026-04-14 (50)

### #50 파일 검색 쉼표 AND 연산 지원

#### 변경 파일
- `src/filemanager.go`
  - `SearchFiles()`: 쉼표로 구분된 키워드를 모두 포함해야 하는 AND 검색으로 변경
  - 예) `우리,나라` → 파일명에 "우리"와 "나라"가 모두 포함된 파일만 반환
  - 앞뒤 공백 trim 처리 포함
- `src/frontend/src/components/ConfirmDialog.jsx`
  - SearchDialog placeholder에 AND 검색 사용법 안내 추가

---

## 2026-04-13 (49)

### #49 F9 키로 CMD 창 열기

#### 변경 파일
- `src/filemanager.go`
  - `OpenCmdWindow(workDir string) error` 추가: Windows에서 `cmd /c start cmd.exe` 실행, 현재 패널 경로를 작업 디렉터리로 설정
- `src/app.go`
  - `OpenCmdWindow` API 메서드 추가
- `src/frontend/src/App.jsx`
  - F9 키 전역 핸들러 추가: 활성 패널 경로에서 CMD 창 실행
  - FKeyBar에 `onCmd` prop 전달
- `src/frontend/src/components/FKeyBar.jsx`
  - `onCmd` prop 추가, F9: CMD 버튼 표시
- `src/frontend/src/wailsjs/runtime.js`
  - 브라우저 개발 모드 목 API에 `OpenCmdWindow` 추가

---

## 2026-04-12 (48)

### #48 F6 이동 충돌 처리 (덮어쓰기 / 이름 바꾸어 이동 / 취소)

#### 변경 파일
- `src/filemanager.go`
  - `moveOne()` 헬퍼 추출 (same-FS rename + cross-device copy-delete 통합)
  - `MoveItemsOverwrite()`: 대상 파일을 삭제한 후 이동 (덮어쓰기)
  - `MoveItemsRename()`: `(2)`, `(3)` ... 접미사로 자동 이름 변경 후 이동
- `src/app.go`: `MoveItemsOverwrite`, `MoveItemsRename` 메서드 추가
- `frontend/wailsjs/go/main/App.js` / `App.d.ts`: 바인딩 추가
- `frontend/src/stores/fileStore.js`
  - `move()`: 이동 전 `CheckCopyConflicts`로 충돌 감지, 충돌 시 `{ conflicts, sources, dest }` 반환
  - `moveWithMode(sources, dest, mode)`: overwrite / rename 모드별 실행
- `frontend/src/components/MoveConflictDialog.jsx`: 이동 충돌 팝업 (덮어쓰기 / 이름 바꾸어 이동 / 취소)
- `frontend/src/App.jsx`
  - `moveConflict` 상태, `handleMove`, `handleMoveConflictConfirm` 추가
  - `onMove` → `handleMove` 변경 (Toolbar, FKeyBar 모두)
  - `MoveConflictDialog` 렌더링 추가

## 2026-04-12 (47)

### #47 뷰어/에디터 Ctrl+F가 부모 파일 검색으로 연결되는 버그 수정

#### 원인
- Toolbar의 `window.addEventListener('keydown', handler)` (버블 페이즈)와
  TextEditor/FileViewer의 `window.addEventListener('keydown', handler)` (버블 페이즈)가
  모두 같은 이벤트를 받아 두 핸들러가 동시에 실행됨

#### 해결
- TextEditor, FileViewer의 `window.addEventListener`를 **캡처 페이즈** (`{ capture: true }`)로 변경
  - 캡처 페이즈는 버블 페이즈보다 먼저 실행 → 뷰어/에디터 핸들러가 Toolbar보다 먼저 동작
- `Ctrl+F`, `Ctrl+S`, `Escape`, `F3` 처리 시 `e.stopPropagation()` 추가
  - Toolbar의 버블 핸들러로 이벤트가 전달되지 않음
- 로딩 완료 후 `textareaRef.current?.focus()` 자동 포커스
  - 뷰어/에디터 열릴 때 키보드 포커스가 자동으로 내부로 이동

## 2026-04-12 (46)

### #46 내장 에디터 및 파일 뷰어 검색 기능 추가

#### 기능
- `Ctrl+F`: 검색 바 열기 (헤더 우측 돋보기 버튼 또는 단축키)
- `Enter`: 다음 일치 항목으로 이동 (끝에 도달하면 처음으로 wrap)
- `Shift+Enter`: 이전 일치 항목으로 이동 (처음에 도달하면 끝으로 wrap)
- `Esc`: 검색 바 닫기 (에디터 종료 전에 검색 바 먼저 닫음)
- 대소문자 구분 없는 검색 (toLowerCase 비교)
- 검색 결과 없을 때 입력창 빨간 테두리 600ms 표시 (ssMemo showMiss 패턴)
- 일치 항목을 뷰포트 상단 1/3 위치로 스크롤 (ssMemo scrollToIndex 패턴)

#### 변경 파일
- `src/frontend/src/components/TextEditor.jsx`
  - `Search, ChevronUp, ChevronDown` 아이콘 추가
  - `searchOpen`, `searchQuery`, `noMatch` 상태 추가
  - `findNext`, `findPrev`, `scrollToMatch`, `showNoMatch`, `handleSearchKeyDown` 콜백 추가
  - 검색 바 UI (헤더 아래)
  - 헤더에 검색 토글 버튼 추가

- `src/frontend/src/components/FileViewer.jsx`
  - `<pre>` → `<textarea readOnly>`로 교체 (setSelectionRange 검색 하이라이팅 지원)
  - TextEditor와 동일한 검색 로직 추가

- `src/frontend/src/styles/TextEditor.module.css`
  - `.searchBar`, `.searchInput`, `.searchNoMatch`, `.searchBtn`, `.searchBtnClose`, `.btnSearch` 스타일 추가

- `src/frontend/src/styles/FileViewer.module.css`
  - 동일 검색 스타일 추가
  - `.pre`에 textarea 호환 속성 추가 (`border: none`, `resize: none`, `cursor: text`)

## 2026-04-12 (45)

### #45 내장 에디터 및 파일 뷰어 성능 개선 (ssMemo 패턴 참조)

#### 문제점
- **스크롤 동기화 버그**: 라인 번호 패널이 텍스트 스크롤을 따라가지 않음
- **DOM 폭발**: 모든 라인 번호를 한 번에 DOM에 생성 (10만 줄 파일 → 10만 개 DOM 노드)
- **매 렌더 시 재계산**: `content.split('\n').length`가 렌더링마다 실행됨

#### 개선 내용 (`src/frontend/src/components/TextEditor.jsx`)
- **스크롤 동기화** (`handleScroll`): `textarea.onscroll` → `lineNumbers.scrollTop` 동기화 (ssMemo `notepad.js` 패턴 차용)
- **가상 라인 번호 렌더링**: 뷰포트에 보이는 줄 ± 버퍼(10줄)만 DOM에 렌더링, 위아래 스페이서(div)로 전체 높이 유지
- **`useMemo`로 lineCount 최적화**: 내용 변경 시에만 `split('\n')` 재계산
- **`useCallback`으로 핸들러 안정화**: `handleSave`, `handleScroll`, `handleCursorChange`, `handleKeyDown`

#### 개선 내용 (`src/frontend/src/components/FileViewer.jsx`)
- **스크롤 동기화** (`handleScroll`): `pre.onscroll` → `lineNumbers.scrollTop` 동기화
- **가상 라인 번호 렌더링**: `fontSize` 기반 동적 `lineHeight`(fontSize+7)로 계산
- **폰트 크기 변경 시 스크롤 초기화**: `fontSize` 변경 시 두 패널 모두 스크롤 위치 리셋
- **`useMemo`로 lineCount 최적화**

#### 개선 내용 (`src/frontend/src/styles/TextEditor.module.css`, `FileViewer.module.css`)
- `.body`에 `contain: strict` 추가 — 브라우저 레이아웃 계산 범위를 컨테이너 내부로 제한

## 2026-04-11 (44)

### #31 FILE 패널 파일 북마크 기능 추가

- `src/filebookmarks.go`
  - `FileBookmark` 구조체에 `IsFile bool` 필드 추가
  - `AddFileBookmark`: `os.Stat`으로 파일/폴더 자동 판별해 `IsFile` 설정

- `src/frontend/src/stores/fileStore.js`
  - `navigateToBookmark(panel, bm)` 액션 추가
    - `bm.isFile=true`: 부모 디렉토리로 이동 후 해당 파일에 커서 이동
    - `bm.isFile=false`: 해당 폴더로 바로 이동

- `src/frontend/src/components/BookmarkDialog.jsx`
  - "현재 폴더 추가" 버튼 항상 표시
  - 커서가 파일(비디렉토리)에 있을 때 "현재 파일 추가" 버튼 추가 표시
  - 북마크 아이템 아이콘: 폴더는 FolderOpen(노란색), 파일은 FileText(파란색)
  - 클릭 시 `navigateToBookmark` 호출

- `src/frontend/src/styles/BookmarkDialog.module.css`
  - `.addButtons` 컨테이너 클래스 추가
  - `.fileIcon` 색상 클래스 추가

## 2026-04-11 (43)

### #30 FTP 접속 이력 자동 저장 및 관리

- `src/ftpmanager.go`
  - `FTPHistory` 구조체 추가: ID(host:port:user), Host, Port, Username, LastConnected, ConnectCount
  - `FTPManager`에 `history`, `historyFile` 필드 추가
  - `AddHistory(config)`: 접속 성공 시 자동 저장, host:port:username 기준 중복 시 LastConnected 갱신, 최대 50개 유지
  - `GetHistory()`, `DeleteHistory(id)`, `ClearHistory()` 메서드 추가
  - `loadHistory()` / `saveHistory()` — `~/.chobocho-commander/ftp_history.json`에 저장
- `src/app.go`
  - `FTPGetHistory`, `FTPDeleteHistory`, `FTPClearHistory`, `FTPAddHistory` API 추가
- `src/frontend/src/wailsjs/runtime.js`
  - 위 4개 API 목 함수 추가
- `src/frontend/src/stores/ftpStore.js`
  - `history: []` 상태 추가
  - `loadHistory`, `addHistory`, `deleteHistory`, `clearHistory` 액션 추가
- `src/frontend/src/components/FTPManager.jsx`
  - 연결 성공 시 `ftpStore.addHistory(config)` 자동 호출
  - 북마크 패널에 "최근 접속" 섹션 추가: 이력 목록 표시, 클릭 시 ConnectModal 미리 채움, 개별/전체 삭제
  - `ConnectModal`에 `prefill` prop 추가 — 이력 클릭 시 host/port/username 자동 입력
- `src/frontend/src/styles/FTPManager.module.css`
  - `.sectionLabel`, `.clearHistoryBtn` 클래스 추가

## 2026-04-11 (42)

### #29 FTP 뷰 UX를 File View와 통일

- `src/frontend/src/components/FTPManager.jsx`
  - `FileListPanel` 공유 서브컴포넌트 추출: 로컬 패널과 FTP 패널이 동일한 렌더링 코드 사용
  - 파일 아이콘: 이모지(📁📄) → lucide 아이콘 + 색상 (FilePanel 동일 아이콘 맵 적용)
  - 날짜 형식: `toLocaleDateString()` → `YYYY-MM-DD HH:MM` (FilePanel과 동일)
  - 컬럼 구조: Name·Size·Modified(3) → Name·Size·Modified·Ext(4)
  - `[..]` 부모 행 추가: 로컬·FTP 양쪽 모두 상위 폴더 이동 가능
  - 키보드 내비게이션 추가: `tabIndex={0}` + ArrowUp/Down·Enter·Backspace·Space(선택)
  - 커서 상태 (`cursor`, `cursorOnParent`) 로컬·FTP 각각 관리
  - FTP 선택 변수명 `selected` → `ftpSelected` (충돌 방지)
- `src/frontend/src/styles/FTPManager.module.css`
  - `.fileListPanel` 클래스 추가 (파일 패널 공통 스타일)
  - `.cursor` 클래스 추가 (키보드 커서 하이라이트)
  - `.colName/.colSize/.colDate/.colExt` 컬럼 클래스 추가 (FilePanel 레이아웃 통일)
  - 날짜 컬럼 너비 140px → 130px (YYYY-MM-DD HH:MM 포맷에 맞춤)

## 2026-04-11 (41)

### #28 보완: 포커스 후 방향키 미작동 수정

- `src/frontend/src/components/FilePanel.jsx`
  - 패널 div에 `onFocus={handleActivate}` 추가
    - 프로그래밍 방식 `focus()` 포함, 포커스를 받을 때마다 `store.setActivePanel` 호출
    - 이전: 클릭 시에만 `setActivePanel` 호출 → 초기 포커스 시 `isActive`가 반영 안 됨
  - `handleKeyDown`에 `INPUT/TEXTAREA/SELECT` 가드 추가: 경로 편집 중 방향키 등 오동작 방지

## 2026-04-11 (40)

### #28 시작 시 좌측 패널 자동 포커스

- `src/frontend/src/App.jsx`
  - `useEffect` 수정: `init()` + `loadBkmarks()` 완료 후 `leftPanelRef.current.focus()` 호출
  - `requestAnimationFrame`으로 DOM 업데이트 이후 포커스 적용

## 2026-04-11 (39)

### #27 도움말 업데이트

- `src/frontend/src/components/HelpDialog.jsx`
  - Ctrl+R 설명 수정: 이름 바꾸기 → 새로고침 (실제 동작과 일치하도록)
  - **탭** 섹션 신규 추가: Ctrl+T(새 탭), Ctrl+W(탭 닫기), Ctrl+Tab(다음 탭), Ctrl+Shift+Tab(이전 탭)
  - **파일 조작** 추가: F8/Delete(삭제), Ctrl+Shift+C(경로 복사)
  - **탐색 및 선택** 추가: Insert(선택 후 이동), Ctrl+A(전체 선택)
  - **기타** 추가: Ctrl+H(숨김 토글), 눈 아이콘 항목 제거(Ctrl+H로 통합)
  - PgUp/PgDn, Home/End 항목 제거 (현재 미구현)
- `src/frontend/src/components/Toolbar.jsx`
  - Ctrl+R 글로벌 핸들러에서 rename 호출 제거 (FilePanel의 refresh와 충돌 방지)
  - 이름 바꾸기는 F2 단독 사용

## 2026-04-11 (38)

### #26 Ctrl+Tab 시 포커스 패널의 탭만 전환

- `src/frontend/src/components/Toolbar.jsx`
  - 글로벌 `keydown` 핸들러의 `Tab` 케이스 수정: `!e.ctrlKey`일 때만 `onSwitchPanel` 호출
  - 이전에는 Ctrl+Tab도 `onSwitchPanel()`을 실행해 패널 포커스까지 전환됐음
  - 이제 Ctrl+Tab은 FilePanel의 `handleKeyDown`에서만 처리(탭 전환), 패널 전환 없음
  - 단순 Tab 키는 기존대로 패널 포커스 전환

## 2026-04-11 (37)

### #25 파일 작업 후 영향 받는 경로의 탭 리프레시

- `src/frontend/src/stores/fileStore.js`
  - `parentDir(path)`: 경로에서 부모 디렉토리 반환 헬퍼 추가
  - `_refreshAffected(dirs)`: 영향 받은 디렉토리를 표시 중인 양쪽 패널의 활성 탭을 동시 리프레시
  - `confirmDelete`: 삭제된 파일들의 부모 디렉토리들을 `_refreshAffected`로 처리
  - `copy` / `copyWithMode`: 복사 대상 디렉토리를 `_refreshAffected`로 처리
  - `move`: 소스 파일들의 부모 디렉토리 + 대상 디렉토리 모두 처리
  - `rename`: 이름 변경된 파일의 부모 디렉토리 처리
  - `writeFile`: 에디터 저장 후 해당 파일의 부모 디렉토리 처리

## 2026-04-11 (36)

### #24 [..] 선택 시 첫 번째 파일도 함께 강조되는 버그 수정

- `src/frontend/src/components/FilePanel.jsx`
  - 파일 행 커서 조건: `isActive && isCursor` → `isActive && isCursor && !cursorOnParent`
  - `cursorOnParent=true`일 때 `panel.cursor`가 0이어도 첫 번째 파일에 커서 클래스가 적용되지 않음

## 2026-04-11 (35)

### #23 비활성 패널 커서 숨기기

- `src/frontend/src/components/FilePanel.jsx`
  - `[..]` 행: `cursorOnParent ? styles.cursor` → `isActive && cursorOnParent ? styles.cursor`
  - 파일 행: `isCursor ? styles.cursor` → `isActive && isCursor ? styles.cursor`
  - 포커스가 없는 패널에서는 커서 하이라이트가 표시되지 않음

## 2026-04-11 (34)

### #22 Ctrl+Alt+C 절대 경로 클립보드 복사

- `src/frontend/src/components/FilePanel.jsx`
  - `handleKeyDown`에 `Ctrl+Alt+C` 처리 추가
  - 커서가 파일/폴더에 있으면 해당 절대 경로, `[..]`에 있으면 현재 패널 경로 복사
  - `navigator.clipboard.writeText()` 사용, 성공/실패 시 상태바 메시지 표시
  - `useCallback` 의존성 배열에 `panel.path` 추가

## 2026-04-11 (33)

### #21 내장 뷰어/에디터 3MB 초과 파일 차단

- `src/frontend/src/App.jsx`
  - `MAX_FILE_SIZE = 3 * 1024 * 1024` 상수 추가
  - `fileSizeError` state 추가 (초과 파일명 보관)
  - `tryOpenViewer(file)` / `tryOpenEditor(file)` 헬퍼: 크기 초과 시 경고 모달, 정상이면 뷰어/에디터 오픈
  - Toolbar, FKeyBar의 onView/onEdit, FilePanel의 onEdit 모두 헬퍼로 교체
  - 크기 초과 시 `ConfirmDialog`로 안내 메시지 표시
- `src/frontend/src/components/FilePanel.jsx`
  - `handleRowDoubleClick`: `onEdit(file.path)` → `onEdit(file)` (파일 객체 전달로 크기 정보 포함)

## 2026-04-11 (32)

### #20 Windows 경로 구분자 수정 (유닉스 스타일 → 역슬래시)

- `src/frontend/src/components/FilePanel.jsx` — `BreadcrumbPath`
  - `isWindows` 감지: 경로에 `\` 포함 또는 드라이브 문자(`C:`) 패턴
  - `sep = isWindows ? '\\' : '/'` 로 OS별 구분자 분기
  - 브레드크럼 클릭 시 `navigate`에 전달되는 경로가 Windows에서 역슬래시 사용
- `src/frontend/src/stores/fileStore.js` — `navigate`
  - history에 입력 경로(`path`) 대신 `result.path`(Go가 정규화한 경로) 저장
  - 이후 `navigateBack`/`navigateForward`도 항상 OS 정규화된 경로 사용
- `src/frontend/src/stores/fileStore.test.js`
  - `buildBreadcrumbParts` 헬퍼를 새 로직으로 동기화
  - BC-03~BC-06: Windows 경로 기대값을 역슬래시(`\`)로 수정

## 2026-04-11 (31)

### #19 내장 편집기 ESC 시 저장 확인 팝업

- `src/frontend/src/components/TextEditor.jsx`
  - `confirmClose` state 추가
  - ESC 핸들러: `isDirty`이면 `setConfirmClose(true)`, 아니면 즉시 닫기
  - `handleSaveAndClose`: 저장 후 닫기
  - 인라인 확인 다이얼로그 렌더링 (저장 / 저장 안 함 / 취소)
- `src/frontend/src/styles/TextEditor.module.css`
  - `.confirmOverlay`, `.confirmDialog`, `.confirmTitle`, `.confirmMsg`, `.confirmActions` 추가
  - 버튼 스타일: `.btnSaveConfirm` / `.btnDiscard` / `.btnCancel`

## 2026-04-11 (30)

### #17/#18 모든 탭 세션 저장 및 복원

- `src/settings.go`
  - `PanelTabsState` 구조체 추가 (`Paths []string`, `ActiveIdx int`)
  - `AppSettings`에 `LeftTabs`, `RightTabs` 필드 추가 (이전 버전 호환 유지)
  - `SaveSessionState(leftTabs, leftActiveIdx, rightTabs, rightActiveIdx)` 추가
  - `filterValidPaths`: 존재하지 않는 경로 자동 필터링
  - `LoadPanelPaths`: 각 탭 경로 검증, 모두 무효인 경우 빈 슬라이스 반환
- `src/frontend/src/stores/fileStore.js`
  - `_restorePanel`: 저장된 탭 목록으로 패널 복원 (비활성 탭은 lazy 로딩)
  - `init`: `_restorePanel` 사용으로 탭 복원 지원
  - `_saveSession`: 양쪽 패널 전체 탭 경로를 `SaveSessionState`로 저장
  - `navigate` / `closeTab` / `switchTab`에서 `_saveSession` 호출
- `src/frontend/src/wailsjs/runtime.js`: `SaveSessionState` mock 추가
- `src/filemanager_test.go`
  - `TestSaveSessionState_MultipleTabs`: 다중 탭 저장/복원 검증
  - `TestSaveSessionState_InvalidTabPathsFiltered`: 무효 경로 필터링 검증
  - `TestSaveSessionState_ActiveIdxClamped`: 범위 초과 인덱스 클램핑 검증

## 2026-04-11 (29)

### OpenFile: 실행 파일의 작업 폴더를 파일 위치로 설정

- `src/filemanager.go`
  - `OpenFile`: Windows에서 `explorer path` → `cmd /c start "" path` 로 변경
  - `cmd.Dir = filepath.Dir(path)` 추가 → 실행된 앱의 작업 폴더가 해당 파일이 있는 폴더로 설정됨
  - Total Commander와 동일한 동작 (파일 위치 = 작업 폴더)

## 2026-04-11 (28)

### #16 폴더 이동 시 프로세스 작업 폴더 동기화

- `src/filemanager.go`
  - `ChangeWorkingDirectory(path string) error` 추가: `os.Chdir(path)` 호출
- `src/app.go`
  - `ChangeWorkingDirectory` Wails API 노출
- `src/frontend/src/wailsjs/runtime.js`
  - 브라우저 개발용 mock에 `ChangeWorkingDirectory` 추가
- `src/frontend/src/stores/fileStore.js`
  - `navigate`: 활성 패널이 이동한 경우 `api.ChangeWorkingDirectory` 호출
  - `setActivePanel`: 패널 전환 시 해당 패널의 현재 경로로 작업 폴더 변경
- `src/filemanager_test.go`
  - `TestChangeWorkingDirectory_ValidPath`: 유효 경로로 작업 폴더 변경 확인
  - `TestChangeWorkingDirectory_InvalidPath`: 존재하지 않는 경로에서 에러 반환 확인

## 2026-04-11 (27)

### F5 복사 충돌 처리 다이얼로그

- `src/filemanager.go`
  - `CopyConflict` 구조체 추가 (Name, SourcePath, DestPath)
  - `CheckCopyConflicts(sources, dest)`: 대상 폴더에 이미 존재하는 파일 목록 반환
  - `CopyItemsRename(sources, dest)`: 충돌 시 `이름 (1).ext` 형식으로 자동 이름 변경 복사
  - `CopyItemsSkipConflicts(sources, dest)`: 충돌 파일 건너뛰고 나머지만 복사

- `src/app.go`: 세 신규 API 프록시 메서드 추가

- `src/frontend/src/stores/fileStore.js`
  - `copy()`: 충돌 감지 후 있으면 `{ conflicts, sources, dest }` 반환 (충돌 없으면 즉시 복사)
  - `copyWithMode(sources, dest, mode)`: mode = 'overwrite' | 'rename' | 'skip'

- `src/frontend/src/components/CopyConflictDialog.jsx` 신규 생성
  - 충돌 파일 목록 표시
  - 버튼: 덮어쓰기 / 이름 바꾸어 복사 / 건너뛰기 / 취소

- `src/frontend/src/styles/CopyConflictDialog.module.css` 신규 생성

- `src/frontend/src/App.jsx`
  - `copyConflict` 상태 추가
  - `handleCopy()`: copy() 결과에 충돌이 있으면 CopyConflictDialog 표시
  - `handleCopyConflictConfirm(mode)`: 선택한 모드로 copyWithMode() 호출
  - Toolbar, FKeyBar의 onCopy → handleCopy로 교체
  - CopyConflictDialog 렌더링 추가

- `src/frontend/src/components/FilePanel.jsx`
  - F5/F6 직접 처리 제거 (Toolbar 전역 핸들러에 일임)

**테스트 결과**: Go 전체 통과, Vite 빌드 성공

## 2026-04-11 (26)

### F4 키 내장 에디터 연결

- `src/frontend/src/components/FKeyBar.jsx`: `onEdit` prop 추가, F4 버튼 활성화
- `src/frontend/src/components/Toolbar.jsx`: `onEdit` prop 추가, 전역 keydown에 `F4` → `onEdit?.()` 추가
- `src/frontend/src/App.jsx`:
  - Toolbar와 FKeyBar 양쪽에 `onEdit` �핸들러 추가
  - 활성 패널의 커서 위치 파일을 `setEditorFile`로 연결 (디렉토리/[..] 제외)
- `src/frontend/src/components/HelpDialog.jsx`: F4 항목 추가

**테스트 결과**: Vite 빌드 성공

## 2026-04-11 (25)

### 멀티 탭 지원 (Total Commander 스타일)

- `src/frontend/src/stores/fileStore.js`
  - `createTabState(path)` 헬퍼 추가: 탭별 저장 상태 (path, cursor, showHidden, selected, history, sortBy, sortDir)
  - `createPanelState`에 `tabs: [createTabState('')]`, `activeTabIdx: 0` 추가
  - `_saveCurrentTab(panel)`: 현재 패널 라이브 상태를 `tabs[activeTabIdx]`에 저장하는 내부 헬퍼
  - `newTab(panel)`: 현재 경로로 새 탭 생성, 탭 배열 끝에 추가 후 전환
  - `closeTab(panel, idx)`: 탭 닫기 (마지막 탭은 닫기 불가), 인접 탭으로 자동 전환
  - `switchTab(panel, idx)`: 현재 탭 상태 저장 → 목표 탭 상태 복원 → 디렉토리 재조회

- `src/frontend/src/components/FilePanel.jsx`
  - `Plus`, `X as XIcon` import 추가
  - `TabBar` 컴포넌트 추가: 탭 목록 + 활성 탭 하이라이트 + ×(닫기) 버튼 + +(추가) 버튼
  - 패널 최상단에 `<TabBar>` 렌더링
  - `handleKeyDown`에 단축키 추가:
    - `Ctrl+T`: 새 탭
    - `Ctrl+W`: 현재 탭 닫기
    - `Ctrl+Tab`: 다음 탭
    - `Ctrl+Shift+Tab`: 이전 탭

- `src/frontend/src/styles/FilePanel.module.css`
  - `.tabBar`, `.tab`, `.tabActive`, `.tabLabel`, `.tabClose`, `.tabAdd` 스타일 추가
  - 활성 탭: 하단 accent 색상 border + 배경 패널 색상으로 구분
  - × 버튼: hover 시에만 표시, 호버 시 빨간색 강조

**테스트 결과**: Vite 빌드 성공

## 2026-04-11 (24)

### Ctrl+F 파일 검색 단축키 연결

- SearchDialog는 이미 `src/frontend/src/components/ConfirmDialog.jsx`에 구현되어 있었음
  - 현재 패널 경로 기준 파일명 패턴 검색 (대소문자 무시)
  - 하위 폴더 포함 여부 체크박스
  - 결과 클릭 시 해당 폴더로 이동
- `src/frontend/src/components/Toolbar.jsx`
  - 전역 keydown 핸들러에 `Ctrl+F` → `onSearch?.()` 추가
  - 의존성 배열에 `onSearch` 추가

**테스트 결과**: Vite 빌드 성공

## 2026-04-11 (23)

### F1 도움말 화면 구현

- `src/frontend/src/components/HelpDialog.jsx` 신규 생성
  - 4개 섹션: 파일 조작 / 탐색 및 선택 / 압축 / 기타
  - 모든 단축키를 `<kbd>` 스타일 태그로 표시
  - ESC 또는 F1 키로 닫기
  - 오버레이 클릭으로 닫기
- `src/frontend/src/styles/HelpDialog.module.css` 신규 생성
  - 섹션별 구분선, kbd 스타일 키 표시
- `src/frontend/src/components/Toolbar.jsx`
  - `onHelp` prop 추가
  - 전역 keydown 핸들러에 `F1` → `onHelp?.()` 추가
- `src/frontend/src/App.jsx`
  - `HelpDialog` import 추가
  - Toolbar에 `onHelp={() => setModal('help')}` 연결
  - `modal === 'help'` 조건으로 HelpDialog 렌더링

**테스트 결과**: Vite 빌드 성공

## 2026-04-11 (22)

### 테스트 격리 수정 - 실제 사용자 config 디렉토리 오염 방지

**문제**: Go 테스트 실행 후 앱 재시작 시 임시 경로가 `~/.chobocho-commander/settings.json`에 저장되어
존재하지 않는 경로로 이동 시도 → `⚠ cannot read directory` 오류 발생

**수정 내용**:
- `src/app.go`: `App` 구조체에 `configDir string` 필드 추가
  - 빈 문자열이면 기본값(`~/.chobocho-commander`) 사용
  - 테스트에서 `t.TempDir()` 주입으로 격리 가능
- `src/settings.go`:
  - `settingsFilePath()` 패키지 함수 → `(a *App) settingsFilePath()` 메서드로 변경
  - `resolvedConfigDir()` 헬퍼 메서드 추가 (`a.configDir` 우선, 없으면 `~/.chobocho-commander`)
- `src/filebookmarks.go`:
  - `fileBookmarksPath()`, `loadFileBookmarks()`, `saveFileBookmarks()` 모두 `App` 메서드로 변경
  - `resolvedConfigDir()` 통해 테스트 격리 지원
- `src/filemanager_test.go`:
  - `newTestApp(t)` 헬퍼 함수 구현: `configDir: t.TempDir()` 설정
  - `TestSavePanelPaths_AndLoad`, `TestLoadPanelPaths_*`, `TestFileBookmark_*` 모두 `newTestApp(t)` 사용
  - `TestLoadPanelPaths_NoFileReturnsEmpty`: `settingsFilePath()` → `a.settingsFilePath()` 사용

**테스트 결과**: Go 전체 통과 (모든 테스트 격리됨)

## 2026-04-11 (21)

### Ctrl+D 바로가기 목록 (추가/삭제/이동)

- `src/filebookmarks.go` 신규 생성
  - `FileBookmark` 구조체: ID, Name, Path, Created
  - `~/.chobocho-commander/file_bookmarks.json`에 저장
  - `GetFileBookmarks()`: 전체 목록 반환
  - `AddFileBookmark(name, path)`: 경로 존재 여부 검증 후 추가
  - `DeleteFileBookmark(id)`: ID로 삭제
- `src/frontend/src/components/BookmarkDialog.jsx` 신규 생성
  - "현재 폴더 추가" 버튼 → 이름 입력 폼 인라인 표시
  - 북마크 목록: 클릭 시 해당 폴더로 이동 후 다이얼로그 닫힘
  - 삭제 버튼: 행 hover 시 표시, 클릭 시 즉시 삭제
  - 에러 메시지 인라인 표시
- `src/frontend/src/styles/BookmarkDialog.module.css` 신규 생성
- `src/frontend/src/components/Toolbar.jsx`: `Ctrl+D` → `onBookmarks?.()` 추가
- `src/frontend/src/App.jsx`: BookmarkDialog 연결
- `src/filemanager_test.go`: 북마크 테스트 3개 추가

**테스트 결과**: Go 전체 통과, JS 73개 전체 통과

## 2026-04-11 (20)

### Ctrl+N 단축키로 새 파일 생성 팝업 연결

- `src/frontend/src/components/Toolbar.jsx`
  - 전역 `keydown` 핸들러에 `Ctrl+N` 케이스 추가 → `onNewFile?.()` 호출
  - 의존성 배열에 `onNewFile` 추가

**테스트 결과**: JS 73개 전체 통과

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
