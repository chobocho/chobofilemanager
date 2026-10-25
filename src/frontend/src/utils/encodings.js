// 뷰어·에디터가 함께 쓰는 인코딩 목록 (Todo #126: FileViewer에서 옮김 — 에디터가 뷰어를 가져오지 않도록)
// 인코딩 순환 — F3/F4 뷰어/편집기 UI에서 자동 판별이 틀렸을 때 수동 변경.
// 백엔드 ReadTextFileWithEncoding 의 encName 인자와 일치해야 함.
export const ENCODINGS = ['auto', 'utf-8', 'utf-16le', 'utf-16be', 'cp949', 'johab']
export const ENCODING_LABELS = {
  'auto':     'Auto',
  'utf-8':    'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  'cp949':    'CP949',
  'johab':    'Johab',
}
export function nextEncoding(current) {
  const idx = ENCODINGS.indexOf(current)
  if (idx === -1) return 'auto'
  return ENCODINGS[(idx + 1) % ENCODINGS.length]
}
