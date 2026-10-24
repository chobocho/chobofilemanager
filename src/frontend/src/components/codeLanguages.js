// 확장자별 구문 강조 언어 (Todo #113).
// 언어 패키지는 해당 파일을 처음 열 때 동적 import로 불러와 초기 번들에 포함하지 않습니다.
import { StreamLanguage } from '@codemirror/language'

const legacy = (load) => () => load().then(mode => StreamLanguage.define(mode))

// 언어 키 → 확장(Extension)을 돌려주는 비동기 로더
const LOADERS = {
  javascript: () => import('@codemirror/lang-javascript').then(m => m.javascript()),
  jsx:        () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true })),
  typescript: () => import('@codemirror/lang-javascript').then(m => m.javascript({ typescript: true })),
  tsx:        () => import('@codemirror/lang-javascript').then(m => m.javascript({ jsx: true, typescript: true })),
  python:     () => import('@codemirror/lang-python').then(m => m.python()),
  go:         () => import('@codemirror/lang-go').then(m => m.go()),
  rust:       () => import('@codemirror/lang-rust').then(m => m.rust()),
  cpp:        () => import('@codemirror/lang-cpp').then(m => m.cpp()),
  html:       () => import('@codemirror/lang-html').then(m => m.html()),
  css:        () => import('@codemirror/lang-css').then(m => m.css()),
  json:       () => import('@codemirror/lang-json').then(m => m.json()),
  xml:        () => import('@codemirror/lang-xml').then(m => m.xml()),
  yaml:       () => import('@codemirror/lang-yaml').then(m => m.yaml()),
  markdown:   () => import('@codemirror/lang-markdown').then(m => m.markdown()),
  sql:        () => import('@codemirror/lang-sql').then(m => m.sql()),
  shell:      legacy(() => import('@codemirror/legacy-modes/mode/shell').then(m => m.shell)),
  powershell: legacy(() => import('@codemirror/legacy-modes/mode/powershell').then(m => m.powerShell)),
  toml:       legacy(() => import('@codemirror/legacy-modes/mode/toml').then(m => m.toml)),
  properties: legacy(() => import('@codemirror/legacy-modes/mode/properties').then(m => m.properties)),
  dockerfile: legacy(() => import('@codemirror/legacy-modes/mode/dockerfile').then(m => m.dockerFile)),
}

const EXT_TO_LANGUAGE = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.jsx': 'jsx', '.ts': 'typescript', '.tsx': 'tsx',
  '.py': 'python', '.star': 'python', '.bzl': 'python',
  '.go': 'go', '.rs': 'rust',
  '.c': 'cpp', '.h': 'cpp', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
  '.html': 'html', '.htm': 'html', '.css': 'css',
  '.json': 'json', '.xml': 'xml', '.svg': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.sql': 'sql',
  '.sh': 'shell', '.bash': 'shell', '.ps1': 'powershell',
  '.toml': 'toml', '.ini': 'properties', '.cfg': 'properties', '.conf': 'properties', '.env': 'properties',
  '.dockerfile': 'dockerfile',
}

// 이보다 큰 문서는 구문 분석을 하지 않음 (아주 큰 파일에서 파서 메모리/시간 절약)
export const MAX_HIGHLIGHT_LENGTH = 5 * 1024 * 1024

// 경로 → 언어 키 (지원하지 않으면 null). 'Dockerfile' 같은 확장자 없는 이름도 처리
export function languageKeyForPath(path) {
  if (!path) return null
  const name = path.split(/[/\\]/).pop().toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return null
  const dot = name.lastIndexOf('.')
  if (dot < 0) return null
  return EXT_TO_LANGUAGE[name.slice(dot)] || null
}

// 언어 키 → 확장 로드 (지원하지 않으면 null)
export async function loadLanguage(key) {
  const loader = key && LOADERS[key]
  return loader ? loader() : null
}

export const SUPPORTED_LANGUAGES = Object.keys(LOADERS)
