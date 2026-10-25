// The tab context menu's items for a tab's state (Todo #121, choboTerm tabmenu.ts).
// Items for file transfer, port forwarding, Lua, memo and logging are added by
// the stages that port those features.

export interface MenuTab {
    state: string;
    proto: string;
    hasReq: boolean;
    encoding: string;
    log?: boolean;
    docker?: boolean;
}

export interface MenuItem {
    act: string;
    label: string;
    disabled?: boolean;
    hidden?: boolean;
    submenu?: boolean;
}

export function tabMenuItems(t: MenuTab, paneCount: number): MenuItem[] {
    const on = t.state !== 'idle';
    return [
        {act: 'reconnect', label: '다시 연결', disabled: !t.hasReq && !t.docker},
        {act: 'duplicate', label: '복제 (새 탭으로 같은 서버 접속)', disabled: !t.hasReq && !t.docker},
        {act: 'splitRight', label: '오른쪽으로 분할 (Ctrl+Shift+\\)'},
        {act: 'splitDown', label: '아래로 분할 (Ctrl+Shift+-)'},
        {act: 'theme', label: '색 테마 (이 서버)', submenu: true},
        {act: 'files', label: '파일 전송 (Ctrl+Shift+F)', disabled: !(on && t.hasReq && t.proto !== 'local' && t.proto !== 'serial')},
        {act: 'forwards', label: '포트 포워딩 (Ctrl+Shift+P)', disabled: !(t.state === 'on' && t.proto === 'ssh')},
        {act: 'encoding', label: `인코딩: ${t.encoding === 'EUC-KR' ? 'UTF-8' : 'EUC-KR'}로 전환`, disabled: t.proto === 'local' && on},
        {act: 'containers', label: '도커 컨테이너 (Ctrl+Shift+J)'},
        {act: 'break', label: 'Break 신호 보내기', hidden: !(t.proto === 'serial' && on)},
        {act: 'memo', label: '메모장 (Ctrl+Shift+B)'},
        {act: 'log', label: t.log ? '로그 기록 중지' : '로그 기록 시작', disabled: !t.log && !on},
        {act: 'logs', label: '로그 폴더 열기'},
        {act: 'saveSession', label: '세션으로 저장', disabled: !t.hasReq},
        {act: 'disconnect', label: '연결 끊기', disabled: !on},
        {act: 'sep', label: ''},
        {act: 'close', label: paneCount > 1 ? '분할 창 닫기' : '탭 닫기'},
    ];
}
