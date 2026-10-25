# 변경 이력

> 이전 이력: [history_20261025_215114.md](history_20261025_215114.md) → [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-26 Todo.md #133-8: FTP를 파일 패널에서
- 패널 경로 `ftp://<연결 ID>/원격/경로`. Go `ftppanel.go` + App 라우팅: 목록, F5 받기·올리기(폴더는 하위까지, 덮어쓰기·건너뛰기·이름 바꾸기 충돌 처리), F6 이동(같은 연결 안은 RNFR/RNTO, 받기·올리기는 복사 후 원본 삭제), F8/Shift+Del 삭제(파일·폴더 판별), F7 새 폴더, Ctrl+N 빈 파일, F2 이름 바꾸기, F3/F4 보기·편집(임시로 받아 읽고, 저장은 원래 인코딩 유지 후 올리기), Enter 기본 앱 열기, Space 폴더 크기, 파일 내용 비교
- 막는 것(이유 표시): FTP끼리 복사, 휴지통(F8은 영구 삭제 확인으로), 검색·명령 실행·압축·동기화·여러 이름 바꾸기
- 프론트: 드라이브 목록에 "FTP: user@host" 연결들과 "FTP 연결..."(기존 연결 창 재사용), 경로 표시줄·탭 이름은 user@host, 루트에선 [..] 없음, 연결 끊기 단추(그 연결을 보던 패널은 홈으로), 다시 시작하면 저장된 FTP 탭은 홈으로, 터미널 도크의 "패널 따라가기"는 FTP·압축 안 경로로 cd하지 않음
- 테스트: ftppanel_test.go 6개(가짜 FTP 서버), ftpPanel.test.js 7개, App AP-FTP1~2 — Go 전체 · 프론트 1335개 통과
- 참고: App.cov.test.js의 TV-01은 이 파일만 따로 돌리면 지연 로딩이 1초를 넘어 실패(변경 전부터, 전체 실행에서는 통과)

## 2026-10-25 Todo.md #133-7: 파일 내용 비교 (Ctrl+Shift+D, @codemirror/merge)
- 의존성: `@codemirror/merge` 6.12.2(MIT, 에디터와 같은 CodeMirror 6) — 6일 전에 나온 6.12.3 대신 검증 기간이 지난 버전으로 고정, lock은 npm 10으로 갱신(npm 10/11 `npm ci` 확인), THIRD_PARTY_NOTICES 갱신
- `DiffView`(처음 열 때 불러옴): 좌우 diff, 바뀐 줄·글자 강조, 구문 강조, Alt+↑/↓ 이전·다음 차이, "같은 부분 접기", 양쪽 편집 → Ctrl+S가 고친 쪽만 저장, 고친 채 Esc는 한 번 더 눌러야 닫힘. 떠 있는 동안 키는 패널로 새지 않음
- 대상(`utils/diffTargets.js`, TC와 같게): 한 패널에서 고른 파일 두 개, 아니면 커서 파일 + 반대 패널의 같은 이름 파일(없으면 반대 패널 커서 파일). 동기화 창(Alt+F2)에서 양쪽에 있는 파일 줄 더블클릭으로도 열림
- Go `CompareFileBytes`: 앞 8KB에 NUL이 있으면 바이너리 — 첫 차이 위치(10진·16진)와 크기만 표시. 압축 파일 안의 파일도 비교 가능
- 테스트: filecompare_test.go 2개, DiffView.test.js(PT 4 · DV 6), App AP-DF1~2 — Go 전체 · 프론트 1326개 통과, vite build 확인

## 2026-10-25 Todo.md #133-6: 폴더 비교(Shift+F2) · 동기화(Alt+F2)
- Shift+F2 (`utils/compareDirs.js`): 두 패널을 이름(대소문자 무시)으로 맞춰 각 쪽에서 더 새 파일 · 한쪽에만 있는 파일 선택, 날짜 같고 크기 다르면 양쪽, 2초 이내 차이는 같은 시각. 폴더는 무시(TC와 같게)
- Alt+F2 `SyncDialog`: 열자마자 비교, 옵션(하위 폴더 · 내용 비교 · 날짜 무시), 보기 필터(→ ← = ≠ 개수), 줄마다 방향 칸 클릭(→ ← 없음), 보이는 항목 중 방향 있는 것만 "동기화 (N)", 끝나면 다시 비교 + 두 패널 새로 고침. 양쪽에 있는 파일 줄 더블클릭은 내용 비교(133-7에서 연결)
- Go `CompareDirs`(dirsync.go): equal · left-newer · right-newer · different · left-only · right-only, 한쪽에만 있는 폴더는 한 항목, 내용 비교는 64KB씩, 20만 항목 제한. `SyncDirs`: 방향대로 복사(폴더는 하위까지), `..`·잘못된 방향 거부
- 복사(F5)할 때 수정 시각 유지 (TC와 같게, 동기화 후 다시 비교하면 같음)
- 테스트: dirsync_test.go 7개, SyncDialog.test.js(CL·DD·SY·CS 10개), Toolbar KB-F2 — Go 전체 · 프론트 1314개 통과

## 2026-10-25 Todo.md #133-5: 압축 파일을 폴더처럼 (ZIP · TAR · TAR.GZ/BZ2/XZ · 7Z · RAR)
- `internal/archive` 신규: 형식마다 다른 읽기(목록 · 순서대로 읽기)를 하나로. 이름은 '/'로 정리해 압축 루트 밖으로 못 나감(`../x` → `x`), 경로에만 있는 폴더도 만들어 줌, 최근 8개 목록 캐시. `Split`이 "C:\x\a.zip\docs" 같은 경로에서 압축 파일과 안쪽 경로를 찾음. `Extract`(고른 항목, 덮어쓰기·건너뛰기·이름 바꾸기, 수정 시각 유지)
- 7Z: github.com/bodgit/sevenzip(BSD-3), RAR: github.com/nwaples/rardecode/v2(BSD-2), TAR.XZ: ulikunitz/xz. THIRD_PARTY_NOTICES 다시 생성
- package main(`archivefs.go`): ListDirectory가 압축 파일·그 안 경로를 목록으로(`readOnly`), F5 복사는 풀어서 꺼내기(충돌 방식 그대로), F3 보기·Space 크기·Ctrl+F 검색도 안에서, Enter로 기본 앱 열기는 임시 폴더에 풀어서. 이동·삭제·휴지통·이름 바꾸기·새 폴더/파일·저장·압축은 "읽기 전용" 오류
- 압축 풀기 단추: ZIP 말고도 모든 형식 (.tar.gz는 확장자를 모두 뺀 폴더 이름)
- 프론트: 압축 파일에서 Enter/더블클릭 → 안으로, 머리글에 "읽기 전용", F6/F7/F8/F2/Ctrl+M/F4/압축은 바로 막고 상태 표시줄 안내
- 테스트: internal/archive 10개(ZIP·TAR 계열·7Z 실제 파일·RAR 오류·Split·Extract 모드), archivefs_test.go 6개, archivePanel.test.js 6개 — Go 전체 · 프론트 1303개 통과. RAR는 만들 도구가 없어 실제 파일로는 확인 못 함

## 2026-10-25 Todo.md #133-4: 여러 이름 바꾸기 (Ctrl+M)
- `utils/multiRename.js`: TC 마스크 — [N] [N2-5] [N3] [N2-] [E] [C](시작·증가·자릿수) [P] [YMD] [hms] [Y][M][D][h][m][s], 찾아 바꾸기(글자는 대소문자 무시, 정규식은 $1 그룹), 대소문자(소문자·대문자·단어 첫 글자). 계획 단계에서 빈 이름·쓸 수 없는 글자·끝 공백/점·묶음 안 중복·묶음 밖 기존 이름 충돌 검사
- `MultiRenameDialog`: 마스크 단추(커서 자리에 넣기), 미리 보기 표(바뀌는 것·오류 색 표시), 충돌이 있으면 바꾸기 꺼짐, 실패하면 창에 오류
- Go `RenameBatch`: 모두 임시 이름으로 옮긴 뒤 새 이름으로(묶음 안 맞바꾸기 a↔b·이어 바꾸기 1→2→3 가능), 다른 폴더·중복·기존 이름은 아무것도 바꾸지 않고 거부, 중간 실패는 되돌림
- 단축키: Ctrl+M = 여러 이름 바꾸기(TC와 같게), Starlark 스크래치는 Ctrl+Shift+M으로 옮김
- 테스트: renamebatch_test.go 6개, multiRename.test.js 16개, MultiRenameDialog.test.js 8개, App AP-MR1, 단축키 테스트 갱신 — Go 전체 · 프론트 1297개 통과

## 2026-10-25 Todo.md #133-3: Alt+글자 빠른 검색
- 패널 아래 검색 칸: 입력한 글자로 시작하는 파일로 커서 이동(대소문자 무시), `*` `?`가 있으면 어디든. 맞는 파일이 없는 글자는 받지 않음(TC와 같게)
- ↑↓ 이전/다음 일치(끝에서 처음으로), Enter 닫고 열기, Esc · Tab · 포커스 이동 시 닫기. Ctrl+Alt(AltGr)·Alt+Shift는 검색 아님
- 테스트: FilePanel.quicksearch.test.js(QS-01~04, QP-01~06) — 프론트 1272개 통과

## 2026-10-25 Todo.md #133-2: 와일드카드 선택 (Num+ / Num- / Num*)
- `utils/mask.js`: TC 마스크 문법 — `*` `?`, 여러 개는 `;`/공백, `|` 뒤는 제외, `*.*`는 확장자 없는 이름도, 대소문자 무시
- Num+ 선택 창 / Num- 해제 창(`SelectMaskDialog`, 마지막 마스크 기억, "폴더도" 선택), Num* 반전(파일만), Ctrl+Num+ 모두 선택, Ctrl+Num- 모두 해제. 주 키보드 `-`(뒤로)는 그대로
- 테스트: selectMask.test.js(MK·SM·SK·SD 14개) — 프론트 1262개 통과

## 2026-10-25 Todo.md #133-1: Space로 폴더 크기 계산 (Total Commander와 같게)
- Go `DirSize`(dirsize.go): 하위까지 파일 크기 합 · 파일 수 · 폴더 수, 읽을 수 없는 하위 항목은 건너뜀
- 패널: 폴더에서 Space → 선택 + 크기 계산, `<DIR>` 자리에 크기 표시, 선택 합계에 포함. Alt+Shift+Enter → 보이는 모든 폴더
- 계산한 크기는 같은 폴더 새로 고침에선 유지, 다른 폴더로 가면 지움. 상태 표시줄에 "이름: 크기 (파일 N개, 폴더 M개)"
- 테스트: dirsize_test.go 4개, FilePanel.dirsize.test.js(DS-01~07) — Go 전체 · 프론트 1248개 통과

## 2026-10-25 README 전체 갱신 + 아키텍처 다이어그램
- `docs/architecture.svg` 신규: 실행 파일(창 · 브라우저 · 헤드리스) → 프론트엔드(App.jsx, 파일 관리자, 터미널, wailsjs ⇄ web_shim.js) → 백엔드(package main, internal/termapp Host와 연결·전송·web·luahost·설정, 공용 internal) → 디스크 · 외부. 불투명 배경이라 GitHub 다크 모드에서도 읽힘, Edge 헤드리스로 렌더링해 겹침 확인
- README: "아키텍처" 섹션(그림 + 층별 표 + 프론트↔백엔드 통신), 기능 목록 갱신(vim/WASD, 빠른 이동, 뷰어·에디터, 명령 실행 창, 웹 서버, FTPS, F1 도움말), 단축키 표에 뷰어·에디터 추가, 프로젝트 구조를 실제 파일·패키지로, Node 24·CI 단계·버전 관리·헤드리스 직접 빌드 명령, 기술 스택(pty, websocket, Starlark, marked, Vitest)
- 확인: Go 전체 · 프론트 1241개 통과

## 2026-10-25 F1 도움말 전체 갱신
- 파일 관리자 F1(`HelpDialog.jsx`): 실제 키 처리와 대조해 빠진 단축키 추가
  - 탐색: vim(j/k, h/l)·WASD(w/s, a/d) 이동, Shift+글자 빠른 이동, `-` 이전 폴더, Ctrl/Shift+클릭
  - 새 섹션 "보기 · 편집 (F3 / F4)": F3↔F4 전환, Ctrl+F 찾기, Ctrl+S 저장, .star 실행(F5 / Ctrl+Enter), 이미지 ←/→ · 확대/축소 · hjkl 스크롤
  - "터미널" 섹션: 도크 키 + Terminal 보기의 F1 전체 도움말 안내, 사용자 화면에 보이던 "Todo #122" 제거
  - 기타: Ctrl+O 명령 실행 창, 보기 전환 단추(FTP 단추 숨기기)
- 터미널 F1(`helpText.ts`): 새 섹션 "파일 관리자와 함께"(F9 도크·패널 따라가기, 경로 붙여넣기, 원격 파일 ↔ 패널, 웹 서버·헤드리스, FTP 버튼 설정), 한국어·영어 같은 구성
- 버그: 라이선스·서드파티 링크가 `blob/main`(없는 브랜치)을 가리킴 → `blob/master`

### 테스트
- HD-01 섹션 목록 갱신, HD-05(실제 단축키가 도움말에 모두 있음, "Todo #" 노출 없음), HL-01b(링크 브랜치, 새 섹션) — 프론트 1241개·타입 검사 통과
