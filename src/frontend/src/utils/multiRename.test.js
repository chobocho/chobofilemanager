import { describe, it, expect } from 'vitest'
import { renameOne, planRenames, DEFAULT_RENAME } from './multiRename.js'

// Todo #133-4: 여러 이름 바꾸기 (Total Commander Ctrl+M과 같은 마스크)

const f = (name, extra = {}) => ({
  name, path: `/d/${name}`, isDir: false, modified: '2026-03-07T09:05:02', ...extra,
})
const opts = (o) => ({ ...DEFAULT_RENAME, ...o })

describe('renameOne (MR)', () => {
  it('MR-01: 기본 [N].[E]는 그대로, 확장자 없는 이름도', () => {
    expect(renameOne(f('photo.JPG'), 0, opts())).toBe('photo.JPG')
    expect(renameOne(f('Makefile'), 0, opts())).toBe('Makefile')
    expect(renameOne(f('a.tar.gz'), 0, opts())).toBe('a.tar.gz')
  })
  it('MR-02: [N2-4] [N3] [N2-] 글자 범위 (1부터)', () => {
    expect(renameOne(f('abcdef.txt'), 0, opts({ nameMask: '[N2-4]' }))).toBe('bcd.txt')
    expect(renameOne(f('abcdef.txt'), 0, opts({ nameMask: '[N3]' }))).toBe('c.txt')
    expect(renameOne(f('abcdef.txt'), 0, opts({ nameMask: '[N2-]' }))).toBe('bcdef.txt')
    expect(renameOne(f('abc.txt'), 0, opts({ nameMask: '[N2-9]' }))).toBe('bc.txt')
  })
  it('MR-03: [C] 카운터 — 시작·증가·자릿수', () => {
    const o = opts({ nameMask: 'img_[C]', counterStart: 5, counterStep: 10, counterDigits: 3 })
    expect(renameOne(f('x.png'), 0, o)).toBe('img_005.png')
    expect(renameOne(f('y.png'), 2, o)).toBe('img_025.png')
  })
  it('MR-04: [YMD] [hms] [Y] [M] [D] 수정 시각, [P] 부모 폴더, 글자는 그대로', () => {
    expect(renameOne(f('a.txt'), 0, opts({ nameMask: '[YMD]_[hms]' }))).toBe('20260307_090502.txt')
    expect(renameOne(f('a.txt'), 0, opts({ nameMask: '[Y]-[M]-[D] [N]' }))).toBe('2026-03-07 a.txt')
    expect(renameOne(f('a.txt'), 0, opts({ nameMask: '[P]-[N]' }))).toBe('d-a.txt')
  })
  it('MR-05: 확장자 마스크, 비우면 확장자 없음', () => {
    expect(renameOne(f('a.jpeg'), 0, opts({ extMask: 'jpg' }))).toBe('a.jpg')
    expect(renameOne(f('a.jpeg'), 0, opts({ extMask: '' }))).toBe('a')
  })
  it('MR-06: 찾아 바꾸기 — 글자(대소문자 무시) / 정규식(그룹 참조)', () => {
    expect(renameOne(f('My Photo.jpg'), 0, opts({ search: ' ', replace: '_' }))).toBe('My_Photo.jpg')
    expect(renameOne(f('IMG_IMG.jpg'), 0, opts({ search: 'img', replace: 'p' }))).toBe('p_p.jpg')
    expect(renameOne(f('2026-03-07.log'), 0, opts({ search: '(\\d+)-(\\d+)-(\\d+)', replace: '$3.$2.$1', regex: true }))).toBe('07.03.2026.log')
  })
  it('MR-07: 대소문자 — 소문자 / 대문자 / 단어 첫 글자', () => {
    expect(renameOne(f('My File.TXT'), 0, opts({ caseMode: 'lower' }))).toBe('my file.txt')
    expect(renameOne(f('My File.txt'), 0, opts({ caseMode: 'upper' }))).toBe('MY FILE.TXT')
    expect(renameOne(f('my fILE.txt'), 0, opts({ caseMode: 'title' }))).toBe('My File.txt')
  })
  it('MR-08: 폴더는 확장자를 나누지 않음', () => {
    expect(renameOne(f('v1.2', { isDir: true }), 0, opts({ nameMask: '[N]_old' }))).toBe('v1.2_old')
  })
  it('MR-09: 잘못된 정규식은 오류', () => {
    expect(() => renameOne(f('a'), 0, opts({ search: '(', regex: true }))).toThrow()
  })
})

describe('planRenames (MP)', () => {
  const files = [f('a.txt'), f('b.txt'), f('c.txt')]

  it('MP-01: 바뀌는 것만 changed, 안 바뀌면 그대로', () => {
    const plan = planRenames(files, opts({ nameMask: '[N]' }), ['a.txt', 'b.txt', 'c.txt'])
    expect(plan.rows.every(r => !r.changed && !r.error)).toBe(true)
    expect(plan.ok).toBe(false) // 바꿀 게 없음
  })
  it('MP-02: 묶음 안의 같은 이름은 충돌 (대소문자 무시)', () => {
    const plan = planRenames(files, opts({ nameMask: 'same', extMask: 'TXT' }), ['a.txt', 'b.txt', 'c.txt'])
    expect(plan.rows.filter(r => r.error).length).toBe(3)
    expect(plan.ok).toBe(false)
  })
  it('MP-03: 묶음 밖의 이미 있는 이름과 충돌, 묶음 안끼리 이름 맞바꾸기는 허용', () => {
    const p1 = planRenames([f('a.txt')], opts({ nameMask: 'z' }), ['a.txt', 'z.txt'])
    expect(p1.rows[0].error).toMatch(/있/)
    // 1→2, 2→3: 2.txt는 이미 있지만 같은 묶음에서 다른 이름으로 바뀌므로 허용
    const chain = planRenames([f('1.txt'), f('2.txt')], opts({ nameMask: '[C]', counterStart: 2 }), ['1.txt', '2.txt'])
    expect(chain.ok).toBe(true)
    expect(chain.rows.map(r => r.newName)).toEqual(['2.txt', '3.txt'])
  })
  it('MP-04: 쓸 수 없는 글자 / 빈 이름 / . .. 는 오류', () => {
    expect(planRenames([f('a.txt')], opts({ nameMask: 'a:b' }), []).rows[0].error).toBeTruthy()
    expect(planRenames([f('a.txt')], opts({ nameMask: '', extMask: '' }), []).rows[0].error).toBeTruthy()
    expect(planRenames([f('a.txt')], opts({ nameMask: '..', extMask: '' }), []).rows[0].error).toBeTruthy()
  })
  it('MP-05: 정상 계획 — ok, 바뀌는 쌍(old 경로 → new 이름)', () => {
    const plan = planRenames(files, opts({ nameMask: 'f[C]' }), ['a.txt', 'b.txt', 'c.txt'])
    expect(plan.ok).toBe(true)
    expect(plan.pairs).toEqual([
      { old: '/d/a.txt', new: '/d/f1.txt' }, { old: '/d/b.txt', new: '/d/f2.txt' }, { old: '/d/c.txt', new: '/d/f3.txt' },
    ])
  })
  it('MP-06: 정규식 오류는 계획 전체 오류', () => {
    const plan = planRenames(files, opts({ search: '[', regex: true }), [])
    expect(plan.ok).toBe(false)
    expect(plan.error).toBeTruthy()
  })
  it('MP-07: Windows 경로도', () => {
    const plan = planRenames([f('a.txt', { path: 'C:\\x\\a.txt' })], opts({ nameMask: 'b' }), ['a.txt'])
    expect(plan.pairs).toEqual([{ old: 'C:\\x\\a.txt', new: 'C:\\x\\b.txt' }])
  })
})
