/**
 * 事件分享卡片：Canvas 2D 手绘 PNG（不依赖 DOM 截图，Shadow DOM 兼容）
 * 配色由「种子色 + 亮暗」独立派生（不依赖当前页面主题），支持自定义背景图与不压暗、卡片覆盖（不透明/半透明/高斯模糊）。
 * 事件带背景图时，默认用 Material 动态取色（Quantizer Celebi + Score）从背景图提取种子色派生整套配色。
 */
import { QuantizerCelebi, Score, argbFromRgb, hexFromArgb } from '@material/material-color-utilities';
import type { AevumEvent, WeekdayDisplay } from '../types.js';
import { getSettings } from '../store/settings.js';
import { computeDiff, parseBoundary, effectiveEvent } from './time-calc.js';
import { formatSegments, statusLabel } from './format.js';
import { formatEventDateTime, weekdaySuffix } from './calendar.js';
import { resolveEventTags, tagDisplay } from '../store/tags.js';
import { getLocale, t } from '../i18n.js';
import { getSchemeColors, resolveDark } from '../theme.js';
import { downloadBlob } from './backup.js';

export const W = 1080;
export const H = 1200;
const PAD = 88;

const FONT = `system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`;

/** 卡片覆盖样式 */
export type CardStyle = 'opaque' | 'translucent' | 'blur';

export interface ShareImageOptions {
  /** 主题种子色 hex */
  themeColor: string;
  /** 亮 / 暗背景 */
  dark: boolean;
  /** 卡片覆盖：不透明 / 半透明 / 高斯模糊 */
  cardStyle: CardStyle;
  /** 卡片覆盖强度 0..1：半透明时控制不透明度、高斯模糊时控制模糊半径（opaque 时忽略） */
  cardIntensity: number;
  /** 卡片覆盖浓度 0..1：仅高斯模糊模式使用，独立控制卡片表面不透明度（0.1..0.8） */
  cardOpacity: number;
  /** 是否压暗背景图（默认 false：保留背景图原色，靠卡片覆盖保证可读） */
  darkenBg: boolean;
  /** 星期显示：关闭 / 短 / 长（分享图页可独立设置） */
  weekday: WeekdayDisplay;
  /** 事件带背景图时是否从背景图动态取色派生主题（Material dynamic color；默认 true） */
  dynamicTheme: boolean;
}

interface SchemeColors {
  surface: string;
  primary: string;
  primaryContainer: string;
  tertiaryContainer: string;
  onSurface: string;
  onSurfaceVariant: string;
  outlineVariant: string;
  tertiary: string;
  surfaceContainer: string;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const h = (hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** 给 hex 颜色附加 alpha（0..1），非法输入原样返回 */
function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}${a}`;
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

/** 背景图取色缓存（src → 种子色 hex；失败也缓存 null，避免重复量化） */
const bgSeedCache = new Map<string, Promise<string | null>>();

/**
 * 从图片提取 Material 动态取色种子色：与官方 sourceColorFromImage 同算法
 * （Quantizer Celebi 量化 + Score 排序），但先降采样到最长边 ≤112px 再量化，
 * 避免整图 getImageData / 量化的开销（预览随滑杆频繁重绘）。
 */
function extractSeedColor(img: HTMLImageElement, src: string): Promise<string | null> {
  const cached = bgSeedCache.get(src);
  if (cached) return cached;
  const p = new Promise<string | null>((resolve) => {
    try {
      const maxSide = 112;
      const iw = img.width || 1;
      const ih = img.height || 1;
      const scale = Math.min(1, maxSide / Math.max(iw, ih));
      const w = Math.max(1, Math.round(iw * scale));
      const h = Math.max(1, Math.round(ih * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const pixels: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 255) continue; // 跳过半透明像素（与官方实现一致）
        pixels.push(argbFromRgb(data[i], data[i + 1], data[i + 2]));
      }
      if (pixels.length === 0) return resolve(null);
      const top = Score.score(QuantizerCelebi.quantize(pixels, 128))[0];
      resolve(typeof top === 'number' ? hexFromArgb(top) : null);
    } catch {
      resolve(null);
    }
  });
  bgSeedCache.set(src, p);
  return p;
}

/** 等比 cover 绘制：把图片铺满 (x,y,w,h) 区域（溢出裁切） */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function resolveScheme(themeColor: string, dark: boolean): SchemeColors {
  const m = getSchemeColors(themeColor, dark);
  // 注意：getSchemeColors 的键是 kebab-case（如 'primary-container'），此处须按 kebab 读取，
  // 否则会命中硬编码兜底值，导致背景等不随主题色变化。
  return {
    surface: m.surface || (dark ? '#1D1B20' : '#FEF7FF'),
    primary: m.primary || (dark ? '#D0BCFF' : '#6750A4'),
    primaryContainer: m['primary-container'] || (dark ? '#4F378B' : '#EADDFF'),
    tertiaryContainer: m['tertiary-container'] || (dark ? '#4A2532' : '#FFD8E4'),
    onSurface: m['on-surface'] || (dark ? '#E6E1E5' : '#1D1B20'),
    onSurfaceVariant: m['on-surface-variant'] || (dark ? '#CAC4D0' : '#49454F'),
    outlineVariant: m['outline-variant'] || (dark ? '#49454F' : '#CAC4D0'),
    tertiary: m.tertiary || (dark ? '#EFB8C8' : '#7D5260'),
    surfaceContainer: m['surface-container'] || m['surface-container-high'] || (dark ? '#211F26' : '#E6E0E9'),
  };
}

function normalizeOptions(opts?: Partial<ShareImageOptions>): ShareImageOptions {
  const s = getSettings();
  const dark = opts?.dark ?? resolveDark(s.themeMode);
  return {
    themeColor: opts?.themeColor ?? s.seedColor,
    dark,
    cardStyle: opts?.cardStyle ?? 'opaque',
    cardIntensity: opts?.cardIntensity ?? 0.5,
    cardOpacity: opts?.cardOpacity ?? 0.5,
    darkenBg: opts?.darkenBg ?? false,
    weekday: opts?.weekday ?? s.shareWeekdayDisplay,
    dynamicTheme: opts?.dynamicTheme ?? true,
  };
}

/**
 * 在给定 canvas 上绘制分享图（纯绘制，不触发下载）。
 * 调用方需保证 canvas 尺寸为 W × H。
 */
export async function drawShareImage(
  canvas: HTMLCanvasElement,
  ev: AevumEvent,
  opts?: Partial<ShareImageOptions>
): Promise<void> {
  const options = normalizeOptions(opts);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-2d-unavailable');
  ctx.clearRect(0, 0, W, H);

  // —— 背景：事件背景图（铺底，不压暗）或 OKLCH 风格渐变 ——
  const bgImg = ev.bgImage ? await loadImage(ev.bgImage) : null;
  // 背景图动态取色：从背景图提取种子色派生整套 M3 配色（提取失败回退用户主题色）
  const dynSeed =
    bgImg && ev.bgImage && options.dynamicTheme ? await extractSeedColor(bgImg, ev.bgImage) : null;
  const colors = resolveScheme(dynSeed ?? options.themeColor, options.dark);
  if (bgImg) {
    drawCover(ctx, bgImg, 0, 0, W, H);
    // 仅在用户显式要求（旧行为）时才压暗背景图；默认保留原色，可读性由卡片覆盖保证
    if (options.darkenBg) {
      ctx.fillStyle = withAlpha(colors.surface, 0.7);
      ctx.fillRect(0, 0, W, H);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    // 两个端点均取自种子色派生色阶（primaryContainer / tertiaryContainer），
    // 主题的选定色会同时影响卡片外缘背景与（半透明/模糊卡片时）透出的底色。
    bg.addColorStop(0, colors.primaryContainer);
    bg.addColorStop(1, colors.tertiaryContainer);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // —— 主卡片几何 ——
  const cardX = PAD;
  const cardY = PAD + 20;
  const cardW = W - PAD * 2;
  const cardH = H - PAD * 2 - 40;

  // 覆盖强度：半透明控制不透明度、高斯模糊控制模糊半径（opaque 忽略）
  const intensity = Math.max(0, Math.min(1, options.cardIntensity));
  // 高斯模糊：模糊半径 4..60px（cardIntensity 驱动），卡片覆盖浓度 0.1..0.8（cardOpacity 独立驱动）
  const blurRadius = 4 + intensity * 56;
  const coverOpacity = Math.max(0, Math.min(1, options.cardOpacity));
  const cardAlpha =
    options.cardStyle === 'opaque'
      ? 1
      : options.cardStyle === 'translucent'
        ? 0.08 + intensity * 0.92
        : 0.1 + coverOpacity * 0.7;

  // 高斯模糊（磨砂玻璃）：在卡片裁剪区内重绘「与底层背景同源」的整图模糊，
  // 仅卡片区域被模糊，且模糊内容与卡片背后的背景严格对齐（不再对整图重新裁切缩放）。
  if (options.cardStyle === 'blur' && bgImg) {
    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 56);
    ctx.clip();
    if (typeof ctx.filter !== 'undefined') ctx.filter = `blur(${blurRadius}px)`;
    // 用与背景一致的整图铺底（0,0,W,H），而非按卡片尺寸重裁，避免模糊区与底层背景错位
    drawCover(ctx, bgImg, 0, 0, W, H);
    if (typeof ctx.filter !== 'undefined') ctx.filter = 'none';
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 16;
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = withAlpha(colors.surface, cardAlpha);
  ctx.fill();
  ctx.restore();

  // 卡片描边
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
  const eff = effectiveEvent(ev, Date.now(), parseBoundary(s.dayBoundary), {
    dayOverflow: s.dayOverflow,
    leapMonthStrategy: s.leapMonthStrategy,
  });
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
  const dateText = [
    formatEventDateTime(eff.date, eff.time, eff.calendar, getLocale()),
    weekdaySuffix(eff.date, getLocale(), options.weekday),
  ]
    .filter(Boolean)
    .join(' ');
  ctx.fillText(dateText, cx, dateY);

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

  // —— 页脚：应用名 · 副标题 + 产品域名 ——
  const footerY = cardY + cardH - 64;
  ctx.font = `400 32px ${FONT}`;
  ctx.fillStyle = colors.onSurfaceVariant;
  ctx.fillText(`${t('appName')} · ${t('appSubtitle')}`, cx, footerY);

  const domainY = footerY + 48;
  const domainText = 'aevum.kkn.moe';
  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = colors.primary;
  const domainW = ctx.measureText(domainText).width;
  const linkPath =
    'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';
  const iconSize = 30;
  const iconGap = 12;
  const iconCenterY = domainY - 34 * 0.35;
  const groupW = iconSize + iconGap + domainW;
  const groupX = cx - groupW / 2;
  ctx.save();
  ctx.translate(groupX, iconCenterY - iconSize / 2);
  ctx.scale(iconSize / 24, iconSize / 24);
  ctx.fill(new Path2D(linkPath));
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillText(domainText, groupX + iconSize + iconGap, domainY);
  ctx.textAlign = 'center';
}

/**
 * 提取（并缓存）背景图种子色，供分享图页在「从背景图取色」开关旁展示取色结果。
 * 与 drawShareImage 内部共用同一份缓存，不产生重复量化。
 */
export async function getBgSeedColor(src: string): Promise<string | null> {
  const img = await loadImage(src);
  if (!img) return null;
  return extractSeedColor(img, src);
}

/** 生成分享图并触发下载 */
export async function saveEventShareImage(ev: AevumEvent, opts?: Partial<ShareImageOptions>): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  await drawShareImage(canvas, ev, opts);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png-encode-failed');
  const safeName = ev.name.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'event';
  downloadBlob(blob, `aevum-${safeName}.png`);
}

/** 生成分享图并复制到剪贴板 */
export async function copyEventShareImageToClipboard(ev: AevumEvent, opts?: Partial<ShareImageOptions>): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  await drawShareImage(canvas, ev, opts);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('png-encode-failed');
  if (!navigator.clipboard || !navigator.clipboard.write) throw new Error('clipboard-unsupported');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
