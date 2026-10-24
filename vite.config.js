import { defineConfig } from 'vite';

export default defineConfig({
  // 相对基址：同一份 dist 可以托管在任意静态路径下（含 GitHub Pages 的 /<repo>/）
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
