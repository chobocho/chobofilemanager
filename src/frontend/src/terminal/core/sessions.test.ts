import {describe, it, expect} from 'vitest';
import {filterSessions, sessionRows, sessionWhere, sessionMeta, groupsOf, importMessage, fieldsToSaved, blankSession} from './sessions';

// ─── Todo #121: 저장된 세션 — 순수 함수 (choboTerm sessions.ts) ─────────────

const s = (o: any) => ({id: 'x', name: '', group: '', host: '', port: 22, login: '', encoding: 'UTF-8', pass: '', jump: '', ...o});
const all = [
    s({id: '1', name: 'web', group: 'prod', host: 'web.example', login: 'root'}),
    s({id: '2', name: 'db', group: 'prod', host: 'db.example'}),
    s({id: '3', name: 'pi', group: '', host: '192.168.0.9', login: 'pi'}),
    s({id: '4', name: 'cmd', group: '', host: 'cmd', port: 0}),
];

describe('sessions (SS)', () => {
    it('SS-01: 찾기 — 공백으로 나눈 낱말 모두 (이름·주소·그룹·로그인, 대소문자 무시)', () => {
        expect(filterSessions(all, '').map(x => x.id)).toEqual(['1', '2', '3', '4']);
        expect(filterSessions(all, 'PROD').map(x => x.id)).toEqual(['1', '2']);
        expect(filterSessions(all, 'prod root').map(x => x.id)).toEqual(['1']);
        expect(filterSessions(all, 'pi 192').map(x => x.id)).toEqual(['3']);
        expect(filterSessions(all, 'nothing')).toEqual([]);
    });

    it('SS-02: 목록 줄 — 그룹마다 머리줄, 그룹 없음, 새 세션은 맨 끝', () => {
        const rows = sessionRows([...all, s({id: ''})]);
        expect(rows.map(r => (r.head ? `#${r.head}` : r.session!.id))).toEqual(['#★ prod', '1', '2', '#★ 그룹 없음', '3', '4', '#★ 새 세션', '']);
    });

    it('SS-03: 줄의 보조 글자 — login@host:port, 로컬 셸', () => {
        expect(sessionMeta(all[0])).toBe('root@web.example:22');
        expect(sessionMeta(all[1])).toBe('db.example:22');
        expect(sessionMeta(all[3])).toBe('로컬 셸');
        expect(sessionMeta(s({host: '', port: 0}))).toBe('');
    });

    it('SS-04: 저장 창의 연결 설명', () => {
        expect(sessionWhere({host: 'h', port: 2222, login: 'u', encoding: 'EUC-KR', pass: '', jump: ''})).toBe('u@h:2222 · EUC-KR');
        expect(sessionWhere({host: 'h', port: 22, login: '', encoding: '', pass: '', jump: 'b@bastion'})).toBe('h:22 · UTF-8 · Jump b@bastion');
        expect(sessionWhere({host: 'wsl', port: 0, login: '', encoding: 'UTF-8', pass: '', jump: ''})).toBe('wsl (로컬 셸)');
    });

    it('SS-05: 그룹 목록 — 중복·빈 이름 제외', () => {
        expect(groupsOf(all)).toEqual(['prod']);
    });

    it('SS-06: 가져오기 결과 문구 (취소면 null)', () => {
        expect(importMessage({added: 0, skipped: 0})).toBeNull();
        expect(importMessage({added: 3, skipped: 0})).toBe('3개를 가져왔습니다');
        expect(importMessage({added: 1, skipped: 2})).toBe('1개를 가져왔습니다 (이미 있는 2개는 건너뜀)');
    });

    it('SS-07: 입력값 → 저장할 세션 (포트 숫자, 앞뒤 공백 제거, 이름 없으면 주소)', () => {
        expect(fieldsToSaved({name: ' ', group: ' g ', host: ' h ', port: '2222', login: 'u', pass: 'p', encoding: 'EUC-KR', jump: ' j '}, 'id9'))
            .toEqual({id: 'id9', name: 'h', group: 'g', host: 'h', port: 2222, login: 'u', pass: 'p', encoding: 'EUC-KR', jump: 'j'});
        expect(fieldsToSaved({name: 'n', group: '', host: 'cmd', port: '', login: '', pass: '', encoding: '', jump: ''}).port).toBe(0);
        expect(fieldsToSaved({name: 'n', group: '', host: 'cmd', port: '', login: '', pass: '', encoding: '', jump: ''}).encoding).toBe('UTF-8');
    });

    it('SS-08: 새 세션 기본값', () => {
        expect(blankSession()).toEqual(s({id: '', port: 22}));
    });
});
