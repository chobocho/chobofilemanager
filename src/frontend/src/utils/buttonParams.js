// 사용자 단추 (Todo #133-12): 인자·시작 폴더의 자리 표시 (Total Commander와 같은 글자)
//   %P 활성 패널 폴더   %T 반대 패널 폴더   %N 커서 파일 이름   %F 커서 파일 전체 경로
//   %S 고른 파일들(없으면 커서 파일)의 전체 경로를 따옴표로 묶어 공백으로   %% 글자 %

export function expandParams(template, ctx) {
  const selected = ctx.selected?.length ? ctx.selected : ctx.cursor ? [ctx.cursor.path] : []
  return (template || '').replace(/%([PTNFS%])/g, (_, c) => {
    switch (c) {
      case 'P': return ctx.activePath || ''
      case 'T': return ctx.targetPath || ''
      case 'N': return ctx.cursor?.name || ''
      case 'F': return ctx.cursor?.path || ''
      case 'S': return selected.map(p => `"${p}"`).join(' ')
      default: return '%'
    }
  })
}

// "@"로 시작하는 명령 = 앱 안의 기능 (App이 실행). "@plugin:파일.star"는 그 플러그인 실행
export const INTERNAL_COMMANDS = [
  { id: '@copy', label: '복사 (F5)' },
  { id: '@move', label: '이동 (F6)' },
  { id: '@mkdir', label: '새 폴더 (F7)' },
  { id: '@delete', label: '휴지통 (F8)' },
  { id: '@search', label: '파일 검색 (Ctrl+F)' },
  { id: '@compare', label: '폴더 비교 (Shift+F2)' },
  { id: '@sync', label: '폴더 동기화 (Alt+F2)' },
  { id: '@diff', label: '파일 내용 비교 (Ctrl+Shift+D)' },
  { id: '@multirename', label: '여러 이름 바꾸기 (Ctrl+M)' },
  { id: '@perms', label: '권한 · 소유자 (Alt+A)' },
  { id: '@quickview', label: '빠른 보기 (Ctrl+Q)' },
  { id: '@tree', label: '폴더 트리 (Ctrl+F8)' },
  { id: '@terminal', label: '터미널 도크 (F9)' },
  { id: '@ftp', label: 'FTP 연결' },
  { id: '@refresh', label: '새로 고침 (Ctrl+R)' },
  { id: '@hidden', label: '숨김 파일 (Ctrl+H)' },
  { id: '@plugins', label: '플러그인 창 (Ctrl+Shift+X)' },
]
