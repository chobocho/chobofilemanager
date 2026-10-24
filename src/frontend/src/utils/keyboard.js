// 키보드 소유권 (Todo #119): 포커스가 터미널(xterm) 안에 있으면 키 입력은 모두 셸의 것.
// 파일 관리자의 전역 단축키(F키, Tab, Delete, Ctrl+문자 ...)는 이 경우 처리하지 않습니다.
export function isTerminalTarget(target) {
  return !!(target && typeof target.closest === 'function' && target.closest('.xterm, [data-terminal-root]'))
}
