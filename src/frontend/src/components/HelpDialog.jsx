import React, { useEffect } from 'react'
import { X, HelpCircle } from 'lucide-react'
import styles from '../styles/HelpDialog.module.css'
// 버전은 package.json 기준 (Go Version/wails.json과 일치 여부는 version_test.go가 검사, Todo #102)
import pkg from '../../package.json'

const SECTIONS = [
  {
    title: '파일 조작',
    rows: [
      { keys: ['F2'],              desc: '이름 바꾸기' },
      { keys: ['Shift+F2'],        desc: '폴더 비교 — 양쪽에서 더 새 파일 · 한쪽에만 있는 파일을 선택' },
      { keys: ['Alt+F2'],          desc: '폴더 동기화 창 — 하위 폴더 · 내용 비교, 줄마다 방향(→ ←) 골라 복사, 더블클릭으로 내용 비교' },
      { keys: ['Ctrl+Shift+D'],    desc: '파일 내용 비교 — 고른 두 파일, 또는 커서 파일과 반대 패널의 같은 이름 파일. 좌우 diff, Alt+↑/↓ 차이 이동, 고친 쪽 Ctrl+S 저장' },
      { keys: ['Ctrl+M'],          desc: '여러 이름 바꾸기 — [N] [E] [C] [YMD] 마스크, 찾아 바꾸기(정규식), 대소문자, 미리 보기' },
      { keys: ['F3'],              desc: '파일 보기 (내장 뷰어: 텍스트 · 이미지 · 마크다운)' },
      { keys: ['F4'],              desc: '내장 에디터로 파일 편집 (CodeMirror, 구문 강조)' },
      { keys: ['F5'],              desc: '복사 (반대 패널로, 같은 이름은 물어봄)' },
      { keys: ['F6'],              desc: '이동 (반대 패널로, 같은 이름은 물어봄)' },
      { keys: ['F7'],              desc: '새 폴더 만들기' },
      { keys: ['F8', 'Delete'],    desc: '선택 항목을 휴지통으로 이동' },
      { keys: ['Shift+Delete'],    desc: '선택 항목을 영구 삭제' },
      { keys: ['Ctrl+N'],          desc: '새 파일 만들기' },
      { keys: ['Ctrl+Shift+C'],    desc: '커서 파일 경로를 클립보드에 복사 ([..]이면 지금 폴더)' },
      { keys: ['Enter'],           desc: '폴더 열기 / 파일 실행' },
    ],
  },
  {
    title: '탐색 및 선택',
    rows: [
      { keys: ['Tab'],             desc: '좌우 패널 전환' },
      { keys: ['↑ / ↓', 'j / k', 'w / s'], desc: '커서 이동 (화살표 · vim · WASD)' },
      { keys: ['h / a', 'l / d'],  desc: '왼쪽 / 오른쪽 패널로' },
      { keys: ['Shift+글자'],      desc: '그 글자(숫자)로 시작하는 파일로 이동, 다시 누르면 다음 파일' },
      { keys: ['Alt+글자'],        desc: '빠른 검색 칸: 입력한 글자로 시작하는 파일로 (* ? 쓰면 어디든), ↑↓ 이전/다음, Enter 열기, Esc 닫기' },
      { keys: ['Backspace'],       desc: '상위 폴더로 이동' },
      { keys: ['-'],               desc: '이전에 있던 폴더로 (뒤로)' },
      { keys: ['[..]'],            desc: '상위 폴더로 이동 (항목 클릭)' },
      { keys: ['Space'],           desc: '항목 선택/해제 (폴더는 크기도 계산)' },
      { keys: ['Alt+Shift+Enter'], desc: '보이는 모든 폴더의 크기 계산' },
      { keys: ['Insert'],          desc: '항목 선택/해제 후 커서 아래로 이동' },
      { keys: ['Ctrl+A'],          desc: '전체 선택' },
      { keys: ['Num +', 'Num -'],  desc: '마스크로 선택 / 선택 해제 (*.txt;*.md, | 뒤는 제외)' },
      { keys: ['Num *'],           desc: '선택 반전 (파일만)' },
      { keys: ['Ctrl+Num +', 'Ctrl+Num -'], desc: '모두 선택 / 모두 해제' },
      { keys: ['Ctrl+클릭', 'Shift+클릭'], desc: '마우스로 여러 개 / 범위 선택' },
    ],
  },
  {
    title: '탭',
    rows: [
      { keys: ['Ctrl+T'],          desc: '새 탭 열기' },
      { keys: ['Ctrl+W'],          desc: '현재 탭 닫기' },
      { keys: ['Ctrl+Tab'],        desc: '다음 탭으로 전환' },
      { keys: ['Ctrl+Shift+Tab'],  desc: '이전 탭으로 전환' },
    ],
  },
  {
    title: '보기 · 편집 (F3 / F4)',
    rows: [
      { keys: ['F3', 'F4'],        desc: '뷰어 ↔ 에디터 전환 (뷰어에서 F3을 한 번 더: 닫기)' },
      { keys: ['Ctrl+F'],          desc: '본문에서 찾기 (Enter: 다음, Shift+Enter: 이전, Esc: 닫기)' },
      { keys: ['Ctrl+S'],          desc: '에디터에서 저장 (인코딩 단추에서 고른 인코딩으로)' },
      { keys: ['F5', 'Ctrl+Enter'], desc: '.star 파일을 에디터에서 Starlark로 실행' },
      { keys: ['Esc'],             desc: '닫기 (저장하지 않은 내용이 있으면 물어봄)' },
      { keys: ['← / →'],           desc: '이미지: 같은 폴더의 이전 / 다음 이미지' },
      { keys: ['Ctrl + + / - / 0'], desc: '이미지: 확대 / 축소 / 창에 맞춤 (Ctrl+휠도 가능)' },
      { keys: ['h j k l'],         desc: '이미지: 확대한 그림을 좌 · 하 · 상 · 우로 스크롤' },
    ],
  },
  {
    title: '터미널',
    rows: [
      { keys: ['F9'],              desc: '하단 터미널 도크 열기/닫기 (활성 패널 폴더의 cmd / PowerShell / WSL)' },
      { keys: ['Shift+F9'],        desc: '바깥 명령 창(cmd) 열기' },
      { keys: ['Ctrl+Enter'],      desc: '커서 파일 이름을 도크 셸에 붙여넣기' },
      { keys: ['Ctrl+Shift+Enter'], desc: '커서 파일 전체 경로를 도크 셸에 붙여넣기' },
      { keys: ['Terminal 버튼'],   desc: 'Terminal 보기: SSH · Telnet · FTP · 시리얼 · 로컬 셸 탭' },
      { keys: ['F1 (Terminal 보기)'], desc: '터미널 전체 도움말 (한국어 / English): 탭 · 분할 · 세션 · 원격 파일 · 포워딩 · Lua ...' },
    ],
  },
  {
    title: '압축',
    rows: [
      { keys: ['압축하기'],        desc: '선택한 파일을 ZIP으로 압축' },
      { keys: ['압축 풀기'],       desc: '압축 파일을 같은 폴더 안 하위 폴더에 풀기 (ZIP · TAR · TAR.GZ · TAR.BZ2 · TAR.XZ · 7Z · RAR)' },
      { keys: ['Enter (압축 파일)'], desc: '압축 파일 안으로 들어가 폴더처럼 보기 — 읽기 전용, F5로 꺼내기, F3 보기, Backspace로 나오기' },
    ],
  },
  {
    title: '기타',
    rows: [
      { keys: ['F1'],              desc: '이 도움말 표시' },
      { keys: ['Ctrl+O'],          desc: '명령 실행 창 — 지금 폴더에서 명령을 실행하고 출력 보기' },
      { keys: ['Ctrl+Shift+M'],    desc: 'Starlark 스크래치 — 임시 .star 파일 생성 + F4 편집기 열기' },
      { keys: ['Ctrl+R'],          desc: '현재 패널 새로고침' },
      { keys: ['Ctrl+H'],          desc: '숨김 파일(.으로 시작) 표시 / 숨김 토글' },
      { keys: ['Ctrl+D'],          desc: '바로가기 목록 (추가 / 이동 / 삭제)' },
      { keys: ['Ctrl+F'],          desc: '파일 검색 (하위 폴더까지)' },
      { keys: ['드라이브 목록 → FTP'], desc: 'FTP 연결... 로 접속하면 패널이 FTP 폴더가 됨 — F5/F6 받기·올리기, F7 F8 F2, F3/F4 보기·편집, 연결 끊기 단추' },
      { keys: ['Files / FTP / Terminal'], desc: '왼쪽 위 단추로 보기 전환 (FTP 단추는 터미널 설정에서 숨길 수 있음)' },
      { keys: ['테마 버튼'],       desc: '라이트 / 다크 테마 전환' },
    ],
  },
]

export default function HelpDialog({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <HelpCircle size={14} className={styles.headerIcon} />
          <span>도움말 — Chobocho Commander V{pkg.version}</span>
          <button className={styles.closeBtn} onClick={onClose} title="닫기">
            <X size={13} />
          </button>
        </div>

        <div className={styles.body}>
          {SECTIONS.map(sec => (
            <section key={sec.title} className={styles.section}>
              <h3 className={styles.sectionTitle}>{sec.title}</h3>
              <table className={styles.table}>
                <tbody>
                  {sec.rows.map(({ keys, desc }) => (
                    <tr key={keys.join()} className={styles.row}>
                      <td className={styles.keys}>
                        {keys.map(k => <kbd key={k} className={styles.kbd}>{k}</kbd>)}
                      </td>
                      <td className={styles.desc}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.tip}>ESC 또는 F1을 누르면 닫힙니다</span>
          <button className={styles.btnClose} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
