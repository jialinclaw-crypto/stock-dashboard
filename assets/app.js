// ================== Stock Dashboard App ==================

const WATCHLIST = [
  { symbol: 'NVDA',    name: '輝達',    market: 'US', tv: 'NASDAQ:NVDA' },
  { symbol: 'TSLA',    name: '特斯拉',  market: 'US', tv: 'NASDAQ:TSLA' },
  { symbol: 'AAPL',    name: '蘋果',    market: 'US', tv: 'NASDAQ:AAPL' },
  { symbol: 'TSM',     name: '台積電 ADR', market: 'US', tv: 'NYSE:TSM' },
  { symbol: '2330',    name: '台積電',  market: 'TW', tv: 'TPE:2330' },
  { symbol: '2454',    name: '聯發科',  market: 'TW', tv: 'TPE:2454' },
  { symbol: '2317',    name: '鴻海',    market: 'TW', tv: 'TPE:2317' },
];

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
      <span class="font-mono text-sm font-bold text-slate-100">${s.symbol}</span>
      <span class="text-[10px] px-1.5 py-0.5 rounded ${s.market === 'TW' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'}">${s.market}</span>
    </div>
    <p class="text-xs text-slate-400">${s.name}</p>
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
            <h3 class="font-bold text-slate-100">${meta.label}</h3>
          </div>
          <p class="text-xs text-slate-400 mt-1">${r.date} · ${r.weekday || ''}</p>
        </div>
        <span class="text-[10px] text-slate-500">${(r.size/1024).toFixed(1)}KB</span>
      </div>
      ${r.tldr ? `<p class="text-sm text-slate-300 line-clamp-2 leading-relaxed mt-2">${r.tldr}</p>` : ''}
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
  if (latest.tldr) document.getElementById('latest-tldr').textContent = latest.tldr;
  document.getElementById('open-latest').onclick = () => openReport(latest);
  // Try load companion signals JSON
  loadSignals(latest);
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
    renderMarketView(sig);
    renderSignalCards(sig);
    renderAlerts(sig);
  } catch (e) {
    // Silent: hide signals UI
    ['market-view-banner','signals-section','alerts-section'].forEach(id => document.getElementById(id).classList.add('hidden'));
  }
}

function renderMarketView(sig) {
  if (!sig.market_view) return;
  const banner = document.getElementById('market-view-banner');
  const style = LEVEL_STYLES[sig.market_view.level] || LEVEL_STYLES['neutral'];
  document.getElementById('market-view-emoji').textContent = style.emoji;
  const levelEl = document.getElementById('market-view-level');
  levelEl.textContent = style.label;
  levelEl.className = `text-xs font-medium px-2 py-0.5 rounded ${style.css}`;
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
  sig.stocks.forEach(s => {
    const borderCls = VIEW_COLORS[s.signal] || 'border-slate-700';
    const changeColor = (s.change_pct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400';
    const changeArrow = (s.change_pct ?? 0) >= 0 ? '▲' : '▼';
    const card = document.createElement('div');
    card.className = `rounded-xl border ${borderCls} p-3`;
    card.innerHTML = `
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-lg">${s.signal || '🟡'}</span>
            <span class="font-mono font-bold text-sm">${s.ticker}</span>
            <span class="text-[10px] px-1 py-0.5 rounded ${s.market === 'TW' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'}">${s.market || ''}</span>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">${s.name || ''}</p>
        </div>
      </div>
      <div class="flex items-baseline gap-2 mb-2">
        <span class="font-mono font-bold text-base">${s.price != null ? s.price : '—'}</span>
        ${s.change_pct != null ? `<span class="${changeColor} text-xs font-mono">${changeArrow} ${Math.abs(s.change_pct).toFixed(2)}%</span>` : `<span class="text-xs text-slate-600">(資料更新中)</span>`}
      </div>
      <div class="text-[11px] text-slate-300 mb-2 leading-tight">${s.view || ''}</div>
      ${(s.target || s.stop_loss) ? `
      <div class="grid grid-cols-2 gap-1 text-[10px] mt-2 pt-2 border-t border-slate-800">
        ${s.target ? `<div class="text-slate-500">🎯 目標<br><span class="text-emerald-400 font-mono text-xs">${s.target}</span></div>` : '<div></div>'}
        ${s.stop_loss ? `<div class="text-slate-500">🛡 停損<br><span class="text-rose-400 font-mono text-xs">${s.stop_loss}</span></div>` : '<div></div>'}
      </div>` : ''}
      ${(s.support || s.resistance) ? `
      <div class="grid grid-cols-2 gap-1 text-[10px] mt-2">
        ${s.support ? `<div class="text-slate-500">支撐 <span class="text-slate-300 font-mono">${s.support}</span></div>` : '<div></div>'}
        ${s.resistance ? `<div class="text-slate-500">壓力 <span class="text-slate-300 font-mono">${s.resistance}</span></div>` : '<div></div>'}
      </div>` : ''}
    `;
    grid.appendChild(card);
  });
  section.classList.remove('hidden');
  const meta = reportTypeMeta(sig.report_file || '');
  document.getElementById('signals-source').textContent = `來自 ${meta.label} · ${sig.date || ''}`;
}

function renderAlerts(sig) {
  if (!sig.alerts?.length) return;
  const section = document.getElementById('alerts-section');
  const list = document.getElementById('alerts-list');
  list.innerHTML = sig.alerts.map(a => {
    const isWarn = a.level === 'warning';
    const cls = isWarn ? 'border-rose-500/30 bg-rose-500/5 text-rose-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-200';
    const icon = isWarn ? '⚠️' : 'ℹ️';
    const tickers = (a.tickers || []).map(t => `<span class="font-mono text-[10px] px-1 py-0.5 bg-slate-800 rounded">${t}</span>`).join(' ');
    const isClickable = !!a.url;
    const tag = isClickable ? 'a' : 'div';
    const attrs = isClickable
      ? `href="${a.url}" target="_blank" rel="noopener" class="block rounded-lg border ${cls} px-3 py-2 text-xs hover:brightness-125 transition cursor-pointer"`
      : `class="rounded-lg border ${cls} px-3 py-2 text-xs"`;
    const source = a.source ? `<span class="text-[10px] text-slate-500 ml-1">· ${a.source}</span>` : '';
    const arrow = isClickable ? '<span class="float-right text-slate-500">↗</span>' : '';
    return `<${tag} ${attrs}>
      <span class="mr-2">${icon}</span>${a.text}${source}
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
    content.innerHTML = marked.parse(md);
  } catch (e) {
    content.innerHTML = `<p class="text-red-400">載入失敗：${e.message}</p>`;
  }
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('report-modal').classList.add('hidden');
});
document.getElementById('report-modal').addEventListener('click', e => {
  if (e.target.id === 'report-modal') e.currentTarget.classList.add('hidden');
});

// ================== Portfolio ==================
let CLOUD_PORTFOLIO = []; // loaded from repo's portfolio.json

async function loadCloudPortfolio() {
  try {
    const res = await fetch(`portfolio.json?t=${Date.now()}`);
    const data = await res.json();
    CLOUD_PORTFOLIO = data.watchlist || [];
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
  el.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-slate-800/50 text-xs uppercase tracking-wider text-slate-400">
          <th class="text-left p-3">代碼</th>
          <th class="text-right p-3">股數</th>
          <th class="text-right p-3">成本</th>
          <th class="text-right p-3">市場</th>
          <th class="p-3"></th>
        </tr>
      </thead>
      <tbody>
        ${positions.map((p, i) => `
          <tr class="border-t border-slate-800 hover:bg-slate-800/30">
            <td class="p-3 font-mono font-bold">${p.symbol}</td>
            <td class="p-3 text-right">${p.shares}</td>
            <td class="p-3 text-right font-mono">${p.cost.toFixed(2)}</td>
            <td class="p-3 text-right text-xs"><span class="px-2 py-0.5 rounded ${p.market === 'TW' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'}">${p.market}</span></td>
            <td class="p-3 text-right"><button data-i="${i}" class="del-btn text-red-400 hover:text-red-300 text-xs">刪除</button></td>
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
    });
  });
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

// ================== Init ==================
(async () => {
  await loadCloudPortfolio();
  loadReports();
  renderPortfolio();
})();
