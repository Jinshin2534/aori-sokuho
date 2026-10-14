import { describe, it, expect } from 'vitest';
import { parseRss, splitSource, decodeEntities } from '../src/lib/rss.js';
import { scoreAori, dedupe, rankAori, anxietyLevel, similarity } from '../src/lib/aori.js';

const XML = `<?xml version="1.0"?><rss><channel><title>x</title>
<item><title>物価高騰が止まらない、家計は限界か - 架空新聞</title><link>https://example.com/a</link>
<pubDate>Wed, 14 Oct 2026 15:19:20 GMT</pubDate><source url="https://example.com">架空新聞</source></item>
<item><title><![CDATA[A &amp; B の対策 - 別媒体]]></title><link>https://example.com/b</link></item>
</channel></rss>`;

describe('rss', () => {
  it('item から見出し・媒体・リンク・日時を読む', () => {
    const items = parseRss(XML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: '物価高騰が止まらない、家計は限界か',
      source: '架空新聞',
      link: 'https://example.com/a',
    });
    expect(items[0].publishedAt).toBe(Date.parse('Wed, 14 Oct 2026 15:19:20 GMT'));
    expect(items[1]).toMatchObject({ title: 'A & B の対策', source: '別媒体', publishedAt: null });
  });

  it('文字参照を戻す', () => {
    expect(decodeEntities('&lt;a&gt; &#12354; &#x3044;')).toBe('<a> あ い');
  });

  it('媒体名の無い見出しはそのまま', () => {
    expect(splitSource('ただの見出し')).toEqual({ title: 'ただの見出し', source: '' });
  });
});

describe('scoreAori', () => {
  it('不安語だけの見出しは「煽るだけ」', () => {
    const r = scoreAori('年金制度が崩壊の危機、専門家が警告');
    expect(r.hits).toEqual(expect.arrayContaining(['崩壊', '危機', '警告']));
    expect(r.justFear).toBe(true);
    expect(r.percent).toBeGreaterThan(50);
  });

  it('できることが書いてあれば減点され、煽るだけにならない', () => {
    const r = scoreAori('詐欺被害が急増、手口の見分け方と相談窓口');
    expect(r.actions.length).toBeGreaterThan(0);
    expect(r.justFear).toBe(false);
  });

  it('長い語を優先し二重取りしない（過去最悪で最悪を数えない）', () => {
    const r = scoreAori('過去最悪');
    expect(r.hits).toEqual(['過去最悪']);
    expect(r.score).toBe(3);
  });

  it('平穏な見出しは0点', () => {
    expect(scoreAori('パンダの赤ちゃんが公開').score).toBe(0);
  });

  it('疑問形・速報は演出として加点', () => {
    expect(scoreAori('【速報】これは何なのか？').score).toBeGreaterThanOrEqual(2);
  });

  it('百分率は100で頭打ち', () => {
    expect(scoreAori('過去最悪の危機、崩壊・破綻・暴落・戦争！').percent).toBe(100);
  });
});

describe('dedupe / rank', () => {
  it('同じ出来事の見出しはまとめる', () => {
    const a = { title: '呉の70代男性から2億円超だまし取る 広島県内で過去最悪の特殊詐欺被害' };
    const b = { title: '呉の70代男性から2億円超の暗号資産だまし取る、広島県内で過去最悪の特殊詐欺被害' };
    const c = { title: 'まったく別の地震のニュース' };
    expect(similarity(a.title, b.title)).toBeGreaterThan(0.45);
    expect(dedupe([a, b, c])).toEqual([a, c]);
  });

  it('煽るだけのものだけ、煽り度順に並べる', () => {
    const ranked = rankAori([
      { title: 'パンダが公開', publishedAt: 1 },
      { title: '物価高騰で家計は限界、懸念強まる', publishedAt: 2 },
      { title: '過去最悪の危機、崩壊は目前か', publishedAt: 3 },
      { title: '値上げラッシュ、節約の方法と支援制度', publishedAt: 4 },
    ]);
    expect(ranked.map((r) => r.title)).toEqual([
      '過去最悪の危機、崩壊は目前か',
      '物価高騰で家計は限界、懸念強まる',
    ]);
  });

  it('不安レベルは煽りが強いほど1に近づく', () => {
    const mk = (score) => ({ aori: { score } });
    expect(anxietyLevel([])).toBe(5);
    expect(anxietyLevel([mk(9), mk(8)])).toBe(1);
    expect(anxietyLevel([mk(3), mk(3)])).toBe(5);
    expect(anxietyLevel([mk(5)])).toBe(3);
  });
});
