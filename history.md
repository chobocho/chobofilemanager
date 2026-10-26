# 변경 이력

> 이전 이력: [history_20261025_215114.md](history_20261025_215114.md) → [history_20261025_103719.md](history_20261025_103719.md) → [history_20261025_073230.md](history_20261025_073230.md) → [history_20261024_235349.md](history_20261024_235349.md) → [history_20261024_233705.md](history_20261024_233705.md)

## 2026-10-26 Todo.md #137-2: 권한 · 소유자 열과 chmod · chown 창 (Alt+A)
- 목록(`FileInfo`)에 `mode`(chmod 숫자, setuid · setgid · sticky 포함) · `owner` · `group` 추가 — 리눅스 · macOS만 이름(못 찾으면 숫자, id마다 한 번만 찾음), Windows는 비움
- 패널: '/' 경로(리눅스 · macOS)면 Mode(`-rwsr-xr-x`) · Owner(소유자:그룹) 열, 머리글로 정렬. Windows · FTP는 그대로, 압축 파일 안은 빈 칸
- Alt+A 창(`PermissionsDialog`): 9개 체크박스 + setuid/setgid/sticky + 숫자 칸(서로 맞춰짐, 잘못된 숫자는 단추 꺼짐), 소유자 · 그룹(/etc/passwd · group 후보)
  - 여러 개면 처음 값에서 **바꾼 비트만** 적용(파일마다 다른 비트는 그대로), 소유자가 서로 다르면 빈 칸 = 그대로
  - 하위 폴더까지: 권한은 바꾼 비트만(폴더의 실행 비트가 파일로 퍼지지 않게), 안의 링크는 따라가지 않음(chown은 링크 자체만). 실행 권한을 빼도 안까지 다 돌도록 폴더는 잠시 주인 rwx 후 아래부터 최종 권한
- Go `ChangeMode(paths, set, clear, recursive)` · `ChangeOwner(paths, owner, group, recursive)` · `GetOwnerChoices()` — 되는 것은 다 바꾸고 실패는 모아서 알림, 압축 파일 안 · FTP 거부, Windows는 "리눅스 · macOS에서만"
- 사용자 단추 `@perms`, 도움말 · README 갱신
- 테스트: perms_test.go(4) · perms_linux_test.go(9: 바꾼 비트만, 특수 비트, 하위까지 접근 권한 빼기 · 링크 너머 안 바뀜, 오류 뒤 계속, 이름 · 숫자 chown, 없는 이름, root가 아니면 남에게 못 줌, /etc 후보) — **WSL Ubuntu에서 실제 리눅스로 실행**, Permissions.test.js(18) — Go 전체 Windows · 리눅스, 프론트 1400개 통과

## 2026-10-26 Todo.md #137-3: 리눅스 특수 파일 · 심볼릭 링크 안전 복사
- 문제: 복사가 파일 종류를 보지 않고 내용을 읽음 — FIFO는 영원히 멈춤, `/dev/zero` 같은 장치는 끝없이 복사, 심볼릭 링크는 대상 내용을 복사(`/`를 가리키면 디스크 전체), 끊어진 링크는 복사 실패. 다른 디스크로 이동(복사 후 삭제)과 폴더 동기화도 같은 경로
- 추가 발견: 덮어쓸 대상이 심볼릭 링크면 `os.Create`가 링크를 따라가 링크가 가리키는 다른 파일에 씀
- 수정(`fileops.go` copyItem · copySymlink · copySpecialFile, `dirsync.go` syncItem):
  - 리눅스 · macOS: 심볼릭 링크는 링크로 복사(상대 · 끊어진 링크 그대로), Windows는 기존처럼 가리키는 내용(TC와 같게)
  - FIFO는 mkfifo로 다시 만들고, 장치 파일은 root면 mknod, 아니면 건너뜀. 소켓도 건너뜀 — 나머지는 다 복사하고 끝에 "특수 파일 N개는 복사하지 않았습니다: 이름" 알림(이동이면 원본을 지우지 않음)
  - `copyFile`은 일반 파일만 읽고, 덮어쓸 자리가 링크면 링크만 치움
  - 폴더 권한 유지(리눅스 · macOS): 안을 다 채운 뒤 아래부터 맞춰 읽기 전용 폴더도 복사됨
- 테스트: copyspecial_linux_test.go 8개(FIFO · 장치 · 소켓 · 링크 · 폴더 권한 · 동기화 · 링크 너머 쓰기 · 실제 XDG 휴지통) — **WSL Ubuntu에서 실제 리눅스로 실행**(Windows에서 `GOOS=linux go test -c`로 만든 바이너리), links_test 조상 링크 테스트를 OS별로 갱신 — Go 전체 Windows · 리눅스 통과

## 2026-10-26 Todo.md #137-1: 리눅스 휴지통 (F8 / Del)
- 원인: 리눅스 빌드의 휴지통이 stub이라 F8/Del이 항상 "Windows에서만 지원" 오류
- `xdgtrash.go`: freedesktop.org Trash 규격 — `files/`로 옮기고 `info/<이름>.trashinfo`(Path는 URL 이스케이프, DeletionDate)를 씀. Nautilus · Dolphin 휴지통에서 그대로 보이고 복원됨
  - 같은 장치: `$XDG_DATA_HOME/Trash`(기본 `~/.local/share/Trash`)
  - 다른 장치(USB 등): 마운트 위치의 `.Trash/$uid`(sticky이고 링크가 아닐 때만) 또는 `.Trash-$uid`, Path는 마운트 기준 상대 경로. 장치를 건너 복사하지 않음
  - 이름이 겹치면 `a.2.txt`, info는 O_EXCL로 먼저 잡고 옮기기가 실패하면 지움. 휴지통 폴더 자체·그 조상은 거부
- `trash_linux.go`: 장치 번호(st_dev)·sticky 연결, `trash_other.go`는 리눅스 외 OS만
- 테스트: xdgtrash_test.go 4개(홈 휴지통·이름 충돌·다른 장치·실패 처리, 장치는 주입해 Windows에서도 검증) — Go 전체 통과, 리눅스 amd64/arm64 빌드 확인

## 2026-10-26 Todo.md #136-2: 리눅스에서 Enter로 실행 권한(+x) 파일 실행
- 원인: 리눅스 Enter/더블클릭이 항상 xdg-open → 실행 파일이 실행되지 않음
- Go `FileInfo.executable`: 일반 파일 + 실행 비트(소유자·그룹·기타), 심볼릭 링크는 대상 기준, 디렉터리·FIFO 제외, Windows는 항상 false
- 프론트: 실행 파일이면 뷰어보다 먼저 터미널 도크를 열고 `cd '<폴더>' && <파일>` + Enter (mc처럼 출력이 보임). 셸이 아직 안 떴으면 뜬 뒤에. 압축 파일 안 · FTP는 실행 안 함
- `runCommand`(dock.ts): bash/zsh는 cd + &&, cmd는 cd /d, PowerShell은 Set-Location; & '경로'
- F1 도움말 Enter 설명 갱신, Todo #137에 mc 대비 부족 기능 10가지 정리
- 테스트: executable_test.go(TestExecMode, TestListDirectory_Executable), DK-RUN, DKV-14, FPC-09x — Go 전체(리눅스 대상 vet 포함) · 프론트 1382개 통과

## 2026-10-26 Todo.md #136-1: 리눅스에서 터미널 도크가 셸을 못 띄움
- 원인: 도크 셸 목록이 cmd/PowerShell/WSL로 고정, 기본값 cmd — 리눅스 백엔드의 로컬 셸은 bash/zsh/fish/sh뿐이라 "cmd"를 서버 주소로 접속하려 함
- `TerminalDock`: 시작 전에 이 PC의 셸 목록(`GetLocalShells`)을 받아 선택 목록을 채우고, 저장된 셸이 목록에 없으면 첫 셸로(한 번만 시작). 목록을 못 받으면 기존 목록. 셸 바꾸면 다시 시작은 "마지막으로 시작한 셸과 다를 때만"
- 테스트: DKV-12(bash로 한 번만 시작, 목록·선택), DKV-13(저장된 셸 유지, 목록 실패 시 기본) — 프론트 1379개 통과

## 2026-10-26 Todo.md #135: #134 수정분 리뷰 + 테스트 보강
- 버그(보안): 압축 풀기가 도중에 실패하면(안전하지 않은 경로 항목, 쓰기 실패) 이미 꺼낸 파일에 인터넷 표시(Zone.Identifier)가 붙지 않음 — 위험한 압축 파일일수록 오류로 끝나므로 보호가 가장 필요한 파일이 빠짐. `ExtractArchive`는 하위 폴더를 만든 직후 `defer`로, 압축 안 F5 복사는 오류 확인 전에 표시
- 리뷰 결과 이상 없음: 여러 이름 바꾸기 대소문자 키 · 동기화 임시 파일 교체 · diff CRLF 복원 · 썸네일 픽셀 제한 · ShellExecute 포인터 수명
- 테스트: TestArchive_MarkOfTheWebOnPartialExtract(ZIP), TestArchive_MarkOfTheWebOnPartialCopyOut(TAR), TestFTPPanel_MoveIntoOwnFolderKeepsSource — 수정 전 실패/수정 후 통과, Go 전체 통과

## 2026-10-26 F4 에디터 CRLF 저장 확인
- 요청: CRLF 파일을 F4로 고쳐 저장하면 CRLF로. 확인 결과 이미 그렇게 동작함(Todo #112): 열 때 원래 줄바꿈을 기억하고 저장할 때 CRLF로 되돌림(프론트 CT-10 · 원격 파일 RE-02). #133 보고의 "F4 에디터는 LF로 저장"은 잘못된 설명이었음
- 백엔드도 줄바꿈을 바꾸지 않는지 테스트 추가(crlf_save_test.go): UTF-8 · CP949 · UTF-16LE · 자동 인코딩 저장 후 다시 읽기, FTP 패널 저장 — Go 전체 통과

## 2026-10-26 Todo.md #134-3: 리뷰 수정 — 화면 갱신
- 폴더 트리(Ctrl+F8): 한 번 읽은 하위 폴더를 계속 써서 F7 · 삭제 · 이름 바꾸기 뒤에도 옛 목록이 보이던 문제 → 패널 목록이 새로 읽힐 때마다 지금 폴더의 하위 폴더를 다시 읽음
- 썸네일: 같은 이름의 그림을 덮어쓰고 새로 고쳐도 옛 썸네일이 남던 문제 → 파일 시각 · 크기가 바뀌면 그림 칸을 새로 만들어 다시 읽음(백엔드 캐시 키도 134-2에서 정리)
- 테스트: FT-06, VM-06 — 프론트 1377개 통과

## 2026-10-26 Todo.md #134-2: 리뷰 수정 — 안정성 · 보안
- 썸네일: 작은 파일이 거대한 크기(예 40000×40000)를 선언하면 풀다가 수 GB를 잡아 앱이 죽을 수 있던 문제 → `image.DecodeConfig`로 먼저 크기를 보고 6400만 픽셀 넘으면 거부. 압축 파일 안 그림의 캐시 키는 압축 파일의 크기·시각으로(압축 파일을 바꾸면 새로 만듦)
- ShellExecute(사용자 단추): 인자 문자열 포인터를 Call 전에 uintptr로 바꿔 두어 GC가 치울 수 있던 문제 → Call 인자 안에서만 바꿈
- 압축 파일에서 꺼낸 파일에 인터넷 표시(MOTW, Zone.Identifier)가 사라져 Office 보호된 보기 · SmartScreen을 건너뛸 수 있던 문제 → F5로 꺼내기 · Enter로 열기 · 압축 풀기(모든 형식) 모두 압축 파일의 표시를 꺼낸 파일마다 붙임(Windows, 7-Zip · WinRAR와 같은 처리). `archive.ExtractPaths`가 꺼낸 항목 경로를 돌려줌
- 테스트: TestReadThumbnail_RejectsHugeDimensions, TestArchive_PropagatesMarkOfTheWeb(Windows, ADS 실제 확인) — Go 전체 통과, Linux vet 통과

## 2026-10-26 Todo.md #134-1: 리뷰 수정 — 데이터 보호
- 파일 내용 비교: CodeMirror는 줄바꿈을 \n으로 바꾸는데 원본(CRLF)과 그대로 비교해, Ctrl+S가 안 고친 쪽까지 LF로 다시 쓰던 문제 → 원본도 \n으로 맞춰 비교, 고친 쪽만 저장하고 원래 CRLF면 CRLF로
- 폴더 동기화: 덮어쓰기가 대상 파일을 먼저 비우고 실패하면 지워 옛 사본이 사라지던 문제 → 같은 폴더 임시 파일에 복사한 뒤 바꿔 넣음(폴더는 파일마다). 이름 안의 ".."(v1..2.txt)를 거부하던 것도 경로 조각 ".."만 거부하게
- 여러 이름 바꾸기: Linux처럼 대소문자를 구분하는 곳에서 묶음 밖의 `a`를 `A`의 빈자리로 잘못 보고 덮어쓸 수 있던 문제 → 이름 비교를 OS에 맞게, 두 번째 단계에서도 대상이 있으면 덮어쓰지 않고 되돌림. 되돌리기에 실패해 임시 이름으로 남은 항목은 오류에 함께 알림
- FTP 같은 연결 안 이동(F6): 충돌 창에서 고른 방식을 무시하고 같은 이름 위로 옮기던 문제 → "이름 바꾸기"는 "x (1)", "덮어쓰기"는 있던 것을 지운 뒤
- 테스트: DV-07, TestSyncDirs_FailedCopyKeepsOldTarget · DotsInNames, TestRenameBatch_CaseSensitiveNeighbour(대소문자 구분 FS에서만) · ReportsLeftoverOnRollbackFailure, TestFTPPanel_MoveWithinConnectionHonoursMode — Go 전체 · 프론트 1375개 통과
- 참고(이번 변경 전부터): F4 에디터도 CRLF 파일을 고쳐 저장하면 LF로 저장됨

## 2026-10-26 Todo.md #133 마무리: README · 아키텍처 그림 갱신
- README: TC 기능 소개 한 단락, 아키텍처 표에 압축 안 · ftp:// 가상 경로와 internal/archive, 기능 목록 · 단축키 표(Alt+글자, Num+/-/*, Ctrl+M, Shift/Alt+F2, Ctrl+Shift+D, Ctrl+Q, Ctrl+F8, Ctrl+F1/F2, Ctrl+Shift+X, 압축 파일 Enter), 프로젝트 구조, 기술 스택(merge, 압축 라이브러리, x/image), 설정 파일(buttonbar.json, plugins/)
- docs/architecture.svg: 프론트(트리·썸네일·DiffView·QuickView·ButtonBar), package main(archivefs · ftppanel · dirsync · filecompare · renamebatch · thumbnail · userbuttons · plugins), internal/archive. Edge로 렌더링해 겹침 없음 확인

## 2026-10-26 Todo.md #133-13: 플러그인 (Ctrl+Shift+X, Starlark)
- TC의 DLL 플러그인(WCX/WLX/WFX) 호환 대신, 이미 있는 Starlark 실행기로 사용자 스크립트 플러그인: `~/.chobocho-commander/plugins/*.star`, 첫 줄들의 `# name:` `# description:`으로 이름·설명
- 스크립트가 받는 것: panel_path · target_path · cursor · selected · targets(고른 파일, 없으면 커서), 함수 read_text · write_text · list_dir · exists · is_dir · file_size · join_path · basename · dirname · mkdir · rename, print 출력. 맨 위 for/while 허용, 2천만 단계 · 15초 제한(무한 반복 멈춤), 파일을 바꾸는 함수를 쓰면 끝난 뒤 두 패널 새로 고침. 압축 파일 안 쓰기는 기존처럼 읽기 전용 오류
- `PluginDialog`: 목록(↑↓ Enter · 더블클릭 실행), 출력·오류(역추적) 표시, 폴더 열기(처음 만들 때 예제 2개: 줄 수 세기 · 파일 목록 만들기), 다시 읽기, "단추로 만들기" → 단추 막대에 `@plugin:파일.star`. 단추 막대에서 `@plugins`도
- 테스트: plugins_test.go 4개(예제 실행 포함), PluginDialog.test.js 5개, App AP-PG1 — Go 전체 · 프론트 1374개 통과

## 2026-10-26 Todo.md #133-12: 사용자 단추 막대
- Files 보기 위쪽에 `ButtonBar`: 클릭 실행, 우클릭 고치기, + 새 단추. `ButtonEditDialog`: 이름 · 명령 · 인자 · 시작 폴더, 앞으로/뒤로 · 지우기, 명령 칸에 앱 기능 목록(datalist)
- 자리 표시(`utils/buttonParams.js`, TC와 같은 글자): %P 활성 패널 · %T 반대 패널 · %N 커서 이름 · %F 커서 경로 · %S 고른 파일들(따옴표, 없으면 커서) · %%
- "@" 명령 = 앱 기능: @copy @move @mkdir @delete @search @compare @sync @diff @multirename @quickview @tree @terminal @ftp @refresh @hidden
- Go: 단추 목록 `~/.chobocho-commander/buttonbar.json`(원자적 저장, 손상되면 백업 후 빈 목록), `RunUserCommand` — Windows는 ShellExecute(프로그램 · 문서 · 웹 주소, 셸 구문 해석 없음, 기존 열기와 같은 함수에 인자 추가), 그 밖은 따옴표를 고려해 인자를 나눠 바로 실행. 시작 폴더가 FTP · 압축 안이면 홈
- 테스트: userbuttons_test.go 4개, ButtonBar.test.js(BP 4 · BS 1 · BB 1 · BE 2), App AP-BB1~2 — Go 전체 · 프론트 1368개 통과

## 2026-10-26 Todo.md #133-11: 보기 방식 — 자세히(Ctrl+F2) · 간단히(Ctrl+F1) · 썸네일(Ctrl+Shift+F1)
- 패널마다 보기 방식: 간단히는 이름만 세로로 채운 여러 열(창 높이에 맞춰 줄 수 계산), 썸네일은 그림 미리 보기 칸. 열 머리글은 자세히에서만
- 화살표: 간단히는 ↑↓ 한 칸 · ←→ 한 열, 썸네일은 ←→ 한 칸 · ↑↓ 한 줄, 맨 위에서 ↑는 [..] (`gridMove`). 선택·클릭·더블클릭·Enter는 같은 규칙
- Go `ReadThumbnail`(thumbnail.go): golang.org/x/image(BSD, v0.47.0 — 17일 지난 버전)로 PNG·JPEG·GIF·BMP·WebP를 긴 쪽 96px로 줄임(작은 그림은 그대로), 투명하면 PNG 아니면 JPEG, SVG는 그대로. 파일 크기·시각이 같으면 최근 300개 기억. 압축 파일 안·FTP 그림도
- 프론트 썸네일은 화면에 보일 때만 읽고(IntersectionObserver) 같은 파일·시각은 다시 읽지 않음
- 버그 예방: Toolbar가 Ctrl+F1을 도움말로, Ctrl+F2를 이름 바꾸기로 처리하지 않게. THIRD_PARTY_NOTICES 갱신(x/image)
- 테스트: thumbnail_test.go 4개, FilePanel.viewModes.test.js(GM 3 · VM 5) — Go 전체 · 프론트 1358개 통과

## 2026-10-26 Todo.md #133-10: 폴더 트리 (Ctrl+F8)
- 패널마다 Ctrl+F8로 왼쪽에 `FolderTree`: 루트(드라이브 · / · FTP 루트)부터 지금 폴더까지 펼쳐 보여 주고 지금 폴더 강조, 하위 폴더는 펼칠 때 읽음(폴더만, 숨김은 패널 설정 따름)
- 클릭으로 이동, 키보드 ↑↓ 이동 · → 펼치기/첫 하위 · ← 접기/부모 · Enter 이동(화살표는 파일 목록으로 새지 않음). 패널 폴더가 바뀌면 그 폴더까지 다시 펼침. 압축 파일 안처럼 목록에 없는 경로도 지금 폴더로 가는 길은 끼워 넣음
- 버그 예방: Toolbar가 Ctrl+F8도 휴지통(F8)으로 처리하던 것을 F8만으로
- 테스트: FolderTree.test.js(TA 1 · FT 5 · FP 2) — 프론트 1350개 통과

## 2026-10-26 Todo.md #133-9: 빠른 보기 (Ctrl+Q)
- TC처럼 Ctrl+Q를 누르면 반대 패널 자리에 `QuickView`(처음 열 때 불러옴): 활성 패널 커서 파일의 텍스트(앞 256KB) · 이미지 · 마크다운(뷰어와 같은 렌더링·정리) 미리 보기, 폴더는 계산한 크기 또는 "Space로 크기 계산", 그 밖의 파일·32MB 넘는 파일은 정보만
- 커서가 150ms 멈춘 뒤 읽고, 그 사이 다른 파일로 옮기면 앞 요청은 버림. 압축 파일 안·FTP 파일도 같은 API라 그대로 미리 보기
- 빠른 보기 중에는 Tab · h/l(a/d) 패널 전환을 막음, Ctrl+Q를 다시 누르면 패널 복귀
- 테스트: QuickView.test.js 6개, App AP-QV1 — 프론트 1342개 통과

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
