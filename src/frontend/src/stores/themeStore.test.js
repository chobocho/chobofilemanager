import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// themeStore를 각 테스트마다 새로 로드하기 위해 dynamic import 사용
const STORAGE_KEY = 'cfm-theme'

describe('useThemeStore', () => {
  let useThemeStore

  beforeEach(async () => {
    localStorage.clear()
    vi.resetModules()
    const mod = await import('./themeStore.js')
    useThemeStore = mod.useThemeStore
    // 스토어 상태 초기화
    useThemeStore.setState({ theme: 'dark' })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('T-01: localStorage가 없을 때 기본 테마는 dark이다', () => {
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('T-02: localStorage에 light가 저장되어 있으면 초기 테마가 light이다', async () => {
    localStorage.setItem('cfm-theme', 'light')
    vi.resetModules()
    const mod = await import('./themeStore.js')
    const freshStore = mod.useThemeStore
    expect(freshStore.getState().theme).toBe('light')
  })

  it('T-03: toggleTheme()이 dark → light로 전환한다', () => {
    useThemeStore.setState({ theme: 'dark' })
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('T-04: toggleTheme()이 light → dark로 전환한다', () => {
    useThemeStore.setState({ theme: 'light' })
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('T-05: setTheme("light") 호출 후 localStorage에 저장된다', () => {
    useThemeStore.getState().setTheme('light')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
  })

  it('T-06: setTheme("dark") 호출 후 localStorage에 저장된다', () => {
    useThemeStore.getState().setTheme('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('T-07: setTheme에 유효하지 않은 값을 전달해도 테마가 변경되지 않는다', () => {
    useThemeStore.setState({ theme: 'dark' })
    useThemeStore.getState().setTheme('invalid')
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('T-08: toggleTheme() 2회 호출 시 원래 테마로 돌아온다', () => {
    const original = useThemeStore.getState().theme
    useThemeStore.getState().toggleTheme()
    useThemeStore.getState().toggleTheme()
    expect(useThemeStore.getState().theme).toBe(original)
  })
})
