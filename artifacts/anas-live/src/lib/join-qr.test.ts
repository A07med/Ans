import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  authoritativeJoinUrl,
  copyJoinLink,
  copyTransparentQr,
  downloadTransparentQr,
  JOIN_LINK_COPY_SUCCESS,
  paintTransparentQr,
  QR_COPY_FAILURE,
  QR_COPY_SUCCESS,
  TRANSPARENT_QR_FILENAME,
  TRANSPARENT_QR_SIZE,
} from './join-qr';

describe('authoritative join QR URL', () => {
  it('uses the current origin when no intentional override exists', () => {
    expect(authoritativeJoinUrl(undefined, 'https://anas-live.vercel.app')).toBe('https://anas-live.vercel.app/join');
  });

  it('respects the intentionally configured join URL', () => {
    expect(authoritativeJoinUrl('https://event.example/join', 'https://ignored.example')).toBe('https://event.example/join');
  });

  it('does not hardcode a Preview deployment URL', () => {
    const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(appSource).not.toMatch(/anas-live-[a-z0-9]+-ahmeds-projects-[a-z0-9]+\.vercel\.app/);
  });
});

describe('transparent QR export', () => {
  it('clears the 1024px canvas and never paints an opaque background', () => {
    const context = { clearRect: vi.fn(), drawImage: vi.fn(), fillRect: vi.fn() };
    const image = {} as CanvasImageSource;
    paintTransparentQr(context as never, image);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, TRANSPARENT_QR_SIZE, TRANSPARENT_QR_SIZE);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, TRANSPARENT_QR_SIZE, TRANSPARENT_QR_SIZE);
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('returns copy-success feedback after writing a PNG ClipboardItem', async () => {
    const write = vi.fn(async () => undefined);
    class FakeClipboardItem { constructor(readonly items: Record<string, Blob | Promise<Blob>>) {} }
    const png = Promise.resolve(new Blob(['png'], { type: 'image/png' }));
    expect(await copyTransparentQr(png, { write } as never, FakeClipboardItem as never)).toBe(QR_COPY_SUCCESS);
    expect(write).toHaveBeenCalledOnce();
  });

  it('returns the required fallback when clipboard image copy is unsupported or fails', async () => {
    const png = Promise.resolve(new Blob(['png'], { type: 'image/png' }));
    expect(await copyTransparentQr(png, undefined, undefined)).toBe(QR_COPY_FAILURE);
    expect(await copyTransparentQr(png, { write: vi.fn(async () => { throw new Error('denied'); }) } as never, class {} as never)).toBe(QR_COPY_FAILURE);
  });

  it('downloads with the exact requested filename', () => {
    const anchor = { href: '', download: '', click: vi.fn() };
    const filename = downloadTransparentQr(new Blob(['png']), {
      createObjectURL: () => 'blob:qr',
      revokeObjectURL: vi.fn(),
      createAnchor: () => anchor,
    });
    expect(filename).toBe(TRANSPARENT_QR_FILENAME);
    expect(anchor.download).toBe('anas-join-qr.png');
    expect(anchor.click).toHaveBeenCalledOnce();
  });
});

describe('join-link clipboard', () => {
  it('copies the exact authoritative /join URL', async () => {
    const writeText = vi.fn(async () => undefined);
    const url = authoritativeJoinUrl(undefined, 'https://anas-live.vercel.app');
    expect(await copyJoinLink(url, { writeText })).toBe(JOIN_LINK_COPY_SUCCESS);
    expect(writeText).toHaveBeenCalledWith('https://anas-live.vercel.app/join');
  });
});
