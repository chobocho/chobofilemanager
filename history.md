# 변경 이력

> 이전 이력: [history_20261024_233705.md](history_20261024_233705.md) (2026-10-24 23:37 시점 전체 백업)

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

## 2026-10-24 (Todo.md #84 — FTP 다운로드 실패가 성공으로 보고되는 문제)

### 원인
`r.Close()`(전송 최종 응답 226/426을 읽음)와 `out.Close()` 에러를 무시 → 중간에 끊긴 잘린 파일이 성공 처리.
`os.Create`로 기존 로컬 파일을 먼저 비움. 원격 이름에 `filepath.Base`를 써서 `\`, `:`(ADS)가 로컬 경로로 해석됨.

### 변경
- `Download`: 같은 폴더 `.part` 임시 파일로 받고 Copy/응답 Close/파일 Close 에러를 모두 확인 후 rename, 실패 시 임시 파일 삭제
- `localNameForRemote`: `path.Base` + Windows 금지 문자(`\ / : * ? " < > |`) 거부
- 가짜 FTP 서버에 EPSV/RETR 데이터 채널 지원 추가
- 테스트: `ftptransfer_test.go` 5건 (성공, 426 중단, 실패 시 기존 파일 보존, 원격 없음, 위험한 이름)
- 업로드 실패 시 원격 부분 파일 정리는 원래 파일을 지울 위험이 있어 하지 않음 (에러만 보고)

## 2026-10-24 (Todo.md #83 — FTP 연결 동시 사용 경합 수정)

### 원인
하나의 `*ftp.ServerConn`을 락 없이 여러 Wails 호출이 동시에 사용 → 제어 채널의 명령/응답이 섞여
엉뚱한 응답, 무한 대기, 전송 중단 발생. `Disconnect`는 전역 락을 잡은 채 `Quit()` 네트워크 I/O 수행.

### 변경
- `ftpConnection.mu` 추가, `withConn` 헬퍼로 모든 FTP 작업(List/Retr/Stor/Delete/MakeDir/Rename)을 연결별 직렬화
- `Disconnect`: 목록에서 먼저 제거 후 전역 락 밖에서 `Quit`
- 테스트: 동시 Rename 20건이 RNFR/RNTO 쌍을 섞지 않는지, 응답 없는 서버 Disconnect가 다른 연결을 막지 않는지
  (수정 전에는 동시 Rename 테스트가 교착 상태로 멈춤)
- 남은 한계: 읽기/쓰기 타임아웃은 미적용 (jlaffaye/ftp에서 dialFunc 지정 시 데이터 채널 TLS가 빠지는 제약)

## 2026-10-24 (Todo.md #82 — 휴지통 없는 드라이브에서 경고 없이 영구 삭제되는 문제)

### 원인
SHFileOperationW 플래그에 `FOF_WANTNUKEWARNING`이 없어, 휴지통을 쓸 수 없는 위치(네트워크 공유, 일부 USB,
휴지통 용량 초과 파일)에서는 F8/Delete가 조용히 영구 삭제됨.

### 변경
- `trash_windows.go`: `fofWantNukeWarning(0x4000)` 추가, 플래그를 `trashFlags` 상수로 분리
  → 영구 삭제가 될 경우 Windows가 확인 창 표시, 취소 시 "중단됨" 에러 반환
- 테스트: `trash_windows_test.go` (플래그 검증). 실제 동작은 네트워크 드라이브에서 수동 확인 필요

## 2026-10-24 (Todo.md #81 — FTP TLS 옵션 동작)

### 원인
`FTPConfig.UseTLS`를 읽지 않아 항상 평문 FTP로 접속 (비밀번호 평문 전송). UI에는 TLS 선택 항목도 없었음.
`Passive` 체크박스도 라이브러리가 지원하지 않아 효과가 없었음.

### 변경
- `ftpmanager.go`: `UseTLS`면 `DialWithExplicitTLS`(AUTH TLS, TLS 1.2+, 인증서 검증). 서버 거부 시 USER/PASS 전송 없이 실패
- `FTPManager.jsx` 접속 창: "Use TLS (FTPS)" 체크박스 추가, Passive는 항상 켜짐(비활성 표시)
- 테스트: Go `ftpconnect_test.go` 2건(TLS 거부 시 자격 증명 미전송, 평문 접속 시 AUTH 미전송),
  프론트 `FTPManager.connect.test.js` FT-01~02 (총 376건 통과)

## 2026-10-24 (Todo.md #80 — FTP 다중 연결 시 엉뚱한 서버로 명령 전송 수정)

### 원인
`Connect`가 새 연결 id를 반환하지 않아 프론트가 `GetConnections()`의 마지막 요소를 사용했는데,
Go map 순회 순서가 무작위라 다른 서버 연결이 선택될 수 있었음. 같은 시각 접속 시 id 충돌 가능성도 있었음.

### 변경
- `ftpmanager.go`: `Connect`가 `(id, error)` 반환, 접속 순번(`seq`)을 id에 포함, `GetConnections`를 접속 순으로 정렬
- `app.go`: `FTPConnect` 반환형 변경
- `ftpStore.connect`: 반환된 id로 연결 검색, null 목록 처리
- `FTPManager.jsx`: `ftpStore.connect` 사용, 재접속 시 이전 연결 해제
- 테스트: Go용 가짜 FTP 서버(`fakeftp_test.go`) + `ftpconnect_test.go` 3건, 프론트 `ftpStore.test.js` FC-01~02

## 2026-10-24 (Todo.md #79 — Ctrl+A가 숨김 파일까지 선택하는 문제 수정)

### 원인
`selectAll`이 `showHidden`을 무시하고 `files` 전체를 선택 → Ctrl+A 후 삭제 시 보이지 않던 `.git` 등도 삭제.
`toggleHidden`으로 숨긴 뒤에도 숨겨진 항목의 선택이 남음.

### 변경
- `selectAll`: 보이는 파일만 선택
- `toggleHidden`: 숨김 표시를 끌 때 숨겨지는 항목의 선택 해제
- 테스트: HID-01~04 추가 (총 372건 통과)

## 2026-10-24 (Todo.md #78 — 커서가 [..]일 때 첫 파일에 작업되는 문제 수정)

### 원인
FilePanel은 [..] 선택 시 `cursorOnParent=true`만 설정하고 `cursor`는 0으로 둠. copy/move/delete/RenameDialog가
`cursorOnParent`를 보지 않아 첫 번째 파일을 대상으로 사용.

### 변경
- `fileStore.js`: `getCursorFile(panelState)` export — 숨김 필터 + [..] + 범위 처리 일원화, copy/move/delete에서 사용
- `RenameDialog`, App의 F3/F4/압축 해제 핸들러도 `getCursorFile` 사용 (중복 로직 제거)
- `App.jsx`: `handleRename` — 대상이 없으면 이름 변경 대화상자를 열지 않음
  (보이지 않는 modal이 #77 단축키 차단 상태로 남는 문제 방지)
- 테스트: PAR-01~07 추가 (총 368건 통과)

## 2026-10-24 (Todo.md #77 — 모달/뷰어/FTP 화면에서 파일 단축키 차단)

### 원인
Toolbar의 window keydown이 INPUT/TEXTAREA만 제외 → 확인창 중 F6 실제 이동, 이미지 뷰어 중 Delete로 패널 커서 파일 삭제,
FTP 화면에서 Delete로 숨은 로컬 파일 삭제. 뷰어/충돌창이 포커스를 가져가지 않아 Enter/Backspace/화살표도 패널로 전달.

### 변경
- `App.jsx`: `overlayOpen`(modal, 뷰어, 에디터, 삭제/휴지통/충돌/크기 경고 대화상자) 계산 → Toolbar `shortcutsDisabled`, FilePanel `keyboardDisabled`로 전달
  - Ctrl+O / F9 / Ctrl+M 전역 핸들러도 오버레이 중 무시
- `Toolbar.jsx`: 오버레이 중 모든 단축키 양보 (Tab 기본 동작도 막지 않음), FTP 뷰에서는 F1만 허용
- `FilePanel.jsx`: `keyboardDisabled`면 키 입력 무시
- 테스트: `Toolbar.shortcuts.test.js` 신규 KB-01~06 (총 361건 통과)

## 2026-10-24 (Todo.md #76 — 에디터 로딩/오류 상태 저장 방지, 저장 실패 처리)

### 원인
- `handleSave`에 가드가 없어 로딩 중이거나 읽기 실패(content='') 상태에서 Ctrl+S 시 빈 내용으로 덮어씀
- 저장 실패를 삼켜 확인창 "저장"이 실패해도 에디터가 닫힘, 실패 메시지가 편집 영역을 대체

### 변경
- `TextEditor.jsx`: `handleSave`가 성공 여부 반환, `loading`/`error` 시 거부
- 저장 실패는 `saveError`로 상태 표시줄에 표시 (편집 내용 유지), 확인창 저장 실패 시 닫지 않음
- 파일 로드 시 이전 `error` 초기화
- 테스트: TES-01~03 추가 (총 355건 통과)

## 2026-10-24 (Todo.md #75 — 에디터 X/F3/뷰어 버튼의 미저장 확인)

### 원인
Esc만 `isDirty`를 확인하고, X 버튼·F3·눈 아이콘은 `onClose`/`onSwitchToViewer`를 바로 호출 → 편집 내용 소실.

### 변경
- `TextEditor.jsx`: `confirmClose` → `pendingLeave`('close' | 'viewer'), `requestLeave`/`leave` 헬퍼로 통일
  - 확인창 "저장"은 저장 후 원래 요청한 동작(닫기 또는 뷰어 전환) 수행
  - 확인창이 열린 상태에서 Esc는 확인창 취소
- 테스트: `TextEditor.dirty.test.js` 신규 (RTL 렌더 테스트 TED-01~08, 총 352건 통과)

## 2026-10-24 (Todo.md #74 — 에디터 저장 시 원래 인코딩 유지)

### 원인
`WriteTextFile`이 `[]byte(content)`를 그대로 기록 → CP949/UTF-16/Johab 파일을 저장하면 전체가 BOM 없는 UTF-8로 바뀜.

### 변경
- `encoding_detect.go`: `EncodeFromUTF8` (UTF-8 BOM, UTF-16 LE/BE + BOM, CP949, Johab)
- `johab.go`: `johabEncode` (ASCII + 가~힣, 그 외 문자는 에러)
- `filemanager.go`/`app.go`: `WriteTextFileWithEncoding(path, content, encName)` — auto면 기존 파일 인코딩 판별 후 유지,
  새/빈 파일은 UTF-8. 인코딩 불가 문자가 있으면 파일을 건드리지 않고 에러
- `fileStore.writeFile(path, content, encoding='auto')`, `TextEditor`가 현재 선택한 인코딩 전달, mock 추가
- 테스트: Go `encoding_write_test.go` 11건, 프론트 ENC-01~02 (총 344건 통과)

## 2026-10-24 (Todo.md #73 — 마크다운 뷰어 XSS 차단)

### 원인
`marked.parse` 결과를 정리 없이 `dangerouslySetInnerHTML`로 삽입 → `.md`의 `<img onerror>` 등이 웹뷰에서 실행되어
Go 바인딩(RunShellCommand, DeleteItems 등) 호출 가능. 링크 클릭 시 앱 웹뷰 자체가 다른 페이지로 이동.

### 변경
- 의존성 추가: `dompurify@^3.2.6`
- `FileViewer.jsx`: `renderMarkdown`(marked → DOMPurify, style/form 추가 금지), `externalLinkUrl`(http/https/mailto만 허용)
- 마크다운 본문 링크 클릭을 가로채 허용된 URL만 `BrowserOpenURL`로 외부 브라우저에서 열기
- 테스트: `FileViewer.test.js` XSS-01~07 (총 342건 통과), `vite build` 확인

## 2026-10-24 (Todo.md #72 — 파일 열기 명령 주입 수정)

### 원인
Windows에서 `cmd /c start "" path`로 파일을 열어, 파일명의 `&`, `|`, `^`, `%VAR%`가 cmd 구문으로 해석됨
(`readme&evil.bat` 열기 → 같은 폴더의 evil.bat 실행).

### 변경
- `src/open_windows.go` 신규: `ShellExecuteW`(기본 verb, lpDirectory=파일 폴더) 직접 호출
- `src/open_other.go` 신규: 비-Windows stub
- `OpenFile`: Windows는 `shellOpen`, Linux는 기존 `xdg-open`
- `buildOpenCmd`: Windows 분기 제거 (Linux 전용)
- 테스트: `src/open_test.go` 2건 (메타문자 파일명이 그대로 전달, Windows에서 셸 명령 미생성), 기존 buildOpenCmd 테스트는 Linux 전용으로 표시
- 실제 앱 실행은 수동 확인 필요 (테스트에서는 ShellExecute를 대체)

## 2026-10-24 (Todo.md #71 — moveOne 복사 폴백을 cross-device로 한정)

### 원인
`moveOne`이 모든 Rename 실패를 다른 볼륨 이동으로 간주 → 같은 이름 폴더가 있으면 조용히 병합·덮어쓰기,
파일 사용 중/접근 거부 시 복사 후 원본 삭제를 시도해 원본이 반쯤 지워질 수 있었음.

### 변경
- `transfer.go`: `isCrossDevice` (EXDEV, Windows ERROR_NOT_SAME_DEVICE=17)
- `moveOne`: Rename 실패가 cross-device일 때만 copy+delete, 그 외에는 원래 에러 반환
- 테스트: `transfer_test.go` 2건 추가 (에러 판별, 기존 폴더 병합 방지). Linux 빌드 vet 확인

## 2026-10-24 (Todo.md #70 — 폴더를 자기 하위로 복사·이동 시 무한 재귀 수정)

### 원인
`copyDir`의 WalkDir가 새로 만든 대상 폴더를 다시 순회 → `a\a\a\...` 무한 생성.
이동도 Rename 실패 후 copyDir 폴백으로 같은 문제 발생.

### 변경
- `transfer.go`: `isSubPath`(정규화 + Windows 대소문자 무시, 공통 접두사 형제 폴더 제외), `errIntoSelf`
- `copyDir`, `moveOne` 시작 시 하위 경로 검사
- 테스트: `transfer_test.go` 4건 추가 (isSubPath, 복사/이름변경복사/이동)

