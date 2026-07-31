/**
 * 事件分享卡片：Canvas 2D 手绘 PNG（不依赖 DOM 截图，Shadow DOM 兼容）
 * 配色读取当前 M3 主题变量，亮暗模式自适应
 */
import type { AevumEvent } from '../types.js';
import { getSettings } from '../store/settings.js';
import { computeDiff, parseBoundary, effectiveEvent } from './time-calc.js';
import { formatSegments, statusLabel } from './format.js';
import { formatEventDateTime } from './calendar.js';
import { resolveEventTags, tagDisplay } from '../store/tags.js';
import { getLocale, t } from '../i18n.js';
import { downloadBlob } from './backup.js';

const W = 1080;
const H = 1200;
const PAD = 88;

const FONT = `system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`;

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/** 单行文本省略号收敛 */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

/** 加载图片（失败返回 null） */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 生成分享图并触发下载 */
export async function saveEventShareImage(ev: AevumEvent): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-2d-unavailable');

  const colors = {
    surface: cssVar('--md-sys-color-surface', '#FEF7FF'),
    primary: cssVar('--md-sys-color-primary', '#6750A4'),
    primaryContainer: cssVar('--md-sys-color-primary-container', '#EADDFF'),
    onSurface: cssVar('--md-sys-color-on-surface', '#1D1B20'),
    onSurfaceVariant: cssVar('--md-sys-color-on-surface-variant', '#49454F'),
    outlineVariant: cssVar('--md-sys-color-outline-variant', '#CAC4D0'),
    tertiary: cssVar('--md-sys-color-tertiary', '#7D5260'),
  };

  // —— 背景：事件背景图（封面铺底 + 纱罩）或 OKLCH 渐变 ——
  const bgImg = ev.bgImage ? await loadImage(ev.bgImage) : null;
  if (bgImg) {
    const scale = Math.max(W / bgImg.width, H / bgImg.height);
    const dw = bgImg.width * scale;
    const dh = bgImg.height * scale;
    ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
    // 纱罩：让卡片从背景中凸显，同时保留图片氛围
    ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(colors.surface) ? `${colors.surface}B3` : colors.surface;
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, colors.primaryContainer);
    bg.addColorStop(1, colors.surface);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // —— 主卡片 ——
  const cardX = PAD;
  const cardY = PAD + 20;
  const cardW = W - PAD * 2;
  const cardH = H - PAD * 2 - 40;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 16;
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = colors.surface;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.strokeStyle = colors.outlineVariant;
  ctx.lineWidth = 2;
  ctx.stroke();

  const cx = W / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // —— 品牌行：沙漏 + Aevum ——
  const clockPath =
    'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z';
  const brandY = cardY + 108;
  ctx.font = `600 44px ${FONT}`;
  const brandText = 'Aevum';
  const brandW = ctx.measureText(brandText).width;
  ctx.fillStyle = colors.primary;
  ctx.save();
  ctx.translate(cx - brandW / 2 - 34, brandY - 34);
  ctx.scale(2.4, 2.4);
  ctx.fill(new Path2D(clockPath));
  ctx.restore();
  ctx.fillText(brandText, cx + 28, brandY);

  // —— 状态（还有/已经/就是今天） ——
  const s = getSettings();
  const eff = effectiveEvent(ev, Date.now(), parseBoundary(s.dayBoundary));
  const diff = computeDiff(eff, Date.now(), parseBoundary(s.dayBoundary), eff.granularity);
  const statusY = brandY + 120;
  ctx.font = `500 42px ${FONT}`;
  ctx.fillStyle = diff.status === 'today' ? colors.primary : colors.onSurfaceVariant;
  ctx.fillText(statusLabel(diff), cx, statusY);

  // —— 大字号倒计时段 ——
  const segments = diff.status === 'today' ? [{ value: '0', unit: t('unitDay') }] : formatSegments(diff);
  const segY = statusY + 300;
  let valueSize = 210;
  const minSize = 96;
  const gap = 56;
  const maxRowW = cardW - 120;
  // 自适应缩放直到整行放下
  for (;;) {
    ctx.font = `700 ${valueSize}px ${FONT}`;
    const total =
      segments.reduce((sum, seg) => sum + ctx.measureText(seg.value).width + gap * 0.4, 0) +
      gap * (segments.length - 1) +
      segments.length * 60;
    if (total <= maxRowW || valueSize <= minSize) break;
    valueSize -= 12;
  }
  ctx.font = `700 ${valueSize}px ${FONT}`;
  const widths = segments.map((seg) => ctx.measureText(seg.value).width);
  const unitW = 60;
  const rowW = widths.reduce((a, b) => a + b, 0) + gap * (segments.length - 1) + segments.length * unitW;
  let x = cx - rowW / 2;
  const accent = diff.status === 'past' ? colors.tertiary : colors.primary;
  segments.forEach((seg, i) => {
    ctx.textAlign = 'left';
    ctx.font = `700 ${valueSize}px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(seg.value, x, segY);
    ctx.font = `500 ${Math.round(valueSize * 0.24)}px ${FONT}`;
    ctx.fillStyle = colors.onSurfaceVariant;
    ctx.fillText(seg.unit, x + widths[i] + 10, segY);
    x += widths[i] + unitW + gap;
  });
  ctx.textAlign = 'center';

  // —— 事件名称 ——
  const nameY = segY + 150;
  let nameSize = 76;
  ctx.font = `600 ${nameSize}px ${FONT}`;
  const maxNameW = cardW - 140;
  while (ctx.measureText(ev.name).width > maxNameW && nameSize > 48) {
    nameSize -= 6;
    ctx.font = `600 ${nameSize}px ${FONT}`;
  }
  ctx.fillStyle = colors.onSurface;
  ctx.fillText(ellipsize(ctx, ev.name, maxNameW), cx, nameY);

  // —— 目标日期（历法感知，农历汉字 + 干支） ——
  const dateY = nameY + 76;
  ctx.font = `400 40px ${FONT}`;
  ctx.fillStyle = colors.onSurfaceVariant;
  ctx.fillText(formatEventDateTime(eff.date, eff.time, eff.calendar, getLocale()), cx, dateY);

  // —— 标签胶囊 ——
  const tagDefs = resolveEventTags(ev);
  if (tagDefs.length > 0) {
    const tagY = dateY + 66;
    ctx.font = `500 32px ${FONT}`;
    const tagPads = 28;
    const tagH = 60;
    const tagGap = 20;
    const tagWidths = tagDefs.map((tag) => ctx.measureText(tagDisplay(tag)).width + tagPads * 2);
    const totalW = tagWidths.reduce((a, b) => a + b, 0) + tagGap * (tagDefs.length - 1);
    let tx = cx - totalW / 2;
    tagDefs.forEach((tag, i) => {
      roundRect(ctx, tx, tagY - tagH + 12, tagWidths[i], tagH, 18);
      ctx.fillStyle = tag.color + '38'; // ~22% 透明度
      ctx.fill();
      ctx.fillStyle = tag.color;
      ctx.textAlign = 'left';
      ctx.fillText(tagDisplay(tag), tx + tagPads, tagY);
      tx += tagWidths[i] + tagGap;
    });
    ctx.textAlign = 'center';
  }

  // —— 页脚 ——
  ctx.font = `400 32px ${FONT}`;
  ctx.fillStyle = colors.onSurfaceVariant;
  ctx.fillText(`${t('appName')} · ${t('appSubtitle')}`, cx, cardY + cardH - 64);

  // —— 导出下载 ——
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png-encode-failed');
  const safeName = ev.name.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'event';
  downloadBlob(blob, `aevum-${safeName}.png`);
}
