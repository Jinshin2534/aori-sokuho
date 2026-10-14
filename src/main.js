import { rankAori, anxietyLevel } from './lib/aori.js';

const MAX_CARDS = 40;
const DEFCON_WORDS = {
  1: '終わりの始まり',
  2: '取り返しがつかない',
  3: 'かなりまずい',
  4: 'じわじわまずい',
  5: 'まだ大丈夫（今のところは）',
};

const $ = (id) => document.getElementById(id);
const state = { ranked: [], total: 0, fetchedAt: null, calm: false, worsened: 0, error: null };

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// 不安語を蛍光ペンで囲う
function highlight(title, hits) {
  let html = escapeHtml(title);
  for (const w of [...hits].sort((a, b) => b.length - a.length)) {
    html = html.split(escapeHtml(w)).join(`\u0001${escapeHtml(w)}\u0002`);
  }
  return html.replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
}

function since(ts) {
  if (!ts) return '発生時刻不明（それが一番怖い）';
  const min = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (min < 60) return `${min}分前から進行中`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}時間前から放置されています`;
  return `${Math.round(h / 24)}日前から誰も止めていません`;
}

function plainDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function badge(score) {
  if (score >= 9) return ['超緊急', 'max'];
  if (score >= 6) return ['緊急', 'high'];
  return ['要警戒', 'mid'];
}

function card(it, i) {
  const [label, tier] = badge(it.aori.score);
  return `
  <article class="card card--${tier}" style="--i:${i}">
    <div class="card__top">
      <span class="card__rank">#${i + 1}</span>
      <span class="card__badge">${label}</span>
      <span class="card__time">${since(it.publishedAt)}</span>
      <span class="card__time-calm">${plainDate(it.publishedAt)}</span>
    </div>
    <h2 class="card__title">${highlight(it.title, it.aori.hits)}</h2>
    <div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${it.aori.percent}" aria-label="煽り度">
      <span class="meter__label">煽り度</span>
      <span class="meter__bar"><span style="width:${it.aori.percent}%"></span></span>
      <span class="meter__num">${it.aori.percent}%</span>
    </div>
    <div class="card__bottom">
      <span class="stamp">あなたにできること：<b>なし</b></span>
      <span class="card__source">${escapeHtml(it.source || '出典不明')}</span>
      <a class="card__link" href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer"><span class="aori-only">続きを読んで不安になる →</span><span class="calm-only">記事を読む</span></a>
    </div>
  </article>`;
}

function renderCalmSummary() {
  const box = $('calmSummary');
  box.hidden = !state.calm;
  if (!state.calm) return;
  const n = state.ranked.length;
  box.innerHTML = `
    <p>この3日ほどの見出し${state.total}件のうち、不安な言葉だけでできていて、読者にできることが書かれていないものが${n}件ありました。</p>
    <p>このうち、あなたがいま画面の前でできることがあるもの：<b>0件</b>。</p>
    <p>必要なことは、必要になったときに、もう少し落ち着いた記事が教えてくれます。お茶でもどうぞ。</p>`;
}

function render() {
  const feed = $('feed');
  if (state.error) {
    feed.innerHTML = `
      <div class="error">
        <p class="error__big">ニュースすら届きません。</p>
        <p>事態は想像以上に深刻な可能性があります（${escapeHtml(state.error)}）。</p>
        <button class="btn btn--reload" type="button" data-retry>もう一度、覚悟して取りに行く</button>
      </div>`;
    feed.querySelector('[data-retry]').onclick = load;
    return;
  }
  const shown = state.ranked.slice(0, MAX_CARDS);
  feed.innerHTML = shown.length
    ? shown.map(card).join('')
    : '<p class="loading">煽れるニュースが見つかりません。逆に不気味です。</p>';

  $('ticker').innerHTML = shown
    .slice(0, 15)
    .map((it) => `<span>⚠ ${escapeHtml(it.title)}</span>`)
    .join('')
    .repeat(2);

  const level = anxietyLevel(state.ranked);
  const defcon = $('defcon');
  defcon.dataset.level = level;
  [...defcon.querySelectorAll('li')].forEach((li, i) => li.classList.toggle('on', i + 1 === level));
  $('defconWord').textContent = DEFCON_WORDS[level];

  state.worsened = Math.max(state.worsened, shown.length);
  $('worsened').textContent = state.worsened;
  renderCalmSummary();
}

async function load() {
  $('feed').innerHTML = '<p class="loading">最新の不安を取り寄せています…</p>';
  try {
    const res = await fetch('/api/news');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    state.error = null;
    state.total = body.items.length;
    state.fetchedAt = body.fetchedAt;
    state.ranked = rankAori(body.items);
  } catch (e) {
    state.error = String(e.message || e);
  }
  render();
}

// 「何かの期限」は毎日0時。0になったら延長される。
function tickCountdown() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const s = Math.floor((end - now) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  $('countdown').textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  $('countdownNote').textContent = s < 5 ? '※期限は延長されました' : '※何の期限かは不明です';
}

// 悪化カウンタは、ただ増える
function tickWorsened() {
  if (state.calm || !state.ranked.length) return;
  state.worsened += 1;
  const el = $('worsened');
  el.textContent = state.worsened;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

let audio;
function siren() {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sawtooth';
    for (let k = 0; k < 4; k++) {
      osc.frequency.setValueAtTime(620, t + k * 0.5);
      osc.frequency.linearRampToValueAtTime(980, t + k * 0.5 + 0.25);
      osc.frequency.linearRampToValueAtTime(620, t + k * 0.5 + 0.5);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    gain.gain.setValueAtTime(0.12, t + 1.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 2);
  } catch {
    // 音が出なくても不安にはなれる
  }
}

function panic() {
  if (state.calm) setCalm(false);
  siren();
  document.body.classList.remove('panic');
  void document.body.offsetWidth;
  document.body.classList.add('panic');
  setTimeout(() => document.body.classList.remove('panic'), 2000);
}

function setCalm(on) {
  state.calm = on;
  document.body.classList.toggle('calm', on);
  $('calmBtn').setAttribute('aria-pressed', String(on));
  $('calmBtn').textContent = on ? 'やっぱり煽られたい' : '冷静になる';
  document.title = on ? 'ニュース' : 'アオリ速報';
  renderCalmSummary();
}

$('panicBtn').onclick = panic;
$('calmBtn').onclick = () => setCalm(!state.calm);
$('reloadBtn').onclick = load;

tickCountdown();
setInterval(tickCountdown, 1000);
setInterval(tickWorsened, 7000);
load();

window.__app = { state, load, setCalm, panic };
