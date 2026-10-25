// A remote file as a source for the file manager's viewer and editor
// (Todo #123, choboTerm viewer.ts): reads with FileView/FileImage, writes with
// FileSaveText, which refuses to overwrite a file changed on the server or to
// drop characters the encoding lacks unless the user agrees.

import {termApi} from './termApi';

export interface FileSource {
    remote: boolean;
    read(path: string, encoding: string): Promise<string>;
    write(path: string, text: string, encoding: string): Promise<void>;
    readImage(path: string): Promise<string>;
    /** What the header shows instead of the path. */
    label(path: string): string;
    /** A line about the file as read (e.g. only its start), or ''. */
    note(): string;
}

const MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp',
    webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
};

export function imageMime(path: string): string {
    return MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** Bytes → text. 'auto' takes UTF-8 when the bytes are valid UTF-8, else CP949 (EUC-KR). */
export function decodeBytes(bytes: Uint8Array, encoding: string): {text: string; encoding: string} {
    switch (encoding) {
        case 'auto':
            try {
                return {text: new TextDecoder('utf-8', {fatal: true}).decode(bytes), encoding: 'UTF-8'};
            } catch {
                return {text: new TextDecoder('euc-kr').decode(bytes), encoding: 'EUC-KR'};
            }
        case 'utf-8':
            return {text: new TextDecoder('utf-8').decode(bytes), encoding: 'UTF-8'};
        case 'cp949':
            return {text: new TextDecoder('euc-kr').decode(bytes), encoding: 'EUC-KR'};
        case 'utf-16le':
        case 'utf-16be':
            return {text: new TextDecoder(encoding).decode(bytes), encoding: encoding.toUpperCase()};
        default:
            throw new Error('원격 파일은 Johab으로 읽을 수 없습니다');
    }
}

/** The Go encoding to save in: what was chosen, or what the file was read as. */
function saveEncoding(chosen: string, read: string): string {
    if (chosen === 'utf-8') return 'UTF-8';
    if (chosen === 'cp949') return 'EUC-KR';
    if (chosen === 'auto' && (read === 'UTF-8' || read === 'EUC-KR')) return read;
    throw new Error('원격 파일은 UTF-8 또는 EUC-KR(CP949)로만 저장할 수 있습니다');
}

export interface RemoteSourceOpts {
    host: string;
    path: string;
    size: number;
    /** Sizes of other files the viewer may page to (images of the folder). */
    sizes?: Record<string, number>;
    onSaved?: () => void;
}

export function createRemoteSource(tabId: number, opts: RemoteSourceOpts): FileSource {
    let meta = {size: opts.size, modTime: '', truncated: false, encoding: 'UTF-8'};
    const sizeOf = (p: string) => opts.sizes?.[p] ?? (p === opts.path ? opts.size : 0);

    async function save(path: string, text: string, encoding: string, ignoreConflict: boolean, allowLossy: boolean): Promise<void> {
        const res = await termApi.FileSaveText(tabId, {path, text, encoding, size: meta.size, modTime: meta.modTime, ignoreConflict, allowLossy});
        if (res.saved) {
            meta = {...meta, size: res.size, modTime: res.modTime};
            opts.onSaved?.();
            return;
        }
        if (res.bad > 0 && !allowLossy) {
            if (!window.confirm(`${encoding}에 없는 글자 ${res.bad}개가 '?'로 바뀝니다. 그래도 저장할까요?`)) throw new Error('저장하지 않았습니다');
            return save(path, text, encoding, ignoreConflict, true);
        }
        if (res.conflict) {
            if (!window.confirm('서버의 파일이 바뀌었습니다 (연 뒤에 누군가 고침). 덮어쓸까요?')) throw new Error('저장하지 않았습니다');
            return save(path, text, encoding, true, allowLossy);
        }
        throw new Error('저장하지 못했습니다');
    }

    return {
        remote: true,
        async read(path, encoding) {
            const res = await termApi.FileView(tabId, path, sizeOf(path));
            const {text, encoding: enc} = decodeBytes(fromB64(res.data), encoding);
            meta = {size: res.size, modTime: res.modTime, truncated: res.truncated, encoding: enc};
            return text;
        },
        async write(path, text, encoding) {
            if (meta.truncated) throw new Error('파일이 커서 앞부분만 열었으므로 저장할 수 없습니다');
            await save(path, text, saveEncoding(encoding, meta.encoding), false, false);
        },
        async readImage(path) {
            const res = await termApi.FileImage(tabId, path, sizeOf(path));
            return `data:${imageMime(path)};base64,${res.data}`;
        },
        label: path => `${opts.host}:${path}`,
        note: () => (meta.truncated ? '파일이 커서 앞부분만 열었습니다 (읽기 전용)' : ''),
    };
}
