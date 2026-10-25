import {describe, it, expect} from 'vitest';
import {
    formatSize, joinPath, parentPath, folderKey, emptyView, listed, select, selectAll, pickedEntries,
    keepAfterDelete, deleteMessage, remember, isUp, viewable, transferText,
} from './remoteFiles';

// ─── Todo #123: 원격 파일 창 — 목록·선택 모델 (choboTerm files.ts) ─────────────

const f = (name: string, o: any = {}) => ({name, isDir: false, size: 10, modTime: '2026-10-01 10:00', ...o});
const d = (name: string) => f(name, {isDir: true, size: 0});
const names = (v: any) => v.entries.map((e: any) => e.name);

describe('remoteFiles (RF)', () => {
    it('RF-01: 크기 표시', () => {
        expect(formatSize(0)).toBe('0 B');
        expect(formatSize(1023)).toBe('1023 B');
        expect(formatSize(1536)).toBe('1.5 KB');
        expect(formatSize(20 * 1024 * 1024)).toBe('20 MB');
    });

    it('RF-02: 경로 — 잇기·상위·비교용 키', () => {
        expect(joinPath('/home/me', 'a')).toBe('/home/me/a');
        expect(joinPath('/', 'a')).toBe('/a');
        expect(parentPath('/home/me/')).toBe('/home');
        expect(parentPath('/home')).toBe('/');
        expect(parentPath('/')).toBe('/');
        expect(folderKey('/home/me//')).toBe('/home/me');
        expect(folderKey('/')).toBe('/');
    });

    it('RF-03: 목록 — "/"가 아니면 맨 위에 ..(상위), 첫 실제 항목 선택', () => {
        const v = listed(emptyView('/home'), '/home/me', [d('src'), f('a.txt')]);
        expect(names(v)).toEqual(['..', 'src', 'a.txt']);
        expect(isUp(v.entries[0])).toBe(true);
        expect(v.selected).toBe(1);
        expect([...v.picked]).toEqual([1]);
        expect(names(listed(emptyView('/'), '/', [f('x')]))).toEqual(['x']);
        // 빈 폴더: .. 만 선택
        expect(listed(emptyView('/'), '/e', []).selected).toBe(0);
    });

    it('RF-04: 목록 — 지정한 이름들을 선택 (업로드·이름 바꾸기 뒤)', () => {
        const v = listed(emptyView('/'), '/w', [f('a'), f('b'), f('c')], ['c', 'b']);
        expect(v.selected).toBe(2);
        expect([...v.picked].sort()).toEqual([2, 3]);
    });

    it('RF-05: 떠난 폴더는 최근 목록 (최대 8개, 중복 없음)', () => {
        let v = emptyView('/');
        v = listed(v, '/a', []);
        v = listed(v, '/b', []);
        v = listed(v, '/a', []);
        expect(v.recent).toEqual(['/b', '/a', '/']);
        let r: string[] = [];
        for (let i = 0; i < 10; i++) r = remember(r, `/d${i}`);
        expect(r).toHaveLength(8);
        expect(r[0]).toBe('/d9');
    });

    it('RF-06: 선택 — 하나/Ctrl 토글/Shift 범위, 전체 선택은 .. 제외', () => {
        let v = listed(emptyView('/'), '/w', [f('a'), f('b'), f('c'), f('d')]);
        v = select(v, 2, 'toggle');
        expect([...v.picked].sort()).toEqual([1, 2]);
        v = select(v, 4, 'range');
        expect([...v.picked].sort()).toEqual([2, 3, 4]);
        v = select(v, 3, 'one');
        expect([...v.picked]).toEqual([3]);
        v = selectAll(v);
        expect([...v.picked].sort()).toEqual([1, 2, 3, 4]);
        expect(select(v, 99, 'one').selected).toBe(4);
    });

    it('RF-07: 고른 항목 — 목록 순서, 아무것도 안 골랐으면 커서 줄, .. 은 빠짐', () => {
        let v = listed(emptyView('/'), '/w', [f('a'), f('b'), f('c')]);
        v = {...select(v, 3, 'toggle')};
        expect(pickedEntries(v).map(e => e.name)).toEqual(['a', 'c']);
        v = {...v, picked: new Set(), selected: 0};
        expect(pickedEntries(v)).toEqual([]);
        v = {...v, selected: 2};
        expect(pickedEntries(v).map(e => e.name)).toEqual(['b']);
    });

    it('RF-08: 삭제 뒤 선택할 항목 — 지운 것 다음, 끝이면 앞', () => {
        const v = listed(emptyView('/'), '/w', [f('a'), f('b'), f('c')]);
        expect(keepAfterDelete(v, [v.entries[1], v.entries[2]])).toBe('c');
        expect(keepAfterDelete(v, [v.entries[3]])).toBe('b');
        expect(keepAfterDelete(v, [v.entries[1], v.entries[2], v.entries[3]])).toBeUndefined();
    });

    it('RF-09: 삭제 확인 문구 — 하나/여러 개, 폴더 경고', () => {
        expect(deleteMessage([f('a')])).toBe('"a"을(를) 서버에서 삭제할까요? 되돌릴 수 없습니다.');
        expect(deleteMessage([f('a'), d('b')])).toBe('2개 항목을(를) 서버에서 삭제할까요? 되돌릴 수 없습니다.\n폴더는 안에 있는 파일과 폴더까지 모두 삭제됩니다.');
    });

    it('RF-10: 볼 수 있는 항목 — 파일 하나일 때만', () => {
        let v = listed(emptyView('/'), '/w', [d('dir'), f('a')]);
        expect(viewable({...v, selected: 2, picked: new Set([2])})?.name).toBe('a');
        expect(viewable({...v, selected: 1, picked: new Set([1])})).toBeUndefined();
        expect(viewable({...v, picked: new Set([1, 2])})).toBeUndefined();
    });

    it('RF-11: 전송 진행 문구 — 크기·퍼센트·속도', () => {
        expect(transferText({name: 'a', done: 512, total: 1024, upload: false}, 0)).toBe('512 B / 1.0 KB (50%)');
        expect(transferText({name: 'a', done: 2048, total: 0, upload: true}, 2)).toBe('2.0 KB · 1.0 KB/s');
    });
});
