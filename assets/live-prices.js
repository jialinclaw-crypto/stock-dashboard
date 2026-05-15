// ============================================================================
// live-prices.js  ·  Best-effort live quotes via Yahoo Finance + corsproxy.io
//
// Codex design principles applied:
//  1. Snapshot is authoritative — live only enhances display, never overwrites
//     source data (LATEST_SIGNALS untouched).
//  2. Third-party data is never trusted — every numeric field validated
//     with Number.isFinite() before being used.
//  3. UI is explicit about state: LIVE / STALE / SNAPSHOT.
//
// Public API:
//   LivePrices.start()                            — begin polling loop
//   LivePrices.subscribe(fn)                      — listen for updates
//   LivePrices.getQuote('2330')                   — { price, change_pct, time, status } | null
//   LivePrices.getStatus()                        — 'live' | 'stale' | 'failed' | 'idle'
//   LivePrices.formatLastUpdated()                — 'HH:MM:SS Taipei' or '—'
//
// Failure modes:
//  - fetch throws / timeout / non-2xx  → exponential backoff (30/60/120/300 s)
//  - missing meta or invalid number    → that symbol stays in failed state,
//                                        UI must fall back to snapshot price.
// ============================================================================
(function () {
  'use strict';

  const POLL_BASE_MS         = 30_000;
  const POLL_BACKOFFS_MS     = [30_000, 60_000, 120_000, 300_000];
  const FETCH_TIMEOUT_MS     = 8_000;
  const STALE_THRESHOLD_MS   = 5 * 60_000;  // 5 minutes
  const CORS_PROXY           = 'https://corsproxy.io/?';
  const YF_BASE              = 'https://query1.finance.yahoo.com/v8/finance/chart/';

  // Yahoo symbol mapping. Currently US-only.
  //
  // Why no TW: Yahoo Finance .TW quotes via corsproxy are 15-20 min delayed
  // and do NOT update after market close. Showing them with a 🟢 LIVE badge
  // would mislead users — "thinks it's live but actually isn't" is worse than
  // "knows it's snapshot only". For TW stocks, we deliberately fall back to
  // the routine snapshot price (which has a clear timestamp), and the user can
  // open TradingView via the watchlist tile for true real-time quotes.
  //
  // Tickers are an allowlist — never construct from untrusted input.
  function yahooSymbol(ticker, market) {
    if (market === 'US' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) return ticker;
    return null;
  }

  // ---- Internal state ----
  const quoteCache = new Map();   // ticker → { price, prev, change_pct, time, status }
  const subscribers = new Set();
  let pollHandle = null;
  let consecutiveFails = 0;
  let requestSeq = 0;             // monotonic id for stale-response guard
  let watchlistGen = 0;           // generation; bumped on start() so old finally clauses bail
  let aggregateStatus = 'idle';   // idle | live | stale | failed

  function setAggregateStatus(s) {
    if (aggregateStatus !== s) {
      aggregateStatus = s;
      notify();
    }
  }

  function notify() {
    subscribers.forEach(fn => { try { fn(); } catch (e) { /* ignore subscriber errors */ } });
  }

  // ---- Fetch one symbol with timeout ----
  async function fetchOne(ticker, market, seq) {
    const ySym = yahooSymbol(ticker, market);
    if (!ySym) return { ticker, ok: false, reason: market === 'TW' ? 'tw-not-supported' : 'invalid-symbol' };

    const url = `${CORS_PROXY}${encodeURIComponent(`${YF_BASE}${ySym}?interval=1d&range=2d`)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) return { ticker, ok: false, reason: `http-${r.status}` };
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta) return { ticker, ok: false, reason: 'no-meta' };
      const price = Number(meta.regularMarketPrice);
      const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
      if (!Number.isFinite(price) || !Number.isFinite(prev) || price <= 0 || prev <= 0) {
        return { ticker, ok: false, reason: 'invalid-numbers' };
      }
      const change_pct = (price - prev) / prev * 100;
      const time = Number.isFinite(Number(meta.regularMarketTime))
        ? new Date(Number(meta.regularMarketTime) * 1000)
        : new Date();
      return { ticker, ok: true, seq, quote: { price, prev, change_pct, time } };
    } catch (e) {
      return { ticker, ok: false, reason: String(e?.name || e).slice(0, 40) };
    } finally {
      clearTimeout(t);
    }
  }

  // ---- One polling round ----
  async function pollOnce(watchlist) {
    const seq = ++requestSeq;
    if (!Array.isArray(watchlist) || watchlist.length === 0) return;

    const results = await Promise.allSettled(
      watchlist.map(s => fetchOne(s.symbol || s.ticker, s.market, seq))
    );

    // Stale-response guard — drop if a newer poll started
    if (seq !== requestSeq) return;

    let okCount = 0, total = 0;
    for (const r of results) {
      total++;
      if (r.status !== 'fulfilled') continue;
      const v = r.value;
      if (!v) continue;
      const key = v.ticker ? String(v.ticker).toUpperCase() : null;
      if (!v.ok) {
        // Evict cached entry so callers fall back to snapshot instead of using
        // a stale "live" price for a symbol whose latest fetch failed.
        if (key) quoteCache.delete(key);
        continue;
      }
      okCount++;
      if (key) {
        quoteCache.set(key, {
          ...v.quote,
          status: 'live',
          fetched_at: new Date(),
        });
      }
    }

    if (okCount === 0) {
      consecutiveFails++;
      setAggregateStatus('failed');
    } else if (okCount < total) {
      consecutiveFails = 0;
      setAggregateStatus('stale');  // partial success
    } else {
      consecutiveFails = 0;
      setAggregateStatus('live');
    }
    notify();
  }

  function scheduleNext(watchlist, gen) {
    // Bail if a newer start() has bumped the generation
    if (gen !== watchlistGen) return;
    const idx = Math.min(consecutiveFails, POLL_BACKOFFS_MS.length - 1);
    const delay = consecutiveFails > 0 ? POLL_BACKOFFS_MS[idx] : POLL_BASE_MS;
    if (pollHandle) clearTimeout(pollHandle);
    pollHandle = setTimeout(() => {
      if (gen !== watchlistGen) return;  // generation check at wake-up too
      pollOnce(watchlist).finally(() => scheduleNext(watchlist, gen));
    }, delay);
  }

  // ---- Public API ----
  const api = {
    start(watchlist) {
      if (!Array.isArray(watchlist) || watchlist.length === 0) return;
      // Filter to symbols we can actually poll (currently US only — TW would
      // mislead with delayed data showing as LIVE).
      const pollable = watchlist.filter(s => yahooSymbol(s.symbol || s.ticker, s.market) != null);
      if (pollHandle) clearTimeout(pollHandle);
      pollHandle = null;
      consecutiveFails = 0;
      // Drop cached quotes for tickers no longer in the active set
      const activeTickers = new Set(
        pollable
          .map(s => String(s.symbol || s.ticker || '').toUpperCase())
          .filter(Boolean)
      );
      for (const key of Array.from(quoteCache.keys())) {
        if (!activeTickers.has(key)) quoteCache.delete(key);
      }
      // If nothing is pollable (watchlist is entirely TW for example), don't
      // start a polling loop — status stays 'idle' so UI shows SNAPSHOT honestly.
      if (pollable.length === 0) {
        aggregateStatus = 'idle';
        notify();
        return;
      }
      const gen = ++watchlistGen;
      pollOnce(pollable).finally(() => scheduleNext(pollable, gen));
    },

    stop() {
      if (pollHandle) clearTimeout(pollHandle);
      pollHandle = null;
    },

    subscribe(fn) {
      if (typeof fn === 'function') subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    getQuote(ticker) {
      const q = quoteCache.get(String(ticker).toUpperCase());
      if (!q) return null;
      const ageMs = Date.now() - q.fetched_at.getTime();
      const status = ageMs > STALE_THRESHOLD_MS ? 'stale' : 'live';
      return { ...q, status, age_ms: ageMs };
    },

    getStatus() {
      // Honor partial-failure: if the last poll round was 'stale' (mixed
      // success/failure) or 'failed', surface that instead of optimistically
      // reporting 'live' just because some entries are fresh.
      if (aggregateStatus === 'failed') return 'failed';
      if (aggregateStatus === 'stale')  return 'stale';
      // Otherwise base it on cache freshness
      const now = Date.now();
      let fresh = 0, stale = 0;
      for (const q of quoteCache.values()) {
        if (now - q.fetched_at.getTime() <= STALE_THRESHOLD_MS) fresh++;
        else stale++;
      }
      if (fresh > 0) return 'live';
      if (stale > 0) return 'stale';
      return aggregateStatus;  // 'idle'
    },

    // ISO time of the most recent successful fetch across all symbols
    getLastUpdated() {
      let max = 0;
      for (const q of quoteCache.values()) {
        const t = q.fetched_at.getTime();
        if (t > max) max = t;
      }
      return max === 0 ? null : new Date(max);
    },

    formatLastUpdated() {
      const d = api.getLastUpdated();
      if (!d) return '—';
      try {
        return new Intl.DateTimeFormat('zh-TW', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false, timeZone: 'Asia/Taipei',
        }).format(d) + ' 台北';
      } catch { return d.toISOString().slice(11, 19); }
    },
  };

  window.LivePrices = api;
})();
