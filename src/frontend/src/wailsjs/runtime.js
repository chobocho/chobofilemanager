// Mock Wails runtime for browser development
// In production Wails injects window.go automatically

const mockFiles = [
  { name: 'Documents', path: '/home/user/Documents', size: 0, isDir: true, isHidden: false, modified: new Date().toISOString(), extension: '', permissions: 'drwxr-xr-x' },
  { name: 'Downloads', path: '/home/user/Downloads', size: 0, isDir: true, isHidden: false, modified: new Date().toISOString(), extension: '', permissions: 'drwxr-xr-x' },
  { name: 'Pictures', path: '/home/user/Pictures', size: 0, isDir: true, isHidden: false, modified: new Date().toISOString(), extension: '', permissions: 'drwxr-xr-x' },
  { name: '.bashrc', path: '/home/user/.bashrc', size: 3456, isDir: false, isHidden: true, modified: new Date().toISOString(), extension: '', permissions: '-rw-r--r--' },
  { name: 'readme.txt', path: '/home/user/readme.txt', size: 1024, isDir: false, isHidden: false, modified: new Date().toISOString(), extension: '.txt', permissions: '-rw-r--r--' },
  { name: 'project.zip', path: '/home/user/project.zip', size: 204800, isDir: false, isHidden: false, modified: new Date().toISOString(), extension: '.zip', permissions: '-rw-r--r--' },
  { name: 'photo.jpg', path: '/home/user/photo.jpg', size: 2048000, isDir: false, isHidden: false, modified: new Date().toISOString(), extension: '.jpg', permissions: '-rw-r--r--' },
  { name: 'main.go', path: '/home/user/main.go', size: 5120, isDir: false, isHidden: false, modified: new Date().toISOString(), extension: '.go', permissions: '-rw-r--r--' },
]

const createMockAPI = () => ({
  ListDirectory: async (path) => ({
    path: path || '/home/user',
    files: mockFiles
  }),
  GetHomeDirectory: async () => '/home/user',
  GetDrives: async () => [
    { name: '/', path: '/', driveType: 'ext4', totalSpace: 500000000000, freeSpace: 250000000000 },
    { name: '/home', path: '/home', driveType: 'ext4', totalSpace: 200000000000, freeSpace: 100000000000 },
  ],
  CopyItems: async () => null,
  MoveItems: async () => null,
  DeleteItems: async () => null,
  CreateDirectory: async () => null,
  CreateFile: async () => null,
  RenameItem: async () => null,
  GetFileInfo: async (path) => mockFiles.find(f => f.path === path) || mockFiles[0],
  ReadTextFile: async () => '# Sample file content\nHello, World!\n',
  ReadTextFileWithEncoding: async (_path, _enc) => '# Sample file content\nHello, World!\n',
  WriteTextFile: async () => null,
  OpenFile: async () => null,
  GetPathParts: async (path) => {
    const parts = [{ name: '/', path: '/' }]
    const segments = path.replace(/^\//, '').split('/')
    let acc = ''
    for (const seg of segments) {
      if (seg) {
        acc += '/' + seg
        parts.push({ name: seg, path: acc })
      }
    }
    return parts
  },
  JoinPath: async (...parts) => parts.join('/').replace(/\/+/g, '/'),
  GetParentPath: async (path) => path.split('/').slice(0, -1).join('/') || '/',
  ChangeWorkingDirectory: async () => null,
  SaveSessionState: async () => null,
  SearchFiles: async () => mockFiles.slice(0, 3),
  GetFileSize: async () => 1024000,
  CompressItems: async () => null,
  ExtractArchive: async () => null,
  OpenCmdWindow: async () => null,
  RunStarlarkFile: async () => 'hello, starlark!\n',

  FTPConnect: async () => null,
  FTPDisconnect: async () => null,
  FTPListDirectory: async () => ({ path: '/', files: mockFiles }),
  FTPDownload: async () => null,
  FTPUpload: async () => null,
  FTPDeleteItem: async () => null,
  FTPCreateDirectory: async () => null,
  FTPRenameItem: async () => null,
  FTPGetConnections: async () => [],
  FTPSaveBookmark: async () => null,
  FTPGetBookmarks: async () => [],
  FTPDeleteBookmark: async () => null,
  FTPGetHistory: async () => [],
  FTPDeleteHistory: async () => null,
  FTPClearHistory: async () => null,
  FTPAddHistory: async () => null,
})

// Detect if running in Wails
export const isWails = () => typeof window !== 'undefined' && window.go !== undefined

export const getAPI = () => {
  if (isWails() && window.go?.main?.App) {
    return window.go.main.App
  }
  console.warn('[Chobocho Commander] Running in browser mock mode')
  return createMockAPI()
}

export default getAPI()
