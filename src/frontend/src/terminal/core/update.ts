// Update check (Todo #124, choboTerm update.ts): asks the Go side (which asks
// GitHub) whether a newer release of Chobocho Commander is out. At start it
// only runs when turned on in the settings.

import {termApi, browserOpenURL} from './termApi';

/**
 * Checks for a newer release and offers to open its page. manual: the
 * "지금 확인" button, which always asks and returns what it found (errors
 * are thrown); at start nothing is said unless there is news.
 */
export async function checkUpdate(manual: boolean): Promise<string> {
    let info;
    try {
        info = await termApi.CheckUpdate(manual);
    } catch (e) {
        if (manual) throw e;
        return '';
    }
    if (!info?.checked) return '';
    if (!info.newer) return `최신 버전입니다 (V${info.current})`;
    const back = document.activeElement as HTMLElement | null;
    const open = window.confirm(`Chobocho Commander V${info.latest}이(가) 나왔습니다. 지금은 V${info.current}입니다.\n다운로드 페이지를 열까요?`);
    back?.focus?.();
    if (open && info.url) browserOpenURL(info.url);
    return `새 버전 V${info.latest}이(가) 있습니다`;
}
