// English screen for the terminal (Todo #124, choboTerm i18n.ts). The page is
// written in Korean; with English on, text that appears in the terminal's part
// of the window (labels, tooltips, messages, errors from the Go side) is looked
// up in i18n_en.json and replaced as it appears. The file manager keeps its
// Korean UI; terminal output and edited file contents are left alone. Keys may
// hold {} for a changing part; the translation puts the parts back in order,
// or by {0} {1} if the order differs. A text with no entry is tried line by
// line, then left as it is.

import EN from '../i18n_en.json';

export type Lang = 'ko' | 'en';

let lang: Lang = 'ko';

const HANGUL = /[가-힣]/;
const exact = new Map<string, string>(Object.entries(EN as Record<string, string>));

interface Pattern {
    re: RegExp;
    to: string;
}

// Keys with {}: the more literal text a key has, the earlier it is tried.
const patterns: Pattern[] = [...exact.entries()]
    .filter(([k]) => k.includes('{}'))
    .sort((a, b) => b[0].replace(/\{\}/g, '').length - a[0].replace(/\{\}/g, '').length)
    .map(([k, to]) => ({
        re: new RegExp('^' + k.split('{}').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)') + '$'),
        to,
    }));

const cache = new Map<string, string>();

function fill(to: string, parts: string[]): string {
    let next = 0;
    return to.replace(/\{(\d*)\}/g, (_, n: string) => parts[n === '' ? next++ : Number(n)] ?? '');
}

function lookup(s: string, depth: number): string | undefined {
    const hit = exact.get(s);
    if (hit !== undefined) return hit;
    if (depth > 3) return undefined;
    for (const p of patterns) {
        const m = p.re.exec(s);
        if (m) return fill(p.to, m.slice(1).map(x => translate(x, depth + 1)));
    }
    return undefined;
}

// What Lua puts before an error: where it happened ("login.lua:12: ") and,
// for errors from send() and the like, the function ("send: "). Same as
// luaWhere in internal/i18n.
const LUA_WHERE = /^((?:[^\s:]+:\d+: )+(?:[A-Za-z_]\w*: )?)([\s\S]+)$/;

function translate(s: string, depth = 0): string {
    if (!HANGUL.test(s)) return s;
    const lead = s.match(/^\s*/)![0];
    const tail = s.slice(lead.length).match(/\s*$/)![0];
    const core = s.slice(lead.length, s.length - tail.length);
    let out = lookup(core, depth);
    if (out === undefined && depth <= 3) {
        const m = LUA_WHERE.exec(core);
        const msg = m && translate(m[2], depth + 1);
        if (m && msg !== m[2]) out = m[1] + msg;
    }
    if (out === undefined && core.includes('\n')) out = core.split('\n').map(l => translate(l, depth)).join('\n');
    return out === undefined ? s : lead + out + tail;
}

/** The text in the current language (as is in Korean). */
export function tr(s: string): string {
    if (lang === 'ko' || !HANGUL.test(s)) return s;
    let out = cache.get(s);
    if (out === undefined) {
        out = translate(s);
        if (cache.size > 5000) cache.clear();
        cache.set(s, out);
    }
    return out;
}

export function currentLang(): Lang {
    return lang;
}

export function setLang(l: Lang) {
    lang = l;
}

/** The language to show: Settings' choice, else the one the Go side uses, else Korean. */
export function resolveLang(setting: string | undefined, goLang: string | undefined): Lang {
    const l = setting || goLang;
    return l === 'en' ? 'en' : 'ko';
}

// ---- The page ----

const ATTRS = ['title', 'placeholder', 'aria-label'];
// Only the terminal's part of the window (and its menus, which sit at the end of <body>).
const SCOPE = '[data-terminal-root], [data-term-i18n]';
// Not translated: terminal screens, file contents.
const SKIP = '.xterm, .cm-content';

function inScope(n: Node): boolean {
    const el = n instanceof Element ? n : n.parentElement;
    return !!el && !!el.closest(SCOPE) && !el.closest(SKIP);
}

function doText(n: Text) {
    const v = n.data;
    if (!HANGUL.test(v) || !inScope(n)) return;
    const t = tr(v);
    if (t !== v) n.data = t;
}

function doAttrs(el: Element) {
    for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v && HANGUL.test(v)) {
            const t = tr(v);
            if (t !== v) el.setAttribute(a, t);
        }
    }
}

function doTree(root: Node) {
    if (root instanceof Text) return doText(root);
    if (!(root instanceof Element)) return;
    if (root.closest(SKIP)) return;
    if (inScope(root)) doAttrs(root);
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n instanceof Element && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n instanceof Text) doText(n);
        else if (inScope(n)) doAttrs(n as Element);
    }
}

let observer: MutationObserver | null = null;

/** Sets the language; with English, translates the terminal's part of the page now and whatever is shown later. */
export function startI18n(l: Lang) {
    lang = l;
    document.documentElement.lang = l;
    stopI18n();
    if (l === 'ko') return;
    doTree(document.body);
    observer = new MutationObserver(records => {
        for (const r of records) {
            if (r.type === 'characterData') doText(r.target as Text);
            else if (r.type === 'attributes') {
                if (inScope(r.target)) doAttrs(r.target as Element);
            } else r.addedNodes.forEach(doTree);
        }
    });
    observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS});
}

export function stopI18n() {
    observer?.disconnect();
    observer = null;
}
