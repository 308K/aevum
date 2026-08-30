/**
 * 测试公共 setup：在所有测试运行前注入 localStorage / navigator 垫片。
 * Vitest 的 node 环境没有 localStorage 和 navigator，但 store 层依赖它们。
 */
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  });
}
if (typeof (globalThis as any).navigator === 'undefined') {
  (globalThis as any).navigator = { language: 'zh-CN', userAgent: 'vitest' };
}

// 强制 i18n 使用中文，避免 CI 环境 navigator.language 为 en-US
import { __setLocaleForTesting } from '../src/i18n.js';
__setLocaleForTesting('zh-CN');

export {};
