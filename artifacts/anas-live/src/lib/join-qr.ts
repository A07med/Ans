export const TRANSPARENT_QR_SIZE = 1024;
export const TRANSPARENT_QR_FILENAME = 'anas-join-qr.png';
export const QR_COPY_SUCCESS = 'تم نسخ QR الشفاف ✓';
export const QR_COPY_FAILURE = 'تعذر النسخ من هذا المتصفح — استخدم تحميل QR شفاف';
export const JOIN_LINK_COPY_SUCCESS = 'تم نسخ رابط التسجيل ✓';
export const JOIN_LINK_COPY_FAILURE = 'تعذر نسخ رابط التسجيل من هذا المتصفح';

type ImageClipboard = Pick<Clipboard, 'write'>;
type TextClipboard = Pick<Clipboard, 'writeText'>;
type ClipboardItemConstructor = new (items: Record<string, Blob | Promise<Blob>>) => ClipboardItem;

export function authoritativeJoinUrl(configuredUrl: string | undefined, origin: string): string {
  const configured = configuredUrl?.trim();
  return configured || new URL('/join', origin).toString();
}

export function paintTransparentQr(
  context: Pick<CanvasRenderingContext2D, 'clearRect' | 'drawImage'>,
  image: CanvasImageSource,
  size = TRANSPARENT_QR_SIZE,
) {
  context.clearRect(0, 0, size, size);
  context.drawImage(image, 0, 0, size, size);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('qr_image_load_failed'));
    image.src = url;
  });
}

export async function transparentQrPng(svg: SVGSVGElement): Promise<Blob> {
  const markup = new XMLSerializer().serializeToString(svg);
  const sourceUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement('canvas');
    canvas.width = TRANSPARENT_QR_SIZE;
    canvas.height = TRANSPARENT_QR_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('qr_canvas_unavailable');
    context.imageSmoothingEnabled = false;
    paintTransparentQr(context, image);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('qr_png_export_failed')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function copyTransparentQr(
  png: Promise<Blob>,
  clipboard: ImageClipboard | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard,
  ClipboardItemType: ClipboardItemConstructor | undefined = typeof ClipboardItem === 'undefined' ? undefined : ClipboardItem,
): Promise<string> {
  if (!clipboard?.write || !ClipboardItemType) return QR_COPY_FAILURE;
  try {
    await clipboard.write([new ClipboardItemType({ 'image/png': png })]);
    return QR_COPY_SUCCESS;
  } catch {
    return QR_COPY_FAILURE;
  }
}

export async function copyJoinLink(
  joinUrl: string,
  clipboard: TextClipboard | undefined = typeof navigator === 'undefined' ? undefined : navigator.clipboard,
): Promise<string> {
  if (!clipboard?.writeText) return JOIN_LINK_COPY_FAILURE;
  try {
    await clipboard.writeText(joinUrl);
    return JOIN_LINK_COPY_SUCCESS;
  } catch {
    return JOIN_LINK_COPY_FAILURE;
  }
}

type DownloadEnvironment = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => Pick<HTMLAnchorElement, 'href' | 'download' | 'click'>;
};

export function downloadTransparentQr(
  png: Blob,
  environment: DownloadEnvironment = {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
  },
): string {
  const url = environment.createObjectURL(png);
  try {
    const anchor = environment.createAnchor();
    anchor.href = url;
    anchor.download = TRANSPARENT_QR_FILENAME;
    anchor.click();
    return anchor.download;
  } finally {
    environment.revokeObjectURL(url);
  }
}
