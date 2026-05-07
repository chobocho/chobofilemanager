# 변경 이력

## 2026-05-08 (Todo #56 — 파일/폴더 생성 후 새 항목으로 커서·스크롤)

### 배경
F7로 폴더, Ctrl+N으로 파일 생성 후 목록 끝에서 새 항목을 찾기 어려움. 생성 직후 커서가 새 항목 위에 위치하고 자동 스크롤되도록 개선.

### 변경
- `fileStore.js`:
  - `createFile(panel, name)` 신규 — api.CreateFile + refresh + 커서 이동까지 store에서 처리
  - `createDirectory(panel, name)` 후처리에 `_focusByName` 호출 추가
  - `_focusByName(panel, name)` 헬퍼 — visible(`showHidden` 반영) 인덱스에서 찾아 `cursor`/`cursorOnParent` 갱신
- `App.jsx` `handleNewFile` — 직접 api 호출 + 수동 refresh 제거, `store.createFile()`로 위임
- `FilePanel.jsx`: `panel.cursor` 변경 시 `requestAnimationFrame`으로 `scrollIntoView` 트리거 — 키보드 네비게이션 외부에서 커서가 이동돼도 화면 스크롤 동기화
- `fileStore.test.js`: FN-01~06 6개 테스트 (createFile, createDirectory, 숨김 항목 폴백, 실패 시 throw, _focusByName)
- 프론트엔드 235 → 241개 테스트 모두 통과

## 2026-05-08 (Todo #55 — Starlark 스크래치 Ctrl+M으로 변경)

### 배경
Ctrl+Enter는 TextEditor 내부에서 Starlark Run 단축키로도 사용되어 의미가 분산.
스크래치 생성은 명시적인 Ctrl+M으로 분리해 충돌과 혼동을 줄임.

### 변경
- `App.jsx`:
  - `isStarlarkScratchShortcut(e)` export — `ctrlKey||metaKey + key='m/M'`
  - 전역 keydown 핸들러에서 Ctrl+Enter → Ctrl+M으로 트리거 변경
- `HelpDialog.jsx`: "Ctrl+M — Starlark 스크래치" 항목 추가
- `App.test.js` 신규: SS-01~06 6개 테스트
- TextEditor 내부 Ctrl+Enter (in-editor Run, Todo #50) 동작은 그대로 유지
- 프론트엔드 229 → 235개 테스트 모두 통과

## 2026-05-08 (Todo #54 — Shift+Delete만 영구 삭제)

### 배경
영구 삭제는 위험하므로 단독 Delete가 아닌 명시적인 Shift+Delete만 동작하도록 변경.
F8과 단독 Delete는 Todo #57에서 휴지통 이동으로 연결될 예정.

### 변경
- `Toolbar.jsx`:
  - `isPermanentDeleteShortcut(e)` — Shift+Delete만 true (영구 삭제)
  - `isTrashShortcut(e)` — F8 또는 단독 Delete만 true (휴지통; Todo #57)
  - 키보드 핸들러 분기: 영구 삭제는 onDelete, 휴지통은 onTrash(없으면 onDelete fallback)
  - `onTrash` prop 추가 (현 단계에서는 미바인딩 → onDelete fallback으로 기존 동작 유지)
- `FilePanel.jsx`: F5/F6/F8/Delete 패스스루 주석 명료화
- `HelpDialog.jsx`: "F8/Delete: 휴지통", "Shift+Delete: 영구 삭제" 항목 분리
- `Toolbar.test.js`: PD-01~04, TR-01~04 8개 테스트 추가
- 프론트엔드 221 → 229개 테스트 모두 통과



### 배경
F3로 이미지를 보고 있을 때 폴더 안의 다음/이전 이미지로 즉시 이동할 수 있어야 사진 일괄 확인이 편함. 갤러리 뷰어 표준 UX.

### 변경
- `FileViewer.jsx`:
  - `siblingImagePath(siblings, currentPath, dir)` 순수 함수 export — wrap-around 순환, 안전 폴백
  - props `siblingImages: string[]`, `onChangePath: (path) => void` 추가
  - keydown 핸들러: 이미지 모드에서 ←/→ 처리 → siblingImagePath로 새 경로 계산 → onChangePath 호출
  - 상태바에 `1 / 5 (←/→로 이동)` 표시
- `App.jsx`:
  - `isImageFile` 재사용 import
  - FileViewer 호출 시 `siblingImages`(활성 패널의 visible 이미지 파일 경로 배열) + `onChangePath={setViewerFile}` 전달
- `FileViewer.test.js`: IMN-01~08 단위 테스트 8개 (next/prev/wrap-around/안전폴백)
- 프론트엔드 213 → 221개 테스트 모두 통과

### 동작
1. F3로 이미지 열기 (예: `/d/a.png`)
2. → 키 → `/d/b.jpg`로 이동, 다시 → → `/d/c.gif`
3. 마지막에서 → 누르면 첫 번째로 순환
4. ← 키도 동일하게 역방향 순환
5. 활성 패널에 이미지가 1개뿐이면 ←/→ 무반응

## 2026-05-05 (Todo #53 북마크 정렬 + 정렬 버튼)

### Todo #53
Ctrl+D로 뜨는 북마크 다이얼로그에 정렬 + 정렬 버튼 추가.

- `BookmarkDialog.jsx`:
  - `SORT_MODES = ['name-asc', 'name-desc', 'path-asc', 'path-desc']`
  - `SORT_MODE_LABELS` 한국어 라벨 (이름 ↑/↓, 경로 ↑/↓)
  - `nextSortMode(current)` 순환 (마지막 → 첫 번째 / 알 수 없는 모드 → name-asc)
  - `sortBookmarks(list, mode)` 순수 함수 — 새 배열 반환(원본 불변), 대소문자 무시
  - state `sortMode` 추가, 기본 `name-asc`
  - 헤더에 정렬 버튼 (ArrowDownAZ 아이콘 + 현재 라벨), 클릭 시 순환
- `BookmarkDialog.module.css`: `.sortBtn` 스타일 추가
- `BookmarkDialog.test.js` 신규: BMS-01~08 (정렬 동작/대소문자/불변), BMNX-01~06 (순환/폴백) 14개 테스트
- 프론트엔드 199 → 213개 테스트 모두 통과

## 2026-05-05 (Todo #50 재해석 — Ctrl+Enter로 Starlark 스크래치 버퍼)

### 배경
사용자 의도 재확인: Ctrl+Enter는 "F4 에디터에서 현재 코드 실행"이 아니라
"임시 .star 파일을 만들어 F4 에디터로 띄우는 스크래치 버퍼" 단축키였다.
에디터를 띄우지 않고도 Ctrl+Enter 한 번으로 Starlark 스니펫을 작성·실행할 수 있게 하는 의도.

### 변경
- 백엔드:
  - `filemanager.go` `CreateStarlarkScratchFile()` 추가 — `os.CreateTemp("", "chobofm-scratch-*.star")`로 OS 임시 디렉터리에 고유 .star 파일 생성, 템플릿 내용(타임스탬프 + 가이드 주석 + print 예시) 작성, 절대 경로 반환
  - `app.go` Wails 노출 래퍼
  - `filemanager_test.go`: 파일존재/확장자/고유경로/초기내용 4개 테스트
- 프론트엔드:
  - `App.jsx`:
    - `handleStarlarkScratch()` callback — API 호출 → 반환된 경로로 `setEditorFile`
    - 전역 keydown 핸들러에 Ctrl/Cmd+Enter 추가
    - **충돌 방지**: editorFile/viewerFile/modal 중 하나라도 떠 있으면 무시 → 에디터 내부 Ctrl+Enter=Run, 뷰어 ESC 등 기존 단축키 보존
  - `wailsjs/runtime.js` mock 갱신
- 테스트: Go 230 / 프론트 199개 모두 통과

### UX
1. 파일패널/메인 화면에서 Ctrl+Enter
2. OS 임시 폴더에 `chobofm-scratch-XXXXX.star` 자동 생성
3. F4 에디터가 그 파일을 열고 템플릿 내용 표시
4. 사용자가 편집 후 F5 또는 (에디터 내부) Ctrl+Enter로 실행

### 직전 텍스트에어리어 보강 유지
직전 커밋(`b43e9cd`)의 textarea-level Ctrl+Enter=Run 처리는 그대로 유지.
에디터 내부에서는 Run, 외부에서는 Scratch — 두 동작이 서로 다른 컨텍스트에서 자연스럽게 동작.

## 2026-05-05 (Todo #50 수정 — Ctrl+Enter 미동작 보강)

### 배경
Todo #50로 window 캡처 단계에서 Ctrl/Cmd+Enter를 매처로 처리했지만 사용자 환경에서 동작하지 않는다는 보고. 캡처 핸들러가 어떤 이유로든 이벤트를 못 잡는 케이스를 대비해 textarea의 onKeyDown(`handleKeyDown`)에도 동일한 핸들링을 추가했다.

- `TextEditor.jsx` `handleKeyDown`: Tab 외에 `isStarlark && isStarlarkRunShortcut(e)`도 처리 → handleRunRef 호출
- 이중화이므로 둘 중 하나만 작동해도 OK
- 단, `.star`/`.bzl` 확장자 파일에서만 동작 (isStarlark 조건은 그대로)
- 기존 199개 테스트 모두 통과

## 2026-05-05 (MAX_FILE_SIZE 3MB → 10MB)

### 배경
Todo #52(F3 이미지 보기) 추가로 이미지 파일도 내장 뷰어 대상이 되었지만 3MB 제한이 너무 빠듯해서 일반 사진(스마트폰 4–8MB)이 자주 차단됨. 일관성 있게 텍스트/이미지 모두 10MB로 상향.

- `App.jsx`: `MAX_FILE_SIZE = 10 * 1024 * 1024` (3MB → 10MB)
- 에러 다이얼로그 메시지도 "10MB" 로 갱신
- 메모리 영향: base64 inflation 33% 감안하면 10MB 이미지 → ~13MB 문자열, 브라우저 메모리에 무리 없음
- 프론트엔드 199개 테스트 모두 통과

## 2026-05-05 (Todo #52 F3으로 이미지 보기)

### Todo #52
이미지 파일(F3 또는 Enter)을 base64 data URL로 백엔드에서 읽어 `<img>`로 표시. file:// URL 직접 사용보다 이식성·보안 측면에서 단순.

- 백엔드:
  - `filemanager.go`: `imageMimeType(ext)` + `ReadImageFile(path)` 신규. PNG/JPG/GIF/WebP/BMP/SVG/ICO 지원, 미지원 확장자는 `application/octet-stream`.
  - `app.go`: Wails 노출 래퍼 추가
  - `filemanager_test.go`: PNG/JPG/확장자별/미지원 4개 테스트
- 프론트엔드:
  - `FileViewer.jsx`:
    - `IMAGE_EXTS` / `isImageFile(ext)` export 추가
    - `isViewableFile`이 이미지도 포함하도록 확장 (F3·Enter로 이미지 열기 가능)
    - `isImage` 분기 — 이미지 모드에서 `readImage()` 호출, `<img src={dataUrl}>` 렌더, 인코딩/줄바꿈/폰트/검색 버튼 숨김, 상태바에 확장자 표시
  - `fileStore.js`: `readImage(path)` 추가 (api.ReadImageFile 래퍼)
  - `wailsjs/runtime.js` mock: `ReadImageFile` 추가
  - `FileViewer.test.js`: IMG-01~06 단위 테스트 6개. 기존 FV-15(.png 미지원)는 새 정책에 맞춰 갱신.
- Go 226 / 프론트엔드 199개 테스트 모두 통과

## 2026-05-05 (Todo #51 Enter로 텍스트 파일 → F3 뷰어)

### Todo #51
기존: Enter와 더블클릭 모두 `handleRowDoubleClick`을 호출 → 텍스트 파일은 F4 편집기 열림.
변경: Enter는 별도의 `handleEnter`로 분기 → 텍스트/소스 파일은 F3 뷰어 열림. 더블클릭은 기존 동작 유지(F4 편집기).

- `App.jsx`: FilePanel에 `onView={tryOpenViewer}` 추가
- `FilePanel.jsx`:
  - `isViewableFile` import (FileViewer.jsx에서 재사용)
  - `onView` prop 추가
  - `handleEnter(file)` 함수 분리 — viewable이면 onView, 아니면 openFile
  - 키 핸들러 case 'Enter' → handleEnter 호출
- 기존 193개 테스트 모두 통과 (Enter 동작 분리는 통합 테스트 부재라 별도 단위 테스트 미추가; viewable 판별은 FileViewer.test.js FV-01~FV-24가 커버)

## 2026-05-05 (Todo #50 Ctrl+Enter로 Starlark 실행)

### Todo #50
- `TextEditor.jsx`: `isStarlarkRunShortcut(e)` 순수 함수 export — F5 또는 Ctrl/Cmd+Enter
- 키 핸들러를 `isStarlark && isStarlarkRunShortcut(e)`로 단순화
- Run 버튼 툴팁에 `Ctrl+Enter` 표기 추가
- `TextEditor.test.js`: SR-01~06 단위 테스트 6개
- 프론트엔드 16 → 22 (TextEditor 파일) / 전체 통과

## 2026-05-05 (Todo #48 복사/이동 후 대상 폴더 포커스)

### Todo #48
- `fileStore.js`:
  - `cursorAfterCopy(visibleAfter, sourcePaths)` 순수 함수 export — 첫 source의 basename으로 visible에서 인덱스 검색
  - `_focusCopiedFile(dest, sources)` 헬퍼 — dest 경로와 일치하는 패널 양쪽 모두 커서 갱신
  - `copy`/`copyWithMode`/`move`/`moveWithMode` 4곳 모두 `_refreshAffected` 직후 `_focusCopiedFile` 호출
- `fileStore.test.js`: CPC-01~06 단위 테스트 6개 추가 (basename 추출/Windows 경로/null 입력)
- 프론트엔드 96 → 102개 테스트 모두 통과

## 2026-05-05 (Todo #47 검증 + Todo #49 삭제 후 커서 위치)

### Todo #47 (rename 포커스)
이미 Todo #36에서 구현되어 있음 (`fileStore.rename`이 새 이름 파일에 커서 설정 + RN-01~05 테스트 존재). Todo.md만 ✓ 표시.

### Todo #49 (삭제 후 위 파일로 포커스)
- `fileStore.js`: 순수 함수 `cursorAfterDelete(minDeletedIdx, remainingCount)` export 추가
  - `Math.min(Math.max(0, minDeletedIdx - 1), remainingCount - 1)`
  - 못 찾았거나(-1) 빈 목록(0)이면 -1 반환 (변경 없음)
- `confirmDelete`: 삭제 직전 visible 인덱스를 기록 → API 호출 → refresh 후 새 visible 길이로 커서 재계산
- `fileStore.test.js`: DEL-01~06 테스트 6개 추가
- 프론트엔드 175 → 181개 테스트 모두 통과

## 2026-05-05 (F3/F4 뷰어·편집기 인코딩 수동 변경 버튼)

### 배경
직전 작업에서 인코딩 자동 판별을 도입했지만 짧은 한글 파일·혼합 인코딩에서는 휴리스틱이 틀릴 수 있음. hviewer가 메뉴(F2)로 인코딩 순환을 제공하는 것처럼, FileViewer(F3)·TextEditor(F4) 헤더에 클릭으로 순환 가능한 인코딩 버튼을 추가하여 사용자가 즉시 다른 인코딩으로 다시 읽을 수 있게 함.

### 변경 파일
- 백엔드:
  - `src/filemanager.go` — `ReadTextFileWithEncoding(path, encName)` 신규 추가. encName: "auto"/"utf-8"/"utf-16le"/"utf-16be"/"cp949"(=euc-kr)/"johab". 미지원 이름은 auto 폴백. `parseEncodingName` 헬퍼 추가.
  - `src/app.go` — Wails 노출용 래퍼 추가
  - `src/filemanager_test.go` — 5개 테스트 추가 (auto/명시 johab/cp949/utf-8/미지원)
- 프론트엔드:
  - `src/frontend/wailsjs/go/main/App.{d.ts,js}` — Wails 자동 재생성
  - `src/frontend/src/wailsjs/runtime.js` — mock에 `ReadTextFileWithEncoding` 추가
  - `src/frontend/src/stores/fileStore.js` — `readFile(path, encoding)` 시그니처 확장 (auto면 기존 경로, 그 외는 `ReadTextFileWithEncoding` 호출)
  - `src/frontend/src/components/FileViewer.jsx`
    - export 추가: `ENCODINGS`, `ENCODING_LABELS`, `nextEncoding`
    - state `encoding` 추가, useEffect 의존성에 포함 → 인코딩 변경 시 재로드
    - 헤더에 인코딩 라벨 버튼 (클릭으로 6개 옵션 순환), 상태바에도 현재 인코딩 표시
  - `src/frontend/src/components/TextEditor.jsx`
    - FileViewer.jsx에서 `ENCODING_LABELS`, `nextEncoding` 재사용
    - `handleEncodingCycle`: dirty 시 `window.confirm`으로 손실 경고 후 변경
    - 헤더 버튼 + 상태바 표시 동일
  - `src/frontend/src/components/FileViewer.test.js` — 8개 테스트 추가 (EN-01~EN-08: ENCODINGS 구성/순환/폴백)

### UX 동작
1. F3(뷰어) / F4(편집기)에서 헤더에 현재 인코딩 라벨 버튼 표시 (예: `Auto`)
2. 클릭 시 다음 인코딩으로 순환: `Auto → UTF-8 → UTF-16 LE → UTF-16 BE → CP949 → Johab → Auto`
3. 인코딩이 변경되면 즉시 해당 인코딩으로 파일 재로드
4. 편집기에서 미저장 변경분이 있을 때 인코딩 변경 시 confirm 경고

### 테스트 결과
- Go: 222개 모두 통과 (이전 217 + 새 5)
- 프론트엔드 (Vitest): 175개 모두 통과 (이전 167 + 새 8)

## 2026-05-04 (조합형(Johab) 한글 인코딩 지원 + 인코딩 자동 판별)

### 배경
hviewer(D:\github3\hviewer)의 조합형 한글 디코더와 인코딩 자동 판별 휴리스틱을 참고하여 코드 뷰어의 인코딩 처리 능력을 보강. 기존에는 UTF-8 + EUC-KR/CP949 만 지원 → 조합형(KS X 1001-1992 부속서 3 / CP1361)과 UTF-16 LE/BE BOM 파일이 깨져 보였음.

### 변경 파일
- `src/johab.go` — Johab 비트 디코더 신규 (hviewer/johab.h 포팅)
  - `johabDecodeSyllable(uint16) rune` — 2바이트 음절 → 유니코드
  - `johabToString([]byte) string` — 바이트 스트림 → UTF-8 (잘림은 U+FFFD)
  - `johabScore`, `johabHangulCount` — 자동 판별용 휴리스틱
- `src/johab_test.go` — 11개 단위 테스트
- `src/encoding_detect.go` — 인코딩 enum + 자동 판별 + UTF-8 변환 통합 (hviewer/encoding.h 포팅)
  - `Encoding` enum: UTF-8 BOM/UTF-16 LE/UTF-16 BE/UTF-8/CP949/Johab
  - `DetectEncoding([]byte) Encoding` — BOM → UTF-8 유효성 → CP949 vs Johab 점수/보조영역 비율
  - `DecodeToUTF8([]byte, Encoding) (string, error)` — BOM 제거 + 인코딩별 변환 + NFC 정규화
- `src/encoding_detect_test.go` — 12개 단위 테스트
- `src/filemanager.go` `ReadTextFile()` — 자동 판별 통합, 64KB 윈도우만 휴리스틱에 사용. CP949 strict 실패 시 관용 모드 폴백.
- `src/filemanager_test.go` — 통합 테스트 3개 추가 (Johab 파일, UTF-16 LE/BE BOM)

### 휴리스틱 요약 (hviewer 기반)
1. BOM 검사 (가장 신뢰)
2. UTF-8 멀티바이트 시퀀스 valid 카운트 — 3개 이상이면 UTF-8, 1~2개라도 utf8.Valid 통과하면 UTF-8 (NFD 짧은 텍스트 케이스)
3. CP949 vs Johab 점수 비교
   - 둘 다 낮으면 UTF-8 기본값 (본 프로젝트는 UTF-8 환경 주류)
   - CP949 strict invalid + johab 음절 ≥ 10 → Johab 확정
   - johab 점수 ≥ 80 + cp949 보조영역 비율 ≥ 30% → Johab
   - johab 점수 > cp949 + 10 → Johab, 아니면 CP949

### 테스트 결과
- Go: 217개 모두 통과
- 프론트엔드 (Vitest): 167개 모두 통과

### 영향 범위
프론트엔드 `FileViewer.jsx`는 백엔드에서 UTF-8 문자열을 받아 표시하므로 변경 없음. 백엔드만 강화한 결과 코드 뷰어/편집기 양쪽이 자동으로 조합형 + UTF-16 BOM 파일을 올바르게 표시.

## 2026-04-24 (테스트 케이스 보강 2차)

### 테스트 케이스 추가 보강

#### 프론트엔드 테스트 (Vitest) — 총 167개

**TextEditor.test.js**
- `buildCursorPosition` export 추출 및 CP-01~CP-08 테스트 추가
  - CP-01~03: 단일 줄 (빈 텍스트, 첫 문자, 끝 위치)
  - CP-04~05: 다중 줄 (두 번째 줄 시작/중간)
  - CP-06~08: 세 번째 줄 시작, 텍스트 맨 끝, 첫 줄이 빈 줄

**FileViewer.test.js**
- `isViewableFile`: FV-17~FV-24 추가 (.jsx, .tsx, .sh, .csv, .sql, .html 뷰 가능; .mp4, .docx 불가)
- `getWordWrapStyle`: WW-01~WW-04 추가 (false/true 각 CSS 속성 확인)

**fileStore.test.js**
- `visibleFiles`: VF-07~VF-10 추가 (전체 숨김→null, 범위 초과 cursor→null, 빈 목록, showHidden=true 접근)
- `getParentPath`: PR-07~PR-09 추가 (소문자 드라이브 루트, Windows 깊은 경로, Unix 단일 세그먼트)
- `joinPath`: JP-11~JP-13 추가 (.gitignore 조인, 숫자 파일명, Windows 깊은 경로)
- `getLastPathSegment`: GPS-10~GPS-12 추가 (Windows 후행 백슬래시, 점 접두사, 숫자 세그먼트)

#### Go 테스트 (testing 패키지) — 총 202개

**filemanager_test.go**
- `RunStarlarkFile`: 4개 추가 (FunctionDef, ForLoop, IfElse — 함수 내부, ListOps)
- `GetFileInfo`: 4개 추가 (File 메타데이터, Directory, NotFound, ExtensionLowercase)
- `CheckCopyConflicts`: 3개 추가 (NoConflict, WithConflict, MultiplePartialConflict)
- `WriteTextFile`: 3개 추가 (EmptyContent, UnicodeContent/한글+이모지, Overwrite)
- `ListDirectory`: 2개 추가 (ExactCount, NoExtensionFile/Makefile)

## 2026-04-24 (46)

### #46 F4 에디터에서 Starlark 스크립트 실행

#### 구현 내용

**Go 백엔드 (filemanager.go)**
- `go.starlark.net/starlark` 라이브러리 추가 (`go get go.starlark.net`)
- `RunStarlarkFile(path string) (string, error)` 구현
  - `starlark.ExecFileOptions` 로 스크립트 실행
  - `print()` 출력을 `strings.Builder`로 캡처하여 반환
  - 문법/런타임 오류는 Go error가 아닌 출력 문자열로 반환 (UI에 표시)
  - 파일 미존재는 Go error 반환
- `app.go`에 `RunStarlarkFile` wrapper 추가

**Frontend (TextEditor.jsx)**
- `isStarlarkFile(ext)` 순수 함수 export (`.star`, `.bzl` 감지)
- `.star`/`.bzl` 파일 편집 시 헤더에 녹색 **Run** 버튼 표시
- **F5** 키로도 실행 가능
- 출력 패널: 실행 결과를 에디터 아래 패널에 표시, X 버튼으로 닫기
- 상태바에 `Starlark` 배지 표시
- `TextEditor.module.css`에 `.btnRun`, `.outputPanel`, `.starlarkBadge` 등 추가
- `wailsjs/runtime.js` mock에 `RunStarlarkFile` 추가

#### 테스트
**Go (filemanager_test.go)**
- `TestRunStarlarkFile_PrintOutput`: print() 출력 캡처 확인
- `TestRunStarlarkFile_ArithmeticAndVar`: 변수/연산 결과 확인
- `TestRunStarlarkFile_SyntaxError`: 문법 오류 → 출력 문자열 반환
- `TestRunStarlarkFile_RuntimeError`: 런타임 오류 → 출력 문자열 반환
- `TestRunStarlarkFile_MultipleLines`: 복수 print() 줄 출력
- `TestRunStarlarkFile_NotFound`: 파일 미존재 → Go error 반환

**Frontend (TextEditor.test.js)**
- `TE-01~08`: `isStarlarkFile` 확장자 판별 (star/bzl 대소문자, py/go/txt/빈 문자열)

최종: 프론트엔드 138개, Go 전체 테스트 통과

## 2026-04-24 (45)

### #45 - 키로 이전 폴더 이동 후 커서 위치 복원

#### 원인
`navigateBack`이 이전 경로로 이동 후 커서를 0으로 유지해서, 직전에 있던 폴더가 어디인지 알 수 없었음.

#### 구현 내용
- `fileStore.js`의 `navigateBack` 수정
  - 이동 전 `prevPath = state.history[state.historyIndex]` 저장
  - 이동 후 `getLastPathSegment(prevPath)` 로 직전 폴더명 추출
  - visible 파일 목록에서 `f.name === childName || f.name === childName + '/'` 로 탐색
  - 찾으면 해당 인덱스로 cursor 이동 (`cursorOnParent: false`)
- `navigateUp`과 동일한 패턴 적용

#### 테스트
- `NB-01`: Unix 경로에서 이전 폴더명으로 커서 인덱스 탐색
- `NB-02`: 경로가 `/`로 끝나도 세그먼트 올바르게 추출
- `NB-03`: visible 목록에 없으면 -1 반환
- `NB-04`: Windows 경로에서도 올바르게 동작
- 전체 프론트엔드 테스트 130개 통과

## 2026-04-24 (44)

### #44 F3 뷰어 Word Wrap 기능 추가

#### 구현 내용
- `FileViewer.jsx`에 `wordWrap` state 추가 (기본값: false)
- 헤더에 `WrapText` 아이콘 토글 버튼 추가 — 활성화 시 파란 배경으로 강조
- `getWordWrapStyle(wordWrap)` 순수 함수 export
  - `wordWrap=true`: `white-space: pre-wrap`, `overflow-x: hidden`, `overflow-wrap: break-word`
  - `wordWrap=false`: `white-space: pre`, `overflow-x: auto`, `overflow-wrap: normal`
- Word Wrap 활성화 시 줄 번호 패널 숨김 (줄 바꿈 시 줄 번호와 정렬 불일치 방지)
- 상태바에 `WRAP` 표시 추가

#### 테스트
- `WW-01~WW-04`: `getWordWrapStyle` 반환값 검증 (false/true 각 속성 확인)
- 전체 프론트엔드 테스트 126개 통과

## 2026-04-23 (테스트 케이스 보강)

### 테스트 케이스 전면 보강

#### 프론트엔드 테스트 (Vitest)

**FileViewer.test.js**
- `isViewableFile`: FV-09~FV-16 추가 (.star, .bzl, .py, .json, .yaml, .toml, .png, .pdf)
- `isMarkdownFile`: MD-01~MD-05 (MD-05: .mdx는 .md 아님 추가)
- `clampFontSize`: FV 번호 충돌 해소 → CF-01~CF-08으로 분리 (CF-06 최솟값 위에서 내려오기, CF-07 delta=0, CF-08 정상 범위)

**FilePanel.test.js**
- `getQuickJumpTarget`: QJ-08~QJ-12 추가 (빈 목록, 단일 항목 순환, 이름 중간 글자 미매칭, 혼합 대소문자, matchPos 범위 초과 안전 순환)

**fileStore.test.js**
- `getLastPathSegment`: GPS-06~GPS-09 추가 (깊은 중첩 경로, 단일 세그먼트, 한글 폴더명, 공백 경로)
- `joinPath`: JP-09~JP-10 추가 (한글 파일명, 공백 포함 파일명)
- `rename 후 커서 위치 로직`: RN-04 (디렉토리 이름 변경), RN-05 (단일 파일 목록)
- `fileStore 동기 작업`: SS-21~SS-25 추가 (setSort size 오름/내림, setSort modified, setActivePanel)
- Wails mock에 `ChangeWorkingDirectory` 추가 (SS-25 픽스)

#### Go 테스트 (testing 패키지)

**filemanager_test.go**
- `SearchFiles`: 빈 패턴 → 빈 결과, AND 키워드(쉼표 구분) 매칭, 매칭 없음
- `ReadTextFile`: 빈 파일 → 빈 문자열 반환
- `RenameItem`: 없는 소스 → 에러, 디렉토리 이름 변경
- `CopyItems`: 다중 파일 복사 (원본 보존 확인)
- `MoveItems`: 다중 파일 이동 (원본 삭제 확인)
- `DeleteItems`: 다중 파일 삭제

#### 최종 테스트 결과
- 프론트엔드: 122개 테스트 전체 통과
- Go: 전체 테스트 통과 (ok totalcmd)

## 2026-04-24 (42, 43)

### #42 F3 뷰어 조합형 한글(NFD) 지원
### #43 F3 뷰어 완성형 한글(EUC-KR/CP949) 지원

#### 구현 내용
- `filemanager.go`의 `ReadTextFile` 함수 인코딩 감지 로직 추가
  - UTF-8 유효한 파일: `norm.NFC.String()` 으로 NFC 정규화
    - **조합형(#42)**: macOS에서 만든 NFD 분리형 한글(ㄱ+ㅏ조합) → NFC 완성형으로 변환
  - UTF-8 아닌 파일: EUC-KR / CP949 디코딩 시도
    - **완성형(#43)**: 레거시 Windows 한국어 인코딩 파일을 UTF-8로 변환
  - 폴백: 원본 바이트 그대로 반환
- import에 `unicode/utf8`, `golang.org/x/text/unicode/norm` 추가 (already in go.mod)

#### 테스트 (Go)
- `TestReadTextFile_EUCKR_완성형`: EUC-KR 인코딩 파일 → "안녕하세요" 정상 출력 확인
- `TestReadTextFile_NFD_조합형`: NFD 유니코드 한글 → NFC 정규화 확인
- 전체 Go 테스트 통과 (ok totalcmd)
- 전체 프론트엔드 테스트 94개 통과

## 2026-04-24 (41)

### #41 F4 에디터 및 F3 뷰어에 Starlark 스크립트(.star, .bzl) 지원

#### 구현 내용
- `FileViewer.jsx`의 `VIEWABLE_EXTS`에 `.star`, `.bzl` 추가 → F3 뷰어로 열기 가능
- `FilePanel.jsx`의 더블클릭 `textExts` 배열에 `.star`, `.bzl` 추가 → F4 에디터로 열기 가능
- `FILE_ICONS_DARK` / `FILE_ICONS_LIGHT`에 `.star`, `.bzl` 아이콘 추가 (FileCode, 초록 계열)

#### 테스트
- `FileViewer.test.js`에 FV-09, FV-10 테스트 케이스 추가
  - `isViewableFile('.star')` → true
  - `isViewableFile('.bzl')` → true
- 전체 94개 테스트 통과

## 2026-04-24 (40)

### #40 `-` 키로 이전 방문 폴더로 이동

#### 구현 내용
- `FilePanel.jsx`의 `handleKeyDown`에 `-` 키 처리 추가
  - Ctrl/Alt/Shift/Meta 없는 단독 `-` 키 입력 시 `store.navigateBack(side)` 호출
  - `navigateBack`은 이미 fileStore에 구현된 히스토리 기반 뒤로가기 함수

#### 테스트
- 기존 92개 테스트 통과

## 2026-04-24 (38, 39)

### #38 vim 스타일 j/k/h/l 키 네비게이션
### #39 WASD 스타일 s/w/a/d 키 네비게이션

#### 구현 내용
- `FilePanel.jsx`의 `handleKeyDown`에 수정자 키(Ctrl/Alt/Shift/Meta) 없는 단독 키 처리 추가
  - `j`, `s`: 아래로 이동 (ArrowDown과 동일 동작)
  - `k`, `w`: 위로 이동 (ArrowUp과 동일 동작)
  - `h`, `a`: 왼쪽 패널로 포커스 이동
  - `l`, `d`: 오른쪽 패널로 포커스 이동
- `FilePanel`에 `onSwitchToPanel(target)` prop 추가
- `App.jsx`에서 `onSwitchToPanel` 구현: `setActivePanel` 후 대상 패널 ref에 포커스
- 기존 Ctrl+A/Ctrl+H/Ctrl+W 단축키와 충돌 없음

#### 테스트
- 기존 92개 테스트 통과 (내비게이션 로직은 ArrowKey와 동일 경로)

## 2026-04-24 (37)

### #37 Shift+a-z/0-9로 해당 글자로 시작하는 파일로 커서 이동

#### 구현 내용
- `FilePanel.jsx`에 `getQuickJumpTarget(files, ch, lastChar, lastMatchIdx)` 유틸 함수 추가
  - 파일 목록에서 ch로 시작하는 파일의 인덱스 순차 반환
  - 같은 글자 반복 입력 시 다음 파일로 순환 이동
- `FilePanel` 컴포넌트에 `quickJumpRef` 추가 (마지막 입력 문자 및 매치 위치 추적)
- `handleKeyDown`의 `default` 케이스에서 `Shift+[a-z0-9]` 감지 및 처리
  - Ctrl/Alt 조합키와 충돌 없이 동작
  - 대소문자 무관 (대문자 입력도 소문자로 정규화)

#### 테스트
- `FilePanel.test.js` 신규 작성 (QJ-01~07 테스트 케이스)
  - 첫 매치, 반복 입력 시 다음 파일 이동, 마지막에서 처음 순환
  - 매칭 없으면 null, 대소문자 무관, 숫자 키 동작, 특수문자 null
- 전체 92개 테스트 통과

## 2026-04-24 (36)

### #36 폴더/파일명 변경 후 커서가 해당 항목 위에 위치

#### 구현 내용
- `fileStore.js`의 `rename` 함수에 커서 위치 설정 로직 추가
  - `_refreshAffected` 완료 후, visible 파일 목록에서 새 이름으로 인덱스 탐색
  - 해당 항목을 찾으면 cursor를 해당 인덱스로, cursorOnParent는 false로 설정

#### 테스트
- `fileStore.test.js`에 RN-01~03 테스트 케이스 추가
  - 이름 변경 후 새 이름의 인덱스 탐색 로직
  - 목록에 없는 이름이면 -1 반환
  - 숨김 파일 미표시 시 visible 필터 적용
- 전체 85개 테스트 통과

## 2026-04-24 (35)

### #35 부모 폴더로 이동시 커서가 직전 폴더 위에 위치

#### 구현 내용
- `fileStore.js`에 `getLastPathSegment(path)` 유틸 함수 추가
  - 경로에서 마지막 폴더명 추출, Windows 드라이브 루트 처리 포함
- `navigateUp` 함수 개선: 상위 폴더 이동 후 이전 폴더를 visible 파일 목록에서 찾아 커서 위치 설정
  - hidden 파일 표시 여부(`showHidden`)에 따라 visible 목록 기준으로 인덱스 탐색

#### 테스트
- `fileStore.test.js`에 GPS-01~05 테스트 케이스 추가
  - Unix/Windows 경로, 끝 슬래시 있는 경우, 루트 경로 처리
- 전체 82개 테스트 통과

## 2026-04-24 (34)

### #34 F4 에디터 <-> F3 뷰어 전환 버튼 지원

#### 구현 내용
- `FileViewer.jsx`: `onSwitchToEditor` prop 추가, 헤더에 "편집기로 열기 (F4)" 버튼(Pencil 아이콘) 추가
- `TextEditor.jsx`: `onSwitchToViewer` prop 추가, 헤더에 "뷰어로 열기 (F3)" 버튼(Eye 아이콘) 추가
- `App.jsx`: 두 컴포넌트에 전환 콜백 연결
  - 뷰어→에디터: `viewerFile` 초기화 후 `editorFile`로 동일 경로 설정
  - 에디터→뷰어: `editorFile` 초기화 후 `viewerFile`로 동일 경로 설정

#### 테스트
- 기존 77개 테스트 모두 통과

## 2026-04-23 (33)

### #33 F3 파일 뷰어에서 마크다운(.md) 렌더링 지원

#### 구현 내용
- `marked` 라이브러리 추가 (npm install marked)
- `FileViewer.jsx`에 `isMarkdownFile(ext)` 함수 추가
- `.md` 파일 열람 시 기본적으로 마크다운 렌더링 모드로 표시
- 헤더에 렌더링/원본 토글 버튼 추가 (BookOpen ↔ Code 아이콘)
- 렌더링 모드: `dangerouslySetInnerHTML`로 HTML 출력, 검색 불가
- 원본 모드: 기존 텍스트 뷰어(라인 번호 + textarea) 그대로 사용
- `FileViewer.module.css`에 `.markdownBody`, `.btnActive` 스타일 추가
  - 헤딩, 코드블록, 인용구, 표, 목록 등 마크다운 요소 스타일링

#### 테스트
- `FileViewer.test.js`에 FV-14 ~ FV-17 테스트 케이스 추가
  - `isMarkdownFile('.md')` → true
  - `isMarkdownFile('.MD')` → true (대소문자 무관)
  - `isMarkdownFile('.txt')` → false
  - `isMarkdownFile('')` → false
- 전체 77개 테스트 통과

## 2026-04-16 (53)

### #53 hide off 상태에서 F2/F5/F6/F8 키가 잘못된 파일을 대상으로 동작하는 버그 수정

#### 원인
`panel.cursor`는 **보이는 파일**(hidden 필터 적용된) 목록의 인덱스이지만,
`copy`, `move`, `delete` (fileStore.js)와 `RenameDialog` (ConfirmDialog.jsx)에서
`panel.files[panel.cursor]`로 전체 파일 배열을 직접 인덱싱하고 있었음.
`showHidden`이 off일 때 숨김 파일이 배열에 포함된 상태로 인덱스가 어긋나 커서 위치와 실제 대상 파일이 달라지는 문제 발생.

#### 수정 파일
- `src/frontend/src/stores/fileStore.js`
  - `copy`, `move`, `delete` 함수에서 커서 파일 조회 시 `showHidden` 여부에 따라 `visibleFiles`를 먼저 계산하도록 수정
- `src/frontend/src/components/ConfirmDialog.jsx`
  - `RenameDialog`에서 `currentFile` 조회 시 `visibleFiles`를 기준으로 수정

---

## 2026-04-14 (52)

### #52 검색 결과에서 내장 뷰어/에디터로 열기 버튼 추가

#### 변경 파일
- `src/frontend/src/App.jsx`
  - `SearchDialog`에 `onView`, `onEdit` prop 전달 (모달 닫은 후 뷰어/에디터 실행)
- `src/frontend/src/components/ConfirmDialog.jsx`
  - `TEXT_EXTS` 집합 정의 (텍스트 계열 확장자)
  - `SearchDialog` props에 `onView`, `onEdit` 추가
  - `handleViewFile`, `handleEditFile` 핸들러 추가
  - 텍스트 파일에 한해 뷰어(👁) · 에디터(✏) 버튼 표시, 모든 파일에 실행(▶) 버튼 표시
  - `Eye`, `FileEdit` 아이콘 import 추가
- `src/frontend/src/styles/Dialogs.module.css`
  - `.resultRunBtn` → `.resultActionBtn` 으로 통일

---

## 2026-04-14 (51)

### #51 검색 결과에서 파일 바로 실행 버튼 추가

#### 변경 파일
- `src/frontend/src/components/ConfirmDialog.jsx`
  - `handleRunFile()` 추가: `api.OpenFile(path)` 호출로 OS 기본 앱으로 파일 실행
  - 검색 결과 파일 행에 실행 버튼(▶) 추가 (디렉터리 제외)
  - `Play` 아이콘 import 추가
- `src/frontend/src/styles/Dialogs.module.css`
  - `.resultRunBtn` 스타일 추가: 행 호버 시에만 표시, 클릭 시 accent 색상

---

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
