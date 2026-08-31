// Build dataset for QDII fund NAV estimation dashboard
// Sources:
//  - Nasdaq API      : US ETF daily closes (incl. 2026-06-30 base)
//  - Tencent ifzq    : A-share ETF qfq daily klines
//  - Yahoo via allorigins proxy : Japan ETF (2644.T) daily closes
//  - chinamoney.com.cn : official RMB central parity (USD/CNY, 100JPY/CNY)
//  - qt.gtimg.cn     : realtime quotes (US intraday + A-share close)
//  - eastmoney pingzhongdata : official published NAV history
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..'); // 生成 data.json 到仓库根目录（qdii-publish）
const sleep = ms => new Promise(r => setTimeout(r, ms));

function req(url, { method = 'GET', headers = {}, body = null, timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = { method, hostname: u.hostname, path: u.pathname + u.search, headers };
    const r = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', e => resolve({ status: 'ERR', body: e.message }));
    r.setTimeout(timeout, () => { r.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
    if (body) r.write(body);
    r.end();
  });
}
async function getRetry(url, opts = {}, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await req(url, opts);
    if (last.status === 200 && last.body && last.body.length > 10) return last;
    await sleep(1200 * (i + 1));
  }
  throw new Error(`GET failed (${last.status}): ${url.slice(0, 90)} :: ${String(last.body).slice(0, 80)}`);
}
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const log = (...a) => console.log('[build]', ...a); // 模块级日志（main 内的同名局部变量会遮蔽此定义）

/* ---------------- fund definitions (from the two PDF quarterly reports) ---------------- */
const FUNDS = [
  {
    key: 'hb',
    nameFull: '华宝海外科技股票型证券投资基金（QDII-LOF）',
    nameShort: '海外科技LOF',
    codeA: '501312', codeC: '017204',
    reportDate: '2026-06-30',
    navA0: 2.4362, navC0: 2.4156,
    sharesA: 764363856.79, sharesC: 231456739.57,
    netAssetsA: 1862166774.88, netAssetsC: 559113004.06,
    totalAssets: 2585548235.16, fundInvestments: 2051362956.72,
    holdings: [
      { name: 'ARK Innovation ETF', ticker: 'ARKK', market: 'US', fv0: 447521490.59 },
      { name: 'ARK Genomic Revolution ETF', ticker: 'ARKG', market: 'US', fv0: 409830940.68 },
      { name: 'ARK Autonomous Technology & Robotics ETF', ticker: 'ARKQ', market: 'US', fv0: 245725082.53 },
      { name: 'Global X Artificial Intelligence & Technology ETF', ticker: 'AIQ', market: 'US', fv0: 153129276.45 },
      { name: 'Global X Robotics & Artificial Intelligence ETF', ticker: 'BOTZ', market: 'US', fv0: 122360710.95 },
      { name: 'ARK Space & Defense Innovation ETF', ticker: 'ARKX', market: 'US', fv0: 121125457.80 },
      { name: 'Technology Select Sector SPDR Fund', ticker: 'XLK', market: 'US', fv0: 113098622.53 },
      { name: 'VanEck Semiconductor ETF', ticker: 'SMH', market: 'US', fv0: 106395331.00 },
      { name: 'iShares Semiconductor ETF', ticker: 'SOXX', market: 'US', fv0: 80736817.25 },
      { name: 'Invesco QQQ Trust Series 1', ticker: 'QQQ', market: 'US', fv0: 79245638.81 },
    ],
  },
  {
    key: 'jsq',
    nameFull: '景顺长城全球半导体芯片产业股票型证券投资基金（QDII-LOF）',
    nameShort: '全球芯片LOF',
    codeA: '501225', codeC: '016668',
    reportDate: '2026-06-30',
    navA0: 3.7763, navC0: 3.7255,
    sharesA: 239211983.86, sharesC: 82806748.09,
    netAssetsA: 903349959.71, netAssetsC: 308499662.87,
    totalAssets: 1223535652.64, fundInvestments: 1131215717.33,
    holdings: [
      { name: 'Invesco Dynamic Semiconductors ETF', ticker: 'PSI', market: 'US', fv0: 220636586.42 },
      { name: 'iShares Semiconductor ETF', ticker: 'SOXX', market: 'US', fv0: 214581003.65 },
      { name: 'VanEck Semiconductor ETF', ticker: 'SMH', market: 'US', fv0: 214358649.63 },
      { name: 'Invesco PHLX Semiconductor ETF', ticker: 'SOXQ', market: 'US', fv0: 213589653.73 },
      { name: '华夏国证半导体芯片ETF', ticker: '159995', symbol: 'sz159995', market: 'CN', fv0: 93762315.00 },
      { name: '国泰CES半导体芯片行业ETF', ticker: '512760', symbol: 'sh512760', market: 'CN', fv0: 93052180.00 },
      { name: '景顺长城中证芯片产业ETF', ticker: '159560', symbol: 'sz159560', market: 'CN', fv0: 60210668.80 },
      { name: 'Global X Japan Semiconductor ETF', ticker: '2644.T', market: 'JP', currency: 'JPY', fv0: 21024660.10 },
    ],
  },
];

const ALL_US = [...new Set(FUNDS.flatMap(f => f.holdings.filter(h => h.market === 'US').map(h => h.ticker)))];
const ALL_CN = [...new Set(FUNDS.flatMap(f => f.holdings.filter(h => h.market === 'CN').map(h => h.symbol)))];

/* ---- 指数条：表格上方的市场基准 ---- */
// 用户指定代码：SP500-45(S&P500信息技术)、NDXTMC(纳指100科技市值加权)、
// SPSIBI(S&P生物科技精选行业)、NBI(纳斯达克生物技术)、SPX、NDX、DJI。
// 数据源可用性(2026-08实测)：NBI/SPX/NDX/DJI=腾讯实时；NDXTMC=CNBC接口；
// SP500-45与SPSIBI无公开免费源(Yahoo/TradingView/Stooq/CNBC均不可用)，以跟踪同一指数的 XLK / XBI 表征。
const INDICES = [
  { key: 'sp_it',    label: '标普信息科技', code: 'SP500-45', tvSym: 'S5INFT', yahooSym: '^SP500-45', etfCode: 'usXLK',  etfName: 'XLK' },
  { key: 'ndx_tech', label: '纳指科技',     code: 'NDXTMC',   cnbcSym: 'NDXTMC',    tvSym: 'NASDAQ:NDXTMC', etfCode: 'usQTEC', etfName: 'QTEC' },
  { key: 'sp_bio',   label: '标普生物',     code: 'SPSIBI',   tvSym: 'SP:SPSIBI',   yahooSym: '^SPSIBI',   etfCode: 'usXBI',  etfName: 'XBI' },
  { key: 'nbi',      label: '纳指生物',     code: 'NBI',      rtCode: 'usNBI' },
  { key: 'spx',      label: '标普500',      code: 'SPX',      rtCode: 'usINX' },
  { key: 'ndx',      label: '纳指100',      code: 'NDX',      rtCode: 'usNDX' },
];

async function fetchCnbcIndex(sym) {
  const url = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols='
    + encodeURIComponent(sym) + '&requestMethod=itv&noform=1&partnerId=2&output=json';
  const r = await getRetry(url, { headers: { Referer: 'https://www.cnbc.com/', 'User-Agent': BROWSER_UA } });
  const j = JSON.parse(r.body);
  const item = [].concat((j.FormattedQuoteResult || {}).FormattedQuote || [])[0];
  const pct = parseFloat(String((item && item.change_pct) || '').replace('%', '').replace('+', ''));
  if (!item || !isFinite(pct)) throw new Error('cnbc empty for ' + sym);
  return { chgPct: Math.round(pct * 100) / 100 };
}

// 真实指数日涨幅：TradingView 公开接口（机房可达性好）→ Yahoo 直连 → Yahoo 经公共代理
async function fetchRaw(urlStr, headers = {}, timeout = 12000) {
  return new Promise((resolve) => {
    const req = https.get(urlStr, { headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, setCookie: res.headers['set-cookie'] || [] }));
    });
    req.on('error', e => resolve({ status: 0, body: 'ERR ' + e.message, setCookie: [] }));
    req.setTimeout(timeout, () => { req.destroy(); resolve({ status: -1, body: 'TIMEOUT', setCookie: [] }); });
  });
}

async function fetchTvIndex(tvSym) {
  const url = 'https://scanner.tradingview.com/symbol?symbol=' + encodeURIComponent(tvSym)
    + '&fields=close,change&no_404=true';
  const r = await getRetry(url, { headers: { 'User-Agent': BROWSER_UA, Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' } }, 1);
  const j = JSON.parse(r.body);
  const pct = Number(j.change);
  if (!isFinite(pct)) throw new Error('tv no change');
  return { chgPct: Math.round(pct * 100) / 100, price: Number(j.close) || null };
}

// Yahoo 需要 cookie+crumb 才能从数据中心 IP 拿数据
async function fetchYahooIdxChg(symbol) {
  const UA = { 'User-Agent': BROWSER_UA };
  // 1) 取 cookie
  await fetchRaw('https://fc.yahoo.com', UA, 8000).catch(() => null);
  const r0 = await fetchRaw('https://finance.yahoo.com', UA, 8000);
  const cookie = r0.setCookie.map(c => c.split(';')[0]).join('; ');
  // 2) 取 crumb
  let crumb = '';
  if (cookie) {
    const r1 = await fetchRaw('https://query2.finance.yahoo.com/v1/test/getcrumb', { ...UA, Cookie: cookie, Referer: 'https://finance.yahoo.com/' }, 8000);
    if (r1.status === 200 && r1.body && r1.body.length < 24) crumb = r1.body.trim();
  }
  const suffix = crumb ? '&crumb=' + encodeURIComponent(crumb) : '';
  const path = '/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=10d&interval=1d' + suffix;
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  const proxies = [
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    u => 'https://api.cors.lol/?url=' + encodeURIComponent(u),
  ];
  let lastErr;
  const attempts = [
    () => fetchRaw(hosts[0] + path, { ...UA, Cookie: cookie }),
    () => fetchRaw(hosts[1] + path, { ...UA, Cookie: cookie }),
    ...[0, 1, 2].map(i => () => fetchRaw(proxies[i](hosts[0] + path))),
  ];
  for (const attempt of attempts) {
    try {
      const r = await attempt();
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const res = JSON.parse(r.body).chart.result[0];
      const cl = (res.indicators.quote[0].close || []).filter(v => isFinite(v));
      if (cl.length >= 2) return { chgPct: Math.round((cl[cl.length - 1] / cl[cl.length - 2] - 1) * 10000) / 100, price: cl[cl.length - 1] };
      lastErr = new Error('no closes');
    } catch (e) { lastErr = e instanceof Error ? e : new Error(String(e)); }
    await sleep(300);
  }
  throw lastErr || new Error('yahoo unreachable');
}

function assembleIndices(rt) {
  return Promise.all(INDICES.map(async ix => {
    // 1) 腾讯实时（真实指数）
    let out = null;
    if (ix.rtCode) {
      const q = rt[ix.rtCode];
      if (q && isFinite(q.price) && isFinite(q.prevClose) && q.prevClose)
        out = { chgPct: Math.round(q.chgPct * 100) / 100, price: q.price, rtCode: ix.rtCode, source: 'tencent-index' };
    }
    // 2) CNBC（真实指数，收盘口径；本地实测稳定）
    if (!out && ix.cnbcSym) {
      try {
        const c = await fetchCnbcIndex(ix.cnbcSym);
        out = { chgPct: c.chgPct, rtCode: null, source: 'cnbc-index' };
      } catch (e) { log('WARN cnbc failed for', ix.label, e.message.slice(0, 60)); }
    }
    // 3) TradingView 真实指数（机房可达性好；SPSIBI 已验证）
    if (!out && ix.tvSym) {
      try {
        const t = await fetchTvIndex(ix.tvSym);
        out = { chgPct: t.chgPct, price: t.price, rtCode: null, source: 'tradingview-index' };
      } catch (e) { log('WARN tradingview failed for', ix.label, ix.tvSym, '-', String(e.message).slice(0, 50)); }
    }
    // 4) Yahoo 真实指数（cookie+crumb → 直连 → 公共代理）
    if (!out && ix.yahooSym) {
      try {
        const y = await fetchYahooIdxChg(ix.yahooSym);
        out = { chgPct: y.chgPct, price: y.price, rtCode: null, source: 'yahoo-index' };
      } catch (e) { log('WARN yahoo index failed for', ix.label, ix.yahooSym, '-', String(e.message).slice(0, 50)); }
    }
    // 3) CNBC（真实指数，仅收盘口径）
    if (!out && ix.cnbcSym) {
      try {
        const c = await fetchCnbcIndex(ix.cnbcSym);
        out = { chgPct: c.chgPct, rtCode: null, source: 'cnbc-index' };
      } catch (e) { log('WARN cnbc failed for', ix.label, e.message.slice(0, 60)); }
    }
    // 5) 行业ETF表征（跟踪同一指数）
    if (!out && ix.etfCode) {
      const q = rt[ix.etfCode];
      if (q && isFinite(q.chgPct)) out = { chgPct: Math.round(q.chgPct * 100) / 100, price: q.price, rtCode: ix.etfCode, source: 'etf-proxy', viaEtf: true, etfName: ix.etfName };
    }
    if (!out) { log('WARN index missing:', ix.label); return null; }
    return { key: ix.key, label: ix.label, code: ix.code, chgPct: out.chgPct, price: out.price ?? null,
      rtCode: out.rtCode || null, viaEtf: !!out.viaEtf, etfName: ix.etfName || null, source: out.source };
  })).then(a => a.filter(Boolean));
}

/* ---------------- fetchers ---------------- */

async function fetchNasdaqHist(sym) {
  const from = '2026-06-24', to = '2026-08-26';
  const url = `https://api.nasdaq.com/api/quote/${sym}/historical?assetclass=etf&fromdate=${from}&todate=${to}&limit=60`;
  const r = await getRetry(url, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } });
  const j = JSON.parse(r.body);
  const rows = j.data && j.data.tradesTable && j.data.tradesTable.rows;
  if (!rows || !rows.length) throw new Error('nasdaq no rows for ' + sym);
  const map = {}; // date -> close
  for (const row of rows) {
    const [mm, dd, yyyy] = row.date.split('/');
    map[`${yyyy}-${mm}-${dd}`] = parseFloat(String(row.close).replace(/,/g, ''));
  }
  return map;
}

async function fetchTencentKline(symbol) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,2026-06-24,2026-08-26,60,qfq`;
  const r = await getRetry(url);
  const j = JSON.parse(r.body);
  const d = j.data[symbol];
  const arr = d.qfqday || d.day;
  if (!arr || !arr.length) throw new Error('tencent kline empty for ' + symbol);
  const map = {};
  for (const row of arr) map[row[0]] = parseFloat(row[2]);
  return map;
}

// Real Yahoo-via-proxy captures taken during source verification (fallback only).
const JP_FALLBACK = {
  '2026-06-25': 5025, '2026-06-26': 4784, '2026-06-29': 4794, '2026-06-30': 4940,
  '2026-07-01': 5172, '2026-07-02': 4833, '2026-07-03': 5009, '2026-07-06': 4886,
  '2026-07-07': 4667, '2026-07-08': 4518, '2026-07-09': 4735, '2026-07-10': 4851,
  '2026-07-13': 4728, '2026-07-14': 4739, '2026-07-15': 4917, '2026-07-16': 4671,
  '2026-07-17': 4233, '2026-07-21': 4383, '2026-07-22': 4396, '2026-07-23': 4479,
  '2026-07-24': 4252,
};

async function fetchYahooProxy(symbol, offsetHours) {
  const period1 = Math.floor(Date.UTC(2026, 5, 23) / 1000); // 2026-06-23
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
  const proxies = [
    u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    u => 'https://api.cors.lol/?url=' + encodeURIComponent(u),
  ];
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const wrap = proxies[attempt % proxies.length];
    try {
      const r = await getRetry(wrap(target), {}, 1);
      const j = JSON.parse(r.body);
      const res = j.chart.result[0];
      const ts = res.timestamp || [];
      const cl = res.indicators.quote[0].close || [];
      const map = {};
      for (let i = 0; i < ts.length; i++) {
        if (cl[i] == null) continue;
        const dstr = new Date((ts[i] + offsetHours * 3600) * 1000).toISOString().slice(0, 10);
        map[dstr] = cl[i];
      }
      return { map, live: true };
    } catch (e) { lastErr = e; await sleep(20000); }
  }
  throw lastErr;
}

// Minkabu server-rendered quote page: latest close for Tokyo-listed ETF
async function fetchMinkabuLatest(code) {
  const r = await getRetry('https://minkabu.jp/stock/' + code, { headers: { 'User-Agent': BROWSER_UA } });
  const blockM = r.body.match(/stock_price">\s*([0-9,]+)(?:\.<span[^>]*>(\d+))?</);
  const dateM = r.body.match(/\((\d{2})\/(\d{2})\)<\/span>/);
  if (!blockM) throw new Error('minkabu price not found');
  const price = parseFloat(blockM[1].replace(/,/g, '') + '.' + (blockM[2] || '0'));
  // daily diff vs previous close, e.g. <span class="up label dpib">+25.0(+0.63%)</span>
  let prevClose = null, dailyChgPct = null;
  const diffM = r.body.match(/stock_price_diff"><span class="(?:up|down)[^"]*">([+-]?[\d,.]+)\(([+-]?[\d.]+)%\)</);
  if (diffM) {
    dailyChgPct = parseFloat(diffM[2]);
    prevClose = +(price - parseFloat(diffM[1].replace(/,/g, ''))).toFixed(1);
  }
  let date = null;
  if (dateM) {
    // year inferred: latest occurrence <= today
    const now = new Date();
    let y = now.getUTCFullYear();
    if (+dateM[1] > now.getUTCMonth() + 1) y -= 1;
    date = `${y}-${dateM[1]}-${dateM[2]}`;
  }
  return { price, date, prevClose, dailyChgPct };
}

async function fetchParity(currency) {
  const qs = `lang=CN&startDate=2026-06-20&endDate=2026-08-26&currency=${encodeURIComponent(currency)}&pageNum=1&pageSize=50`;
  const r = await getRetry('https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew?' + qs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': BROWSER_UA, Referer: 'https://www.chinamoney.com.cn/chinese/bkccpr/' },
  });
  const j = JSON.parse(r.body);
  const records = j.records || [];
  if (!records.length) throw new Error('parity empty for ' + currency);
  const map = {};
  for (const rec of records) map[rec.date] = parseFloat(rec.values[0]);
  return map;
}

async function fetchRealtimeQuotes(codes) {
  const r = await getRetry('https://qt.gtimg.cn/q=' + codes.join(','));
  const out = {};
  for (const m of r.body.matchAll(/v_([a-z]{2}[A-Za-z0-9]+)="([^"]*)"/g)) {
    const f = m[2].split('~');
    if (f.length < 32) continue;
    out[m[1]] = { price: parseFloat(f[3]), prevClose: parseFloat(f[4]), rawTime: f[30], chgPct: parseFloat(f[32]) };
  }
  return out;
}

async function fetchEastmoneyNAV(code) {
  const r = await getRetry('https://fund.eastmoney.com/pingzhongdata/' + code + '.js', { headers: { Referer: 'https://fund.eastmoney.com/', 'User-Agent': BROWSER_UA } });
  const m = r.body.match(/Data_netWorthTrend\s*=\s*(\[.*?\]);/s);
  if (!m) return null;
  const arr = JSON.parse(m[1]);
  const map = {};
  for (const p of arr) map[new Date(p.x + 8 * 3600 * 1000).toISOString().slice(0, 10)] = p.y; // timestamps are Beijing time
  return map; // date -> unit nav
}

function fmtNowCn(d) { return d.toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '-'); }

/* ---------------- main ---------------- */
(async () => {
  const log = (...a) => console.log('[build]', ...a);
  log('fetching US histories via nasdaq...');
  const usMaps = {};
  for (const sym of ALL_US) { usMaps[sym] = await fetchNasdaqHist(sym); log('  us', sym, 'days', Object.keys(usMaps[sym]).length, 'jun30=', usMaps[sym]['2026-06-30']); await sleep(350); }

  log('fetching CN klines via tencent...');
  const cnMaps = {};
  for (const s of ALL_CN) { cnMaps[s] = await fetchTencentKline(s); log('  cn', s, 'days', Object.keys(cnMaps[s]).length, 'jun30=', cnMaps[s]['2026-06-30']); await sleep(250); }

  let jpMap = null, jpSource = 'unavailable', jpLatest = null;
  try {
    const jp = await fetchYahooProxy('2644.T', 9); // Tokyo UTC+9
    jpMap = jp.map; jpSource = 'Yahoo Finance via CORS proxy (2644.T 日收盘)';
    log('JP 2644.T days', Object.keys(jpMap).length, 'jun30=', jpMap['2026-06-30']);
  } catch (e) {
    log('WARN japan proxy failed, using captured snapshot + minkabu latest:', String(e.message).slice(0, 90));
    jpMap = { ...JP_FALLBACK };
    try {
      const mk = await fetchMinkabuLatest('2644');
      if (mk.date) { jpMap[mk.date] = mk.price; jpLatest = mk; jpSource = `已验证快照(Yahoo 6/25-7/24) + minkabu.jp 最新(${mk.date})`; }
      log('minkabu 2644:', JSON.stringify(mk));
    } catch (e2) { log('WARN minkabu failed too:', e2.message); }
  }

  log('fetching FX central parity...');
  const usdcnyMap = await fetchParity('USD/CNY');
  const jpycny100Map = await fetchParity('100JPY/CNY');
  const fxBaseDate = '2026-06-30';
  const usdcny0 = usdcnyMap[fxBaseDate], jp100_0 = jpycny100Map[fxBaseDate];
  const latestParDates = Object.keys(usdcnyMap).sort();
  const latestFxDate = latestParDates[latestParDates.length - 1];
  const usdcnyLast = usdcnyMap[latestFxDate], jp100Last = jpycny100Map[latestFxDate] ?? jpyprevFallback();
  function jpyprevFallback() { const ds = Object.keys(jpycny100Map).sort(); return jp100Last = jp100Last || jpycny100Map[ds[ds.length - 1]]; }
  log('fx usdcny 6/30=', usdcny0, 'latest(', latestFxDate, ')=', usdcnyLast, '| jpycny 6/30=', jp100_0 / 100, 'latest=', jp100Last / 100);

  log('fetching realtime quotes...');
  const rtCodes = [...ALL_US.map(t => 'us' + t), ...ALL_CN,
    ...INDICES.flatMap(i => [i.rtCode, i.etfCode]).filter(Boolean)];
  const rt = await fetchRealtimeQuotes(rtCodes);
  const rtSample = rt['usARKK'];
  log('rt sample usARKK:', JSON.stringify(rtSample));
  const indicesOut = await assembleIndices(rt);
  log('indices strip:', indicesOut.map(i => i.label + '(' + i.code + (i.viaEtf ? '~' + i.etfName : '') + ') ' + (i.chgPct > 0 ? '+' : '') + i.chgPct + '%').join(' | '));

  log('fetching official NAV series (eastmoney)...');
  const offMaps = {};
  for (const code of ['501312', '017204', '501225', '016668']) {
    try { offMaps[code] = await fetchEastmoneyNAV(code); const ks = Object.keys(offMaps[code] || {}).sort(); log('  nav', code, 'points', ks.length, 'last', ks[ks.length - 1], '=', offMaps[code][ks[ks.length - 1]]); }
    catch (e) { log('  nav', code, 'FAILED:', e.message); }
    await sleep(300);
  }

  /* ---- compute ---- */
  const fx = {
    usdcny0, usdcnyLast, usdcnyLastDate: latestFxDate,
    jpycny0: jp100_0 / 100, jpycnyLast: jp100Last / 100,
    source: '中国外汇交易中心人民币汇率中间价 (chinamoney.com.cn)',
  };

  // master trading-date list: union of all maps, >= 2026-06-30, sorted
  const dateSet = new Set();
  for (const m of [...Object.values(usMaps), ...Object.values(cnMaps)]) for (const d of Object.keys(m)) if (d >= '2026-06-30') dateSet.add(d);
  if (jpMap) for (const d of Object.keys(jpMap)) if (d >= '2026-06-30') dateSet.add(d);
  for (const d of latestParDates) if (d >= '2026-06-30') dateSet.add(d);
  const dates = [...dateSet].sort();

  // per-market fx on each date (parity; carry forward)
  const usdByDate = {}, jpyByDate = {};
  let lu = null, lj = null;
  for (const d of dates) {
    if (usdcnyMap[d]) lu = usdcnyMap[d];
    if (jpycny100Map[d]) lj = jpycny100Map[d] / 100;
    usdByDate[d] = lu; jpyByDate[d] = lj;
  }

  const priceOf = (h, d) => h.market === 'US' ? (usMaps[h.ticker] || {})[d]
    : h.market === 'CN' ? (cnMaps[h.symbol] || {})[d]
      : (jpMap ? jpMap[d] : undefined);

  // build fund computations
  const fundsOut = [];
  for (const f of FUNDS) {
    const netTotal = f.netAssetsA + f.netAssetsC;
    // 静态部分按"净资产-基金投资"计（已扣除负债），这样报告日 est NAV 恰好等于披露净值
    const otherNetAssets = netTotal - f.fundInvestments;
    const disclosedSum = f.holdings.reduce((s, h) => s + h.fv0, 0);
    const residualFV = f.fundInvestments - disclosedSum;
    const liabTotal = f.totalAssets - netTotal;

    const holdingsOut = [];
    let warnSplits = [];
    for (const h of f.holdings) {
      const cur = h.market === 'US' ? 'USD' : h.market === 'CN' ? 'CNY' : 'JPY';
      const p0raw = priceOf(h, f.reportDate);
      if (p0raw == null) throw new Error(`missing base price ${h.ticker} ${f.reportDate}`);
      const fx0 = cur === 'USD' ? usdcny0 : cur === 'JPY' ? fx.jpycny0 : 1;
      const p0cny = p0raw * fx0;
      const qty = h.fv0 / p0cny;

      // split sanity check on raw-ish series (US/JP): flag >35% one-day moves
      const srcMap = h.market === 'US' ? usMaps[h.ticker] : h.market === 'JP' ? (jpMap || {}) : null;
      if (srcMap) {
        const ds = Object.keys(srcMap).sort();
        for (let i = 1; i < ds.length; i++) {
          const ch = srcMap[ds[i]] / srcMap[ds[i - 1]] - 1;
          if (Math.abs(ch) > 0.35) warnSplits.push(`${h.ticker} ${ds[i]} ${(ch * 100).toFixed(1)}%`);
        }
      }

      holdingsOut.push({
        name: h.name, ticker: h.ticker, symbol: h.symbol || null, market: h.market, currency: cur,
        fv0: h.fv0,
        weight0Pct: +(h.fv0 / netTotal * 100).toFixed(2),
        p0: p0raw, fx0, p0Cny: p0cny, qty,
        qtyDisp: qty >= 1e6 ? Math.round(qty).toLocaleString('en-US') : qty.toFixed(2),
      });
    }

    // residual bucket (undisclosed smaller positions) moves with weighted avg of disclosed
    const wSum = disclosedSum;

    // daily series + latest
    const series = [];
    const carry = {}; // ticker -> last known {price, cur}
    for (const d of dates) {
      let portVal = 0, disclosedVal = 0;
      for (const h of holdingsOut) {
        const p = priceOf({ ticker: h.ticker, symbol: h.symbol, market: h.market }, d);
        const cur = h.currency;
        const fxd = cur === 'USD' ? usdByDate[d] : cur === 'JPY' ? jpyByDate[d] : 1;
        let eff = null;
        if (p != null && fxd != null) { eff = { p, fxd }; carry[h.ticker] = eff; }
        else eff = carry[h.ticker];
        if (!eff) continue;
        const valCny = h.qty * eff.p * eff.fxd;
        portVal += valCny;
        disclosedVal += valCny;
      }
      if (disclosedSum > 0 && residualFV > 0) portVal += residualFV * (disclosedVal / disclosedSum);
      else if (residualFV > 0 && disclosedSum === 0) portVal += residualFV;
      const estTotal = otherNetAssets + portVal;
      series.push({
        date: d,
        estNavA: +(f.navA0 * estTotal / netTotal).toFixed(4),
        estNavC: +(f.navC0 * estTotal / netTotal).toFixed(4),
        officialA: (offMaps[f.codeA] || {})[d] ?? null,
        officialC: (offMaps[f.codeC] || {})[d] ?? null,
      });
    }

    // latest point: prefer realtime quotes for US/CN
    const rtTimeNote = { us: null, cn: null };
    let portValLive = 0, discValLive = 0;
    for (const h of holdingsOut) {
      const cur = h.currency;
      let eff = null, src = null, prevClose = null, dailyChg = null;
      if (h.market === 'US' && rt['us' + h.ticker]) {
        const q = rt['us' + h.ticker];
        if (q.price > 0) { eff = { p: q.price, fxd: fx.usdcnyLast }; src = 'qt-intraday'; rtTimeNote.us = q.rawTime; prevClose = q.prevClose; dailyChg = q.chgPct; }
      }
      if (!eff && h.market === 'CN' && rt[h.symbol] && rt[h.symbol].price > 0) {
        const q = rt[h.symbol];
        eff = { p: q.price, fxd: 1 }; src = 'qt-close'; rtTimeNote.cn = q.rawTime; prevClose = q.prevClose; dailyChg = q.chgPct;
      }
      if (!eff) {
        // fall back to last known close (already forward-filled during series build)
        const p = priceOf(h, dates[dates.length - 1]);
        const fxd = cur === 'USD' ? usdByDate[dates[dates.length - 1]] : cur === 'JPY' ? jpyByDate[dates[dates.length - 1]] : 1;
        if (p != null) { eff = { p, fxd }; src = 'eod'; }
        else if (carry[h.ticker]) { eff = carry[h.ticker]; src = 'eod-carry'; }
      }
      if (!eff) throw new Error(`no price at all for ${h.ticker}`);
      // 前一日收盘与当日涨幅（美股即上一美股交易日收盘）
      if (prevClose == null || !isFinite(dailyChg)) {
        if (h.market === 'JP' && jpLatest && jpLatest.dailyChgPct != null) { prevClose = jpLatest.prevClose; dailyChg = jpLatest.dailyChgPct; }
        else {
          const ds2 = dates.filter(d => priceOf(h, d) != null);
          const lastD = ds2[ds2.length - 1], prevD = ds2[ds2.length - 2];
          if (prevD && (new Date(lastD) - new Date(prevD)) <= 5 * 86400000) {
            const pl = priceOf(h, lastD), pp = priceOf(h, prevD);
            prevClose = pp; dailyChg = +((pl / pp - 1) * 100).toFixed(2);
          }
        }
      }
      h.prevClose = prevClose; h.dailyChgPct = (dailyChg != null && isFinite(dailyChg)) ? +(+dailyChg).toFixed(2) : null;
      h.pLast = eff.p; h.fxLast = eff.fxd; h.pLastSrc = src;
      h.chgPct = +((eff.p * eff.fxd / ((cur === 'USD' ? usdcny0 : cur === 'JPY' ? fx.jpycny0 : 1) * h.p0) - 1) * 100).toFixed(2);
      h.valLast = h.qty * eff.p * eff.fxd;
      portValLive += h.valLast; discValLive += h.valLast;
    }
    const residLive = residualFV > 0 ? residualFV * (discValLive / disclosedSum) : 0;
    const estTotLive = otherNetAssets + portValLive + residLive;
    const estNavA_live = +(f.navA0 * estTotLive / netTotal).toFixed(4);
    const estNavC_live = +(f.navC0 * estTotLive / netTotal).toFixed(4);

    // recompute weightNow against estimated total assets, then sort by weight desc (display order)
    for (const h of holdingsOut) h.weightNowPct = +(h.valLast / estTotLive * 100).toFixed(2);
    holdingsOut.sort((a, b) => b.weightNowPct - a.weightNowPct);

    // 整个基金较前日收盘涨幅：组合市值 ÷ 前收市值 − 1（静态项不变，未披露持仓随组合平均）
    let portValPrev = 0;
    for (const h of holdingsOut) {
      const pc = (h.prevClose != null && h.prevClose > 0) ? h.prevClose : h.pLast;
      portValPrev += h.qty * pc * h.fxLast;
    }
    const residPrev = residualFV > 0 ? residualFV * (portValPrev / (disclosedSum || 1)) : 0;
    const estTotPrev = otherNetAssets + portValPrev + residPrev;
    const fundDailyChgPct = +((estTotLive / estTotPrev - 1) * 100).toFixed(2);
    const estNavAPrev = +(f.navA0 * estTotPrev / netTotal).toFixed(4);

    const lastOffA = (() => { const m = offMaps[f.codeA]; if (!m) return null; const ks = Object.keys(m).filter(k => k <= dates[dates.length - 1]).sort(); return ks.length ? { date: ks[ks.length - 1], navA: m[ks[ks.length - 1]] } : null; })();
    const lastOffC = (() => { const m = offMaps[f.codeC]; if (!m) return null; const ks = Object.keys(m).filter(k => k <= dates[dates.length - 1]).sort(); return ks.length ? { date: ks[ks.length - 1], navC: m[ks[ks.length - 1]] } : null; })();

    fundsOut.push({
      key: f.key, nameFull: f.nameFull, nameShort: f.nameShort,
      codeA: f.codeA, codeC: f.codeC, reportDate: f.reportDate,
      navA0: f.navA0, navC0: f.navC0,
      sharesA: f.sharesA, sharesC: f.sharesC,
      netAssetsTotal: netTotal, totalAssets: f.totalAssets, fundInvestments: f.fundInvestments,
      liabilities: liabTotal, otherNetAssets, disclosedSum, residualFV,
      holdings: holdingsOut,
      residual: { fv0: residualFV, note: '报告未披露的其余基金持仓（按已披露持仓平均涨幅估算）' },
      series,
      live: {
        estNavA: estNavA_live, estNavC: estNavC_live,
        chgSinceReportA: +((estNavA_live / f.navA0 - 1) * 100).toFixed(2),
        chgSinceReportC: +((estNavC_live / f.navC0 - 1) * 100).toFixed(2),
        estTotalAssetsCny: estTotLive,
        fundDailyChgPct, estNavAPrev,
        officialLatestA: lastOffA, officialLatestC: lastOffC,
        usQuoteTime: rtTimeNote.us, cnQuoteTime: rtTimeNote.cn,
      },
      warnings: warnSplits,
    });
    log('fund computed:', f.nameShort, 'est NAV A now =', estNavA_live, '(reported', f.navA0, ') official latest:', JSON.stringify(lastOffA));
  }

  const data = {
    generatedAt: fmtNowCn(new Date()) + ' (北京时间, 构建时点)',
    disclaimer: '基于基金2026年第2季度报告披露的持仓，按各市场收盘价与官方汇率中间价折算持仓数量；最新净值为按最新可得价格推算的估算值，非官方公布净值。估算未考虑报告日后申购赎回、调仓、费用及披露滞后影响。',
    fx,
    funds: fundsOut,
    indices: indicesOut,
    sources: {
      usHistory: 'api.nasdaq.com (日收盘价)',
      cnHistory: '腾讯行情 web.ifzq.gtimg.cn (前复权日线, 自动处理份额拆分)',
      jpHistory: jpSource,
      fx: 'chinamoney.com.cn 人民币汇率中间价',
      realtime: 'qt.gtimg.cn 腾讯实时行情',
      officialNav: '东方财富 fund.eastmoney.com 官方公布净值',
    },
  };

  fs.writeFileSync(path.join(OUT_DIR, 'data.json'), JSON.stringify(data, null, 1), 'utf8');
  log('WROTE', path.join(OUT_DIR, 'data.json'), (fs.statSync(path.join(OUT_DIR, 'data.json')).size / 1024).toFixed(1) + 'KB');

  // sanity summary
  for (const f of fundsOut) {
    console.log('\n=== ' + f.nameShort + ' ===');
    console.log('holdings:', f.holdings.map(h => `${h.ticker} qty=${(+h.qty).toFixed(0)} chg=${h.chgPct}%`).join('\n  '));
    console.log('est NAV A:', f.live.estNavA, 'chg%:', f.live.chgSinceReportA, '| official:', JSON.stringify(f.live.officialLatestA));
  }
})().catch(e => { console.error('BUILD FAILED:', e); process.exit(1); });
