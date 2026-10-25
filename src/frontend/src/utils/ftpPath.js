// FTP 패널 경로 (Todo #133-8): "ftp://<연결 ID>/원격/경로" — Go ftppanel.go와 같은 형식

export const FTP_SCHEME = 'ftp://'

export const isFtpPath = (p) => typeof p === 'string' && p.startsWith(FTP_SCHEME)

// 연결 ID ("host_port_시각_번호")
export function ftpId(p) {
  if (!isFtpPath(p)) return ''
  return p.slice(FTP_SCHEME.length).split('/')[0]
}

export const ftpRoot = (id) => `${FTP_SCHEME}${id}/`

// 사람이 읽는 이름: 연결 정보가 있으면 user@host, 없으면 ID의 호스트 부분
export function ftpLabel(p, connections) {
  const id = ftpId(p)
  const c = (connections || []).find(x => x.id === id)
  if (c) return c.username ? `${c.username}@${c.host}` : c.host
  return id.split('_')[0] || id
}
