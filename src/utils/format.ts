/**
 * 格式化输出工具：将 DiffResult 渲染为本地化展示段
 */
import { t, formatNumber } from '../i18n.js';
import type { DiffResult } from './time-calc.js';

const UNIT_I18N_KEY = {
  year: 'unitYear',
  month: 'unitMonth',
  week: 'unitWeek',
  day: 'unitDay',
  hour: 'unitHour',
  minute: 'unitMinute',
  second: 'unitSecond',
} as const;

export interface DisplaySegment {
  value: string;
  unit: string;
}

/** 将差值段格式化为本地化文案段（值 + 单位） */
export function formatSegments(diff: DiffResult): DisplaySegment[] {
  return diff.segments.map((seg) => ({
    value: formatNumber(seg.value),
    unit: t(UNIT_I18N_KEY[seg.unit]),
  }));
}

/** 状态前缀文案：还有 / 已经 / 就是今天 */
export function statusLabel(diff: DiffResult): string {
  switch (diff.status) {
    case 'future':
      return t('statusFuture');
    case 'past':
      return t('statusPast');
    case 'today':
      return t('statusToday');
  }
}
