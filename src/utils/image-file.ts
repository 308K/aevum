/**
 * 图片文件处理：降采样压缩为 dataURL（控制 localStorage 占用）
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB 上限
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

/**
 * 读取图片文件 → 等比缩放至最长边 ≤ 1600 → JPEG dataURL
 * @throws 'too-large' 超过大小上限；'not-image' 非图片
 */
export async function fileToDownscaledDataURL(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('too-large');

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('not-image');

  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-2d-unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // PNG（截图类）或 JPEG（照片类）：统一 JPEG，体积可控
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
