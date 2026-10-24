// Things a tab can be asked to do from its menu or a shortcut (Todo #121):
// encoding, color theme per server, serial Break, disconnect. Ported from
// choboTerm's look.ts (applyEncoding/applyLook/chooseTheme) and connection.ts.

import {termApi} from './termApi';
import {settings} from './settings';
import {lookOptions} from './look';
import {themeByName} from './themes';
import {NARROW, WIDE} from './cjkwidth';
import {loadRules} from './highlight';
import type {TermSession} from './session';
import type {Reconnector} from './reconnect';

const notice = (s: TermSession, msg: string) => s.term.write(`\r\n\x1b[36m[${msg}]\x1b[0m\r\n`);

/** Fonts, colors (the tab's own theme or Settings'), cursor and scrollback. */
export function applyLook(s: TermSession) {
    const o = lookOptions(settings, s.encoding === 'EUC-KR');
    o.theme = themeByName(s.theme || settings.theme).theme;
    Object.assign(s.term.options, o);
}

/** After the Settings window's OK: every tab takes the new look and keyword rules. */
export function applySettingsAll(list: TermSession[]) {
    loadRules();
    for (const s of list) {
        applyLook(s);
        s.highlighter?.reset();
    }
}

/** EUC-KR screens draw ambiguous-width symbols in 2 columns, with the legacy Korean font. */
export function applyEncoding(s: TermSession, name: string) {
    s.encoding = name;
    applyLook(s);
    const wanted = name === 'EUC-KR' ? WIDE : NARROW;
    // Never let a missing width provider break connecting.
    if (s.term.unicode.versions?.includes(wanted)) s.term.unicode.activeVersion = wanted;
}

export async function toggleEncoding(s: TermSession) {
    if (s.proto === 'local' && s.state !== 'idle') return notice(s, '로컬 셸은 UTF-8만 씁니다');
    const name = await termApi.SetEncoding(s.id, s.encoding === 'EUC-KR' ? 'UTF-8' : 'EUC-KR');
    applyEncoding(s, name);
    if (s.req) s.req.encoding = name;
    notice(s, `인코딩: ${name}`);
}

/** Picks a color theme for the tab ("" = Settings) and remembers it for its server. */
export async function chooseTheme(s: TermSession, name: string) {
    s.theme = name || undefined;
    applyLook(s);
    await termApi.SetTabTheme(s.id, name).catch(() => undefined);
}

/** After connecting: the theme saved for this server, if any. */
export async function loadTabTheme(s: TermSession) {
    const name = await termApi.TabTheme(s.id).catch(() => '');
    s.theme = name || undefined;
    applyLook(s);
}

export async function sendBreak(s: TermSession) {
    try {
        await termApi.SendBreak(s.id);
        notice(s, 'Break 신호를 보냈습니다');
    } catch (e) {
        notice(s, String((e as Error)?.message ?? e));
    }
}

export async function disconnectSession(s: TermSession, rc?: Reconnector) {
    if (rc?.retrying) {
        rc.cancel();
        rc.hint('자동 재접속을 취소했습니다');
    }
    if (s.state === 'idle') return;
    await termApi.Disconnect(s.id).catch(() => undefined);
    s.markIdle();
    s.term.write('\r\n\x1b[33m[연결을 끊었습니다] Enter: 다시 접속\x1b[0m\r\n');
}
