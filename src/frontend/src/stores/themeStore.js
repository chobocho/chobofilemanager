import { create } from 'zustand'

const STORAGE_KEY = 'cfm-theme'
const VALID_THEMES = ['dark', 'light']

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && VALID_THEMES.includes(stored)) return stored
  } catch (_) {}
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

export const useThemeStore = create((set, get) => ({
  theme: getInitialTheme(),

  setTheme: (theme) => {
    if (!VALID_THEMES.includes(theme)) return
    try { localStorage.setItem(STORAGE_KEY, theme) } catch (_) {}
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
}))
