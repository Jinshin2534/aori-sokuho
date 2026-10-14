// RSS 2.0 の <item> を素朴に読む。依存を増やさないため正規表現で十分な範囲だけ扱う。

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]).trim() : '';
}

// Google ニュースの見出しは「本文 - 媒体名」の形。末尾の媒体名を切り離す。
export function splitSource(title, sourceTag = '') {
  if (sourceTag && title.endsWith(` - ${sourceTag}`)) {
    return { title: title.slice(0, -(sourceTag.length + 3)).trim(), source: sourceTag };
  }
  const i = title.lastIndexOf(' - ');
  if (i > 0 && title.length - i < 40) {
    return { title: title.slice(0, i).trim(), source: title.slice(i + 3).trim() };
  }
  return { title: title.trim(), source: sourceTag };
}

export function parseRss(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const raw = tag(block, 'title');
    if (!raw) continue;
    const { title, source } = splitSource(raw, tag(block, 'source'));
    const date = Date.parse(tag(block, 'pubDate'));
    items.push({
      title,
      source,
      link: tag(block, 'link'),
      publishedAt: Number.isFinite(date) ? date : null,
    });
  }
  return items;
}
