// 「下周大事」数据抓取：经济日历 / 财报日历 / 指数成分股变动 / 下次预定调整窗口
//
// 数据源（均为公开接口，无需 key）：
//   - TradingView 经济日历 economic-calendar.tradingview.com（公开 JSON，字段含 actual/forecast/previous/category/unit）
//     仅取美国（countries=US）——按需求「主要是美国的重要数据，中欧就算了」
//   - Nasdaq 财报日历 api.nasdaq.com/api/calendar/earnings（按日查询）
//   - Wikipedia API（一次批量查 4 个条目，避免限流）：
//       Historical components of the S&P 500 / of the Nasdaq-100  → 变动表 id="changes"，
//         Refs 列即 S&P DJI / Nasdaq 官方新闻稿链接
//       List of S&P 500 companies / List of NASDAQ-100 companies   → 当前成分，用于给财报标注行业与所属指数
//
// 注意 importance 字段不可靠（实测整月只有 -1/0/1 三档，连美国 CPI 都标 1），故「大事」用标题白名单筛，
// 不用 importance；未命中白名单的降级到 other 桶，前端折叠显示，避免误杀。
'use strict';
const https = require('https');

// Wikimedia 要求 UA 表明身份与联系方式（用浏览器 UA 会被限流）；但 Nasdaq / TradingView 反过来
// 只接受浏览器 UA——故两个 UA 分开用，别混。
const UA = 'qdii-nav-dashboard/1.0 (https://github.com/snowelf306/snowelf306.github.io; snowelf306@gmail.com)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 成分股变动的时间窗口：保留生效日在「最近 N 天」内、以及已公告但生效日在未来的记录；更早的丢弃 */
const CHANGE_WINDOW_DAYS = 30;

/** 「重要的事」白名单（严格档）：只留市场真正盯的美国数据。小的（房地产、贸易帐、地区联储调查、
 *  各种子项与终值、委员讲话）一律不进列表，只在页面底部以条数备注体现。 */
const HEADLINE = new RegExp(
  '^(' + [
    // 通胀
    'Inflation Rate', 'Core Inflation Rate', 'Core PCE', 'PCE Price Index', 'PPI', 'Core PPI', 'Producer Prices',
    // 就业
    'Nonfarm Payrolls', 'Unemployment Rate', 'Initial Jobless Claims', 'Continuing Jobless Claims', 'ADP Employment', 'Average Hourly Earnings',
    // 货币政策
    'Interest Rate', 'FOMC', 'Fed Chair', 'Beige Book',
    // 增长与消费
    'GDP', 'Retail Sales', 'Durable Goods', 'Personal Spending', 'Personal Income',
    // 景气度
    'ISM ', 'Composite PMI', 'Manufacturing PMI', 'Services PMI', 'Consumer Confidence', 'Michigan Consumer',
    // 美股休市日
    'Columbus Day', 'Christmas', 'Thanksgiving', 'Independence Day', 'Labor Day', 'New Year', 'Good Friday', 'Memorial Day', 'Juneteenth', 'Veterans Day', 'Martin Luther King',
  ].join('|') + ')',
  'i',
);
/** 命中白名单但属于子项/终值/次要口径的，仍剔除 */
const SUBITEM = /(Ex Food|Ex Autos|Ex Gas|Control Group|Final|s\.a\b|MoM Final|4-week|Weekly|Employment Index|New Orders|Prices Paid|CAPEX|Inventories|Capacity Utilization|Manufacturing Production|Import Prices|Export Prices|TIC Flows|Capital Flows|Monthly Budget|Vehicle Sales|NY Fed|Real Earnings|Real Weekly|Real Hourly|Prelim|Preliminary|^(PPI|CPI|Core PPI|Core CPI)(\s*\(|$))/i;
/** 央行讲话：只留主席级（Fed Chair），委员讲话属"小事" */
const PRINCIPAL_SPEECH = /^Fed Chair/i;

function isHeadline(e) {
  if (e.indicator === 'Holidays') return true;
  if (SUBITEM.test(e.title || '')) return false;
  if (HEADLINE.test(e.title || '')) return true;
  if (PRINCIPAL_SPEECH.test(e.title || '')) return true;
  return false;
}

function req(url, { headers = {}, timeout = 25000 } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const r = https.request(
      { method: 'GET', hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': BROWSER_UA, ...headers } },
      (res) => {
        let d = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, body: d, location: res.headers.location || null }));
      },
    );
    r.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message, location: null }));
    r.setTimeout(timeout, () => { r.destroy(); resolve({ status: -1, body: 'TIMEOUT', location: null }); });
    r.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await req(url, { headers });
    if (r.status === 200 && r.body) {
      try { return JSON.parse(r.body); } catch (e) { last = e; }
    } else {
      last = new Error('HTTP ' + r.status);
      // 429/5xx 退避重试（Wikimedia 与 Nasdaq 都会限流）
      if (r.status === 429 || r.status >= 500 || r.status === 0 || r.status === -1) await sleep(1500 * (i + 1));
    }
  }
  throw last || new Error('getJson failed: ' + url);
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400e3);

/** 本周（周一~周五）的日期区间；周六/周日构建时自动滚到下一周——配合 CI 的 UTC 周六定时 */
function upcomingWeek(now = new Date()) {
  const dow = now.getUTCDay(); // 0=周日
  const backToMon = (dow + 6) % 7; // 周一=0
  const thisMon = addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), -backToMon);
  const start = dow === 0 || dow === 6 ? addDays(thisMon, 7) : thisMon;
  return { start: ymd(start), end: ymd(addDays(start, 4)) };
}

/** 第三个周五（用于推算指数预定调整窗口） */
function thirdFriday(year, month1to12) {
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const firstFri = 1 + ((5 - first.getUTCDay() + 7) % 7);
  return ymd(new Date(Date.UTC(year, month1to12 - 1, firstFri + 14)));
}

/* ---------------- 1) 经济日历 ---------------- */
async function fetchEconomicEvents(start, end) {
  const url = 'https://economic-calendar.tradingview.com/events'
    + `?from=${start}T00:00:00.000Z&to=${end}T23:59:59.000Z&countries=US`;
  const j = await getJson(url, { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' });
  const all = j.result || [];
  const shape = (e) => ({
    date: e.date, country: e.country, title: e.title,
    indicator: e.indicator || null, category: e.category || null,
    period: e.period || null, unit: e.unit || null,
    previous: e.previous ?? null, forecast: e.forecast ?? null, actual: e.actual ?? null,
    // 「没发生过」= 还没有 actual；前端据此突出显示
    released: e.actual !== null && e.actual !== undefined,
    source: e.source || null,
  });
  const headline = [];
  const other = [];
  for (const e of all) (isHeadline(e) ? headline : other).push(shape(e));
  headline.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  other.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { events: headline, other: other, scanned: all.length };
}

/* ---------------- 2) Wikipedia：一次批量取 4 页 ---------------- */
const PAGES = {
  spList: 'List of S&P 500 companies',
  spChanges: 'Historical components of the S&P 500',
  ndxList: 'List of NASDAQ-100 companies',
  ndxChanges: 'Historical components of the Nasdaq-100',
};

async function fetchWikitexts(pages) {
  const titles = Object.values(pages).map(encodeURIComponent).join('|');
  const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main'
    + `&format=json&formatversion=2&redirects=1&titles=${titles}`;
  const j = await getJson(url, { 'User-Agent': UA, Accept: 'application/json' });
  const byTitle = new Map();
  for (const p of j.query?.pages || []) {
    const txt = p.revisions?.[0]?.slots?.main?.content;
    if (txt) byTitle.set(p.title, txt);
  }
  const out = {};
  for (const [k, title] of Object.entries(pages)) {
    // 重定向后标题可能变，做一次模糊匹配
    let t = byTitle.get(title);
    if (!t) for (const [k2, v] of byTitle) if (k2.toLowerCase().startsWith(title.slice(0, 18).toLowerCase())) { t = v; break; }
    out[k] = t || '';
  }
  return out;
}

/** 去掉 wiki 标记，留纯文本 */
function wikiText(s) {
  return String(s)
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{cite[^}]*\}\}/gi, '')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 把一个 wikitable 切成「每行一组单元格」。
 *  两种实际写法都要吃下：
 *    a) 单行多格：| ADBE || [[Adobe Inc.]] || Technology || Software
 *    b) 每格一行：|| {{NyseSymbol|MMM}} / || [[3M]] / || Industrials / …
 *  注意按 "||"（双竖线）切，不能按单个 "|" —— 公司名里的 wikilink 会带单竖线
 *  （如 [[AMD|Advanced Micro Devices]]），按单竖线切会把一格拆成两格。 */
function tableRows(wikitext) {
  const t0 = String(wikitext).indexOf('id="constituents"');
  if (t0 < 0) return [];
  const tEnd = String(wikitext).indexOf('\n|}', t0);
  const table = String(wikitext).slice(t0, tEnd < 0 ? undefined : tEnd);
  const out = [];
  for (const raw of table.split(/\n\s*\|-/).slice(1)) {
    const lines = raw.split('\n').filter((l) => /^\s*\|/.test(l) && !/^\s*\|[!}+\-]/.test(l));
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*\|\|/.test(l))) {
      out.push(lines.map((l) => l.replace(/^\s*\|\|\s?/, '').trim()));
    } else if (lines.length === 1) {
      out.push(lines[0].replace(/^\s*\|\s?/, '').split('||').map((s) => s.trim()));
    } else {
      out.push(lines.map((l) => l.replace(/^\s*\|+\s?/, '').trim()));
    }
  }
  return out;
}

/** 当前成分：ticker -> {name, sector, industry} */
function parseConstituents(spWikitext, ndxWikitext) {
  // 标普500：格序 = 符号(模板 {{NyseSymbol|MMM}} 等) / 证券名 / GICS 行业 / 子行业 / 总部 / 纳入日 / CIK
  const sp500 = new Map();
  for (const cells of tableRows(spWikitext)) {
    if (cells.length < 4) continue;
    const ticker = (cells[0].match(/\{\{[^|}]*\|([A-Z0-9.\-]{1,7})\}\}/) || [])[1]
      || (cells[0].match(/^([A-Z][A-Z0-9.\-]{0,6})$/) || [])[1];
    if (!ticker) continue;
    sp500.set(ticker, { name: wikiText(cells[1]), sector: wikiText(cells[2]), industry: wikiText(cells[3]) });
  }
  // 纳指100：格序 = 代码 / 公司 / ICB 行业 / ICB 子行业
  const ndx = new Map();
  for (const cells of tableRows(ndxWikitext)) {
    if (cells.length < 4) continue;
    const ticker = cells[0];
    if (!/^[A-Z][A-Z0-9.\-]{0,6}$/.test(ticker)) continue;
    ndx.set(ticker, { name: wikiText(cells[1]), sector: wikiText(cells[2]), industry: wikiText(cells[3]) });
  }
  return { sp500, ndx };
}

/** 半导体/科技判定 */
const SEMI_INDUSTRY = /Semiconductor/i;
const TECH_SECTOR = /Information Technology|Technology/i;
/** 两个指数都不含、但属于半导体/科技核心的名字（ADT 等海外上市或双重上市）——用于财报标注的补充 */
const EXTRA_SEMI = new Set(['TSM', 'ASML', 'UMC', 'ASE', 'STM', 'NXPI', 'ON', 'MPWR', 'ENTG', 'TER', 'COHR', 'LSCC', 'ALAB', 'CRDO', 'RMBS', 'AMBA', 'SITM', 'AXTI', 'ACLS', 'ONTO', 'CAMT', 'FORM', 'KLIC', 'VECO', 'POWI', 'DIOD', 'SLAB', 'AOSL', 'MTSI']);

/* ---------------- 3) 财报日历（按日） ---------------- */
async function fetchWeekEarnings(start, end, constituents) {
  const days = [];
  for (let d = new Date(start + 'T00:00:00Z'); ymd(d) <= end; d = addDays(d, 1)) days.push(ymd(d));
  const out = [];
  let scanned = 0;
  for (const day of days) {
    const j = await getJson(`https://api.nasdaq.com/api/calendar/earnings?date=${day}`, { Accept: 'application/json' }, 2).catch(() => null);
    const rows = (j && j.data && j.data.rows) || [];
    scanned += rows.length;
    for (const r of rows) {
      const sym = String(r.symbol || '').trim();
      if (!sym) continue;
      const sp = constituents.sp500.get(sym) || null;
      const nd = constituents.ndx.get(sym) || null;
      const industry = (nd && nd.industry) || (sp && sp.industry) || null;
      const sector = (nd && nd.sector) || (sp && sp.sector) || null;
      const tags = [];
      if (nd) tags.push('纳指100');
      if (sp) tags.push('标普500');
      if ((industry && SEMI_INDUSTRY.test(industry)) || EXTRA_SEMI.has(sym)) tags.push('半导体');
      else if (sector && TECH_SECTOR.test(sector)) tags.push('科技');
      out.push({
        date: day, symbol: sym, name: r.name || null,
        time: r.time || null, epsForecast: r.epsForecast || null,
        sector, industry, tags,
        // 「重点」= 半导体/科技相关，或本身是标普500 / 纳指100 成分
        key: tags.some((t) => t === '半导体' || t === '科技' || t === '标普500' || t === '纳指100'),
      });
    }
    await sleep(250);
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (Number(b.key) - Number(a.key)) || String(a.symbol).localeCompare(String(b.symbol)));
  return { earnings: out, scanned };
}

/* ---------------- 4) 成分股变动 ---------------- */
/** 解析变动表：|- 分行 → 单元格；空单元格保留；日期留空时沿用上一行（rowspan 续行） */
function parseChanges(wikitext, indexName) {
  const t0 = String(wikitext).indexOf('id="changes"');
  if (t0 < 0) return [];
  const tEnd = String(wikitext).indexOf('\n|}', t0);
  const table = String(wikitext).slice(t0, tEnd < 0 ? undefined : tEnd);
  const rows = table.split(/\n\s*\|-/).slice(1);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const out = [];
  let lastDate = null;
  for (const raw of rows) {
    const norm = raw.replace(/\|\|/g, '\n|');
    const cells = [];
    for (const line of norm.split('\n')) {
      if (!/^\s*\|/.test(line)) continue;
      if (/^\s*\|[!}]/.test(line)) continue;
      cells.push(
        line.replace(/^\s*\|+/, '')
          .replace(/^\s*(rowspan|colspan|data-sort-value|style|class|align|scope)\s*=\s*[^|]*\|/, '')
          .trim(),
      );
    }
    if (!cells.length) continue;
    let date = null;
    let rest = cells;
    const dm = cells[0].match(/([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/);
    if (dm) {
      const mm = months.indexOf(dm[1]) + 1;
      if (mm > 0) { date = `${dm[3]}-${String(mm).padStart(2, '0')}-${String(dm[2]).padStart(2, '0')}`; lastDate = date; }
      rest = cells.slice(1);
    } else {
      date = lastDate;
    }
    if (!date) continue;
    const [aTicker = '', aName = '', rTicker = '', rName = '', ...tail] = rest;
    // reason 与 refs 的位置随行结构浮动：refs 是含 url= 的那一格，reason 取它前面一格
    let reason = '', refUrl = null;
    for (let i = 0; i < tail.length; i++) {
      const u = tail[i].match(/url\s*=\s*([^\s|}]+)/);
      if (u) { refUrl = u[1]; reason = tail[i - 1] || ''; break; }
    }
    if (!refUrl && tail.length) reason = tail[0];
    const added = /^[A-Z][A-Z0-9.\-]{0,6}$/.test(aTicker.trim()) ? { ticker: aTicker.trim(), name: wikiText(aName) || null } : null;
    const removed = /^[A-Z][A-Z0-9.\-]{0,6}$/.test(rTicker.trim()) ? { ticker: rTicker.trim(), name: wikiText(rName) || null } : null;
    if (!added && !removed) continue;
    out.push({
      index: indexName, effectiveDate: date, added, removed,
      reason: wikiText(reason).slice(0, 180) || null,
      ref: refUrl ? refUrl.replace(/^https?:\/\//, '') : null,
    });
  }
  return out;
}

/** 保留最近 N 天内的 + 已公告未来生效的；更早的丢弃 */
function pruneChanges(changes, today, windowDays) {
  const cutoff = ymd(addDays(today, -windowDays));
  const kept = changes.filter((c) => c.effectiveDate >= cutoff);
  kept.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return { kept, cutoff, dropped: changes.length - kept.length };
}

/* ---------------- 5) 下次预定调整窗口（规则推算，以官方公告为准） ---------------- */
function nextWindows(today) {
  const todayStr = ymd(today);
  const y = today.getUTCFullYear();
  const list = [];
  let spDate = null;
  for (const mi of [3, 6, 9, 12]) { const d = thirdFriday(y, mi); if (d >= todayStr) { spDate = d; break; } }
  list.push({
    name: '标普500 季度权重再平衡',
    date: spDate || thirdFriday(y + 1, 3),
    note: '按 S&P DJI 季度再平衡惯例推算（3/6/9/12 月第三个周五）；成分股增删为不定期公告，见下方变动表',
  });
  let ndxDate = thirdFriday(y, 12);
  if (ndxDate < todayStr) ndxDate = thirdFriday(y + 1, 12);
  list.push({
    name: '纳指100 年度重构',
    date: ndxDate,
    note: '按 Nasdaq 指数方法推算（每年 12 月第三个周五生效，公告通常 12 月初）；成分股增删另有不定期公告',
  });
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list;
}

/* ---------------- 汇总 ---------------- */
async function buildWeekAhead(now = new Date()) {
  const { start, end } = upcomingWeek(now);
  const log = (...a) => console.log('[week]', ...a);
  log('window', start, '~', end);

  const wiki = { spList: '', spChanges: '', ndxList: '', ndxChanges: '' };
  try {
    Object.assign(wiki, await fetchWikitexts(PAGES));
    log('wikitexts:', Object.entries(wiki).map(([k, v]) => k + '=' + (v ? (v.length / 1024).toFixed(0) + 'KB' : 'FAIL')).join(' '));
  } catch (e) { log('WARN wikipedia batch failed:', String(e.message).slice(0, 80)); }

  let eco = { events: [], other: [], scanned: 0 };
  try { eco = await fetchEconomicEvents(start, end); log('events headline', eco.events.length, '| other', eco.other.length, '| scanned', eco.scanned); }
  catch (e) { log('WARN economic calendar failed:', String(e.message).slice(0, 80)); }

  let cons = { sp500: new Map(), ndx: new Map() };
  try { cons = parseConstituents(wiki.spList, wiki.ndxList); log('constituents sp500', cons.sp500.size, 'ndx', cons.ndx.size); }
  catch (e) { log('WARN parse constituents failed:', String(e.message).slice(0, 80)); }

  let earn = { earnings: [], scanned: 0 };
  try {
    earn = await fetchWeekEarnings(start, end, cons);
    log('earnings', earn.earnings.length, '| 重点', earn.earnings.filter((x) => x.key).length, '| 半导体/科技', earn.earnings.filter((x) => x.tags.includes('半导体') || x.tags.includes('科技')).length);
  } catch (e) { log('WARN earnings failed:', String(e.message).slice(0, 80)); }

  const changes = [];
  try {
    for (const [key, label] of [['spChanges', '标普500'], ['ndxChanges', '纳指100']]) {
      const parsed = parseChanges(wiki[key], label);
      const pruned = pruneChanges(parsed, now, CHANGE_WINDOW_DAYS);
      changes.push({ index: label, total: parsed.length, cutoff: pruned.cutoff, dropped: pruned.dropped, kept: pruned.kept });
      log('changes', label, 'kept', pruned.kept.length, '/ total', parsed.length, '(cutoff ' + pruned.cutoff + ')');
    }
  } catch (e) { log('WARN changes failed:', String(e.message).slice(0, 80)); }

  return {
    weekStart: start, weekEnd: end, windowDays: CHANGE_WINDOW_DAYS,
    events: eco.events,
    // 次要数据只报条数、不列出（需求：只说重要的事，小事就算了）
    otherCount: eco.other.length,
    earnings: earn.earnings, changes, nextWindows: nextWindows(now),
    sources: {
      calendar: 'TradingView 经济日历 (economic-calendar.tradingview.com，仅美国)',
      earnings: 'Nasdaq 财报日历 (api.nasdaq.com)',
      changes: 'Wikipedia：Historical components of the S&P 500 / Nasdaq-100（变动表 Refs 列为 S&P DJI / Nasdaq 官方公告）',
      constituents: 'Wikipedia：List of S&P 500 companies / List of NASDAQ-100 companies（用于给财报标注行业与所属指数）',
    },
  };
}

module.exports = {
  buildWeekAhead, upcomingWeek, thirdFriday, parseChanges, pruneChanges,
  fetchEconomicEvents, isHeadline, CHANGE_WINDOW_DAYS,
};
