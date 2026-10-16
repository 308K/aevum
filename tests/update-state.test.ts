/**
 * 应用更新状态机回归（2026-10-16）
 * - check-failed 不得盖掉「有可用更新」这一更有价值的信息
 * - available 状态下不回到 checking（横幅按钮不闪烁）
 * - 自动检查限流：从未检查过时不触发
 * - i18n 键双语全覆盖（漏键会在 UI 上显示键名）
 */
import { describe, it, expect } from 'vitest';
import {
  AUTO_CHECK_INTERVAL_MS,
  INITIAL_UPDATE_STATE,
  UPDATE_STATUS_KEYS,
  reduceUpdateState,
  shouldAutoCheck,
  type UpdateState,
  type UpdateStatus,
} from '../src/utils/update-state.js';
import { zhCN } from '../src/locales/zh-CN.js';
import { enUS } from '../src/locales/en-US.js';

const at = (status: UpdateStatus, lastCheckedAt = 0): UpdateState => ({ status, lastCheckedAt });

describe('更新状态机', () => {
  it('初始状态为 idle / 从未检查', () => {
    expect(INITIAL_UPDATE_STATE).toEqual({ status: 'idle', lastCheckedAt: 0 });
  });

  it('check-start 进入 checking 并保留上次检查时间', () => {
    const next = reduceUpdateState(at('idle', 1000), { type: 'check-start' });
    expect(next.status).toBe('checking');
    expect(next.lastCheckedAt).toBe(1000);
  });

  it('check-done 回到 idle 并记录检查时间', () => {
    const next = reduceUpdateState(at('checking'), { type: 'check-done', now: 2000 });
    expect(next).toEqual({ status: 'idle', lastCheckedAt: 2000 });
  });

  it('check-failed 进入 error 并记录检查时间', () => {
    const next = reduceUpdateState(at('checking'), { type: 'check-failed', now: 3000 });
    expect(next).toEqual({ status: 'error', lastCheckedAt: 3000 });
  });

  it('need-refresh 置为 available（保留历史检查时间）', () => {
    const next = reduceUpdateState(at('idle', 500), { type: 'need-refresh' });
    expect(next).toEqual({ status: 'available', lastCheckedAt: 500 });
  });

  it('check-failed 不覆盖已有的 available（保留待更新信息）', () => {
    const next = reduceUpdateState(at('available', 100), { type: 'check-failed', now: 9000 });
    expect(next).toEqual({ status: 'available', lastCheckedAt: 100 });
  });

  it('check-done 不覆盖已有的 available', () => {
    const next = reduceUpdateState(at('available', 100), { type: 'check-done', now: 9000 });
    expect(next).toEqual({ status: 'available', lastCheckedAt: 100 });
  });

  it('available 状态下 check-start 返回同一引用（避免无谓重渲染）', () => {
    const s = at('available', 100);
    expect(reduceUpdateState(s, { type: 'check-start' })).toBe(s);
  });

  it('apply-start 进入 applying，unsupported 覆盖任意状态', () => {
    expect(reduceUpdateState(at('available'), { type: 'apply-start' }).status).toBe('applying');
    expect(reduceUpdateState(at('available'), { type: 'unsupported' }).status).toBe('unsupported');
  });
});

describe('自动检查限流', () => {
  it('从未检查过时不自动检查', () => {
    expect(shouldAutoCheck(0, AUTO_CHECK_INTERVAL_MS * 10)).toBe(false);
  });

  it('未到间隔不检查，刚到间隔即检查', () => {
    expect(shouldAutoCheck(1000, 1000 + AUTO_CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(shouldAutoCheck(1000, 1000 + AUTO_CHECK_INTERVAL_MS)).toBe(true);
    expect(shouldAutoCheck(1000, 1000 + AUTO_CHECK_INTERVAL_MS + 1)).toBe(true);
  });

  it('支持自定义间隔', () => {
    expect(shouldAutoCheck(0, 10_000, 1000)).toBe(false);
    expect(shouldAutoCheck(1000, 3000, 1000)).toBe(true);
  });
});

describe('更新状态 i18n 键覆盖', () => {
  const statuses: UpdateStatus[] = ['idle', 'checking', 'available', 'applying', 'error', 'unsupported'];

  it('六种状态各有映射键', () => {
    expect(Object.keys(UPDATE_STATUS_KEYS).sort()).toEqual([...statuses].sort());
    for (const s of statuses) {
      expect(UPDATE_STATUS_KEYS[s], s).toBeTruthy();
    }
  });

  it('映射键在 zh-CN / en-US 字典中均存在且非空', () => {
    for (const s of statuses) {
      const key = UPDATE_STATUS_KEYS[s];
      expect(zhCN[key], `zh-CN:${key}`).toBeTruthy();
      expect(enUS[key], `en-US:${key}`).toBeTruthy();
    }
  });
});
