import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

/** 构建期解析当前 commit 短 id：优先 Cloudflare Pages 的 COMMIT_REF，本地回退 git rev-parse */
function resolveCommitId(): string {
  const ref = process.env.COMMIT_REF || process.env.CF_PAGES_COMMIT_SHA;
  if (ref) return ref.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  define: {
    __COMMIT_ID__: JSON.stringify(resolveCommitId()),
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        id: 'app.aevum.countdown',
        name: 'Aevum · 倒数日',
        short_name: 'Aevum',
        description: '极简优雅的倒数日应用，支持多历法与多粒度时间展示',
        lang: 'zh-CN',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#141218',
        theme_color: '#6750a4',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
