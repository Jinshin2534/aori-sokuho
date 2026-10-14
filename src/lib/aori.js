// 見出しの「煽り度」を採点する。
// 不安を誘う語は加点、読者が何かできそうな語（対策・申請・支援…）は減点。
// 差し引きが大きいほど「ただ危機感を煽るだけ」の見出し、という判定。

export const FEAR_WORDS = [
  // 重み3: 終末感
  ['過去最悪', 3], ['崩壊', 3], ['破綻', 3], ['壊滅', 3], ['消滅', 3], ['危機', 3],
  ['最悪', 3], ['暴落', 3], ['絶滅', 3], ['限界', 3], ['戦争', 3], ['死者', 3], ['パニック', 3],
  // 重み2: 不穏
  ['警告', 2], ['警鐘', 2], ['警戒', 2], ['懸念', 2], ['恐れ', 2], ['おそれ', 2], ['深刻', 2],
  ['急増', 2], ['急騰', 2], ['不足', 2], ['迫る', 2], ['脅威', 2], ['不安', 2], ['悪化', 2],
  ['値上げ', 2], ['被害', 2], ['詐欺', 2], ['倒産', 2], ['猛威', 2], ['危険', 2], ['緊急', 2],
  ['衝撃', 2], ['激減', 2], ['急落', 2], ['逼迫', 2], ['過去最多', 2], ['最多', 2], ['過去最高', 2],
  ['相次ぐ', 2], ['止まらない', 2], ['感染', 2], ['地震', 2], ['異常', 2], ['失踪', 2], ['孤立', 2],
  // 重み1: なんとなく暗い
  ['円安', 1], ['物価', 1], ['赤字', 1], ['減少', 1], ['高騰', 1], ['逮捕', 1], ['事故', 1],
  ['停止', 1], ['低下', 1], ['課題', 1], ['問題', 1], ['影響', 1], ['波紋', 1], ['拡大', 1],
  ['続く', 1], ['疑い', 1], ['増加', 1], ['揺れ', 1], ['批判', 1], ['反発', 1], ['辞任', 1],
];

export const ACTION_WORDS = [
  '対策', '方法', '予防', '防ぐ', '備え', '申請', '支援', '給付', '相談', '改善', '解決',
  '回復', '合意', '成功', '対処', '見分け方', '守る', '窓口', '無料', '受付', 'コツ', '解説',
];

// 見出しそのものの書きぶりで足す点（語彙ではなく演出）
const HYPE_MARKS = [
  [/【速報】|【緊急】/, 1],
  [/[!！]/, 1],
  [/(のか|か)[?？]?$|[?？]/, 1],
  [/かも|ついに|まさか|ヤバ|やばい/, 1],
];

// 長い語を先に照合し、照合した部分は消して二重取りを防ぐ（「過去最悪」と「最悪」など）
const FEAR_SORTED = [...FEAR_WORDS].sort((a, b) => b[0].length - a[0].length);

export function scoreAori(title) {
  let rest = title;
  let fear = 0;
  const hits = [];
  for (const [w, weight] of FEAR_SORTED) {
    if (rest.includes(w)) {
      fear += weight;
      hits.push(w);
      rest = rest.split(w).join('\u0000');
    }
  }
  for (const [re, weight] of HYPE_MARKS) if (re.test(title)) fear += weight;

  const actions = ACTION_WORDS.filter((w) => title.includes(w));
  const score = Math.max(0, fear - actions.length * 2);
  return {
    score,
    percent: Math.min(100, Math.round(score * 12)),
    hits,
    actions,
    // 煽るだけ = 不安語が十分あり、かつ読者にできることが一つも書かれていない
    justFear: score >= 3 && actions.length === 0,
  };
}

// 見出しの2文字組の集合
function bigrams(s) {
  const t = s.replace(/[\s【】「」『』、。・…]/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

export function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// 同じ出来事を複数の媒体が書いた見出しをまとめる（先に来たものを残す）
export function dedupe(items, threshold = 0.45) {
  const kept = [];
  for (const it of items) {
    if (!kept.some((k) => similarity(k.title, it.title) >= threshold)) kept.push(it);
  }
  return kept;
}

// 煽るだけのニュースだけを、煽り度の高い順に
export function rankAori(items) {
  return dedupe(items)
    .map((it) => ({ ...it, aori: scoreAori(it.title) }))
    .filter((it) => it.aori.justFear)
    .sort((a, b) => b.aori.score - a.aori.score || (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
}

// 国民不安レベル: 上位の平均煽り度から 1(最悪)〜5 を出す（DEFCON の向き）
export function anxietyLevel(ranked) {
  if (!ranked.length) return 5;
  const top = ranked.slice(0, 10);
  const avg = top.reduce((s, it) => s + it.aori.score, 0) / top.length;
  if (avg >= 8) return 1;
  if (avg >= 6) return 2;
  if (avg >= 4.5) return 3;
  if (avg >= 3.5) return 4;
  return 5;
}
