# 변경 이력

> 이전 이력: [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-25 (Todo.md #115 — 뷰어/에디터 지연 로딩)

### 변경
- `App.jsx`: `TextEditor`/`FileViewer`를 `React.lazy` + `Suspense`로 처음 열 때 로드, `isImageFile`은 `utils/fileTypes.js`에서 사용
- 시작 직후 유휴 시간에 두 조각을 미리 받아 두는 `prefetchViewerChunks` (첫 F3/F4도 지연 없이 열림)
- `components/index.js`: 묶음 export에서 TextEditor 제거 (묶음 import 시 CodeMirror가 초기 번들로 끌려오는 것 방지)
- 번들: 초기 조각 649KB → 253KB (gzip 195KB → 77KB). CodeMirror·marked·DOMPurify는 FileViewer 조각(388KB), 에디터 조각 11KB, 언어 패키지는 기존처럼 개별 조각
- 테스트: `lazyLoad.test.js` LZ-01~03 — `main.jsx`부터 정적 import 그래프를 따라가 뷰어/에디터/CodeMirror/marked/DOMPurify가 없는지 검사. 총 788건 통과

## 2026-10-25 (Todo.md #114 — 뷰어/에디터 파일 크기 제한 10MB → 32MB)

### 근거 (측정)
- CodeMirror 전환 후 프론트: 20MB 열기 83~175ms, 50MB 169~197ms, 100MB 350~404ms, 키 입력은 크기와 무관하게 17ms
- Go 읽기+디코딩+JSON: 50MB 약 0.14s / 일시 메모리 약 500MB (파일 크기의 약 10배, 즉시 해제)
- Wails IPC(WebView2) 구간은 헤드리스로 측정 불가 → 여유를 두고 32MB로 결정

### 변경
- `utils/fileTypes.js`: `MAX_VIEWER_FILE_SIZE`(32MB), `exceedsViewerLimit` — App의 F3/F4 크기 검사와 안내 문구가 이 상수 사용
- `filemanager.go`: `maxViewerFileSize` 64MB → 32MB (프론트와 동일)
- 테스트: LIM-01~02, AP-22(33MB 거부/32MB 문구), Go `limit_sync_test.go`(백엔드·프론트 값 일치 검사) — Go 통과, 프론트 785건 통과

## 2026-10-25 (Todo.md #113 — 뷰어/에디터 구문 강조)

### 변경
- 의존성: `@codemirror/language`, `@lezer/highlight`, `@codemirror/lang-*`(javascript/python/go/rust/cpp/html/css/json/xml/yaml/markdown/sql),
  `@codemirror/legacy-modes`(shell/powershell/toml/properties/dockerfile). state/view는 단일 사본으로 정리(6.7.6/6.43.15)
- `codeLanguages.js` 신규: 확장자/파일명 → 언어 키(`.star/.bzl`은 Python, `Dockerfile` 포함), 언어 패키지를 동적 import로 지연 로딩
- `CodeSurface.jsx`: `language` prop, 언어 Compartment + `classHighlighter`(tok-* 클래스), 5MB 초과 문서는 구문 분석 생략
- `global.css`: 다크/라이트 테마별 `--syn-*` 색 변수와 tok-* 스타일
- 에디터/뷰어 상태 표시줄에 언어 표시
- 벤치: `npm run bench -- 1,5 js`로 강조 포함 측정 → 키 입력 17ms, 열기 22~61ms (강조 없음과 동일 수준)
- 번들: 기본 615KB → 649KB, 언어 패키지는 별도 지연 로딩 조각(약 20개)
- 테스트: `syntaxHighlight.test.js` 41건 (확장자 매핑, 모든 로더, 강조 표시, txt 미강조, 내용/저장 불변, 뷰어, 큰 문서 생략, 상태 표시) — 총 783건 통과

## 2026-10-25 (Todo.md #111 — 뷰어(F3) 텍스트 모드 CodeMirror 6 전환)

### 변경
- `FileViewer.jsx`: textarea·가상 줄 번호·스크롤 동기화 제거 → `CodeSurface`(읽기 전용, 글자 크기/줄 바꿈 연동).
  검색은 파일을 읽을 때 한 번 만든 소문자 텍스트 사용. 마크다운 렌더링/이미지 모드는 그대로
- `CodeSurface.jsx`: 읽기 전용이어도 포커스·커서·키보드 탐색·선택 복사는 가능 (내용 변경만 차단)
- textarea 전용 CSS(`.pre`, `.lineNumbers`, `.lineNum`, `.textarea`) 제거
- 구현 전용 테스트 2건(FVC-04 줄번호 숨김, FVC-19 스크롤 동기화)을 CodeMirror 기준(줄 바꿈 적용, 줄 번호 표시)으로 교체 — 총 742건 통과

### 측정 (npm run bench) — 뷰어 열기 (전 → 후)
| 크기 | 열기 | 스크롤 |
|---|---|---|
| 1MB | 157~326ms → 72ms | 15ms → 15ms |
| 5MB | 1.0~1.1s → 35ms | 40ms → 13ms |
| 10MB | 2.1s → 54ms | 70ms → 12ms |

## 2026-10-25 (Todo.md #110 — 에디터(F4) CodeMirror 6 전환)

### 변경
- 의존성: `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`
- `CodeSurface.jsx` 신규: CodeMirror 6 래퍼 (줄 번호, 현재 줄 강조, 실행 취소, Tab=공백 2칸, 글자 크기/줄 바꿈 설정,
  ref API: getText/getDoc/getSelection/select/focus). 부모에는 키 입력마다 문서 객체만 전달(전체 문자열 복사 없음)
- `TextEditor.jsx`: textarea·가상 줄 번호 제거 → CodeSurface 사용. 줄/문자 수는 `doc.lines/length`,
  미저장 판정은 길이 비교 후 `doc.eq(원본)`, 검색은 문서가 바뀔 때만 소문자 캐시 생성, CRLF 보존(#112) 유지
- 테스트 드라이버(`src/test/textSurface.js`)가 textarea/CodeMirror 둘 다 지원(act 처리), `src/test/setup.js`(jsdom Range 측정 API 대체)
- 계약 테스트가 전환 중 버그 1건(Tab 명령의 선택 범위 생성 오류)을 잡아 수정. textarea 전용 TEC-21은 줄 번호 표시 테스트로 교체
- 총 742건 통과, `vite build` 확인 (번들 340KB → 617KB, gzip 105KB → 196KB)

### 측정 (npm run bench, 헤드리스 Edge)
| 크기 | 에디터 열기 (전 → 후) | 키 입력 1회 중앙값 (전 → 후) |
|---|---|---|
| 1MB | 129~271ms → 27ms | 129~209ms → 17ms |
| 5MB | 0.84~0.91s → 32ms | 1.1~1.2s → 17ms |
| 10MB | 2.1~2.3s → 75ms | 2.2~2.4s → 17ms |

## 2026-10-25 (Todo.md #109 — 뷰어/에디터 성능 기준선 측정)

### 변경
- `src/frontend/bench/` 신규: 실제 FileViewer/TextEditor를 헤드리스 Edge(Chromium, WebView2와 같은 엔진)로 렌더링해 측정
  - `npm run bench [-- 1,5,10]`, 텍스트 영역 조작은 `bench/surfaceOps.js` (구현 교체 시 함께 수정)
- 개발 의존성 `puppeteer-core` 추가 (브라우저는 설치된 Edge/Chrome 사용, 다운로드 없음)

### 기준선 (textarea 구현, 2회 측정)
| 크기 | 뷰어 열기 | 뷰어 스크롤 | 에디터 열기 | 에디터 키 입력 1회(중앙값/최대) |
|---|---|---|---|---|
| 1MB | 157~326ms | 15ms | 129~271ms | 129~209ms / 154~302ms |
| 5MB | 1.0~1.1s | 40ms | 0.84~0.91s | 1.1~1.2s / 1.3~1.4s |
| 10MB | 2.1s | 70ms | 2.1~2.3s | 2.2~2.4s / 2.7~3.0s |

→ 에디터는 1MB부터 키 입력마다 100ms 이상 지연, 5MB 이상은 사실상 편집 불가. 뷰어 스크롤은 문제 없음.

## 2026-10-25 (Todo.md #112 — CRLF 파일 편집 시 줄바꿈 보존)

### 원인
브라우저 textarea는 값을 LF로 정규화해 돌려주므로, CRLF 파일을 편집하면 `onChange` 내용이 LF가 되고
그대로 저장되어 파일 전체 줄바꿈이 LF로 바뀜. 줄 수/문자 수도 `\r`을 포함해 계산. (CodeMirror 6도 기본 LF 정규화 → 전환 전에 처리)

### 변경
- `TextEditor.jsx`: 로드 시 원본 줄바꿈(`eolRef`) 기록 후 LF로 통일, 저장 시 원래 CRLF로 복원
- `FileViewer.jsx`: 텍스트를 LF로 통일해 표시
- 테스트: 계약 테스트 CT-10~14 (CRLF 저장 유지, LF 유지, 열기만 하면 clean, 줄/문자 수, 뷰어 표시), 총 742건 통과

## 2026-10-25 (Todo.md #108 — 텍스트 영역 테스트 드라이버 + 동작 계약 테스트)

### 배경
뷰어/에디터를 CodeMirror 6로 바꾸기 전에, 테스트가 `<textarea>` 구현에 직접 묶여 있으면 교체 시 대부분 깨져
회귀를 판별할 수 없음 → 구현과 무관한 안전망을 먼저 마련.

### 변경
- `src/frontend/src/test/textSurface.js` 신규: 텍스트/선택/입력/키/커서 알림을 다루는 드라이버 (구현 교체 시 이 파일만 수정)
- `TextEditor.jsx`/`FileViewer.jsx`: 텍스트 영역에 `data-text-surface` 표식
- 기존 뷰어/에디터 테스트 6개 파일을 드라이버 경유로 전환 (textarea 직접 접근 제거),
  스크롤 동기화 2건은 "[textarea 구현 전용]"으로 표시
- `textSurface.contract.test.js` 신규 15건: 편집 내용 그대로 저장, 줄/문자 수·미저장 표시, 되돌리면 clean,
  한글/이모지, 2만 줄 파일 검색·커서 이동, 선택 영역 Tab, 포커스, 인코딩 재로딩, 뷰어 읽기 전용,
  드라이버 사용 강제(CT-90) — 총 737건 통과

## 2026-10-24 (Todo.md #106 — FTP 북마크/히스토리에 TLS 설정 보존)

### 원인
`FTPConnectionInfo`/`FTPHistory`에 TLS 필드가 없어 TLS로 접속 후 저장한 북마크·최근 접속이 `useTls`를 잃고,
나중에 클릭하면 평문 FTP로 접속.

### 변경
- `ftpmanager.go`: `FTPConnectionInfo.UseTLS`, `FTPHistory.UseTLS` 추가 (재접속 시 최신 설정으로 갱신)
- `FTPManager.jsx`: 북마크 저장 시 `useTls` 포함, 최근 접속 항목 클릭 시 TLS 체크 상태 미리 채움
- 테스트: Go `ftptls_test.go` 2건, 프론트 FM-52(skip 해제)/FM-53, FM-31 기대값 갱신 (프론트 722건 전부 통과, skip 0)

## 2026-10-24 (Todo.md #104 — Go 테스트 커버리지 보완, 완료)

### 변경
- `*_cov_test.go` 5개 신규 (92개 테스트 함수): App 바인딩 전체를 임시 폴더/가짜 FTP 서버로 종단 검증, FTP 목록·업로드·MKD·삭제·히스토리,
  복사/이동/replaceWith 복구 경로, 원자적 저장 실패, 인코딩 전 분기, 설정 구버전/손상/쓰기 불가, 파일 북마크, Windows 드라이브
- 가짜 FTP 서버(`fakeftp_test.go`): LIST/NLST, STOR, MKD/RMD/DELE, PWD/CWD/CDUP 지원 추가
- Go 커버리지: 71.8% → 87.5% (`-count=2` 반복 통과, Linux vet 통과)
- 미커버: 앱/휴지통을 실제 실행하는 함수(OpenFile, OpenCmdWindow, trashItems, NewApp), 다른 볼륨 간 이동 폴백, 개발자 모드가 필요한 심볼릭 링크 테스트

## 2026-10-24 (Todo.md #105 — FTP 전송 실패 메시지가 가려지는 문제)

### 원인
다운로드/업로드 루프에서 실패 메시지를 표시한 직후 마지막에 `Downloaded 0 file(s)`로 덮어써 사용자가 원인을 볼 수 없었음.

### 변경
- `FTPManager.jsx`: 실패를 모아 `transferStatus`로 "Downloaded 1 file(s), 1 failed — a.txt: disk full" 형식 표시
- 테스트: FM-50(다운로드, skip 해제), FM-51(업로드 신규) (총 720건 통과)

## 2026-10-24 (Todo.md #107 — 검색 Shift+Enter 역방향 순환 수정)

### 원인
`findPrev`가 `lastIndexOf(q, max(0, selectionStart-1))`를 사용 → 선택이 첫 일치(위치 0)일 때 같은 위치를 다시 찾아 제자리.

### 변경
- `FileViewer.jsx`/`TextEditor.jsx`: 선택이 맨 앞이면 바로 끝에서부터 순환
- 테스트: FVC-06b, TEC-07b skip 해제 (총 718건 통과)

## 2026-10-24 (Todo.md #104 — 프론트엔드 테스트 커버리지 보완)

### 변경
- `@vitest/coverage-v8` 개발 의존성 추가 (`npx vitest run --coverage`)
- `*.cov.test.js` 12개 신규 (303건): App 단축키 흐름(F8/Shift+Del/F5/F6 충돌/F7/Ctrl+N/F2/F3/F4/Tab/FTP 전환),
  fileStore/ftpStore 액션, FTPManager 접속~다운로드/업로드/삭제, FilePanel/FileViewer/TextEditor 조작,
  ConfirmDialog/BookmarkDialog/소형 컴포넌트, wailsjs mock
- 프론트 커버리지: 구문 37.0% → 96.6%, 분기 36.4% → 90.1% (총 716건 통과)
- 발견된 버그 4건은 skip 테스트로 남기고 Todo #105~#107로 등록

## 2026-10-24 (Todo.md #101 — GW-BASIC 인터프리터 문법 보완)

### 변경 (`examples/gwbasic.star` 코어 재작성, 그래픽/사운드 헬퍼와 데모 유지)
- 줄 내 위치 추적으로 `:` 다중 문장 지원 (IF THEN/ELSE 분기 내 다중 문장, 중첩 IF의 ELSE 매칭)
- 연산자 우선순위: `^` > 단항 `-`/`+` > `* /` > `\` > MOD > `+ -` > 관계 > NOT > AND > OR > XOR, AND/OR/NOT 비트 연산
- `/`는 항상 실수 결과, `\` 정수 나눗셈, 관계 연산 참 = -1
- FOR 0회 반복 시 매칭 NEXT 뒤로 이동, NEXT 스택 정리, `NEXT J,I`, 같은 변수 FOR 재진입
- `READ A(I)`/`INPUT A(I)` 배열 원소 대입, 배열 자동 DIM(10), 배열/스칼라 이름 공간 분리, 다차원 배열
- PRINT: 숫자 앞 부호 공백·뒤 공백, 7자리 유효숫자(`.3`, `1E+10`), `,` 14칸 존, 끝 `;`/`,` 줄바꿈 억제, TAB/SPC
- 런타임 오류 시 이전 출력 유지 + "Division by zero in 20" 형식 메시지, 0으로 나누기/Type mismatch/Overflow 등은 BASIC 오류로 처리(호스트 크래시 없음)
- REM/`'` 뒤 미토큰화, 미정의 문자열 변수 "", SIN/COS 범위 축소·정확도 개선, 괄호 없는 RND, RANDOMIZE
- ON GOTO/GOSUB, `IF c GOTO n`, `=<` `=>` `><`, CHR$/STR$/VAL/ASC/CINT/FIX/SGN/EXP/LOG/ATN/SPACE$
- DATA 원문 보존(대소문자·공백·빈 항목·키워드·부호), `RESTORE n`은 n 이상 첫 DATA 줄, 중복 줄 번호는 교체
- `run_program(src, input_queue, max_steps)` 추가 (테스트용 단일 프로그램 실행)

### 테스트
- `src/gwbasic_test.go` 신규: 시맨틱 76건 + 호스트 크래시 방지 32건 (총 108 하위 테스트)
- 기존 Stage1~6 기대 문자열 중 버그를 반영하던 부분만 수정 (숫자 앞뒤 공백, `EQ:1` → `EQ:-1` 등)

### 한계
- `\`·MOD·AND/OR의 16비트 범위 미검사, INPUT 한 줄을 여러 변수로 분할하지 않음, STOP은 END와 동일

## 2026-10-24 (Todo.md #102 — 버전 단일화 / 중복 헬퍼 정리)

### 변경
- 버전: `src/version.go`(`Version`, `AppTitle()`) 신규 — `main.go` 창 제목이 사용, `wails.json`에 `info.productVersion`/`productName` 추가,
  `frontend/package.json`(+lock) 버전을 0.2.12로 맞춤, 도움말 제목에 버전 표시. 빌드 시 `-ldflags "-X main.Version=..."`로 덮어쓰기 가능
- `src/frontend/src/utils/fileTypes.js` 신규: `TEXT_EXTS`/`IMAGE_EXTS`/`isTextFile`/`isImageFile`/`isViewableFile`/`formatSize`/`formatDate`
  → FilePanel(더블클릭), FileViewer(재export), SearchDialog, FTPManager의 중복 정의 제거.
  진입점마다 달랐던 텍스트 확장자 목록 통일(.csv/.sql/.toml 등 더블클릭 시 에디터, .bat은 기존처럼 실행)
- 테스트: Go `version_test.go`(wails.json/package.json/Version 일치), 프론트 `fileTypes.test.js` FT102-01~05, VER-01 (총 417건 통과)
- 아이콘 맵은 FilePanel(점 포함 확장자)과 FTPManager(점 제외)의 키 형식이 달라 이번에는 유지

## 2026-10-24 (Todo.md #100 — 프론트엔드 잔여 버그 묶음)

### 변경
- `FilePanel.jsx`: Shift+문자 퀵 점프를 switch 앞에서 처리 → Shift+C/T/W가 'C'/'T'/'W' case에 막히던 문제 해결
- `FileViewer.jsx`: 이미지에서는 F4/편집 버튼으로 에디터 전환 불가(바이너리 손상 방지), IME 조합 중 키 무시
- `ConfirmDialog.jsx`(셸 대화상자): 히스토리가 비었을 때 ↑가 입력 중 명령을 지우지 않음
- `TextEditor.jsx`: 미저장 확인창이 뜨면 "저장" 버튼으로 포커스, IME 조합 중(`isComposing`) 키 무시
- `fileStore.closeTab`: 비활성 탭을 닫으면 현재 탭 유지(인덱스만 보정)
- `App.jsx`: init/OpenCmdWindow 실패 처리, 이름 변경 await
- `wailsjs/runtime.js`: 브라우저 mock에 누락 바인딩 10개 추가
- 테스트: `misc100.test.js` M-01~07 (M-07은 소스의 `api.X` 호출을 스캔해 mock 누락을 검사), 총 411건 통과, `vite build` 확인

## 2026-10-24 (Todo.md #99 — 백엔드 잔여 버그 묶음)

### 변경
- `SearchFiles`: 비재귀 검색에서도 폴더 이름 매칭(내부로는 진입 안 함), 검색 루트 자체는 결과에서 제외
- `GetPathParts`: UNC 경로(`\srv\share\...`)를 `\srv\share`부터 올바르게 분할
- `uniqueName`(신규, `fileutil.go`): `a (1).txt`, `.bashrc (1)`, IsNotExist 외 에러 시 즉시 반환(무한 루프 방지)
  → CopyItemsRename/MoveItemsRename/ExtractArchive 폴더명에 적용
- `CompressItems`: 같은 이름 압축 파일이 있으면 덮어쓰지 않고 `archive (1).zip`으로 저장 (리뷰 중 추가 발견)
- `DeleteItems`/`TrashItems`: 빈 경로·루트·홈 폴더 거부(`guardDeletable`), 하나라도 위험하면 아무것도 지우지 않음
- `CreateFile`: `O_EXCL`로 생성 (확인~생성 사이 경합으로 기존 파일 비우기 방지)
- `RunShellCommand`: 출력이 UTF-8이면 그대로, 아니면 CP949 디코딩 (`decodeShellOutput`)
- `drives_linux.go`: `/proc/mounts`의 8진수 이스케이프(`\040` 등) 복원
- 테스트: `misc_test.go` 11건

## 2026-10-24 (Todo.md #98 — 대용량 폴더/파일 성능)

### 원인
- `FilePanel`이 `useFileStore()`로 스토어 전체를 구독 → 상태 표시줄 문구, 반대쪽 패널 변경에도 양쪽 목록 전체 재렌더
- 행이 인라인으로 렌더링되어 커서 한 칸 이동에도 모든 행을 다시 그림
- 백엔드 텍스트/이미지 읽기에 크기 제한 없음

### 변경
- `FilePanel.jsx`: `s[side]`/`activePanel`/`drives`만 선택 구독, 액션은 `getState()`, `visibleFiles` useMemo
- `FileRow`를 `memo` 컴포넌트로 분리하고 ref 기반 안정 핸들러 전달 → 바뀐 행만 재렌더
- `filemanager.go`: `readLimited`(64MB 초과 거부)를 `ReadTextFileWithEncoding`/`ReadImageFile`에 적용
- 테스트: `FilePanel.perf.test.js` PERF-01~03(Profiler로 재렌더 여부 검증, 수정 전 코드에서 실패 확인), Go `readlimit_test.go` 3건
- 남은 과제: 수만 개 항목 폴더의 가상 스크롤은 미적용

## 2026-10-24 (Todo.md #97 — 뷰어/에디터 로드 상태 미초기화 및 경합)

### 원인
FileViewer 로드 effect가 `error`를 초기화하지 않아 이미지 하나가 실패하면 ←/→로 넘겨도 계속 ⚠ 표시.
로드 취소가 없어 빠르게 넘기면 늦게 끝난 이전 파일 내용이 새 경로 아래 표시됨 (에디터도 동일).

### 변경
- `FileViewer.jsx`/`TextEditor.jsx`: 로드 시작 시 `setError(null)`, effect cleanup의 `cancelled` 플래그로 이전 결과 무시
- 테스트: `FileViewer.load.test.js` LD-01~03 (총 401건 통과)

## 2026-10-24 (Todo.md #96 — 확인창 비동기 에러가 다음 대화상자에 표시되는 문제)

### 원인
ConfirmDialog의 Confirm 버튼이 `onConfirm(); onClose()`를 동기 호출 → 대화상자와 오류 상태가 즉시 지워지고,
이후 비동기 삭제가 실패하면 `setDeleteError`가 보이지 않는 상태로 남아 다음 삭제 팝업에 "삭제 실패"로 표시.

### 변경
- `ConfirmDialog.jsx`: `handleConfirm`이 `onConfirm`을 await, 닫기는 호출 측이 결정(성공 시 App이 닫음),
  처리 중 버튼 비활성화로 중복 실행 방지 → 실패 시 같은 대화상자에 오류 표시 후 재시도/취소 가능
- 테스트: `ConfirmDialog.async.test.js` CD-01~03 (총 398건 통과)

## 2026-10-24 (Todo.md #95 — 숨김 필터를 무시한 커서 인덱스 수정)

### 원인
커서 인덱스는 숨김 필터 적용 목록 기준인데, `BookmarkDialog`의 "현재 파일 추가"와 `navigateToBookmark`가
전체 `files` 기준으로 인덱싱 → 숨김 파일이 있으면 다른 파일을 북마크하거나 다른 파일에 커서.

### 변경
- `BookmarkDialog.jsx`: `getCursorFile` 사용
- `navigateToBookmark`: visible 목록에서 인덱스 검색, 밀린 이동이면 커서 설정 생략
- 테스트: BM-01 (총 395건 통과)

## 2026-10-24 (Todo.md #94 — 인코딩 감지/디코딩 오류 수정)

### 원인
- x/text EUC-KR 디코더는 잘못된 바이트를 에러 없이 U+FFFD로 바꿔 `cp949StrictValid`가 항상 true → Johab 판정 경로가 죽은 코드
- Johab 채움(fill) 코드를 무효로 처리 → 단독 자모(ㅋㅋㅋ, ㅠㅠ) 디코딩 실패 후 저장 시 영구 손실
- 잘못된 Johab lead 뒤 ASCII(개행 등)까지 2바이트로 삼킴
- UTF-8 읽기 시 전체 NFC 정규화 → CJK 호환 한자 등이 열고 저장만 해도 바뀜
- `utf8ValidityScore`가 서로게이트/overlong을 통과시킴

### 변경
- `cp949StrictValid`: 디코드 결과의 U+FFFD로 판정, 감지 창 끝의 잘린 lead 무시
- `validUTF8IgnoringTail`: 고신뢰 UTF-8 판정에 `utf8.Valid` 병행 (창 끝 잘림 허용)
- `composeHangulJamo`: NFD 한글 자모(L+V+T)만 완성형으로 합성 — 기존 NFD 한글 표시 기능 유지, 다른 문자는 그대로
- `johab.go`: 단독 자모/채움 문자 디코딩(`johabDecodeJamo`) + 인코딩(`johabJamoCode`), trail < 0x41이면 1바이트만 소비
- 테스트: `encoding_fix_test.go` 7건

## 2026-10-24 (Todo.md #93 — 정렬이 새로고침 후 초기화, 정렬 시 커서 이동 문제)

### 원인
`setSort`만 정렬하고 `navigate`/`refresh`/탭 전환은 백엔드의 이름순 결과를 그대로 저장 →
복사 등으로 새로고침되면 헤더는 크기순 표시인데 목록은 이름순. 정렬 시 커서 인덱스가 그대로라 다른 파일을 가리킴.

### 변경
- `fileStore.js`: `sortFiles` export (폴더 우선), `navigate`/`_navigateHistory`/`switchTab`/`closeTab`에서 현재 정렬 적용
- `setSort`: 정렬 전 커서 파일을 찾아 새 인덱스로 보정
- 테스트: SORT-01~03 (총 394건 통과)

## 2026-10-24 (Todo.md #92 — 폴더 이동 경합, 뒤로/앞으로 상태 오류 수정)

### 원인
- `navigate`/`switchTab`/`closeTab`에 요청 순번이 없어 늦게 도착한 이전 응답이 현재 목록을 덮어씀.
  `navigate`가 await 전 history를 사용해 그 사이 이동이 history에서 사라짐
- `navigateBack/Forward`: try/catch 없음, 목록 조회 전에 historyIndex 변경, 커서 미초기화(범위 초과),
  세션 저장·작업 폴더 변경 누락

### 변경
- `fileStore.js`: 패널별 `beginNav` 토큰 — 최신 요청이 아니면 결과/에러 무시. `navigate`는 적용 여부(boolean) 반환
- `_navigateHistory`: 뒤로/앞으로 공통 — 성공 시에만 historyIndex 변경, 커서 0(또는 빈 폴더면 [..]), `_afterNavigate`
- `_afterNavigate`: 세션 저장 + 활성 패널이면 `ChangeWorkingDirectory`
- `navigateAndFocus`/`navigateUp`: 밀린 이동이면 커서 설정 생략
- 테스트: `fileStore.nav.test.js` NAV-01~06 (총 391건 통과)

## 2026-10-24 (Todo.md #91 — 드라이브 루트에서 작업 후 목록 갱신 안 됨)

### 원인
`parentDir('C:\foo')`가 `'C:'`, `parentDir('/foo')`가 `'/foo'`를 반환 → 패널 경로(`C:\`, `/`)와 일치하지 않아
삭제/이동/이름 변경/저장 후 `_refreshAffected`가 패널을 새로고침하지 않음.
`navigateToBookmark`는 `ListDirectory('C:')`(드라이브 상대 경로 = 현재 작업 폴더)를 호출.

### 변경
- `fileStore.js`: `parentDir` export, 루트 처리(`C:\`, `D:/`, `/`), `navigateToBookmark`도 `parentDir` 사용
- 테스트: PD91-01~05 (총 385건 통과)

## 2026-10-24 (Todo.md #90 — copyFile Close 에러 무시, 링크/정션 폴더 처리)

### 원인
- `copyFile`이 `out.Close()` 에러를 무시 → 네트워크 드라이브 지연 쓰기 실패가 성공으로 보고되고, 이동 시 원본 삭제로 데이터 손실 가능.
  실패 시 부분 파일도 남음
- `copyDir`의 WalkDir는 링크를 따라가지 않아 폴더 링크/정션에 `copyFile`을 실행 → 복사 중간 실패
- `ListDirectory`가 폴더 링크/정션을 파일로 표시 → Enter 시 폴더 진입 대신 파일 열기

### 변경
- `copyFile`: Copy/Close 에러 확인, 실패 시 부분 파일 삭제
- `copyDir`: 심볼릭 링크·정션(ModeIrregular)은 `copyLinkTarget`으로 대상 내용 복사, 복사 루트나 상위를 가리키면 거부
- `resolveLink`: Go 1.23+ `EvalSymlinks`가 정션을 해석하지 않아 `Readlink`로 직접 해석
- `ListDirectory`: 폴더를 가리키는 링크/정션은 `IsDir=true`
- 테스트: `links_test.go` 4건 (Windows는 `mklink /J` 정션으로 검증)

## 2026-10-24 (Todo.md #89 — 압축/압축 해제 에러 무시 및 zip 형식 오류 수정)

### 원인
- `CompressItems`: WalkDir 콜백의 Create/Open/Copy 실패와 `w.Close()` 에러를 무시 → 잘린 zip이 성공 처리.
  엔트리 이름에 `\` 사용(다른 OS에서 `dir\file` 파일 생성), 빈 폴더 누락, 압축 대상 폴더 안에 zip 생성 가능, 루프 안 defer
- `ExtractArchive`: MkdirAll/Open/Create/Copy/Close 실패를 모두 건너뛰고 성공 반환

### 변경
- `CompressItems`: 임시 파일에 쓰고 성공 시 rename, `addZipEntry`(FileInfoHeader, '/' 이름, 폴더 엔트리, Deflate), 모든 에러 반환,
  압축 대상 폴더 내부 경로 거부
- `ExtractArchive`: 단계별 에러 반환(`extractZipFile`, 실패 시 부분 파일 삭제), zip slip 항목은 건너뛰고 개수를 에러로 보고
- `fileStore.extract`: 실패 시 상태 표시줄에 표시
- 테스트: `archive_test.go` 6건, 프론트 ARC-01

## 2026-10-24 (Todo.md #88 — settings.json 음수 activeIdx로 인한 panic 수정)

### 원인
`SaveSessionState`/`LoadPanelPaths`가 `idx >= len`만 검사하고 음수는 검사하지 않아
`activeIdx: -1`이 저장/수정되면 시작할 때마다 index out of range panic. 존재하지 않는 탭 경로를 제거한 뒤에도
`ActiveIdx`를 보정하지 않아 다른 탭이 활성화됨.

### 변경
- `settings.go`: `clampTabIdx`(음수·범위 밖 → 0), `normalizeTabs`(경로 필터 후 원래 활성 경로의 새 인덱스로 보정)
- 테스트: `settings_idx_test.go` 3건 (저장 시 음수, 파일의 음수, 필터 후 활성 탭 유지)

## 2026-10-24 (Todo.md #87 — 설정/북마크/에디터 저장을 원자적으로)

### 원인
`os.WriteFile`(truncate 후 write)를 직접 사용 → 저장 중 크래시/디스크 부족 시 원본 손상, 설정·북마크 JSON이 깨지면
북마크 목록이 사라지고 이후 추가가 영구 실패. 파일 북마크 read-modify-write에 락이 없어 동시 추가 시 유실.

### 변경
- `settings.go`(세션), `filebookmarks.go`: `writeFileAtomic` 사용
- `filebookmarks.go`: 손상 파일은 `backupCorrupt` 후 빈 목록으로 시작, `App.bookmarkMu`로 직렬화, id 충돌 방지
- `fileutil.go`: `writeUserFile` — 에디터 저장 시 기존 권한 유지 + 원자적 교체, 다른 프로그램이 잠가 교체가 거부되면 제자리 저장으로 폴백
- 테스트: `atomicsave_test.go` 6건 (임시 파일 미잔존, 권한 유지, 손상 북마크 복구, 동시 추가 20건)

## 2026-10-24 (Todo.md #86 — FTP 비밀번호 평문 저장 금지, 북마크 동시성/손상 처리)

### 원인
- 북마크 파일(`~/.chobocho-commander/ftp_bookmarks.json`, 0644)에 비밀번호를 평문으로 저장할 수 있었음
- `SaveBookmark`/`DeleteBookmark`/`GetBookmarks`에 락이 없고 내부 slice를 그대로 반환
- JSON 파싱 실패를 무시 → 빈 목록으로 시작 후 다음 저장이 손상된 원본을 덮어써 전체 소실

### 변경
- `src/fileutil.go` 신규: `writeFileAtomic`(temp + sync + rename), `backupCorrupt`(`.corrupt-<시각>` 보관)
- `SaveBookmark`: 비밀번호 제거, 락 적용 / `GetBookmarks`: 복사본 반환 / `DeleteBookmark`: 락 적용
- `loadBookmarks`: 이전 버전이 저장한 비밀번호 제거 후 재저장, 손상 시 백업 / `loadHistory`도 손상 시 백업
- 북마크/히스토리 파일 0600 + 원자적 저장
- `FTPManager.jsx`: 계정이 있는 북마크 클릭 시 접속 창(비밀번호 입력)으로 열기
- 테스트: `ftpbookmark_test.go` 6건

## 2026-10-24 (Todo.md #85 — FTP 원격 삭제 확인창, 삭제 실패 원인 은폐 수정)

### 원인
- 원격 Delete 버튼이 확인 없이 선택 항목 전체를 즉시 삭제, 중간 실패 시 목록을 갱신하지 않음
- `DeleteItem`이 DELE 실패 시 무조건 `RemoveDirRecur`로 넘어가 실제 원인(권한 없음 등)을 숨김

### 변경
- `DeleteItem(id, path, isDir)`: 파일은 DELE 결과 그대로, 폴더만 재귀 삭제 (`app.go` 바인딩도 변경)
- `FTPManager.jsx`: `ftpDeleteTargets`/`ftpDeleteMessage` 헬퍼, 삭제 전 확인창(폴더 내용 포함 경고),
  실패해도 목록 새로고침 후 실패 항목 표시
- 테스트: Go 2건(파일 에러 보고, 폴더 재귀 삭제), 프론트 FD-01~03 (총 379건 통과)

