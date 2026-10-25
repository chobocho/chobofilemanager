// A short message at the bottom of the window that goes away by itself
// (choboTerm notify.ts toast), for things said outside a terminal.

const SHOW_MS = 2500;
let el: HTMLDivElement | null = null;
let timer = 0;

export function toast(msg: string) {
    if (!el) {
        el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.dataset.toast = '';
        el.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:2000;padding:6px 14px;' +
            'border-radius:4px;background:rgba(20,20,28,.92);color:#eee;font-size:12px;pointer-events:none;max-width:80vw';
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(timer);
    timer = window.setTimeout(() => { if (el) el.hidden = true; }, SHOW_MS);
}
