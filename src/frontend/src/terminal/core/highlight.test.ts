import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Terminal} from '@xterm/xterm';
import {attachHighlight, loadRules} from './highlight';
import {settings, resetSettingsForTest} from './settings';
import {loadUnicodeWidths, NARROW} from './cjkwidth';

// ─── Todo #130-4: keyword highlighting on a real xterm (jsdom) ───────────

interface Deco {x: number; width: number; backgroundColor?: string; line: number; disposed: boolean}

let term: Terminal;
let el: HTMLElement;
let decos: Deco[];

function open() {
    term = new Terminal({cols: 40, rows: 5, allowProposedApi: true});
    loadUnicodeWidths(term);
    term.unicode.activeVersion = NARROW;
    el = document.createElement('div');
    document.body.appendChild(el);
    term.open(el);
    decos = [];
    const orig = term.registerDecoration.bind(term);
    vi.spyOn(term, 'registerDecoration').mockImplementation(opts => {
        const d = orig(opts);
        const rec: Deco = {x: opts.x ?? 0, width: opts.width ?? 1, backgroundColor: opts.backgroundColor, line: opts.marker.line, disposed: false};
        decos.push(rec);
        if (d) {
            const dispose = d.dispose.bind(d);
            d.dispose = () => { rec.disposed = true; dispose(); };
        }
        return d;
    });
    return attachHighlight(term);
}

const write = (s: string) => new Promise<void>(r => term.write(s, r));
const live = () => decos.filter(d => !d.disposed);
const pass = () => new Promise(r => setTimeout(r, 90)); // one highlight pass (60 ms debounce)

beforeEach(() => {
    resetSettingsForTest();
    settings.highlight = {on: true, red: 'error, 오류', yellow: 'warn', green: 'ok'};
    loadRules();
});

afterEach(() => {
    term?.dispose();
    el?.remove();
});

describe('highlight on a terminal (HL)', () => {
    it('HL-01: ASCII words match whole words only, any case; Korean also inside a word', async () => {
        const h = open();
        await write('ERROR here\r\nerrors no\r\nmy_error no\r\n오류가 났음\r\n');
        h.schedule();
        await pass();
        const got = live().map(d => [d.line, d.x, d.width, d.backgroundColor]);
        expect(got).toEqual([
            [0, 0, 5, '#c0392b'],
            [3, 0, 4, '#c0392b'], // 오류 = two wide characters = 4 cells
        ]);
    });

    it('HL-02: column of a match after wide characters', async () => {
        const h = open();
        await write('한글 warn ok\r\n');
        h.schedule();
        await pass();
        expect(live().map(d => [d.x, d.width, d.backgroundColor])).toEqual([
            [5, 4, '#e0b000'], // 한(2)+글(2)+space(1)
            [10, 2, '#1e8449'],
        ]);
    });

    it('HL-03: a line rewritten on screen loses its old mark', async () => {
        const h = open();
        await write('error');
        h.schedule();
        await pass();
        expect(live()).toHaveLength(1);
        await write('\r\x1b[2Kfine now');
        h.schedule();
        await pass();
        expect(live()).toHaveLength(0);
    });

    it('HL-04: the alternate screen (full-screen programs) is not scanned', async () => {
        const h = open();
        await write('\x1b[?1049h' + 'error in vim\r\n');
        h.schedule();
        await pass();
        expect(decos).toHaveLength(0);
    });

    it('HL-05: turning the rules off and reset() removes every mark', async () => {
        const h = open();
        await write('error\r\n' + 'x\r\n'.repeat(8) + 'error\r\n'); // first one scrolls into the scrollback
        h.schedule();
        await pass();
        expect(live().length).toBeGreaterThan(0);
        settings.highlight.on = false;
        loadRules();
        h.reset();
        await pass();
        expect(live()).toHaveLength(0);
    });

    it('HL-06: at most 20 marks per line', async () => {
        const h = open();
        term.resize(200, 5);
        await write('ok '.repeat(30));
        h.schedule();
        await pass();
        expect(live()).toHaveLength(20);
    });

    it('HL-07: schedule() coalesces into one pass', async () => {
        const h = open();
        await write('error\r\n');
        h.schedule();
        h.schedule();
        h.schedule();
        await pass();
        expect(decos).toHaveLength(1);
    });
});
