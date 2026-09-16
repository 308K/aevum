/**
 * 构建期注入的版本信息（见 vite.config.ts 的 define）
 * - Cloudflare Pages 构建时取 COMMIT_REF 环境变量
 * - 本地构建回退 git rev-parse --short HEAD
 * - 拿不到（如无 git 环境的裸构建）时为空串，页脚不渲染
 */
declare const __COMMIT_ID__: string;

export const COMMIT_ID: string = typeof __COMMIT_ID__ === 'string' ? __COMMIT_ID__ : '';
