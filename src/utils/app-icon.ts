/**
 * 运行时应用图标生成
 * - 复用主题系统的 M3 配色（material-color-utilities），从当前 seedColor 推导
 *   primary（图标底色）与 onPrimary（沙漏字形色），保证与界面主题完全一致
 * - 在主题应用的同时生成 SVG 并写入 favicon / apple-touch-icon，
 *   使浏览器标签图标随主题色与亮暗模式实时变化
 * - 纯函数 buildAppIconSvg 不依赖 DOM，便于测试与离屏复用
 */
import { argbFromHex, hexFromArgb, themeFromSourceColor } from '@material/material-color-utilities';

/* 沙漏主形（onPrimary 描边感）+ 内部「沙堆」与中心点（用底色做镂空，形成凹陷质感） */
const HOURGLASS = 'M176 128h160v18c0 48-30 82-64 106-8 6-8 14 0 20 34 24 64 58 64 106v18H176v-18c0-48 30-82 64-106 8-6 8-14 0-20-34-24-64-58-64-106v-12z';
const SAND_BOTTOM = 'M196 372c10-34 34-52 60-52s50 18 60 52H196z';
const SAND_TOP = 'M206 148c6 30 26 50 50 50s44-20 50-50H206z';

export interface AppIconOptions {
  /** 是否生成 maskable（全出血、留安全区）版本 */
  maskable?: boolean;
  /** 是否使用暗色方案（默认亮色，由调用方按当前生效模式传入） */
  dark?: boolean;
}

/**
 * 根据种子色生成应用图标 SVG 字符串。
 * 底色 = primary，沙漏字形 = onPrimary（M3 保证对比度），
 * 内部沙堆与中心点用底色镂空，复刻现有静态图标的层次感。
 */
export function buildAppIconSvg(seedColor: string, opts: AppIconOptions = {}): string {
  const theme = themeFromSourceColor(argbFromHex(seedColor));
  const scheme = (opts.dark ? theme.schemes.dark : theme.schemes.light) as unknown as Record<string, number>;
  const bg = hexFromArgb(scheme.primary);
  const fg = hexFromArgb(scheme.onPrimary);
  const cut = bg; // 镂空细节与底色一致

  const glyphs = `
    <path d="${HOURGLASS}" fill="${fg}" opacity="0.95"/>
    <path d="${SAND_BOTTOM}" fill="${cut}"/>
    <path d="${SAND_TOP}" fill="${cut}" opacity="0.85"/>
    <circle cx="256" cy="260" r="9" fill="${cut}"/>`;

  if (opts.maskable) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${bg}"/>
  <g transform="translate(51 51) scale(0.8)">${glyphs}
  </g>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="114" fill="${bg}"/>${glyphs}
</svg>`;
}

function setIconLink(rel: string, href: string): void {
  let link = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = href;
}

/**
 * 将当前主题色生成的图标应用到文档：实时更新 favicon 与 apple-touch-icon。
 * 以 data URL 注入，无需任何静态资源或网络请求。
 */
export function applyAppIcon(seedColor: string, dark: boolean): void {
  const svg = buildAppIconSvg(seedColor, { dark });
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  setIconLink('icon', href);
  setIconLink('apple-touch-icon', href);
}
