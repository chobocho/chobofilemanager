import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {MACRO_KEYS, keyName, macroForKey, expandMacro, macroLabel, sendMacro, keyOptions} from './macros';
import {resetSettingsForTest, settings} from './settings';
import {setTermBackend} from './termApi';
import {TermSession} from './session';
import {FakeTerminal} from '../test/fakeTerminal';

// ─── Todo #121: 매크로 — 단축키, 이스케이프, 보내기 (choboTerm macros.ts) ──

const kd = (key: string, o: any = {}) => ({type: 'keydown', key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...o}) as KeyboardEvent;
const BS = String.fromCharCode(92); // 역슬래시

describe('macros (MC)', () => {
    beforeEach(() => resetSettingsForTest());

    it('MC-01: 쓸 수 있는 키 — F2~F12, Shift/Ctrl+F1~F12 (F1은 도움말)', () => {
        expect(MACRO_KEYS).toHaveLength(35);
        expect(MACRO_KEYS).not.toContain('F1');
        expect(MACRO_KEYS).toContain('Shift+F1');
        expect(MACRO_KEYS).toContain('Ctrl+F12');
    });

    it('MC-02: keyName — Ctrl+Shift·Alt 조합, keyup, F13은 제외', () => {
        expect(keyName(kd('F5'))).toBe('F5');
        expect(keyName(kd('F5', {shiftKey: true}))).toBe('Shift+F5');
        expect(keyName(kd('F5', {ctrlKey: true}))).toBe('Ctrl+F5');
        expect(keyName(kd('F5', {ctrlKey: true, shiftKey: true}))).toBe('');
        expect(keyName(kd('F5', {altKey: true}))).toBe('');
        expect(keyName(kd('F13'))).toBe('');
        expect(keyName(kd('a'))).toBe('');
        expect(keyName({...kd('F5'), type: 'keyup'} as KeyboardEvent)).toBe('');
    });

    it('MC-03: macroForKey — 지정한 키만 (지정 안 된 F키는 터미널로)', () => {
        settings.macros = [{name: 'ls', key: 'F5', text: 'ls', kind: ''}];
        expect(macroForKey(kd('F5'))?.name).toBe('ls');
        expect(macroForKey(kd('F6'))).toBeUndefined();
    });

    it('MC-04: expandMacro — 줄바꿈=Enter, \\n \\r \\t \\e \\xHH \\\\', () => {
        expect(expandMacro('ls\ncd /')).toBe('ls\rcd /');
        expect(expandMacro('a\r\nb')).toBe('a\rb');
        expect(expandMacro(`a${BS}tb${BS}e[A`)).toBe('a\tb\x1b[A');
        expect(expandMacro(`${BS}x03`)).toBe('\x03');
        expect(expandMacro(`${BS}n${BS}r`)).toBe('\r\r');
        expect(expandMacro(`C:${BS}${BS}temp`)).toBe(`C:${BS}temp`);
        expect(expandMacro(`${BS}q`)).toBe(`${BS}q`); // 모르는 이스케이프는 그대로
    });

    it('MC-05: 목록 이름 — 이름, 없으면 내용 첫 줄, 둘 다 없으면 (이름 없음)', () => {
        expect(macroLabel({name: 'n', key: '', text: 't', kind: ''})).toBe('n');
        expect(macroLabel({name: '', key: '', text: 'first\nsecond', kind: ''})).toBe('first');
        expect(macroLabel({name: '', key: '', text: '', kind: ''})).toBe('(이름 없음)');
    });

    it('MC-06: 단축키 선택지 — 다른 매크로가 쓰는 키는 비활성 (그 매크로 이름 표시)', () => {
        const a = {name: 'a', key: 'F2', text: '', kind: ''};
        const b = {name: 'b', key: '', text: '', kind: ''};
        const opts = keyOptions([a, b], b);
        expect(opts[0]).toEqual({value: '', label: '(없음)', disabled: false});
        expect(opts.find(o => o.value === 'F2')).toEqual({value: 'F2', label: 'F2 - a', disabled: true});
        expect(keyOptions([a, b], a).find(o => o.value === 'F2')!.disabled).toBe(false);
    });
});

describe('sendMacro (MC)', () => {
    let api: any, fake: FakeTerminal;
    beforeEach(() => {
        api = {Connect: vi.fn().mockResolvedValue('ssh'), Send: vi.fn().mockResolvedValue(undefined), Resize: vi.fn(), CloseTab: vi.fn()};
        setTermBackend(api, {EventsOn: () => () => {}} as any);
    });
    afterEach(() => setTermBackend(null));
    const make = () => {
        const s = new TermSession(7, {createTerminal: o => (fake = new FakeTerminal(o)) as any, addons: false});
        s.open(document.createElement('div'));
        return s;
    };

    it('MC-10: 연결된 탭에 펼친 내용을 보냄', async () => {
        const s = make();
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: 'UTF-8', jump: ''});
        sendMacro(s, {name: '', key: '', text: 'ls\n', kind: ''});
        await vi.waitFor(() => expect(api.Send).toHaveBeenCalledWith(7, 'ls\r'));
        s.dispose();
    });

    it('MC-11: 연결 안 됨 → 보내지 않고 안내', () => {
        const s = make();
        sendMacro(s, {name: '', key: '', text: 'ls', kind: ''});
        expect(api.Send).not.toHaveBeenCalled();
        expect(fake.text()).toContain('연결되어 있지 않습니다');
        s.dispose();
    });

    it('MC-12: Lua 매크로 — 아직 실행하지 않고 안내 (Todo #124)', async () => {
        const s = make();
        await s.connect({host: 'h', port: 22, login: '', pass: '', encoding: 'UTF-8', jump: ''});
        sendMacro(s, {name: 'x', key: '', text: 'send("ls")', kind: 'lua'});
        expect(api.Send).not.toHaveBeenCalled();
        expect(fake.text()).toContain('Lua');
        s.dispose();
    });
});
