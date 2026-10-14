import { defineConfig } from 'vite';
import handler from './api/news.js';

// 本番は Vercel が api/news.js を動かす。開発中も同じ関数を /api/news に繋ぐ。
const devApi = {
  name: 'dev-api-news',
  configureServer(server) {
    server.middlewares.use('/api/news', (req, res) => handler(req, res));
  },
};

export default defineConfig({
  plugins: [devApi],
  server: { port: 5800, strictPort: true },
});
