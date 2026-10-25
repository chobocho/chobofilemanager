// 파일 이름 마스크 (Todo #133-2, Total Commander와 같은 문법)
//   *.txt;*.md   여러 개는 ; 또는 공백으로
//   *.*|a*       | 뒤는 제외 (포함이 비어 있으면 모두)
//   * ?          아무 글자들 / 한 글자, 대소문자 무시. *.* 는 확장자 없는 이름도 포함

function globToRegExp(glob) {
  if (glob === '*.*') return /^.*$/
  const body = glob.replace(/[.+^${}()[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${body}$`, 'i')
}

const splitMasks = (s) => s.split(/[;\s]+/).filter(Boolean).map(globToRegExp)

export function parseMask(mask) {
  const [inc = '', exc = ''] = (mask || '').split('|')
  const include = splitMasks(inc)
  const exclude = splitMasks(exc)
  // "|*.log"처럼 제외만 있으면 나머지 모두
  if (!include.length && exclude.length) include.push(/^.*$/)
  return { include, exclude }
}

export function matchMask(name, mask) {
  const { include, exclude } = typeof mask === 'string' ? parseMask(mask) : mask
  return include.some(r => r.test(name)) && !exclude.some(r => r.test(name))
}
