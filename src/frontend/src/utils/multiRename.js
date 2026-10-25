// 여러 이름 바꾸기 (Ctrl+M, Todo #133-4) — Total Commander의 마스크 문법
//   [N] 이름(확장자 빼고)  [N2-5] 2~5번째 글자  [N3] 3번째 글자  [N2-] 2번째부터 끝까지
//   [E] 확장자(점 빼고)    [C] 카운터           [P] 부모 폴더 이름
//   [YMD] [hms] [Y] [M] [D] [h] [m] [s] 수정 시각,  그 밖의 글자는 그대로
// 순서: 마스크 → 찾아 바꾸기 → 대소문자

export const DEFAULT_RENAME = {
  nameMask: '[N]', extMask: '[E]',
  search: '', replace: '', regex: false,
  caseMode: 'keep', // keep | lower | upper | title
  counterStart: 1, counterStep: 1, counterDigits: 1,
}

// 이름 → [이름, 확장자]. 앞의 점(.bashrc)은 확장자가 아님, 폴더는 나누지 않음
export function splitName(name, isDir) {
  const dot = name.lastIndexOf('.')
  if (isDir || dot <= 0) return [name, '']
  return [name.slice(0, dot), name.slice(dot + 1)]
}

const pad = (n, w) => String(n).padStart(w, '0')
const parentName = (path) => path.replace(/[/\\]+$/, '').split(/[/\\]/).slice(-2, -1)[0] || ''
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function expandMask(mask, file, index, opts) {
  const [base, ext] = splitName(file.name, file.isDir)
  const d = new Date(file.modified)
  const ok = !isNaN(d)
  const counter = Number(opts.counterStart) + index * Number(opts.counterStep)
  const time = {
    Y: ok ? String(d.getFullYear()) : '', M: ok ? pad(d.getMonth() + 1, 2) : '', D: ok ? pad(d.getDate(), 2) : '',
    h: ok ? pad(d.getHours(), 2) : '', m: ok ? pad(d.getMinutes(), 2) : '', s: ok ? pad(d.getSeconds(), 2) : '',
  }
  return mask.replace(/\[(N)(\d+)?(-)?(\d+)?\]|\[(E|C|P|YMD|hms|Y|M|D|h|m|s)\]/g, (all, n, from, dash, to, tag) => {
    if (n) {
      if (!from) return base
      const a = Number(from) - 1
      if (!dash) return base.slice(a, a + 1)
      return to ? base.slice(a, Number(to)) : base.slice(a)
    }
    switch (tag) {
      case 'E': return ext
      case 'C': return pad(counter, Math.max(1, Number(opts.counterDigits) || 1))
      case 'P': return parentName(file.path)
      case 'YMD': return time.Y + time.M + time.D
      case 'hms': return time.h + time.m + time.s
      default: return time[tag]
    }
  })
}

function applyCase(name, mode) {
  if (mode === 'lower') return name.toLowerCase()
  if (mode === 'upper') return name.toUpperCase()
  if (mode === 'title') return name.toLowerCase().replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase())
  return name
}

// 파일 하나의 새 이름 (index: 묶음 안 순서, 카운터용). 잘못된 정규식이면 예외
export function renameOne(file, index, opts) {
  const o = { ...DEFAULT_RENAME, ...opts }
  const base = expandMask(o.nameMask, file, index, o)
  const ext = file.isDir ? '' : expandMask(o.extMask, file, index, o)
  let name = ext ? `${base}.${ext}` : base
  if (o.search) {
    const re = o.regex ? new RegExp(o.search, 'g') : new RegExp(escapeRe(o.search), 'gi')
    name = name.replace(re, o.regex ? o.replace : () => o.replace)
  }
  return applyCase(name, o.caseMode)
}

export function nameError(name) {
  if (!name) return '빈 이름'
  if (name === '.' || name === '..') return '쓸 수 없는 이름'
  if (/[\\/:*?"<>|\x00-\x1f]/.test(name)) return '쓸 수 없는 글자 (\\ / : * ? " < > |)'
  if (/[ .]$/.test(name)) return '끝이 공백이나 점'
  return ''
}

function joinSibling(oldPath, newName) {
  const i = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'))
  return oldPath.slice(0, i + 1) + newName
}

// 묶음 계획: rows(미리 보기), pairs(실제로 바뀌는 old→new 경로), ok(오류 없고 바뀌는 게 있음)
// existingNames: 그 폴더에 지금 있는 이름들 — 묶음 밖의 이름과 겹치면 오류 (묶음 안끼리는 허용: 백엔드가 두 단계로 바꿈)
export function planRenames(files, opts, existingNames) {
  let rows
  try {
    rows = files.map((file, i) => ({ file, newName: renameOne(file, i, opts) }))
  } catch (err) {
    return { rows: files.map(file => ({ file, newName: file.name, changed: false, error: '' })), pairs: [], ok: false, error: `정규식 오류: ${err.message}` }
  }
  const lower = (s) => s.toLowerCase()
  const batchOld = new Set(files.map(f => lower(f.name)))
  const existing = new Set((existingNames || []).map(lower))
  const counts = new Map()
  for (const r of rows) counts.set(lower(r.newName), (counts.get(lower(r.newName)) || 0) + 1)

  for (const r of rows) {
    r.changed = r.newName !== r.file.name
    r.error = nameError(r.newName)
    if (!r.error && counts.get(lower(r.newName)) > 1) r.error = '같은 이름이 여럿'
    if (!r.error && r.changed && existing.has(lower(r.newName)) && !batchOld.has(lower(r.newName))) r.error = '이미 있는 이름'
  }
  const pairs = rows.filter(r => r.changed && !r.error).map(r => ({ old: r.file.path, new: joinSibling(r.file.path, r.newName) }))
  const ok = rows.every(r => !r.error) && pairs.length > 0
  return { rows, pairs, ok }
}
