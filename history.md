# 변경 이력

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
