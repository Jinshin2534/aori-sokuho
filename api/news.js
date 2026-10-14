// Google ニュースの RSS を束ねて返す同一オリジン用の中継。
// Vercel のサーバ関数として動き、開発時は vite.config.js から同じ関数を呼ぶ。
import { parseRss } from '../src/lib/rss.js';

const BASE = 'https://news.google.com/rss';
const LOCALE = 'hl=ja&gl=JP&ceid=JP:ja';
// 煽り見出しが集まりやすい言葉で検索した分も混ぜる
const QUERIES = ['過去最悪', '警告', '懸念', '危機', '急増', '恐れ', '過去最多', '深刻'];

export const FEEDS = [
  `${BASE}?${LOCALE}`,
  ...QUERIES.map((q) => `${BASE}/search?q=${encodeURIComponent(q + ' when:3d')}&${LOCALE}`),
];

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (aori-sokuho; +https://github.com/Jinshin2534/aori-sokuho)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return parseRss(await res.text());
}

export async function collectNews() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (!items.length) throw new Error('全フィードの取得に失敗');
  return { items, failed, fetchedAt: Date.now() };
}

export default async function handler(req, res) {
  try {
    const body = await collectNews();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    res.end(JSON.stringify(body));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
