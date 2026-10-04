/**
 * 日历形式的目标日期选择器（历法感知、无障碍）
 * - 复用 calendar.ts 的纯函数层（keysFromGregorian / yearOptions / monthOptions / monthCalendarDays）
 * - 7 列周网格，支持上/下月、上/下年导航与「今天」快捷跳转
 * - 公历/农历/伊斯兰历/希伯来历/波斯历/佛教历/日本和历均按各自历法展示
 * - 无障碍：role=grid 语义、roving tabindex、方向键/Home/End/PageUp/PageDown 键盘导航、
 *   每个日格提供完整日期的 aria-label、选中态用 aria-selected
 * - 快速跳转：点击表头年份/月份可展开年份网格视图与月份网格视图
 * - 滑动翻页：三面板轨道预渲染 [前月, 当前月, 后月]，左右拖拽切换月份全程无白屏；
 *   邻月面板整体 inert（不进读屏树、不可聚焦、不参与命中测试）
 */
import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  monthCalendarDays,
  yearOptions,
  monthOptions,
  keysFromGregorian,
  startOfMonthKeys,
  sameCalendarMonth,
  formatYearMonthHeader,
  type CalDayCell,
} from '../utils/calendar.js';
import { Temporal } from '../utils/temporal.js';
import {
  applySwipeResistance,
  resolveSwipeAxis,
  resolveSwipePage,
  trackGeometry,
  trackTurnOffset,
  SWIPE_ANIM_MS,
  type SwipeAxis,
} from '../utils/swipe.js';
import type { CalendarId, WeekStart } from '../types.js';
import { getLocale, t } from '../i18n.js';
import { getSettings, onSettingsChange } from '../store/settings.js';
import { icon } from '../icons.js';

const GRID_ID = 'aevum-cal-grid';
const HINT_ID = 'aevum-cal-hint';
const YM_HINT_ID = 'aevum-cal-ym-hint';

/** 视图模式：日期网格 / 年份选择 / 月份选择 */
type ViewMode = 'days' | 'years' | 'months';

/** 历法年/月键对 */
type YearMonth = { yearKey: string; monthKey: string };

/** 单个面板（一个月）的渲染数据 */
interface PanelData extends YearMonth {
  /** 该月全部日格 */
  cells: CalDayCell[];
  /** 按 7 列切分后的行；null 为空白占位 */
  rows: ({ cell: CalDayCell; muted: boolean } | null)[][];
  /** 表头年份展示（可能含「干支年」等额外文字，内部含空格，不可按空格拆分） */
  yearDisplay: string;
  /** 表头月份展示 */
  monthDisplay: string;
  /** 读屏标签：年月标题拼接 */
  label: string;
  /** 是否为当前视图月（决定 tabindex / aria / inert） */
  isCurrent: boolean;
  /** 该面板内应获 tabindex=0 的日格 ISO；邻月面板恒为 ''（全部 -1） */
  focusKey: string;
}

function toISO(d: Date): string {
  const pd = Temporal.PlainDate.from({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
  return pd.toString();
}

function fromISO(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  try {
    const pd = Temporal.PlainDate.from(iso);
    return new Date(pd.year, pd.month - 1, pd.day);
  } catch {
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 取某 locale 的每周首日列索引（0=周日 … 6=周六）
 *  优先用 Intl weekInfo；override 为固定选择（'sunday'/'monday'/'saturday'）时直接采用；
 *  override 为 'locale' 或省略时回退到语言惯例。 */
function firstDayOfWeek(locale: string, override?: WeekStart): number {
  if (override && override !== 'locale') {
    switch (override) {
      case 'sunday': return 0;
      case 'monday': return 1;
      case 'saturday': return 6;
    }
  }
  try {
    const li = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const wi = li.getWeekInfo?.() ?? li.weekInfo;
    if (wi && typeof wi.firstDay === 'number') return wi.firstDay === 7 ? 0 : wi.firstDay;
  } catch {
    /* 忽略，按下方惯例回退 */
  }
  return locale.startsWith('zh') ? 1 : 0;
}

@customElement('date-calendar')
export class DateCalendar extends LitElement {
  static styles = css`
    :host {
      display: block;
      text-autospace: normal;
    }
    .picker {
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
      background: color-mix(in oklch, var(--md-sys-color-surface-container) 55%, transparent);
      padding: 14px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 8px;
    }
    .title-group {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
    }
    .title-btn {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 8px;
      transition: background 0.15s ease;
      white-space: nowrap;
    }
    .title-btn:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .title-btn:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .title-btn.active {
      color: var(--md-sys-color-primary);
    }
    .title-sep {
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.95rem;
      user-select: none;
    }
    .nav {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      flex: none;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--md-sys-color-on-surface-variant);
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .nav:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .nav:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      margin-bottom: 4px;
    }
    .wd {
      text-align: center;
      font-size: 0.72rem;
      color: var(--md-sys-color-on-surface-variant);
      padding: 4px 0;
    }
    /* ---- 滑动翻页：视口裁切 + 三面板轨道（相邻月预渲染，翻页无白屏） ---- */
    .viewport {
      overflow: hidden;
      /* 只允许浏览器处理纵向平移，横向手势才会以 pointermove 送达组件 */
      touch-action: pan-y;
      -webkit-user-select: none;
      user-select: none;
      /* 负 margin 抵消 padding，使聚焦描边不被 overflow 裁掉 */
      padding: 2px;
      margin: -2px;
    }
    /* 轨道宽度/位移由 render 按面板数内联给出（--track-w / --track-shift） */
    .track {
      display: flex;
      align-items: flex-start;
      width: var(--track-w, 300%);
      margin-left: var(--track-shift, -100%);
      will-change: transform;
    }
    /* 面板即 role=grid 容器：自身也是列布局，省掉中间层以保住 grid > row > gridcell 三层结构 */
    .panel {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: none;
      width: var(--panel-w, 33.3333%);
    }
    /* 仅在松手后的动画阶段开启过渡，拖拽过程必须即时跟手 */
    .viewport.anim .track {
      transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
    }
    .grid-row {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
    }
    .empty {
      display: block;
      aspect-ratio: 1 / 1;
      pointer-events: none;
    }
    .day {
      aspect-ratio: 1 / 1;
      width: 100%;
      max-width: 44px;
      margin: 0 auto;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
    }
    .day:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .day:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .day.muted {
      color: color-mix(in oklch, var(--md-sys-color-on-surface) 42%, transparent);
    }
    .day.today {
      box-shadow: inset 0 0 0 1.5px var(--md-sys-color-primary);
      font-weight: 600;
    }
    .day.selected {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .day.selected.today {
      box-shadow: none;
    }

    /* ---- 年份/月份选择视图 ---- */
    .view-panel {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 260px;
    }
    .view-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 0 8px;
    }
    .view-title {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
    }
    .year-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
      overflow-y: auto;
      max-height: 280px;
      padding: 2px;
      scrollbar-width: thin;
      scrollbar-color: var(--md-sys-color-outline-variant) transparent;
    }
    .year-grid::-webkit-scrollbar {
      width: 6px;
    }
    .year-grid::-webkit-scrollbar-thumb {
      background: var(--md-sys-color-outline-variant);
      border-radius: 3px;
    }
    .year-cell {
      padding: 10px 4px;
      border: none;
      border-radius: 12px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s ease, color 0.15s ease;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
    }
    .year-cell:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .year-cell:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .year-cell.selected {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .year-cell.current {
      box-shadow: inset 0 0 0 1.5px var(--md-sys-color-primary);
      font-weight: 600;
    }
    .year-cell.selected.current {
      box-shadow: none;
    }
    .month-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }
    .month-cell {
      padding: 14px 4px;
      border: none;
      border-radius: 12px;
      background: transparent;
      color: var(--md-sys-color-on-surface);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: background 0.15s ease, color 0.15s ease;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
    }
    .month-cell:hover {
      background: color-mix(in oklch, var(--md-sys-color-on-surface) 8%, transparent);
    }
    .month-cell:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
    .month-cell.selected {
      background: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary);
      font-weight: 700;
    }
    .month-cell.current {
      box-shadow: inset 0 0 0 1.5px var(--md-sys-color-primary);
      font-weight: 600;
    }
    .month-cell.selected.current {
      box-shadow: none;
    }

    .footer {
      display: flex;
      justify-content: center;
      margin-top: 10px;
    }
    .hint {
      /* 仅供屏幕阅读器：视觉隐藏，但读屏在网格获焦时会念出 */
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      border: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .today-btn {
      padding: 6px 18px;
      border: 1px solid var(--md-sys-color-outline);
      border-radius: 999px;
      background: transparent;
      color: var(--md-sys-color-primary);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .today-btn:hover {
      background: color-mix(in oklch, var(--md-sys-color-primary) 8%, transparent);
    }
    .today-btn:focus-visible {
      outline: 2px solid var(--md-sys-color-primary);
      outline-offset: 2px;
    }
  `;

  /** 当前录入使用的历法 */
  @property({ type: String }) calendar: CalendarId = 'gregory';
  /** 当前选中的公历 ISO 日期 yyyy-mm-dd */
  @property({ type: String }) value = '';

  @state() private viewYearKey = '';
  @state() private viewMonthKey = '';
  /** 当前键盘/视觉焦点所在的日（公历 ISO），用于 roving tabindex */
  @state() private focusKey = '';
  /** 当前视图模式：日期网格 / 年份选择 / 月份选择 */
  @state() private viewMode: ViewMode = 'days';
  /** 年份视图中需要滚动到的年份键（触发后清空） */
  @state() private yearScrollKey = '';
  /** 标记一次键盘导航后需要把 DOM 焦点移到指定日格 */
  private pendingFocus = false;
  /** 年份/月份视图打开后需将 DOM 焦点移入选中/当前项（视图切换时原按钮被销毁，焦点会掉到 body） */
  @state() private ymFocusPending = false;
  /** 年份/月份视图中键盘焦点所在的键（roving tabindex 跟随浏览位置而非固定在选中项） */
  @state() private ymFocusKey = '';
  /** 上次用于初始化视图的 value，避免视图被已选值反复重置 */
  private lastValue = '';

  // ---- 滑动翻页 ----
  /** 跟手位移（px）；翻页动画阶段为进出场位移 */
  @state() private dragX = 0;
  /** 是否处于进出场动画阶段（决定 .track 是否启用 transition） */
  @state() private animating = false;
  /** 正在跟踪的指针 id，非 null 表示手势进行中 */
  private swipePointerId: number | null = null;
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeStartT = 0;
  private swipeAxis: SwipeAxis = 'none';
  /** 滑动视口宽度缓存（px），手势开始时测量 */
  private swipeWidth = 0;
  /** 翻页后抑制 click 的截止时间戳（ms）；期间到达的 click 视为翻页误触 */
  private suppressClickUntil = 0;
  /** 上次渲染的轨道面板数（1~3），历法边界处可能不足 3 个 */
  private panelCount = 1;
  /** 上次渲染时轨道是否含前月 / 后月（历法枚举边界处可能缺失） */
  private hasPrev = false;
  private hasNext = false;

  willUpdate() {
    if (this.value && this.value !== this.lastValue) {
      const d = fromISO(this.value);
      if (d) {
        // 月份归属由月首决定（日本和历月中改元时，选中日的 yearKey 可能与月首不同）
        const sel = startOfMonthKeys(d, this.calendar);
        this.viewYearKey = sel.yearKey;
        this.viewMonthKey = sel.monthKey;
        this.lastValue = this.value;
        // 首次由外部值初始化视图时，同步焦点到该日
        if (!this.focusKey) this.focusKey = this.value;
      }
    }
  }

  protected updated(changed: PropertyValues) {
    // 三个面板都渲染 data-iso 日格（相邻月的灰日与当前月日期会重叠，
    // 例如 1 月 1 日也出现在 12 月面板的尾部），因此焦点查询必须限定在
    // 当前面板内——只有它带唯一的 GRID_ID，不能用 .panel 或 role=grid 筛选。
    if (this.pendingFocus && this.focusKey && this.viewMode === 'days') {
      const el = this.shadowRoot?.querySelector<HTMLButtonElement>(
        `#${GRID_ID} [data-iso="${this.focusKey}"]`
      );
      el?.focus();
      this.pendingFocus = false;
    }
    // 年份选择视图打开时，滚动到当前选中年份
    if (this.viewMode === 'years' && this.yearScrollKey) {
      const el = this.shadowRoot?.querySelector<HTMLElement>(
        `[data-year-key="${CSS.escape(this.yearScrollKey)}"]`
      );
      el?.scrollIntoView({ block: 'center', behavior: 'auto' });
      this.yearScrollKey = '';
    }
    // 年份/月份视图打开后，把 DOM 焦点移入选中/当前项（否则焦点掉到 body，键盘完全不可用）
    if (this.ymFocusPending) {
      this.ymFocusPending = false;
      if (this.viewMode === 'years' || this.viewMode === 'months') {
        const keySel = `[data-year-key="${CSS.escape(this.ymFocusKey)}"],[data-month-key="${CSS.escape(this.ymFocusKey)}"]`;
        const el = this.shadowRoot?.querySelector<HTMLElement>(keySel)
          ?? this.shadowRoot?.querySelector<HTMLElement>('[tabindex="0"]');
        el?.focus();
        el?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }
    void changed;
  }

  private get locale() {
    return getLocale();
  }

  /** 用于历法年/月/日展示格式化的 locale（农历始终用中文） */
  private get calLocale(): string {
    return this.calendar === 'chinese' ? 'zh-CN' : this.locale;
  }

  /** 当前生效的每周首日列索引：跟随设置（默认按 locale 习惯） */
  private get resolvedFirstDOW(): number {
    return firstDayOfWeek(this.locale, getSettings().weekStart);
  }

  private unsubSettings?: () => void;

  connectedCallback() {
    super.connectedCallback();
    // 设置变更（如周起始日）即时反映到日历
    this.unsubSettings = onSettingsChange(() => this.requestUpdate());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubSettings?.();
  }

  /** 作为 yearOptions 采样中心的参考公历日期（取当前选中值，确保视图年份落在 ±100 年内） */
  private get refDate(): Date {
    return fromISO(this.value) ?? new Date();
  }

  /** 当前视图月份的首日公历日期，用于 sameCalendarMonth 比较 */
  private get viewRefDate(): Date {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
    if (cells.length) return cells[0].greg;
    // 月份无日期（理论上不会发生），回退到今天
    return new Date();
  }

  private emit(date: Date) {
    this.dispatchEvent(
      new CustomEvent<string>('date-change', { detail: toISO(date), bubbles: true, composed: true })
    );
  }

  /** 当前焦点日的「公历日序号」，用于跨月导航时尽量保持同一天 */
  private currentFocusDay(): number {
    const d = fromISO(this.focusKey) ?? fromISO(this.value) ?? new Date();
    return d.getDate();
  }

  /** 视图切换后，让焦点落在新月份中「相同日序号」（超出则月末）的日格上 */
  private reseatFocusAfterViewChange(oldDay: number) {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
    if (!cells.length) return;
    const idx = Math.min(Math.max(oldDay, 1), cells.length) - 1;
    this.focusKey = toISO(cells[idx].greg);
  }

  /**
   * 查找相邻的「不同公历月」。
   * 日本和历允许重复月份（如昭和64年1月与平成元年1月同为 1989-01），
   * 导航时需跳过映射到同一公历月的条目，否则会出现「两个1月」。
   */
  private findAdjacentMonthFrom(
    yearKey: string,
    monthKey: string,
    delta: number
  ): { yearKey: string; monthKey: string } | null {
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    const curCells = monthCalendarDays(this.calendar, yearKey, monthKey, this.calLocale);
    const curGregId = curCells.length
      ? `${curCells[0].greg.getFullYear()}-${curCells[0].greg.getMonth()}`
      : '';

    const yi = years.findIndex((y) => y.key === yearKey);
    if (yi < 0) return null;

    // 先在当前年份的剩余月份中搜索
    const curMonths = monthOptions(this.calendar, yearKey, this.calLocale);
    const mi = curMonths.findIndex((m) => m.key === monthKey);
    for (let i = mi + delta; i >= 0 && i < curMonths.length; i += delta) {
      const cells = monthCalendarDays(this.calendar, yearKey, curMonths[i].key, this.calLocale);
      if (cells.length) {
        const id = `${cells[0].greg.getFullYear()}-${cells[0].greg.getMonth()}`;
        if (id !== curGregId) return { yearKey, monthKey: curMonths[i].key };
      }
    }

    // 跨年搜索：逐年扫描月份，跳过同一公历月的重复条目
    for (let yOff = yi + delta; yOff >= 0 && yOff < years.length; yOff += delta) {
      const yk = years[yOff].key;
      const ms = monthOptions(this.calendar, yk, this.calLocale);
      const range = delta > 0 ? ms : [...ms].reverse();
      for (const m of range) {
        const cells = monthCalendarDays(this.calendar, yk, m.key, this.calLocale);
        if (cells.length) {
          const id = `${cells[0].greg.getFullYear()}-${cells[0].greg.getMonth()}`;
          if (id !== curGregId) return { yearKey: yk, monthKey: m.key };
        }
      }
    }

    return null;
  }

  /** 取得相对当前视图偏移 delta（±1）个月的年/月键；越界或映射到同一公历月时返回 null */
  private findAdjacentMonth(delta: number): YearMonth | null {
    return this.findAdjacentMonthFrom(this.viewYearKey, this.viewMonthKey, delta);
  }

  private stepMonth(delta: number) {
    const oldDay = this.currentFocusDay();
    const next = this.findAdjacentMonth(delta);
    if (!next) return;
    this.viewYearKey = next.yearKey;
    this.viewMonthKey = next.monthKey;
    this.reseatFocusAfterViewChange(oldDay);
    this.requestUpdate();
  }

  private stepYear(delta: number) {
    const oldDay = this.currentFocusDay();
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    const yi = years.findIndex((y) => y.key === this.viewYearKey) + delta;
    if (yi < 0 || yi >= years.length) return;
    this.viewYearKey = years[yi].key;
    // 新年份可能不含当前月份（如闰月/缺失月），回退到该年首月
    const months = monthOptions(this.calendar, this.viewYearKey, this.calLocale);
    if (!months.some((m) => m.key === this.viewMonthKey)) {
      this.viewMonthKey = months[0].key;
    }
    this.reseatFocusAfterViewChange(oldDay);
    this.requestUpdate();
  }

  private jumpToday() {
    const now = new Date();
    const sel = startOfMonthKeys(now, this.calendar);
    this.viewYearKey = sel.yearKey;
    this.viewMonthKey = sel.monthKey;
    this.focusKey = toISO(now);
    this.viewMode = 'days';
    this.pendingFocus = true;
    this.requestUpdate();
  }

  /** 把焦点（可能跨月）移到某公历日期对应的日格 */
  private setFocusDate(d: Date) {
    // 月份归属由月首决定（日本和历月中改元时逐日 yearKey 不同，但同属一个月）
    if (!sameCalendarMonth(d, this.viewRefDate, this.calendar)) {
      const k = startOfMonthKeys(d, this.calendar);
      this.viewYearKey = k.yearKey;
      this.viewMonthKey = k.monthKey;
    }
    this.focusKey = toISO(d);
    this.pendingFocus = true;
    this.requestUpdate();
  }

  private pickDay(d: Date) {
    this.focusKey = toISO(d);
    this.emit(d);
  }

  /**
   * 日期网格键盘导航（WAI-ARIA APG Grid 模式）：
   * - 方向键：按周历网格移动一日
   * - Home / End：本月首日 / 末日
   * - PageUp / PageDown：上 / 下月；Shift+PageUp / Shift+PageDown：上 / 下年
   * （不占用 Ctrl+Home/End：那是编辑器与文本域的「跳到开头/结尾」全局习惯键）
   */
  private onGridKeydown(e: KeyboardEvent) {
    const cells = monthCalendarDays(this.calendar, this.viewYearKey, this.viewMonthKey, this.calLocale);
    if (!cells.length) return;
    const cur = fromISO(this.focusKey) ?? fromISO(this.value) ?? new Date();
    const curPd = Temporal.PlainDate.from({
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      day: cur.getDate(),
    });
    let nextPd: Temporal.PlainDate | null = null;
    switch (e.key) {
      case 'ArrowRight':
        nextPd = curPd.add({ days: 1 });
        break;
      case 'ArrowLeft':
        nextPd = curPd.subtract({ days: 1 });
        break;
      case 'ArrowDown':
        nextPd = curPd.add({ days: 7 });
        break;
      case 'ArrowUp':
        nextPd = curPd.subtract({ days: 7 });
        break;
      case 'Home': {
        // Home: 本月首日
        nextPd = curPd.subtract({ days: curPd.day - 1 });
        break;
      }
      case 'End': {
        // End: 本月末日
        nextPd = curPd.add({ days: curPd.daysInMonth - curPd.day });
        break;
      }
      case 'PageUp':
        // Shift+PageUp: 上一年；PageUp: 上个月
        nextPd = e.shiftKey
          ? curPd.subtract({ years: 1 })
          : curPd.subtract({ months: 1 });
        break;
      case 'PageDown':
        nextPd = e.shiftKey
          ? curPd.add({ years: 1 })
          : curPd.add({ months: 1 });
        break;
      default:
        return; // Enter/Space 等交给按钮默认行为触发选择
    }
    e.preventDefault();
    const next = nextPd ? new Date(nextPd.year, nextPd.month - 1, nextPd.day) : null;
    if (next) this.setFocusDate(next);
  }

  /** 计算实际应获得 tabindex=0 的日格 ISO（焦点日 -> 选中日 -> 今天 -> 首日） */
  private effectiveFocusKey(cells: CalDayCell[]): string {
    if (this.focusKey && cells.some((c) => toISO(c.greg) === this.focusKey)) return this.focusKey;
    const sel = fromISO(this.value);
    if (sel && sameCalendarMonth(sel, this.viewRefDate, this.calendar)) {
      const sk = keysFromGregorian(sel, this.calendar);
      const hit = cells.find((c) => c.dayKey === sk.dayKey);
      if (hit) return toISO(hit.greg);
    }
    const now = new Date();
    if (sameCalendarMonth(now, this.viewRefDate, this.calendar)) {
      const tk = keysFromGregorian(now, this.calendar);
      const th = cells.find((c) => c.dayKey === tk.dayKey);
      if (th) return toISO(th.greg);
    }
    return cells[0] ? toISO(cells[0].greg) : '';
  }

  // ---- 滑动翻页：面板轨道 ----

  /**
   * 组装单个月份面板的渲染数据。
   * prev/next 面板与当前面板走完全相同的组装逻辑，保证翻页前后像素一致、无跳动。
   * @param prevKeys/nextKeys 该面板自身的相邻月（用于补齐前导/后置灰日与跨月点击）
   */
  private buildPanel(
    yearKey: string,
    monthKey: string,
    prevKeys: YearMonth | null,
    nextKeys: YearMonth | null,
    isCurrent: boolean
  ): PanelData {
    const calLocale = this.calLocale;
    const cells = monthCalendarDays(this.calendar, yearKey, monthKey, calLocale);
    const firstDOW = this.resolvedFirstDOW;

    const leading = cells.length ? ((cells[0].greg.getDay() - firstDOW + 7) % 7) : 0;
    const trailing = (7 - ((leading + cells.length) % 7)) % 7;

    // 前导/后置：取相邻月份的真实日格，以灰色显示（而非空白占位）
    const prevDays = prevKeys
      ? monthCalendarDays(this.calendar, prevKeys.yearKey, prevKeys.monthKey, calLocale)
      : [];
    const nextDays = nextKeys
      ? monthCalendarDays(this.calendar, nextKeys.yearKey, nextKeys.monthKey, calLocale)
      : [];
    const leadingCells = leading ? prevDays.slice(Math.max(0, prevDays.length - leading)) : [];
    const trailingCells = trailing ? nextDays.slice(0, trailing) : [];

    // 拼成 7 列网格（含相邻月灰色日），再按行切分
    const flat: ({ cell: CalDayCell; muted: boolean } | null)[] = [
      ...leadingCells.map((c) => ({ cell: c, muted: true })),
      ...cells.map((c) => ({ cell: c, muted: false })),
      ...trailingCells.map((c) => ({ cell: c, muted: true })),
    ];
    const rows: ({ cell: CalDayCell; muted: boolean } | null)[][] = [];
    for (let i = 0; i < flat.length; i += 7) rows.push(flat.slice(i, i + 7));

    // 表头跟随焦点日（或选中日）的真实年号（日本和历月中改元时与月首不同）
    const focusKey = isCurrent ? this.effectiveFocusKey(cells) : '';
    const anchor = fromISO(focusKey) ?? fromISO(this.value);
    const headerYearKey = anchor && this.calendar === 'japanese'
      ? keysFromGregorian(anchor, this.calendar).yearKey
      : yearKey;
    const headerMonthKey = anchor && this.calendar === 'japanese'
      ? keysFromGregorian(anchor, this.calendar).monthKey
      : monthKey;
    const yearDisplay = yearOptions(this.calendar, this.refDate, calLocale)
      .find((y) => y.key === headerYearKey)?.display
      ?? formatYearMonthHeader(this.calendar, headerYearKey, headerMonthKey, calLocale);
    const monthDisplay = monthOptions(this.calendar, headerYearKey, calLocale)
      .find((m) => m.key === headerMonthKey)?.display
      ?? monthKey;

    return {
      yearKey,
      monthKey,
      cells,
      rows,
      yearDisplay,
      monthDisplay,
      label: `${yearDisplay} ${monthDisplay}`,
      isCurrent,
      focusKey,
    };
  }

  /**
   * 构造轨道上要渲染的面板序列：[前月?, 当前月, 后月?]。
   * 前月自身的前邻与后月的后邻用于补齐各自的灰日，越界则为 null。
   */
  private buildPanels(): PanelData[] {
    const prev = this.findAdjacentMonth(-1);
    const next = this.findAdjacentMonth(1);
    const prevOfPrev = prev ? this.findAdjacentMonthFrom(prev.yearKey, prev.monthKey, -1) : null;
    const nextOfNext = next ? this.findAdjacentMonthFrom(next.yearKey, next.monthKey, 1) : null;

    const panels: PanelData[] = [];
    if (prev) panels.push(this.buildPanel(prev.yearKey, prev.monthKey, prevOfPrev, this.currentYM(), false));
    panels.push(this.buildPanel(this.viewYearKey, this.viewMonthKey, prev, next, true));
    if (next) panels.push(this.buildPanel(next.yearKey, next.monthKey, this.currentYM(), nextOfNext, false));
    return panels;
  }

  /** 当前视图月的年月键对 */
  private currentYM(): YearMonth {
    return { yearKey: this.viewYearKey, monthKey: this.viewMonthKey };
  }

  /** 视口宽度（px），取不到时返回 0 */
  private viewportWidth(): number {
    const el = this.shadowRoot?.querySelector<HTMLElement>('.viewport');
    return el ? el.clientWidth : 0;
  }

  /** 当前视图月在轨道中的索引（0 起）；无前月时为 0 */
  private currentPanelIndex(panels: PanelData[]): number {
    return panels.findIndex((p) => p.isCurrent);
  }

  /**
   * 轨道中是否存在 dir 方向的可翻面板。
   * 历法枚举边界（yearOptions 的 ±100 年）处可能没有前月/后月。
   */
  private canSwipe(dir: -1 | 1): boolean {
    if (this.panelCount < 2) return false;
    return dir < 0 ? this.hasPrev : this.hasNext;
  }

  /** 单个面板的像素宽度（视口内每个面板恰为一个视口宽） */
  private panelWidthPx(): number {
    const el = this.shadowRoot?.querySelector<HTMLElement>('.panel');
    if (el) {
      const w = el.getBoundingClientRect().width;
      if (w > 0) return w;
    }
    return this.viewportWidth();
  }

  private onSwipePointerDown(e: PointerEvent) {
    // 仅主键 / 单指；多指（缩放）不参与
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.swipePointerId = e.pointerId;
    this.swipeStartX = e.clientX;
    this.swipeStartY = e.clientY;
    this.swipeStartT = e.timeStamp;
    this.swipeAxis = 'none';
    this.swipeWidth = this.panelWidthPx();
  }

  private onSwipePointerMove(e: PointerEvent) {
    if (this.swipePointerId !== e.pointerId) return;
    const dx = e.clientX - this.swipeStartX;
    const dy = e.clientY - this.swipeStartY;
    if (this.swipeAxis === 'none') {
      this.swipeAxis = resolveSwipeAxis(dx, dy);
      // 纵向手势交还页面滚动，不拦截
      if (this.swipeAxis === 'vertical') {
        this.swipePointerId = null;
        return;
      }
      if (this.swipeAxis === 'none') return;
      // 横向手势：捕获指针，避免移出视口后丢失 move 事件
      (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
    }
    if (this.swipeAxis !== 'horizontal') return;
    e.preventDefault();
    this.dragX = applySwipeResistance(dx, this.swipeWidth);
  }

  private onSwipePointerUp(e: PointerEvent) {
    if (this.swipePointerId !== e.pointerId) return;
    this.swipePointerId = null;
    if (this.swipeAxis !== 'horizontal') {
      this.dragX = 0;
      return;
    }
    const dx = e.clientX - this.swipeStartX;
    const dt = e.timeStamp - this.swipeStartT;
    const dir = resolveSwipePage(dx, dt);
    // 历法边界：目标面板未预渲染，无法翻页，直接弹回
    if (dir === 0 || !this.canSwipe(dir)) {
      this.springBack();
      return;
    }
    // 仅在极短时间窗内拦截 click：既吞掉翻页尾随的误触，又不会吃掉下一次正常点击
    this.suppressClickUntil = e.timeStamp + 400;
    this.animatePageTurn(dir);
  }

  private onSwipePointerCancel(e: PointerEvent) {
    if (this.swipePointerId !== e.pointerId) return;
    this.swipePointerId = null;
    this.swipeAxis = 'none';
    this.dragX = 0;
  }

  /** 滑动未达阈值：弹回原位 */
  private springBack() {
    this.animating = true;
    this.dragX = 0;
    this.scheduleSettle();
  }

  /**
   * 翻页动画：把轨道滑到相邻面板（相邻月已预渲染，全程无白屏），
   * 动画结束后在关闭过渡的前提下换数据并归位——此刻新旧内容完全一致，用户不可见。
   * animating 类只控制 CSS transition 的开关，位移始终由 dragX 驱动；
   * 每次改位移后都要等 Lit 完成一次渲染并强制回流，过渡才会真正播放。
   */
  private async animatePageTurn(dir: -1 | 1) {
    const w = this.swipeWidth || this.panelWidthPx();
    // 1) 滑到相邻面板：dir=1（下一月）向左滑一个面板宽
    this.animating = true;
    this.dragX = trackTurnOffset(dir, w);
    await this.updateComplete;
    await delay(SWIPE_ANIM_MS);

    // 2) 关闭过渡后换数据：新旧面板内容一致，切换不可见；随后归位
    this.stepMonth(dir);
    this.animating = false;
    this.dragX = 0;
    // 翻页重渲染会销毁原日格按钮，若焦点原本在网格内需移回新页对应日，
    // 否则焦点会掉到 body，键盘用户将失去位置
    const hadFocus = !!this.shadowRoot?.activeElement?.closest('.panel');
    if (hadFocus) this.pendingFocus = true;
    await this.updateComplete;
  }

  /** 动画结束后清理 animating 标记 */
  private scheduleSettle() {
    window.setTimeout(async () => {
      await this.updateComplete;
      this.animating = false;
      this.dragX = 0;
    }, SWIPE_ANIM_MS);
  }

  /** 翻页后抑制随之而来的 click，避免落到日期格上误选 */
  private onViewportClickCapture(e: Event) {
    if (performance.now() > this.suppressClickUntil) return;
    this.suppressClickUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  }

  /**
   * 捕获阶段的 click 拦截器（稳定引用，避免每次渲染重建监听器）。
   * 必须在捕获阶段吞掉：日期格的 click 处理器位于冒泡阶段，
   * 若只在下方的 .viewport 上冒泡拦截，pickDay 早已执行。
   */
  private readonly captureClick = {
    capture: true,
    handleEvent: (e: Event) => this.onViewportClickCapture(e),
  };

  // ---- 年份/月份选择视图相关 ----

  /** 打开年份选择视图，并滚动到当前选中年份 */
  private openYearView() {
    this.viewMode = 'years';
    // 焦点初始落点：选中年优先，缺省为当前年（与 roving tabindex 的 tabindex=0 一致）
    this.ymFocusKey = this.viewYearKey;
    this.ymFocusPending = true;
    this.yearScrollKey = this.viewYearKey;
  }

  /** 打开月份选择视图 */
  private openMonthView() {
    this.viewMode = 'months';
    this.ymFocusKey = this.viewMonthKey;
    this.ymFocusPending = true;
  }

  /** 从年份/月份视图返回日期网格，并把焦点移回日期网格 */
  private returnToDays(resetToToday = false) {
    if (resetToToday) {
      // 经「今天」按钮返回：视图重置到今天所在月，jumpToday 已含 requestUpdate
      this.jumpToday();
      return;
    }
    this.viewMode = 'days';
    this.pendingFocus = true;
    this.requestUpdate();
  }

  /** 在年份视图中选择某年，返回日期网格 */
  private selectYear(yearKey: string) {
    this.viewYearKey = yearKey;
    // 新年份可能不含当前月份（如闰月/缺失月），回退到该年首月
    const months = monthOptions(this.calendar, yearKey, this.calLocale);
    if (!months.some((m) => m.key === this.viewMonthKey)) {
      this.viewMonthKey = months[0].key;
    }
    this.reseatFocusAfterViewChange(this.currentFocusDay());
    this.returnToDays();
  }

  /** 在月份视图中选择某月，返回日期网格 */
  private selectMonth(monthKey: string) {
    this.viewMonthKey = monthKey;
    this.reseatFocusAfterViewChange(this.currentFocusDay());
    this.returnToDays();
  }

  /** 计算年份视图焦点初始落点的 yearKey（选中/当前年不存在时取网格首项） */
  private yearFocusTargetKey(): string {
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    if (years.some((y) => y.key === this.viewYearKey)) return this.viewYearKey;
    return years[0]?.key ?? '';
  }

  /** 焦点/浏览位置同步：roving tabindex 跟随 DOM 焦点（含程序化 focus 移动） */
  private onYmCellFocus(e: FocusEvent) {
    const el = e.target as HTMLElement;
    const key = el.getAttribute('data-year-key') ?? el.getAttribute('data-month-key');
    if (key) this.ymFocusKey = key;
  }

  /** 通用网格键盘处理器：在 cells（DOM 顺序即浏览顺序）上做 roving 导航
   *  cols=每行列数，dataAttr=定位当前项的 data 属性名 */
  private onYmNavKeydown(
    e: KeyboardEvent,
    cells: HTMLButtonElement[],
    curAttr: string,
    cols: number
  ) {
    const target = e.target as HTMLElement;
    const curKey = target.getAttribute(curAttr) ?? '';
    const idx = cells.findIndex((c) => c.getAttribute(curAttr) === curKey);
    if (idx < 0) return;
    let nextIdx = idx;
    switch (e.key) {
      case 'ArrowRight': nextIdx = Math.min(idx + 1, cells.length - 1); break;
      case 'ArrowLeft': nextIdx = Math.max(idx - 1, 0); break;
      case 'ArrowDown': nextIdx = Math.min(idx + cols, cells.length - 1); break;
      case 'ArrowUp': nextIdx = Math.max(idx - cols, 0); break;
      case 'Home': nextIdx = 0; break;
      case 'End': nextIdx = cells.length - 1; break;
      case 'Escape': {
        e.preventDefault();
        this.returnToDays();
        return;
      }
      default:
        return; // Enter/Space 交给按钮默认行为
    }
    if (nextIdx !== idx) {
      e.preventDefault();
      cells[nextIdx]?.focus();
      cells[nextIdx]?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
  }

  /** 年份视图键盘导航：方向键移动焦点，Enter 选择，Escape 返回 */
  private onYearGridKeydown(e: KeyboardEvent) {
    const cells = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-year-key]') ?? []
    );
    this.onYmNavKeydown(e, cells, 'data-year-key', 3);
  }

  /** 月份视图键盘导航：方向键移动焦点，Enter 选择，Escape 返回 */
  private onMonthGridKeydown(e: KeyboardEvent) {
    const cells = Array.from(
      this.shadowRoot?.querySelectorAll<HTMLButtonElement>('[data-month-key]') ?? []
    );
    this.onYmNavKeydown(e, cells, 'data-month-key', 3);
  }

  /** 渲染年份选择视图 */
  private renderYearView() {
    const years = yearOptions(this.calendar, this.refDate, this.calLocale);
    const todayYearKey = keysFromGregorian(new Date(), this.calendar).yearKey;
    const selYearKey = this.viewYearKey;
    // roving tabindex 锚点：优先键盘浏览位置，其次选中年（与打开视图时的初始焦点一致）
    const navKey = this.ymFocusKey && years.some((y) => y.key === this.ymFocusKey)
      ? this.ymFocusKey
      : this.yearFocusTargetKey();

    // 拆分显示：年份的 display 可能含额外文字（如 "2026年 丙午年"），取前半部分
    return html`
      <div
        class="view-panel"
        role="grid"
        aria-label=${t('calSelectYear')}
        aria-describedby=${YM_HINT_ID}
        @keydown=${this.onYearGridKeydown}
      >
        <div class="view-header">
          <span class="view-title">${t('calSelectYear')}</span>
        </div>
        <div class="year-grid" role="row">
          ${years.map((y) => {
            const isSel = y.key === selYearKey;
            const isCur = y.key === todayYearKey;
            const isNav = y.key === navKey;
            return html`
              <button
                class="year-cell ${isSel ? 'selected' : ''} ${isCur ? 'current' : ''}"
                type="button"
                role="gridcell"
                data-year-key=${y.key}
                tabindex=${isNav ? '0' : '-1'}
                aria-selected=${isSel ? 'true' : 'false'}
                @click=${() => this.selectYear(y.key)}
                @focus=${this.onYmCellFocus}
              >
                ${y.display}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  /** 渲染月份选择视图 */
  private renderMonthView() {
    const months = monthOptions(this.calendar, this.viewYearKey, this.calLocale);
    const selMonthKey = this.viewMonthKey;
    const todayKeys = startOfMonthKeys(new Date(), this.calendar);
    const isTodayYear = todayKeys.yearKey === this.viewYearKey;
    const navKey = this.ymFocusKey && months.some((m) => m.key === this.ymFocusKey)
      ? this.ymFocusKey
      : selMonthKey;

    return html`
      <div
        class="view-panel"
        role="grid"
        aria-label=${t('calSelectMonth')}
        aria-describedby=${YM_HINT_ID}
        @keydown=${this.onMonthGridKeydown}
      >
        <div class="view-header">
          <span class="view-title">${t('calSelectMonth')}</span>
        </div>
        <div class="month-grid" role="row">
          ${months.map((m) => {
            const isSel = m.key === selMonthKey;
            const isCur = isTodayYear && m.key === todayKeys.monthKey;
            const isNav = m.key === navKey;
            return html`
              <button
                class="month-cell ${isSel ? 'selected' : ''} ${isCur ? 'current' : ''}"
                type="button"
                role="gridcell"
                data-month-key=${m.key}
                tabindex=${isNav ? '0' : '-1'}
                aria-selected=${isSel ? 'true' : 'false'}
                @click=${() => this.selectMonth(m.key)}
                @focus=${this.onYmCellFocus}
              >
                ${m.display}
              </button>
            `;
          })}
        </div>
      </div>
    `;
  }

  render() {
    const locale = this.locale;

    // 年份/月份选择视图
    if (this.viewMode === 'years') {
      return html`
        <div class="picker">
          <div class="header">
            <button class="nav" type="button" aria-label=${t('actionBack')} @click=${() => this.returnToDays()}>
              ${icon('back', 20)}
            </button>
            <div class="title-group">
              <span class="title-btn active">${t('calSelectYear')}</span>
            </div>
            <span class="nav" style="visibility:hidden"></span>
          </div>
          ${this.renderYearView()}
          <p class="hint" id=${YM_HINT_ID}>${t('calYearMonthKeyboardHint')}</p>
          <div class="footer">
            <button class="today-btn" type="button" @click=${() => this.returnToDays(true)}>${t('calToday')}</button>
          </div>
        </div>
      `;
    }

    if (this.viewMode === 'months') {
      const yearLabel = yearOptions(this.calendar, this.refDate, this.calLocale)
        .find((y) => y.key === this.viewYearKey)?.display ?? this.viewYearKey;
      return html`
        <div class="picker">
          <div class="header">
            <button class="nav" type="button" aria-label=${t('actionBack')} @click=${() => this.returnToDays()}>
              ${icon('back', 20)}
            </button>
            <div class="title-group">
              <span class="title-btn active">${yearLabel}</span>
            </div>
            <span class="nav" style="visibility:hidden"></span>
          </div>
          ${this.renderMonthView()}
          <p class="hint" id=${YM_HINT_ID}>${t('calYearMonthKeyboardHint')}</p>
          <div class="footer">
            <button class="today-btn" type="button" @click=${() => this.returnToDays(true)}>${t('calToday')}</button>
          </div>
        </div>
      `;
    }

    // 日期网格视图（默认）
    const firstDOW = this.resolvedFirstDOW;

    // 周列标题：以 2023-01-01（周日）为基准，按首日偏移归列；同时取窄/全称供可见与读屏使用
    const wdNarrow = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    const wdLong = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    const headers: { narrow: string; long: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(2023, 0, 1 + i);
      const col = (d.getDay() - firstDOW + 7) % 7;
      headers[col] = { narrow: wdNarrow.format(d), long: wdLong.format(d) };
    }

    // 选中日期（用于高亮比对）
    const valDate = fromISO(this.value);
    const now = new Date();

    // 轨道面板：[前月?, 当前月, 后月?]；相邻月已预渲染，滑动全程无白屏
    const panels = this.buildPanels();
    this.panelCount = panels.length;
    this.hasPrev = panels.length > 0 && !panels[0].isCurrent;
    this.hasNext = panels.length > 0 && !panels[panels.length - 1].isCurrent;
    const curIdx = this.currentPanelIndex(panels);
    const cur = panels[curIdx];

    // 轨道整体左移 curIdx 个面板宽，使当前面板与视口左边对齐
    const geo = trackGeometry(panels.length, curIdx);
    const trackStyle = [
      `--track-w: ${geo.trackWidth}`,
      `--track-shift: ${geo.trackShift}`,
      `--panel-w: ${geo.panelWidth}`,
      `transform: translateX(${this.dragX}px)`,
    ].join('; ');

    // 表头年份/月份拆分（点击可跳转），跟随焦点日真实年号
    const yearDisplay = cur.yearDisplay;
    const monthDisplay = cur.monthDisplay;

    return html`
      <div class="picker">
        <div class="header">
          <button class="nav" type="button" aria-label=${t('calPrevYear')} aria-controls=${GRID_ID} @click=${() => this.stepYear(-1)}>
            ${icon('doubleChevronLeft', 20)}
          </button>
          <button class="nav" type="button" aria-label=${t('calPrevMonth')} aria-controls=${GRID_ID} @click=${() => this.stepMonth(-1)}>
            ${icon('chevronLeft', 20)}
          </button>
          <div class="title-group">
            <button class="title-btn" type="button" @click=${() => this.openYearView()} aria-label=${t('calSelectYear')} title=${t('calYearViewHint')}>
              ${yearDisplay}
            </button>
            <span class="title-sep">·</span>
            <button class="title-btn" type="button" @click=${() => this.openMonthView()} aria-label=${t('calSelectMonth')} title=${t('calMonthViewHint')}>
              ${monthDisplay}
            </button>
          </div>
          <button class="nav" type="button" aria-label=${t('calNextMonth')} aria-controls=${GRID_ID} @click=${() => this.stepMonth(1)}>
            ${icon('chevronRight', 20)}
          </button>
          <button class="nav" type="button" aria-label=${t('calNextYear')} aria-controls=${GRID_ID} @click=${() => this.stepYear(1)}>
            ${icon('doubleChevronRight', 20)}
          </button>
        </div>

        <!-- 键盘操作提示：置于网格之前，读屏先念提示再念日历 -->
        <p class="hint" id=${HINT_ID}>${t('calKeyboardHint')}</p>

        <div
          class="viewport ${this.animating ? 'anim' : ''}"
          @pointerdown=${this.onSwipePointerDown}
          @pointermove=${this.onSwipePointerMove}
          @pointerup=${this.onSwipePointerUp}
          @pointercancel=${this.onSwipePointerCancel}
          @click=${this.captureClick}
        >
          <div class="track" style=${trackStyle}>
            ${panels.map((p) => this.renderPanel(p, headers, valDate, now))}
          </div>
        </div>

        <div class="footer">
          <button class="today-btn" type="button" @click=${() => this.jumpToday()}>${t('calToday')}</button>
        </div>
      </div>
    `;
  }

  /**
   * 渲染单个月份面板。
   * 邻月面板整体 inert + aria-hidden：不可聚焦、不进读屏树、不参与命中测试，
   * 因此预渲染相邻月既不污染无障碍语义，也不会误触发点击。
   * role="grid" 保留在每个面板上，保证 grid > row > gridcell 三层结构完整。
   */
  private renderPanel(
    p: PanelData,
    headers: { narrow: string; long: string }[],
    valDate: Date | null,
    now: Date
  ) {
    return html`
      <div
        class="panel"
        role="grid"
        id=${p.isCurrent ? GRID_ID : nothing}
        aria-label=${p.isCurrent ? p.label : nothing}
        aria-describedby=${p.isCurrent ? HINT_ID : nothing}
        aria-hidden=${p.isCurrent ? nothing : 'true'}
        ?inert=${!p.isCurrent}
        @keydown=${p.isCurrent ? this.onGridKeydown : nothing}
      >
        <div class="weekdays" role="row">
          ${headers.map(
            (h) => html`<div class="wd" role="columnheader" aria-label=${h.long}>${h.narrow}</div>`
          )}
        </div>

        ${p.rows.map(
          (row) => html`<div class="grid-row" role="row">
            ${row.map((entry) =>
              entry
                ? this.renderDay(entry.cell, entry.muted, valDate, now, p.focusKey, p.label, p.isCurrent)
                : html`<span class="empty" role="gridcell" aria-disabled="true"></span>`
            )}
          </div>`
        )}
      </div>
    `;
  }

  private renderDay(
    c: CalDayCell,
    muted: boolean,
    valDate: Date | null,
    now: Date,
    fk: string,
    headerLabel: string,
    isCurrent: boolean
  ) {
    const isSel = valDate != null && toISO(c.greg) === toISO(valDate);
    const isToday =
      c.greg.getFullYear() === now.getFullYear() &&
      c.greg.getMonth() === now.getMonth() &&
      c.greg.getDate() === now.getDate();
    const iso = toISO(c.greg);
    // 灰色（相邻月）日格：用其真实年月表头，避免读屏误读为当前月
    const ownKeys = muted ? keysFromGregorian(c.greg, this.calendar) : null;
    const cellHeader = ownKeys
      ? formatYearMonthHeader(this.calendar, ownKeys.yearKey, ownKeys.monthKey, this.calLocale)
      : headerLabel;
    // 完整日期作为读屏标签（含年月与「今天」提示），单日数字本身信息不足
    const label = `${cellHeader} ${c.dayDisplay}${isToday ? ' ' + t('calToday') : ''}`;
    return html`<button
      class="day ${muted ? 'muted' : ''} ${isSel ? 'selected' : ''} ${isToday ? 'today' : ''}"
      type="button"
      role="gridcell"
      data-iso=${iso}
      tabindex=${isCurrent && iso === fk ? '0' : '-1'}
      aria-selected=${isSel ? 'true' : 'false'}
      aria-label=${label}
      @click=${isCurrent ? () => this.pickDay(c.greg) : nothing}
    >
      ${c.dayDisplay}
    </button>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'date-calendar': DateCalendar;
  }
}