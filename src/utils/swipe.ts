/**
 * 滑动翻页手势判定（纯函数，无 DOM）
 * - 主轴判定：|dx| >= |dy| 视为横向翻页；纵向手势交还页面滚动
 * - 翻页判定：净位移足够即翻页；位移不足但速度够快（轻扫）同样翻页
 * - 跟手位移：超过视口一定比例后加阻尼，避免整页被拖走
 */

/** 手势主轴：none=尚未超过判定阈值，vertical=交还页面滚动 */
export type SwipeAxis = 'none' | 'horizontal' | 'vertical';

/** 翻页判定参数 */
export interface SwipeThresholds {
  /** 判定主轴所需的最小位移（px） */
  axisSlop: number;
  /** 触发翻页的最小净位移（px） */
  minDistance: number;
  /** 触发翻页的最小速度（px/ms），用于快速轻扫 */
  minVelocity: number;
}

/** 默认阈值：约一拇指宽的位移，或 0.35px/ms 以上的轻扫 */
export const DEFAULT_SWIPE: SwipeThresholds = {
  axisSlop: 8,
  minDistance: 44,
  minVelocity: 0.35,
};

/** 翻页动画时长（ms），须与组件 CSS transition 时长一致 */
export const SWIPE_ANIM_MS = 200;

/** 判定手势主轴。纵向一律返回 vertical，由浏览器处理页面滚动。 */
export function resolveSwipeAxis(
  dx: number,
  dy: number,
  slop: number = DEFAULT_SWIPE.axisSlop
): SwipeAxis {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < slop) return 'none';
  return ax >= ay ? 'horizontal' : 'vertical';
}

/**
 * 判定是否翻页。
 * @param dx 水平净位移（向右滑为正）
 * @param dt 手势时长（ms）；小于等于 0 视为未知，仅按位移判定
 * @returns -1 上一个月 / 0 不翻页 / 1 下一个月
 */
export function resolveSwipePage(
  dx: number,
  dt: number,
  cfg: SwipeThresholds = DEFAULT_SWIPE
): -1 | 0 | 1 {
  if (dx === 0) return 0;
  const dist = Math.abs(dx);
  if (dist >= cfg.minDistance) return dx > 0 ? -1 : 1;
  // 轻扫：位移未达阈值但速度够快，且至少要超过 axisSlop（否则只是手抖）
  if (dt > 0 && dist > cfg.axisSlop && dist / dt >= cfg.minVelocity) {
    return dx > 0 ? -1 : 1;
  }
  return 0;
}

/** 拖拽跟手位移：超过视口宽度的 maxFraction 后加阻尼 */
export function applySwipeResistance(
  dx: number,
  viewportWidth: number,
  maxFraction = 0.5
): number {
  const max = Math.max(1, viewportWidth * maxFraction);
  const abs = Math.abs(dx);
  if (abs <= max) return dx;
  return Math.sign(dx) * (max + (abs - max) * 0.35);
}

/** 轨道几何：面板数与当前面板索引 -> 三个 CSS 变量 */
export interface TrackGeometry {
  /** 轨道总宽（相对视口）：面板数 × 100% */
  trackWidth: string;
  /** 轨道左移量：把当前面板对齐到视口左边 */
  trackShift: string;
  /** 单面板宽（相对轨道）：均分 */
  panelWidth: string;
}

/**
 * 计算滑动轨道的 CSS 几何。
 * 每个面板恰好等于一个视口宽，故左移 currentIndex × 100% 即可对齐当前面板；
 * 翻页时轨道再整体平移 ±100%（一个面板宽）即滑到相邻月。
 */
export function trackGeometry(panelCount: number, currentIndex: number): TrackGeometry {
  const n = Math.max(1, Math.floor(panelCount));
  const idx = Math.min(Math.max(Math.floor(currentIndex), 0), n - 1);
  return {
    trackWidth: `${n * 100}%`,
    trackShift: `-${idx * 100}%`,
    panelWidth: `${100 / n}%`,
  };
}

/** 轨道翻页的位移（px）：dir=1（下一月）向左，dir=-1 向右 */
export function trackTurnOffset(dir: -1 | 1, panelWidthPx: number): number {
  return -dir * panelWidthPx;
}
