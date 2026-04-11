import { describe, it, expect } from 'vitest'
import { joinPath } from './fileStore.js'

// ─── BreadcrumbPath 경로 구성 로직 (FilePanel.jsx와 동일) ──────────────────────
function buildBreadcrumbParts(path) {
  const parts = []
  const segments = path.replace(/\\/g, '/').split('/')
  let acc = ''

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (i === 0 && seg === '') {
      acc = '/'
      parts.push({ name: '/', path: '/' })
      continue
    }
    if (!seg) continue
    if (i === 0 && /^[A-Za-z]:$/.test(seg)) {
      acc = seg + '/'
      parts.push({ name: seg, path: acc })
      continue
    }
    acc = acc.endsWith('/') ? `${acc}${seg}` : `${acc}/${seg}`
    parts.push({ name: seg, path: acc })
  }
  return parts
}

// ─── joinPath 단위 테스트 ──────────────────────────────────────────────────────

describe('joinPath', () => {
  // Unix 경로
  it('JP-01: Unix 경로에 이름을 결합한다', () => {
    expect(joinPath('/home/user', 'file.txt')).toBe('/home/user/file.txt')
  })

  it('JP-02: Unix 경로 끝에 슬래시가 있어도 중복 없이 결합한다', () => {
    expect(joinPath('/home/user/', 'file.txt')).toBe('/home/user/file.txt')
  })

  it('JP-03: Unix 루트 경로에 결합한다', () => {
    expect(joinPath('/', 'tmp')).toBe('/tmp')
  })

  // Windows 경로
  it('JP-04: Windows 경로에 이름을 결합한다', () => {
    expect(joinPath('C:\\Users\\user', 'file.txt')).toBe('C:\\Users\\user\\file.txt')
  })

  it('JP-05: Windows 경로 끝에 역슬래시가 있어도 중복 없이 결합한다', () => {
    expect(joinPath('C:\\Users\\user\\', 'file.txt')).toBe('C:\\Users\\user\\file.txt')
  })

  it('JP-06: Windows 드라이브 루트에 결합한다', () => {
    expect(joinPath('C:\\', 'Documents')).toBe('C:\\Documents')
  })

  it('JP-07: 디렉토리 이름을 결합한다 (Unix)', () => {
    expect(joinPath('/home/user', 'new_folder')).toBe('/home/user/new_folder')
  })

  it('JP-08: 디렉토리 이름을 결합한다 (Windows)', () => {
    expect(joinPath('D:\\Projects', 'my_app')).toBe('D:\\Projects\\my_app')
  })
})

// ─── BreadcrumbPath 경로 구성 테스트 ──────────────────────────────────────────

describe('BreadcrumbPath 경로 구성', () => {
  it('BC-01: Unix 경로의 첫 번째 파트가 "/" 이다', () => {
    const parts = buildBreadcrumbParts('/home/user/docs')
    expect(parts[0].path).toBe('/')
    expect(parts[0].name).toBe('/')
  })

  it('BC-02: Unix 경로 파트들이 올바르게 누적된다', () => {
    const parts = buildBreadcrumbParts('/home/user/docs')
    expect(parts.map(p => p.path)).toEqual(['/', '/home', '/home/user', '/home/user/docs'])
  })

  it('BC-03: Windows 드라이브 루트가 "/C:" 가 아닌 "C:/" 로 시작한다 (핵심 버그 수정)', () => {
    const parts = buildBreadcrumbParts('C:\\github\\temp')
    expect(parts[0].path).toBe('C:/')
    expect(parts[0].path).not.toBe('/C:')
  })

  it('BC-04: Windows 경로 파트들이 올바르게 누적된다', () => {
    const parts = buildBreadcrumbParts('C:\\github\\temp')
    expect(parts.map(p => p.path)).toEqual(['C:/', 'C:/github', 'C:/github/temp'])
  })

  it('BC-05: Windows 다른 드라이브도 올바르게 처리한다 (D:)', () => {
    const parts = buildBreadcrumbParts('D:\\Projects\\myapp')
    expect(parts[0].path).toBe('D:/')
    expect(parts.map(p => p.path)).toEqual(['D:/', 'D:/Projects', 'D:/Projects/myapp'])
  })

  it('BC-06: Windows 경로에서 중간에 슬래시 혼용도 처리한다', () => {
    const parts = buildBreadcrumbParts('C:/Users/user/Documents')
    expect(parts[0].path).toBe('C:/')
    expect(parts[1].path).toBe('C:/Users')
  })
})

// ─── rename 경로 구성 로직 테스트 ─────────────────────────────────────────────

describe('rename 경로 구성', () => {
  // rename 함수 내부와 동일한 로직
  function buildRenamePath(oldPath, newName) {
    const lastSep = Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\'))
    return oldPath.substring(0, lastSep + 1) + newName
  }

  it('RP-01: Unix 경로에서 파일명을 교체한다', () => {
    expect(buildRenamePath('/home/user/old.txt', 'new.txt')).toBe('/home/user/new.txt')
  })

  it('RP-02: Unix 경로에서 확장자 변경도 처리한다', () => {
    expect(buildRenamePath('/home/user/doc.md', 'doc.txt')).toBe('/home/user/doc.txt')
  })

  it('RP-03: Windows 경로에서 파일명을 교체한다', () => {
    expect(buildRenamePath('C:\\Users\\user\\old.txt', 'new.txt')).toBe('C:\\Users\\user\\new.txt')
  })

  it('RP-04: Windows 중첩 경로에서 파일명을 교체한다', () => {
    expect(buildRenamePath('D:\\Projects\\app\\main.go', 'app.go')).toBe('D:\\Projects\\app\\app.go')
  })

  it('RP-05: 디렉토리 이름을 교체한다 (Unix)', () => {
    expect(buildRenamePath('/home/user/old_folder', 'new_folder')).toBe('/home/user/new_folder')
  })

  it('RP-06: 디렉토리 이름을 교체한다 (Windows)', () => {
    expect(buildRenamePath('C:\\Users\\user\\old_folder', 'new_folder')).toBe('C:\\Users\\user\\new_folder')
  })
})
