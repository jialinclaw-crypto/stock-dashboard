// ================== Stock Dashboard App ==================

const WATCHLIST = [
  { symbol: 'NVDA',    name: '輝達',    market: 'US', tv: 'NASDAQ:NVDA' },
  { symbol: 'TSLA',    name: '特斯拉',  market: 'US', tv: 'NASDAQ:TSLA' },
  { symbol: 'AAPL',    name: '蘋果',    market: 'US', tv: 'NASDAQ:AAPL' },
  { symbol: 'TSM',     name: '台積電 ADR', market: 'US', tv: 'NYSE:TSM' },
  // TradingView symbol PAGE URLs use TWSE: for Taiwan stocks (e.g. /symbols/TWSE-2330/).
  // The ticker-tape widget does NOT include free TW data feed (renders ! for both
  // TPE: and TWSE: prefixes), so TW stocks are filtered out of the ticker entirely
  // in mountWatchlistTicker(). This `tv` value is used only for watchlist tile links.
  { symbol: '2330',    name: '台積電',  market: 'TW', tv: 'TWSE:2330' },
  { symbol: '2454',    name: '聯發科',  market: 'TW', tv: 'TWSE:2454' },
  { symbol: '2317',    name: '鴻海',    market: 'TW', tv: 'TWSE:2317' },
];

// ================== HTML escaping helpers ==================
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeURL(u) {
  if (!u) return null;
  try {
    const p = new URL(u, location.href);
    if (!['http:', 'https:'].includes(p.protocol)) return null;
    return p.href;
  } catch { return null; }
}

// ================== Tabs ==================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.remove('active', 'border-accent', 'text-accent');
      b.classList.add('border-transparent', 'text-slate-400');
    });
    btn.classList.add('active', 'border-accent', 'text-accent');
    btn.classList.remove('border-transparent', 'text-slate-400');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.querySelector(`[data-panel="${tab}"]`).classList.remove('hidden');
    if (tab === 'calendar') renderCalendar();
  });
});

// ================== Theme toggle ==================
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
});
if (localStorage.getItem('theme') === 'light') {
  document.documentElement.classList.remove('dark');
}

// ================== Market status header ==================
function updateMarketStatus() {
  const now = new Date();
  const tpe = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const hour = tpe.getHours();
  const min = tpe.getMinutes();
  const day = tpe.getDay();
  const totalMin = hour * 60 + min;

  let status, color;
  if (day === 0 || day === 6) {
    status = '週末休市';
    color = 'bg-slate-700 text-slate-300';
  } else if (totalMin >= 540 && totalMin < 810) {  // 9:00-13:30
    status = '🟢 台股交易中';
    color = 'bg-emerald-500/20 text-emerald-300';
  } else if (totalMin >= 1290 || totalMin < 240) {  // 21:30-04:00 美股(粗略)
    status = '🟢 美股交易中';
    color = 'bg-emerald-500/20 text-emerald-300';
  } else {
    status = '🔴 休市時段';
    color = 'bg-slate-700 text-slate-300';
  }
  const el = document.getElementById('market-status');
  el.textContent = status;
  el.className = `px-2 py-1 rounded-full text-xs ${color}`;

  const subtitle = `${tpe.toLocaleDateString('zh-TW', { month:'long', day:'numeric', weekday:'long' })} · ${tpe.toLocaleTimeString('zh-TW', {hour:'2-digit',minute:'2-digit'})} 台北`;
  document.getElementById('header-subtitle').textContent = subtitle;
}
updateMarketStatus();
setInterval(updateMarketStatus, 30000);

// ================== TradingView widgets ==================
function makeTVWidget(containerId, symbol) {
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
  script.async = true;
  script.textContent = JSON.stringify({
    symbol,
    width: '100%',
    height: 120,
    locale: 'zh_TW',
    dateRange: '1D',
    colorTheme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    isTransparent: true,
    autosize: true,
    largeChartUrl: ''
  });
  const container = document.getElementById(containerId);
  if (container) container.appendChild(script);
}
// Use ETF proxies — TV mini widget doesn't render index data directly, only stocks/ETFs
makeTVWidget('tv-taiex', 'AMEX:EWT');     // iShares MSCI Taiwan ETF
makeTVWidget('tv-sox',   'NASDAQ:SOXX');  // iShares Semiconductor ETF
makeTVWidget('tv-ndaq',  'NASDAQ:QQQ');   // Invesco QQQ Trust (Nasdaq 100)
makeTVWidget('tv-spx',   'AMEX:SPY');     // SPDR S&P 500 ETF

// ================== Live ticker tape (watchlist real-time prices) ==================
function mountWatchlistTicker(stocks) {
  const container = document.getElementById('tv-watchlist-ticker');
  if (!container) return;
  container.innerHTML = '';
  // Build a lookup from WATCHLIST so we can recover exchange-qualified TV symbols
  // for the well-known tickers when portfolio entries only carry ticker/market.
  const tvLookup = Object.fromEntries(WATCHLIST.map(w => [w.symbol.toUpperCase(), w.tv]));

  // Filter out Taiwan stocks — TradingView free ticker-tape feed doesn't include
  // TPE/TWSE data (renders as "!" warning). TW prices come from the routine snapshot
  // in signal cards below; for live TW quotes, see external sources like 鉅亨網/Yahoo奇摩.
  const filtered = (stocks && stocks.length ? stocks : WATCHLIST).filter(s => s.market !== 'TW');

  // Fallback: if every entry was TW (so nothing left), hide the entire ticker
  // section — both the "美股 only" label AND the bordered widget box.
  const section = document.getElementById('ticker-section');
  if (!filtered.length) {
    if (section) section.classList.add('hidden');
    return;
  } else {
    if (section) section.classList.remove('hidden');
  }

  const symbols = filtered.map(s => {
    const t = (s.ticker || s.symbol || '').toUpperCase();
    let proName;
    if (s.tv) {
      proName = s.tv;                              // explicit override (e.g. baked-in WATCHLIST entry)
    } else if (tvLookup[t]) {
      proName = tvLookup[t];                       // known ticker → use canonical exchange
    } else {
      proName = `NASDAQ:${t}`;                     // unknown US: default to NASDAQ (TradingView resolves many NYSE tickers too)
    }
    return { proName, title: s.name || s.symbol || s.ticker };
  });
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
  script.async = true;
  script.textContent = JSON.stringify({
    symbols,
    showSymbolLogo: true,
    colorTheme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    isTransparent: true,
    displayMode: 'compact',
    locale: 'zh_TW',
  });
  container.appendChild(script);
}
// Note: ticker tape is mounted from init() after portfolio.json loads so the
// repository-configured watchlist (not the baked-in WATCHLIST) is shown.

// ================== Watchlist ==================
const watchGrid = document.getElementById('watchlist-grid');
WATCHLIST.forEach(s => {
  const tile = document.createElement('a');
  tile.className = 'stock-tile flex flex-col gap-1 no-underline';
  tile.href = `https://www.tradingview.com/symbols/${s.tv.replace(':', '-')}/`;
  tile.target = '_blank';
  tile.rel = 'noopener';
  tile.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="font-mono text-sm font-bold text-slate-100">${esc(s.symbol)}</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded ${s.market === 'TW' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'}">${esc(s.market)}</span>
    </div>
    <p class="text-xs text-slate-400">${esc(s.name)}</p>
    <p class="text-[10px] text-slate-500 mt-1">點開看 K 線 →</p>
  `;
  watchGrid.appendChild(tile);
});

// ================== Reports loader ==================
async function loadReports() {
  try {
    const res = await fetch('reports/index.json?t=' + Date.now());
    if (!res.ok) throw new Error('no index');
    const reports = await res.json();
    renderReports(reports);
    renderLatest(reports);
    return reports;
  } catch (e) {
    document.getElementById('reports-list').innerHTML = `
      <div class="text-center py-12 text-slate-500">
        <p class="text-4xl mb-3">📭</p>
        <p class="text-sm">尚無報告 — 排程啟動後會自動出現</p>
      </div>`;
    return [];
  }
}

function reportTypeMeta(filename) {
  if (filename.includes('開盤前')) return { emoji:'📈', label:'開盤前簡報', type:'morning', color:'border-emerald-500/30' };
  if (filename.includes('收盤後')) return { emoji:'📊', label:'收盤後分析', type:'close',   color:'border-amber-500/30' };
  if (filename.includes('週報'))   return { emoji:'📅', label:'一週回顧',   type:'weekly',  color:'border-purple-500/30' };
  return { emoji:'📄', label:'股市報告', type:'other', color:'border-slate-700' };
}

function renderReports(reports, filter = 'all') {
  const list = document.getElementById('reports-list');
  list.innerHTML = '';
  const filtered = filter === 'all' ? reports : reports.filter(r => reportTypeMeta(r.filename).type === filter);
  if (!filtered.length) {
    list.innerHTML = `<p class="text-center text-slate-500 py-8">沒有符合條件的報告</p>`;
    return;
  }
  filtered.forEach(r => {
    const meta = reportTypeMeta(r.filename);
    const card = document.createElement('div');
    card.className = `report-card ${meta.color}`;
    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xl">${meta.emoji}</span>
            <h3 class="font-bold text-slate-100">${esc(meta.label)}</h3>
          </div>
          <p class="text-xs text-slate-400 mt-1">${esc(r.date)} · ${esc(r.weekday || '')}</p>
        </div>
        <span class="text-[10px] text-slate-500">${(r.size/1024).toFixed(1)}KB</span>
      </div>
      ${r.tldr ? `<p class="text-sm text-slate-300 line-clamp-2 leading-relaxed mt-2">${esc(r.tldr)}</p>` : ''}
    `;
    card.addEventListener('click', () => openReport(r));
    list.appendChild(card);
  });
}

function renderLatest(reports) {
  if (!reports.length) return;
  const latest = reports[0];
  const meta = reportTypeMeta(latest.filename);
  document.getElementById('latest-title').textContent = `${meta.emoji} ${meta.label}`;
  document.getElementById('latest-time').textContent = `${latest.date} · ${latest.weekday || ''}`;
  // Always set (avoid stale text leak across renders)
  document.getElementById('latest-tldr').textContent = latest.tldr || '排程啟動後，報告會自動出現在這裡。';
  document.getElementById('open-latest').onclick = () => openReport(latest);
  // Try load companion signals JSON
  loadSignals(latest);
}

// ================== Indices strip ==================
function renderIndices(sig) {
  const strip = document.getElementById('indices-strip');
  if (!strip) return;
  // Always clear first to avoid stale data when newer JSON omits indices
  if (!sig.indices?.length) {
    strip.innerHTML = '';
    strip.classList.add('hidden');
    return;
  }
  strip.innerHTML = sig.indices.map(i => {
    const up = (i.change_pct ?? 0) >= 0;
    const color = up ? 'text-emerald-400' : 'text-rose-400';
    const arrow = up ? '▲' : '▼';
    return `<div class="bg-card rounded-lg border border-slate-800 px-3 py-2">
      <div class="text-[10px] text-slate-500 mb-0.5">${esc(i.name)}</div>
      <div class="flex items-baseline gap-2">
        <span class="font-mono text-sm font-bold">${esc(i.value)}</span>
        ${i.change_pct != null ? `<span class="${color} text-xs font-mono">${arrow} ${Math.abs(i.change_pct).toFixed(2)}%</span>` : ''}
      </div>
    </div>`;
  }).join('');
  strip.classList.remove('hidden');
}

// ================== Latest signals (shared state for portfolio P&L) ==================
let LATEST_SIGNALS = null;

// Merge live quote into a single stock card view-model. Live ONLY overrides
// display fields; never mutates the source object. If live invalid → snapshot.
function mergeSignalWithLive(s) {
  const view = { ...s };  // shallow clone for display-only
  view._isLive = false;
  view._liveAge = null;
  if (!window.LivePrices || !s.ticker) return view;
  const q = window.LivePrices.getQuote(s.ticker);
  // Only let LIVE (not stale) quotes override the authoritative snapshot.
  // Stale quotes are kept out of UI per Codex principle 3 (snapshot fallback).
  if (!q || q.status !== 'live' || !Number.isFinite(q.price)) return view;
  view.price = q.price;
  if (Number.isFinite(q.change_pct)) view.change_pct = q.change_pct;
  view._isLive = true;
  view._liveAge = q.age_ms;
  return view;
}

// Distance-to-target/stop helpers (uses whichever price is displayed)
function distancePct(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return (to - from) / from * 100;
}

// Color helpers
function rsiColor(rsi) {
  if (rsi == null) return 'text-slate-300';
  if (rsi >= 70) return 'text-rose-400';     // overbought
  if (rsi <= 30) return 'text-emerald-400';  // oversold
  return 'text-slate-300';
}
function pePercentileColor(p) {
  if (p == null) return 'text-slate-500';
  if (p >= 80) return 'text-rose-400';       // expensive
  if (p <= 20) return 'text-emerald-400';    // cheap
  return 'text-slate-500';
}

// ================== Signal cards (from companion JSON) ==================
const VIEW_COLORS = {
  '🟢': 'border-emerald-500/40 bg-emerald-500/5',
  '🟡': 'border-amber-500/40 bg-amber-500/5',
  '🔴': 'border-rose-500/40 bg-rose-500/5',
};
const LEVEL_STYLES = {
  'very-bullish':    { emoji:'🟢', label:'非常偏多', css:'bg-emerald-500/20 text-emerald-300' },
  'bullish':         { emoji:'🟢', label:'偏多',     css:'bg-emerald-500/20 text-emerald-300' },
  'neutral-bullish': { emoji:'🟢', label:'偏多偏向中性', css:'bg-emerald-500/10 text-emerald-200' },
  'neutral':         { emoji:'🟡', label:'中性',     css:'bg-amber-500/20 text-amber-300' },
  'neutral-bearish': { emoji:'🟡', label:'中性偏空', css:'bg-amber-500/10 text-amber-200' },
  'bearish':         { emoji:'🔴', label:'偏空',     css:'bg-rose-500/20 text-rose-300' },
  'very-bearish':    { emoji:'🔴', label:'非常偏空', css:'bg-rose-500/20 text-rose-300' },
};

async function loadSignals(latestReport) {
  if (!latestReport) return;
  const jsonFile = latestReport.filename.replace(/\.md$/, '.json');
  try {
    const res = await fetch(`reports/${jsonFile}?t=${Date.now()}`);
    if (!res.ok) throw new Error('no signals json');
    const sig = await res.json();
    LATEST_SIGNALS = sig;
    renderIndices(sig);
    renderMarketView(sig);
    renderSignalCards(sig);
    renderSectorRotation(sig);
    renderAlerts(sig);
    // Re-render portfolio so P&L picks up the new prices
    renderPortfolio();
  } catch (e) {
    LATEST_SIGNALS = null;
    ['indices-strip','market-view-banner','signals-section','sector-section','alerts-section'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    // Also clear stale prices/P&L from portfolio table
    renderPortfolio();
  }
}

// ================== Sector rotation ==================
function renderSectorRotation(sig) {
  const section = document.getElementById('sector-section');
  if (!section) return;
  const rot = sig.sector_rotation;
  const total = (rot?.strong?.length || 0) + (rot?.weak?.length || 0) + (rot?.watch?.length || 0);
  if (!rot || total === 0) {
    section.classList.add('hidden');
    return;
  }
  const groups = [
    { key: 'strong', icon: '🔥', label: '啟動 / 強勢', cls: 'border-emerald-500/40 bg-emerald-500/5', chipCls: 'bg-emerald-500/20 text-emerald-200' },
    { key: 'weak',   icon: '🌅', label: '退潮 / 弱勢', cls: 'border-rose-500/40 bg-rose-500/5',       chipCls: 'bg-rose-500/20 text-rose-200' },
    { key: 'watch',  icon: '👁', label: '觀察名單',   cls: 'border-amber-500/40 bg-amber-500/5',     chipCls: 'bg-amber-500/20 text-amber-200' },
  ];
  document.getElementById('sector-grid').innerHTML = groups.map(g => {
    const items = rot[g.key] || [];
    if (!items.length) {
      return `<div class="rounded-xl border ${g.cls} p-3 opacity-40">
        <div class="text-xs mb-1 text-slate-400">${g.icon} ${esc(g.label)}</div>
        <div class="text-[10px] text-slate-500">—</div>
      </div>`;
    }
    return `<div class="rounded-xl border ${g.cls} p-3">
      <div class="text-xs mb-2 text-slate-400">${g.icon} ${esc(g.label)} <span class="text-[10px] text-slate-600">· ${items.length} 項</span></div>
      <div class="flex flex-wrap gap-1.5">
        ${items.map(i => `<span class="text-[11px] px-2 py-0.5 rounded-full ${g.chipCls}">${esc(i)}</span>`).join('')}
      </div>
    </div>`;
  }).join('');
  section.classList.remove('hidden');
}

function renderMarketView(sig) {
  if (!sig.market_view) return;
  const banner = document.getElementById('market-view-banner');
  const style = LEVEL_STYLES[sig.market_view.level] || LEVEL_STYLES['neutral'];
  document.getElementById('market-view-emoji').textContent = style.emoji;
  const levelEl = document.getElementById('market-view-level');
  levelEl.textContent = style.label;
  levelEl.className = `text-xs font-medium px-2 py-0.5 rounded ${style.css}`;
  // textContent is safe (no HTML parsing)
  document.getElementById('market-view-headline').textContent = sig.market_view.headline || '';
  const conf = sig.market_view.confidence;
  document.getElementById('market-view-confidence').textContent = conf != null ? `信心度 ${Math.round(conf * 100)}%` : '';
  banner.classList.remove('hidden');
}

function renderSignalCards(sig) {
  if (!sig.stocks?.length) return;
  const section = document.getElementById('signals-section');
  const grid = document.getElementById('signals-grid');
  grid.innerHTML = '';
  sig.stocks.forEach(rawStock => {
    const s = mergeSignalWithLive(rawStock);
    const borderCls = VIEW_COLORS[s.signal] || 'border-slate-700';
    const changeColor = (s.change_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const changeArrow = (s.change_pct ?? 0) >= 0 ? '▲' : '▼';
    const liveBadge = s._isLive
      ? `<span class="text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 ml-1">LIVE</span>`
      : `<span class="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-400 ml-1">SNAP</span>`;
    // Distance to target / stop using whichever price is showing
    const distToTarget = distancePct(s.price, s.target);
    const distToStop   = distancePct(s.price, s.stop_loss);
    const card = document.createElement('div');
    card.className = `rounded-xl border ${borderCls} p-3`;
    card.dataset.ticker = String(s.ticker || '').toUpperCase();
    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-lg">${esc(s.signal || '🟡')}</span>
            <span class="font-mono font-bold text-sm">${esc(s.ticker)}</span>
            <span class="text-[10px] px-1 py-0.5 rounded ${s.market === 'TW' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'}">${esc(s.market || '')}</span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">${esc(s.name || '')}</p>
        </div>
      </div>
      <div class="flex items-baseline gap-2 mb-1">
        <span class="font-mono font-bold text-base price-cell">${s.price != null ? esc(Number(s.price).toFixed(2)) : '—'}</span>
        <span class="change-cell text-xs font-mono ${changeColor}">${s.change_pct != null ? `${changeArrow} ${Math.abs(s.change_pct).toFixed(2)}%` : ''}</span>
        <span class="live-badge-cell">${liveBadge}</span>
      </div>
      <div class="dist-row flex gap-3 text-[10px] text-slate-500 mb-2 ${(distToTarget == null && distToStop == null) ? 'hidden' : ''}">
        <span class="dist-target ${distToTarget == null ? 'hidden' : ''}">到 🎯 <span class="${(distToTarget ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono dist-target-val">${distToTarget != null ? ((distToTarget >= 0 ? '+' : '') + distToTarget.toFixed(2) + '%') : ''}</span></span>
        <span class="dist-stop ${distToStop == null ? 'hidden' : ''}">到 🛡 <span class="${(distToStop ?? 0) >= 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono dist-stop-val">${distToStop != null ? ((distToStop >= 0 ? '+' : '') + distToStop.toFixed(2) + '%') : ''}</span></span>
      </div>
      <div class="text-[11px] text-slate-300 mb-2 leading-tight">${esc(s.view || '')}</div>
      ${(s.target || s.stop_loss) ? `
      <div class="grid grid-cols-2 gap-1 text-[10px] mt-2 pt-2 border-t border-slate-800">
        ${s.target ? `<div class="text-slate-500">🎯 目標<br><span class="text-emerald-400 font-mono text-xs">${esc(s.target)}</span></div>` : '<div></div>'}
        ${s.stop_loss ? `<div class="text-slate-500">🛡 停損<br><span class="text-rose-400 font-mono text-xs">${esc(s.stop_loss)}</span></div>` : '<div></div>'}
      </div>` : ''}
      ${(s.support || s.resistance) ? `
      <div class="grid grid-cols-2 gap-1 text-[10px] mt-2">
        ${s.support ? `<div class="text-slate-500">支撐 <span class="text-slate-300 font-mono">${esc(s.support)}</span></div>` : '<div></div>'}
        ${s.resistance ? `<div class="text-slate-500">壓力 <span class="text-slate-300 font-mono">${esc(s.resistance)}</span></div>` : '<div></div>'}
      </div>` : ''}
      ${(s.technicals || s.valuation) ? `
      <div class="grid grid-cols-2 gap-1 text-[10px] mt-2 pt-2 border-t border-slate-800/60">
        ${s.technicals?.rsi14 != null ? `<div class="text-slate-500">RSI14 <span class="font-mono ${rsiColor(s.technicals.rsi14)}">${esc(s.technicals.rsi14)}</span></div>` : '<div></div>'}
        ${s.valuation?.pe != null ? `<div class="text-slate-500">P/E <span class="font-mono text-slate-300">${esc(s.valuation.pe)}</span>${s.valuation.pe_percentile_5y != null ? ` <span class="text-[9px] ${pePercentileColor(s.valuation.pe_percentile_5y)}">P${esc(s.valuation.pe_percentile_5y)}</span>` : ''}</div>` : '<div></div>'}
        ${s.technicals?.macd ? `<div class="text-slate-500 col-span-2">MACD <span class="text-slate-300">${esc(s.technicals.macd)}</span></div>` : ''}
        ${s.technicals?.ma_alignment ? `<div class="text-slate-500 col-span-2">MA <span class="text-slate-300">${esc(s.technicals.ma_alignment)}</span></div>` : ''}
      </div>` : ''}
    `;
    grid.appendChild(card);
  });
  section.classList.remove('hidden');
  const meta = reportTypeMeta(sig.report_file || '');
  let when = '';
  if (sig.generated_at) {
    try {
      // Always render in Asia/Taipei regardless of viewer's local timezone
      const fmt = new Intl.DateTimeFormat('zh-TW', {
        hour: '2-digit', minute: '2-digit',
        hour12: false, timeZone: 'Asia/Taipei',
      });
      when = ` ${fmt.format(new Date(sig.generated_at))}`;
    } catch {}
  }
  document.getElementById('signals-source').textContent = `${meta.label} · ${sig.date || ''}${when} 快照`;
}

function renderAlerts(sig) {
  if (!sig.alerts?.length) return;
  const section = document.getElementById('alerts-section');
  const list = document.getElementById('alerts-list');
  list.innerHTML = sig.alerts.map(a => {
    const isWarn = a.level === 'warning';
    const cls = isWarn ? 'border-rose-500/30 bg-rose-500/5 text-rose-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-200';
    const icon = isWarn ? '⚠️' : 'ℹ️';
    const tickers = (a.tickers || []).map(t => `<span class="font-mono text-[10px] px-1 py-0.5 bg-slate-800 rounded">${esc(t)}</span>`).join(' ');
    const url = safeURL(a.url);  // reject javascript:, data:, etc.
    const isClickable = !!url;
    const tag = isClickable ? 'a' : 'div';
    const attrs = isClickable
      ? `href="${esc(url)}" target="_blank" rel="noopener" class="block rounded-lg border ${cls} px-3 py-2 text-xs hover:brightness-125 transition cursor-pointer"`
      : `class="rounded-lg border ${cls} px-3 py-2 text-xs"`;
    const source = a.source ? `<span class="text-[10px] text-slate-500 ml-1">· ${esc(a.source)}</span>` : '';
    const arrow = isClickable ? '<span class="float-right text-slate-500">↗</span>' : '';
    return `<${tag} ${attrs}>
      <span class="mr-2">${icon}</span>${esc(a.text || '')}${source}
      ${tickers ? `<span class="ml-2">${tickers}</span>` : ''}
      ${arrow}
    </${tag}>`;
  }).join('');
  section.classList.remove('hidden');
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.remove('active', 'bg-emerald-500/20', 'text-emerald-300');
      b.classList.add('bg-slate-800', 'text-slate-400');
    });
    btn.classList.add('active', 'bg-emerald-500/20', 'text-emerald-300');
    btn.classList.remove('bg-slate-800', 'text-slate-400');
    const reports = await loadReports();
    renderReports(reports, btn.dataset.filter);
  });
});

// ================== Modal ==================
async function openReport(r) {
  const modal = document.getElementById('report-modal');
  const title = document.getElementById('modal-title');
  const content = document.getElementById('modal-content');
  const meta = reportTypeMeta(r.filename);
  title.textContent = `${meta.emoji} ${meta.label} · ${r.date}`;
  content.innerHTML = '<p class="text-slate-400 text-center py-8">載入中…</p>';
  modal.classList.remove('hidden');
  try {
    const res = await fetch(`reports/${r.filename}?t=${Date.now()}`);
    const md = await res.text();
    // Sanitize markdown HTML output (defense against XSS via report content).
    // Fail closed: if DOMPurify is unavailable, render as plain text instead of
    // unsanitized HTML — never let a script tag from a report execute.
    if (typeof DOMPurify === 'undefined') {
      content.textContent = md;  // safe plain text fallback
    } else {
      content.innerHTML = DOMPurify.sanitize(marked.parse(md));
    }
  } catch (e) {
    content.textContent = `載入失敗：${e.message}`;
  }
}

function closeModal() {
  document.getElementById('report-modal').classList.add('hidden');
}
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('report-modal').addEventListener('click', e => {
  if (e.target.id === 'report-modal') closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('report-modal').classList.contains('hidden')) {
    closeModal();
  }
});

// ================== Portfolio ==================
let CLOUD_PORTFOLIO = []; // loaded from repo's portfolio.json

async function loadCloudPortfolio() {
  try {
    const res = await fetch(`portfolio.json?t=${Date.now()}`);
    const data = await res.json();
    // Map ticker → symbol for renderPortfolio compatibility; default missing fields
    CLOUD_PORTFOLIO = (data.watchlist || []).map(w => ({
      symbol: w.symbol || w.ticker || '?',
      name:   w.name || '',
      market: w.market || (String(w.ticker || w.symbol || '').match(/^\d/) ? 'TW' : 'US'),
      shares: w.shares ?? 0,
      cost:   w.cost ?? 0,
    }));
  } catch {
    CLOUD_PORTFOLIO = [];
  }
}

function getPortfolio() {
  // Merge: local overrides cloud by ticker
  try {
    const local = JSON.parse(localStorage.getItem('portfolio') || '[]');
    if (local.length) return local;
    return CLOUD_PORTFOLIO;
  } catch { return CLOUD_PORTFOLIO; }
}
function savePortfolio(p) {
  localStorage.setItem('portfolio', JSON.stringify(p));
}

function renderPortfolio() {
  const positions = getPortfolio();
  const el = document.getElementById('portfolio-table');
  if (!positions.length) {
    el.innerHTML = `
      <div class="text-center py-12 text-slate-500">
        <p class="text-4xl mb-3">📭</p>
        <p class="text-sm">尚未新增任何持股</p>
        <p class="text-xs mt-2">點右上「+ 新增持股」開始追蹤</p>
      </div>`;
    return;
  }
  // Build a price lookup: live cache overrides snapshot when available
  const priceMap = new Map();
  const priceSource = new Map();  // ticker → 'live' | 'snapshot'
  if (LATEST_SIGNALS && Array.isArray(LATEST_SIGNALS.stocks)) {
    LATEST_SIGNALS.stocks.forEach(s => {
      if (s.ticker && s.price != null && !isNaN(Number(s.price))) {
        const t = String(s.ticker).toUpperCase();
        priceMap.set(t, Number(s.price));
        priceSource.set(t, 'snapshot');
      }
    });
  }
  // Overlay live quotes on top of snapshot — ONLY when fresh (status === 'live').
  // Stale quotes are excluded so P&L never reflects out-of-date live data.
  if (window.LivePrices) {
    positions.forEach(p => {
      if (!p.symbol) return;
      const q = window.LivePrices.getQuote(p.symbol);
      if (q && q.status === 'live' && Number.isFinite(q.price) && q.price > 0) {
        const t = String(p.symbol).toUpperCase();
        priceMap.set(t, q.price);
        priceSource.set(t, 'live');
      }
    });
  }

  // Compute portfolio totals separately by currency (TWD vs USD) — never mix them
  const tot = { TW: { cost: 0, market: 0, any: false }, US: { cost: 0, market: 0, any: false } };
  const rows = positions.map((p, i) => {
    const shares = Number(p.shares ?? 0);
    const cost = Number(p.cost ?? 0);
    const price = priceMap.get(String(p.symbol).toUpperCase());
    const hasPrice = price != null && !isNaN(price);
    const hasHolding = shares > 0 && cost > 0;
    const currency = p.market === 'TW' ? 'TW' : 'US';
    if (hasHolding && hasPrice && tot[currency]) {
      tot[currency].cost   += shares * cost;
      tot[currency].market += shares * price;
      tot[currency].any = true;
    }
    const marketVal = hasPrice ? shares * price : null;
    const costBasis = shares * cost;
    const pnl       = (hasHolding && hasPrice) ? (marketVal - costBasis) : null;
    const pnlPct    = (pnl != null && costBasis > 0) ? (pnl / costBasis * 100) : null;
    const pnlColor  = pnl == null ? 'text-slate-500' : (pnl >= 0 ? 'text-emerald-400' : 'text-rose-400');
    const pnlSign   = pnl == null ? '' : (pnl >= 0 ? '+' : '');
    return { i, p, shares, cost, price, hasPrice, hasHolding, costBasis, marketVal, pnl, pnlPct, pnlColor, pnlSign };
  });

  const anyHolding = tot.TW.any || tot.US.any;
  const priceAsOf = LATEST_SIGNALS?.generated_at
    ? new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Taipei' }).format(new Date(LATEST_SIGNALS.generated_at))
    : null;

  function totalsCard(label, currency, t, badgeCls) {
    if (!t.any) return '';
    const pnl = t.market - t.cost;
    const pnlPct = t.cost > 0 ? pnl / t.cost * 100 : null;
    const color = pnl >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const sign = pnl >= 0 ? '+' : '';
    return `<div class="flex-1 min-w-[260px] bg-gradient-to-br from-slate-800/40 to-slate-900 border border-slate-800 rounded-lg p-3 m-2">
      <div class="flex items-center justify-between mb-1">
        <p class="text-[10px] uppercase tracking-wider text-slate-500">${esc(label)}</p>
        <span class="text-[10px] px-2 py-0.5 rounded ${badgeCls}">${esc(currency)}</span>
      </div>
      <p class="text-xl font-mono font-bold ${color}">${sign}${pnl.toFixed(0)}
        ${pnlPct != null ? `<span class="text-sm ml-2">(${sign}${pnlPct.toFixed(2)}%)</span>` : ''}
      </p>
      <p class="text-[10px] text-slate-500 mt-1">市值 <span class="font-mono text-slate-300">${t.market.toFixed(0)}</span> / 成本 <span class="font-mono text-slate-400">${t.cost.toFixed(0)}</span></p>
    </div>`;
  }

  el.innerHTML = `
    ${anyHolding ? `
    <div class="border-b border-slate-800">
      <div class="flex flex-wrap">
        ${totalsCard('台股 P&L', 'TWD', tot.TW, 'bg-orange-500/20 text-orange-300')}
        ${totalsCard('美股 P&L', 'USD', tot.US, 'bg-blue-500/20 text-blue-300')}
      </div>
      <p class="text-[10px] text-slate-500 px-4 pb-2">${(() => {
        const hasLive = Array.from(priceSource.values()).some(v => v === 'live');
        const allLive = priceSource.size > 0 && Array.from(priceSource.values()).every(v => v === 'live');
        if (allLive) return `📡 全部用 LIVE 即時價計算 · 不同幣別不相加`;
        if (hasLive) return `📡 LIVE 即時價 + ${priceAsOf ? esc(priceAsOf) + ' ' : ''}快照價混合 · 不同幣別不相加`;
        return priceAsOf ? `📍 用 ${esc(priceAsOf)} 快照價計算（非即時）· 不同幣別不相加` : `📍 用報告快照價計算 · 不同幣別不相加`;
      })()}</p>
    </div>` : ''}
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-slate-800/30 text-[10px] uppercase tracking-wider text-slate-400">
          <th class="text-left p-2">代碼</th>
          <th class="text-right p-2">股數</th>
          <th class="text-right p-2">成本</th>
          <th class="text-right p-2">現價</th>
          <th class="text-right p-2">市值</th>
          <th class="text-right p-2">損益 $</th>
          <th class="text-right p-2">損益 %</th>
          <th class="p-2"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr class="border-t border-slate-800 hover:bg-slate-800/30">
            <td class="p-2 font-mono font-bold">
              ${esc(r.p.symbol)}
              <span class="text-[9px] ml-1 px-1 py-0.5 rounded ${r.p.market === 'TW' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'}">${esc(r.p.market || '')}</span>
              ${!r.hasHolding ? `<span class="text-[9px] ml-1 text-slate-500">觀察</span>` : ''}
            </td>
            <td class="p-2 text-right font-mono">${r.shares || '—'}</td>
            <td class="p-2 text-right font-mono">${r.cost > 0 ? r.cost.toFixed(2) : '—'}</td>
            <td class="p-2 text-right font-mono ${r.hasPrice ? 'text-slate-200' : 'text-slate-600'}">${r.hasPrice ? r.price.toFixed(2) : '—'}</td>
            <td class="p-2 text-right font-mono text-slate-300">${r.marketVal != null && r.hasHolding ? r.marketVal.toFixed(0) : '—'}</td>
            <td class="p-2 text-right font-mono ${r.pnlColor}">${r.pnl == null ? '—' : r.pnlSign + r.pnl.toFixed(0)}</td>
            <td class="p-2 text-right font-mono ${r.pnlColor}">${r.pnlPct == null ? '—' : r.pnlSign + r.pnlPct.toFixed(2) + '%'}</td>
            <td class="p-2 text-right"><button data-i="${r.i}" class="del-btn text-red-400 hover:text-red-300 text-xs">刪除</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  el.querySelectorAll('.del-btn').forEach(b => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.i);
      const p = getPortfolio();
      p.splice(i, 1);
      savePortfolio(p);
      renderPortfolio();
      refreshTickerFromPortfolio();
    });
  });
}

// Re-mount ticker AND restart live-price poller after portfolio edits so both
// track the current watchlist.
function refreshTickerFromPortfolio() {
  const eff = getPortfolio();
  const stocks = (eff && eff.length)
    ? eff.map(p => ({ ticker: p.symbol, symbol: p.symbol, name: p.name, market: p.market }))
    : WATCHLIST;
  mountWatchlistTicker(stocks);
  if (window.LivePrices && typeof window.LivePrices.start === 'function') {
    window.LivePrices.start(stocks);  // start() resets state internally
  }
}

document.getElementById('add-position-btn').addEventListener('click', () => {
  document.getElementById('position-form').classList.toggle('hidden');
});
document.getElementById('pf-cancel').addEventListener('click', () => {
  document.getElementById('position-form').classList.add('hidden');
});
document.getElementById('pf-save').addEventListener('click', () => {
  const symbol = document.getElementById('pf-symbol').value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById('pf-shares').value);
  const cost   = parseFloat(document.getElementById('pf-cost').value);
  const market = document.getElementById('pf-market').value.trim().toUpperCase() || (symbol.match(/^\d/) ? 'TW' : 'US');
  if (!symbol || !shares || !cost) return alert('請填完整');
  const p = getPortfolio();
  p.push({ symbol, shares, cost, market, addedAt: new Date().toISOString() });
  savePortfolio(p);
  document.getElementById('position-form').classList.add('hidden');
  ['pf-symbol','pf-shares','pf-cost','pf-market'].forEach(id => document.getElementById(id).value = '');
  renderPortfolio();
  refreshTickerFromPortfolio();
});

// ================== Calendar timeline ==================
async function renderCalendar() {
  const reports = await loadReports();
  const grouped = {};
  reports.forEach(r => {
    const d = r.date;
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(r);
  });
  const dates = Object.keys(grouped).sort().reverse();
  const el = document.getElementById('calendar-timeline');
  if (!dates.length) {
    el.innerHTML = `<p class="text-center text-slate-500 py-8">尚無資料</p>`;
    return;
  }
  el.innerHTML = dates.map(d => `
    <div class="relative pl-6 border-l-2 border-emerald-500/30">
      <div class="absolute -left-2 top-2 w-3 h-3 rounded-full bg-emerald-500"></div>
      <p class="text-sm font-bold text-slate-200 mb-2">${d}</p>
      <div class="space-y-2">
        ${grouped[d].map(r => {
          const m = reportTypeMeta(r.filename);
          return `<button class="cal-item flex items-center gap-2 text-xs bg-card border border-slate-800 rounded-lg px-3 py-2 hover:border-emerald-500/50 transition w-full text-left" data-fn="${r.filename}">
            <span>${m.emoji}</span>
            <span class="font-medium">${m.label}</span>
          </button>`;
        }).join('')}
      </div>
    </div>
  `).join('');
  el.querySelectorAll('.cal-item').forEach(b => {
    b.addEventListener('click', async () => {
      const reports = await loadReports();
      const r = reports.find(x => x.filename === b.dataset.fn);
      if (r) openReport(r);
    });
  });
}

// ================== Live status badge ==================
function updateLiveStatusBadge() {
  const el = document.getElementById('live-status-badge');
  if (!el || !window.LivePrices) return;
  const status = window.LivePrices.getStatus();
  const updated = window.LivePrices.formatLastUpdated();
  const styles = {
    live:     { text: `🟢 LIVE ${updated}`,    cls: 'bg-emerald-500/20 text-emerald-300' },
    stale:    { text: `🟡 STALE ${updated}`,   cls: 'bg-amber-500/20 text-amber-300' },
    failed:   { text: '🔴 LIVE 取得失敗',       cls: 'bg-rose-500/20 text-rose-300' },
    idle:     { text: '📍 SNAPSHOT only',      cls: 'bg-slate-700 text-slate-400' },
  };
  const s = styles[status] || styles.idle;
  el.textContent = s.text;
  el.className = `px-2 py-0.5 rounded text-[10px] ${s.cls}`;
}

// ================== Refresh signal cards from live cache (light) ==================
// Surgically updates price / change% / LIVE-SNAP badge / distance-to-target/stop
// per card. NEVER calls innerHTML — pure textContent + classList mutations.
function refreshSignalCardLivePrices() {
  // Even when signals JSON is unavailable, the portfolio can still benefit from
  // live prices, so we always update the status badge + portfolio at the end.
  if (!LATEST_SIGNALS?.stocks) {
    updateLiveStatusBadge();
    renderPortfolio();
    return;
  }
  const grid = document.getElementById('signals-grid');
  if (!grid) {
    updateLiveStatusBadge();
    renderPortfolio();
    return;
  }
  LATEST_SIGNALS.stocks.forEach(raw => {
    const card = grid.querySelector(`[data-ticker="${String(raw.ticker || '').toUpperCase()}"]`);
    if (!card) return;
    const view = mergeSignalWithLive(raw);

    // Price cell + flash on change
    const priceEl = card.querySelector('.price-cell');
    if (priceEl && Number.isFinite(Number(view.price))) {
      const next = Number(view.price).toFixed(2);
      if (priceEl.textContent !== next) {
        priceEl.textContent = next;
        priceEl.classList.remove('price-flash');
        void priceEl.offsetWidth;
        priceEl.classList.add('price-flash');
      }
    }

    // Change % + arrow + color
    const changeEl = card.querySelector('.change-cell');
    if (changeEl) {
      if (Number.isFinite(view.change_pct)) {
        const up = view.change_pct >= 0;
        changeEl.textContent = `${up ? '▲' : '▼'} ${Math.abs(view.change_pct).toFixed(2)}%`;
        changeEl.classList.remove('text-emerald-400', 'text-rose-400');
        changeEl.classList.add(up ? 'text-emerald-400' : 'text-rose-400');
      } else {
        changeEl.textContent = '';
      }
    }

    // LIVE / SNAP badge
    const badgeEl = card.querySelector('.live-badge-cell');
    if (badgeEl) {
      const isLive = !!view._isLive;
      badgeEl.innerHTML = '';
      const span = document.createElement('span');
      span.className = `text-[9px] px-1 py-0.5 rounded ml-1 ${
        isLive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'
      }`;
      span.textContent = isLive ? 'LIVE' : 'SNAP';
      badgeEl.appendChild(span);
    }

    // Distance to target / stop (recomputed from current displayed price)
    const distRow = card.querySelector('.dist-row');
    const distTargetEl = card.querySelector('.dist-target');
    const distStopEl   = card.querySelector('.dist-stop');
    const distTargetVal = card.querySelector('.dist-target-val');
    const distStopVal   = card.querySelector('.dist-stop-val');
    const dT = distancePct(view.price, view.target);
    const dS = distancePct(view.price, view.stop_loss);
    if (distTargetEl) {
      if (dT != null && distTargetVal) {
        distTargetEl.classList.remove('hidden');
        distTargetVal.textContent = `${dT >= 0 ? '+' : ''}${dT.toFixed(2)}%`;
        distTargetVal.classList.remove('text-emerald-400', 'text-rose-400');
        distTargetVal.classList.add(dT >= 0 ? 'text-emerald-400' : 'text-rose-400');
      } else {
        distTargetEl.classList.add('hidden');
      }
    }
    if (distStopEl) {
      if (dS != null && distStopVal) {
        distStopEl.classList.remove('hidden');
        distStopVal.textContent = `${dS >= 0 ? '+' : ''}${dS.toFixed(2)}%`;
        distStopVal.classList.remove('text-emerald-400', 'text-rose-400');
        distStopVal.classList.add(dS >= 0 ? 'text-rose-400' : 'text-emerald-400');
      } else {
        distStopEl.classList.add('hidden');
      }
    }
    if (distRow) {
      distRow.classList.toggle('hidden', dT == null && dS == null);
    }
  });
  updateLiveStatusBadge();
  // Re-render portfolio so P&L picks up live prices
  renderPortfolio();
}

// ================== Init ==================
(async () => {
  await loadCloudPortfolio();
  // Mount live ticker using whatever the user is actually watching:
  // getPortfolio() respects local override → falls back to cloud → finally WATCHLIST
  const effective = getPortfolio();
  const tickerStocks = (effective && effective.length)
    ? effective.map(p => ({
        ticker: p.symbol,
        symbol: p.symbol,
        name: p.name,
        market: p.market,
      }))
    : WATCHLIST;
  mountWatchlistTicker(tickerStocks);
  loadReports();
  renderPortfolio();

  // Start live price polling once we know the watchlist
  if (window.LivePrices) {
    const startList = (effective && effective.length) ? effective.map(p => ({
      ticker: p.symbol, symbol: p.symbol, name: p.name, market: p.market,
    })) : WATCHLIST;
    window.LivePrices.subscribe(refreshSignalCardLivePrices);
    window.LivePrices.start(startList);
  }
})();
