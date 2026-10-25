import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {setTermBackend} from './termApi';
import {createRemoteSource, decodeBytes, imageMime} from './remoteSource';

// ─── Todo #123: 원격 파일 보기/편집 소스 (FileView / FileSaveText / FileImage) ──

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const utf8 = (s: string) => new TextEncoder().encode(s);
const EUC_HANGUL = new Uint8Array([0xc7, 0xd1, 0xb1, 0xdb]); // "한글" (CP949)

let api: any;
beforeEach(() => {
    api = {
        FileView: vi.fn().mockResolvedValue({data: b64(utf8('hello\r\n한글')), truncated: false, size: 14, modTime: 't1'}),
        FileImage: vi.fn().mockResolvedValue({data: b64(new Uint8Array([1, 2, 3])), truncated: false, size: 3, modTime: 't1'}),
        FileSaveText: vi.fn().mockResolvedValue({saved: true, conflict: false, bad: 0, size: 20, modTime: 't2', data: ''}),
    };
    setTermBackend(api, {EventsOn: () => () => {}} as any);
});
afterEach(() => { setTermBackend(null); vi.restoreAllMocks(); });

describe('remoteSource (RS)', () => {
    it('RS-01: 자동 판별 — UTF-8이면 UTF-8, 아니면 CP949', () => {
        expect(decodeBytes(utf8('가나'), 'auto')).toEqual({text: '가나', encoding: 'UTF-8'});
        expect(decodeBytes(EUC_HANGUL, 'auto')).toEqual({text: '한글', encoding: 'EUC-KR'});
        expect(decodeBytes(EUC_HANGUL, 'cp949').text).toBe('한글');
        expect(decodeBytes(new Uint8Array([0x41, 0x00]), 'utf-16le').text).toBe('A');
        expect(() => decodeBytes(utf8('x'), 'johab')).toThrow('Johab');
    });

    it('RS-02: 읽기 — FileView(크기 포함), 이름표에 서버', async () => {
        const s = createRemoteSource(4, {host: 'srv', path: '/w/a.txt', size: 14});
        expect(await s.read('/w/a.txt', 'auto')).toBe('hello\r\n한글');
        expect(api.FileView).toHaveBeenCalledWith(4, '/w/a.txt', 14);
        expect(s.label('/w/a.txt')).toBe('srv:/w/a.txt');
        expect(s.note()).toBe('');
        expect(s.remote).toBe(true);
    });

    it('RS-03: 저장 — 읽을 때의 크기·시각과 함께, 저장 후 새 값으로 다음 저장', async () => {
        const onSaved = vi.fn();
        const s = createRemoteSource(4, {host: 'srv', path: '/w/a.txt', size: 14, onSaved});
        await s.read('/w/a.txt', 'auto');
        await s.write('/w/a.txt', 'new', 'auto');
        expect(api.FileSaveText).toHaveBeenCalledWith(4, expect.objectContaining({path: '/w/a.txt', text: 'new', encoding: 'UTF-8', size: 14, modTime: 't1', ignoreConflict: false, allowLossy: false}));
        expect(onSaved).toHaveBeenCalled();
        await s.write('/w/a.txt', 'again', 'auto');
        expect(api.FileSaveText).toHaveBeenLastCalledWith(4, expect.objectContaining({size: 20, modTime: 't2'}));
    });

    it('RS-04: CP949로 연 파일은 EUC-KR로 저장', async () => {
        api.FileView.mockResolvedValue({data: b64(EUC_HANGUL), truncated: false, size: 4, modTime: 't1'});
        const s = createRemoteSource(4, {host: 'srv', path: '/a', size: 4});
        await s.read('/a', 'auto');
        await s.write('/a', '한글', 'auto');
        expect(api.FileSaveText.mock.calls[0][1].encoding).toBe('EUC-KR');
        await s.write('/a', 'x', 'utf-8');
        expect(api.FileSaveText.mock.calls[1][1].encoding).toBe('UTF-8');
    });

    it('RS-05: 서버에서 바뀜 → 확인하면 덮어쓰기, 거절하면 저장 안 함', async () => {
        const s = createRemoteSource(4, {host: 'srv', path: '/a', size: 14});
        await s.read('/a', 'auto');
        api.FileSaveText.mockResolvedValueOnce({saved: false, conflict: true, bad: 0});
        const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
        await s.write('/a', 't', 'auto');
        expect(ask.mock.calls[0][0]).toContain('서버의 파일이 바뀌었습니다');
        expect(api.FileSaveText).toHaveBeenLastCalledWith(4, expect.objectContaining({ignoreConflict: true}));
        api.FileSaveText.mockResolvedValueOnce({saved: false, conflict: true, bad: 0});
        ask.mockReturnValueOnce(false);
        await expect(s.write('/a', 't', 'auto')).rejects.toThrow('저장하지 않았습니다');
    });

    it('RS-06: 인코딩에 없는 글자 → 확인하면 ?로 바꿔 저장', async () => {
        api.FileView.mockResolvedValue({data: b64(EUC_HANGUL), truncated: false, size: 4, modTime: 't1'});
        const s = createRemoteSource(4, {host: 'srv', path: '/a', size: 4});
        await s.read('/a', 'auto');
        api.FileSaveText.mockResolvedValueOnce({saved: false, conflict: false, bad: 2});
        const ask = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
        await s.write('/a', '😀😀', 'auto');
        expect(ask.mock.calls[0][0]).toContain('2개');
        expect(api.FileSaveText).toHaveBeenLastCalledWith(4, expect.objectContaining({allowLossy: true}));
    });

    it('RS-07: 앞부분만 받은 큰 파일은 저장 거부, 안내 문구', async () => {
        api.FileView.mockResolvedValue({data: b64(utf8('part')), truncated: true, size: 99e6, modTime: 't1'});
        const s = createRemoteSource(4, {host: 'srv', path: '/big.log', size: 99e6});
        await s.read('/big.log', 'auto');
        expect(s.note()).toContain('앞부분만');
        await expect(s.write('/big.log', 'x', 'auto')).rejects.toThrow('앞부분만');
        expect(api.FileSaveText).not.toHaveBeenCalled();
    });

    it('RS-08: UTF-16 등은 원격 저장 불가', async () => {
        const s = createRemoteSource(4, {host: 'srv', path: '/a', size: 14});
        await s.read('/a', 'auto');
        await expect(s.write('/a', 'x', 'utf-16le')).rejects.toThrow('UTF-8');
    });

    it('RS-09: 이미지 — FileImage, 확장자별 data URL', async () => {
        const s = createRemoteSource(4, {host: 'srv', path: '/p.png', size: 3, sizes: {'/p.png': 3, '/q.jpg': 5}});
        expect(await s.readImage('/p.png')).toBe('data:image/png;base64,AQID');
        await s.readImage('/q.jpg');
        expect(api.FileImage).toHaveBeenLastCalledWith(4, '/q.jpg', 5);
        expect(imageMime('/x.svg')).toBe('image/svg+xml');
        expect(imageMime('/x.unknown')).toBe('application/octet-stream');
    });
});
