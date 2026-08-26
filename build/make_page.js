// Generate self-contained qdii-nav.html embedding data.json (paths relative to repo root)
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));
const json = JSON.stringify(data).replace(/</g, '\\u003c');
// 静态项（银行存款+其他资产-负债）占净值比例，用于方法说明
const pctHb = (data.funds[0].otherNetAssets / data.funds[0].netAssetsTotal * 100).toFixed(1);
const pctJsq = (data.funds[1].otherNetAssets / data.funds[1].netAssetsTotal * 100).toFixed(1);
// 持仓显示简称（浏览器端渲染用）
const SHORT = {
  ARKK: 'ARK创新ETF', ARKG: 'ARK基因革命ETF', ARKQ: 'ARK自动驾驶与机器人ETF',
  AIQ: 'Global X人工智能科技ETF', BOTZ: 'Global X机器人AI ETF', ARKX: 'ARK太空与国防ETF',
  XLK: '科技行业精选SPDR', SMH: 'VanEck半导体ETF', SOXX: 'iShares半导体ETF',
  QQQ: '纳指100 ETF', PSI: 'Invesco动态半导体ETF', SOXQ: 'Invesco费城半导体ETF',
  '159995': '华夏国证芯片ETF', '512760': '国泰CES芯片ETF', '159560': '景顺长城芯片ETF',
  '2644.T': 'Global X日本半导体ETF',
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QDII-LOF 持仓净值估算看板 · 海外科技 / 全球芯片</title>
<style>
:root{
  --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --border:#2a3140;
  --text:#e6e8eb; --muted:#8b949e; --accent:#58a6ff; --up:#3fb950; --down:#f85149;
  --gold:#d29922; --chip:#21262d;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:-apple-system,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;font-size:14px;line-height:1.55;padding-bottom:60px}
.wrap{max-width:1560px;margin:0 auto;padding:0 18px}
.funds-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(680px,1fr));gap:16px;align-items:stretch;margin-top:26px}
@media(max-width:1420px){.funds-grid{grid-template-columns:1fr}}
.fund{background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
header{padding:26px 0 14px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px}
h1{font-size:21px;font-weight:700;letter-spacing:.5px}
h1 .sub{color:var(--muted);font-weight:400;font-size:13px;margin-left:8px}
.meta{color:var(--muted);font-size:12px;width:100%;display:flex;flex-wrap:wrap;gap:6px 18px}
button.refresh{background:var(--chip);color:var(--accent);border:1px solid var(--border);border-radius:6px;padding:6px 16px;cursor:pointer;font-size:13px}
button.refresh:hover{background:var(--panel2)}
button.refresh[disabled]{opacity:.5;cursor:wait}
.fund-head{padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:linear-gradient(180deg,#182130,#141a24);border-bottom:1px solid var(--border)}
.fund-head h2{font-size:17px;font-weight:600}
.tag{font-size:11px;color:var(--muted);background:var(--chip);border:1px solid var(--border);padding:2px 8px;border-radius:4px}
.tag.code{color:var(--accent);font-family:Consolas,monospace}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 18px}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:12px 12px}
.kpi .label{font-size:12px;color:var(--muted);white-space:nowrap}
.kpi .value{font-size:19px;font-weight:700;font-family:Consolas,"Courier New",monospace;margin-top:2px;white-space:nowrap}
.kpi .note{font-size:10.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.up{color:var(--up)} .down{color:var(--down)} .flat{color:var(--muted)}
section.holdings{padding:6px 20px 18px}
section.holdings h3{font-size:14px;color:var(--muted);font-weight:600;margin:12px 0 8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{color:var(--muted);font-weight:500;text-align:right;padding:7px 7px;border-bottom:1px solid var(--border);white-space:nowrap}
th:first-child{text-align:left}
td{padding:7px 7px;border-bottom:1px solid #20263433;text-align:right;font-family:Consolas,"Courier New",monospace;white-space:nowrap}
td:first-child{text-align:left;font-family:inherit;white-space:normal}
tr:hover td{background:#ffffff08}
td .nm{font-weight:600} td .tk{color:var(--muted);font-size:11px;margin-left:6px}
.mkt-US{color:#58a6ff}.mkt-CN{color:#d29922}.mkt-JP{color:#bc8cff}
.srcdot{font-size:10px;color:var(--muted);display:block;line-height:1.2}
.chartbox{padding:4px 20px 20px;margin-top:auto}
.chartbox h3{font-size:14px;color:var(--muted);font-weight:600;margin:8px 0 10px}
svg{width:100%;height:auto;display:block;background:var(--panel2);border:1px solid var(--border);border-radius:8px}
.legend{display:flex;gap:20px;font-size:12px;color:var(--muted);margin-top:8px}
.legend span b{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:5px;border-radius:2px}
#tooltip{position:fixed;pointer-events:none;background:#000c;border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;display:none;z-index:9;font-family:Consolas,monospace}
.notes{margin-top:30px;background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:18px 22px;color:var(--muted);font-size:12.5px}
.notes h3{color:var(--text);font-size:14px;margin-bottom:10px}
.notes li{margin-left:18px;margin-top:5px}
footer{margin-top:22px;color:#555f6b;font-size:11.5px;text-align:center}
.warn{color:var(--gold);font-size:12px;padding:0 20px 12px}
@media (max-width:760px){ .kpi .value{font-size:19px} th,td{padding:6px 5px;font-size:12px} }
</style>
</head>
<body>
<div class="wrap">
<header>
  <h1>QDII-LOF 基金持仓净值估算看板<span class="sub">海外科技LOF · 全球芯片LOF</span></h1>
  <button class="refresh" id="btnRefresh" onclick="liveRefresh()">↻ 刷新实时行情</button>
  <div class="meta">
    <span>数据构建时间：<b id="genAt"></b></span>
    <span id="fxLine"></span>
    <span id="statusLine"></span>
  </div>
</header>
<div id="funds"></div>

<div class="notes">
<h3>计算方法与说明</h3>
<ul>
  <li><b>持仓来源：</b>两份《2026年第2季度报告》PDF（报告期截止 2026-06-30）中披露的"前十名基金投资明细"，含基金名称、管理人、公允价值（人民币元）及占基金资产净值比例。</li>
  <li><b>持仓数量推算：</b>季报未直接披露持有份数，按 <code>数量 = 报告期公允价值 ÷（报告期末收盘价 × 报告期末汇率中间价）</code> 推算。美国 ETF 价格取自 Nasdaq 日线（USD），A 股 ETF 取腾讯行情前复权日线（CNY，自动消除 159995 于 2026-07-07 的 1:2 份额拆分跳变），日本 2644.T 取 Yahoo Finance 日线（JPY）。</li>
  <li><b>汇率折算：</b>采用中国外汇交易中心公布的<b>人民币汇率中间价</b>：2026-06-30 USD/CNY = ${data.fx.usdcny0}、100JPY/CNY = ${(data.fx.jpycny0 * 100).toFixed(4)}；最新中间价（${data.fx.usdcnyLastDate}）USD/CNY = ${data.fx.usdcnyLast}、100JPY/CNY = ${(data.fx.jpycnyLast * 100).toFixed(4)}。</li>
  <li><b>估算净值公式：</b><code>估算净值(t) = 报告期净值 × [净资产−基金投资 + Σ 数量ᵢ×价格ᵢ(t)×汇率ᵢ(t) + 未披露持仓×平均涨幅] ÷ 净资产</code>。其中"未披露持仓"= 季报基金投资合计 − 前十（八）大披露合计，按已披露持仓的平均涨幅估值。该公式在报告日恰好还原官方净值。</li>
  <li><b>银行存款 / 其他资产的处理：</b>季报中"银行存款和结算备付金""其他资产"（主要为应收证券清算款、应收申购款）扣除负债后并入公式的静态项，按面值持有、不随股价波动——该项占净值比例：海外科技约 ${pctHb}%，全球芯片约 ${pctJsq}%。此处理保证报告日还原精确。</li>
  <li><b>申赎流量是最主要的误差来源：</b>海外科技LOF 持续开放申购，报告期份额大幅净增长（场内溢价吸引申购-卖出套利）。新申购款以现金形态停留数日（美元换汇+建仓时滞），摊薄了组合波动，而本估算按季报结构满仓计算，故官方净值常低于估算值；新资金随后的投向与建仓成本季报不再披露，构成无法从公开数据消除的偏差。全球芯片LOF 处于暂停申购状态、仅有小额持续赎回，赎回对每份净值中性，组合结构与季报基本一致，因此静态估算与官方净值高度贴合（残余偏差≈费用水平）。</li>
  <li><b>最新价格时点：</b>美股为腾讯行情实时盘中价（美东时间），A 股 ETF 为最近收盘价，日本 ETF 为 minkabu.jp 收盘快照，美元/日元汇率用最近日中间价。点击右上角"刷新实时行情"可更新美股与 A 股价格并重算（汇率与日经持仓保持构建时点值）。</li>
  <li><b>误差参考：</b>以同日官方净值对照：全球芯片偏差约 0.1%~0.5%（接近费用拖累水平），海外科技约 1%~2%（开放申购带来的现金摊薄与再建仓所致）。其余次要素级：基金调仓 &gt; 管理托管等费用（约 0.3%/两月，恒为正偏）&gt; 境内外估值时点差 &gt; 现金静态假设。估算结果不构成投资建议。</li>
</ul>
</div>
<footer id="srcFooter"></footer>
</div>
<div id="tooltip"></div>

<script id="embedded-data" type="application/json">${json}</script>
<script>
'use strict';
let D = JSON.parse(document.getElementById('embedded-data').textContent);
const SHORT = ${JSON.stringify(SHORT)};
const fmtWan = v => (v / 1e4).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
const fmtYi = v => (v / 1e8).toFixed(2);
const cls = x => x > 0 ? 'up' : x < 0 ? 'down' : 'flat';
const sign = x => (x > 0 ? '+' : '') + x.toFixed(2);

/* ---------- render ---------- */
function kpi(label, valueHtml, note) {
  return '<div class="kpi"><div class="label">' + label + '</div><div class="value">' + valueHtml + '</div>' + (note ? '<div class="note">' + note + '</div>' : '') + '</div>';
}

function fundCard(f, fi) {
  const L = f.live;
  const offA = L.officialLatestA;
  const offChgA = offA ? sign((offA.navA / f.navA0 - 1) * 100) + '% 较报告期' : '';
  let hrows = '';
  f.holdings.forEach((h, i) => {
    const srcTxt = h.pLastSrc === 'qt-intraday' ? '盘中' : h.pLastSrc === 'qt-close' ? '收盘' : 'EOD';
    hrows += '<tr>'
      + '<td><span class="nm">' + (SHORT[h.ticker] || h.name) + '</span><span class="tk">' + h.ticker + '</span></td>'
      + '<td>' + Math.round(h.qty).toLocaleString('zh-CN') + '</td>'
      + '<td>' + h.pLast.toFixed(h.pLast > 100 ? 2 : 4) + '<span class="srcdot">' + srcTxt + '</span></td>'
      + '<td class="' + cls(h.dailyChgPct ?? 0) + '">' + (h.dailyChgPct == null ? '-' : sign(h.dailyChgPct) + '%')
      + '<span class="srcdot">较6/30累计 ' + sign(h.chgPct) + '%</span></td>'
      + '<td>' + fmtWan(h.valLast) + '</td>'
      + '<td>' + h.weightNowPct.toFixed(2) + '%</td>'
      + '</tr>';
  });
  if (f.residual && f.residual.fv0 > 0.5) {
    const residVal = L.estTotalAssetsCny - f.otherNetAssets - f.holdings.reduce((s, h) => s + h.valLast, 0);
    hrows += '<tr style="color:var(--muted)">'
      + '<td>其余未披露基金持仓<small>（按已披露平均涨幅估算）</small></td>'
      + '<td>-</td><td>-</td>'
      + '<td class="' + cls(L.chgSinceReportA) + '">≈' + sign(L.chgSinceReportA) + '%<span class="srcdot">随组合平均</span></td>'
      + '<td>' + fmtWan(residVal) + '</td>'
      + '<td>' + (residVal / L.estTotalAssetsCny * 100).toFixed(2) + '%</td></tr>';
  }
  const estVsOff = offA ? ((L.estNavA / offA.navA - 1) * 100) : null;

  return '<div class="fund" id="fund' + fi + '">'
    + '<div class="fund-head"><h2>' + f.nameShort + '</h2>'
    + '<span class="tag code">' + f.codeA + '</span>'
    + '<span class="tag">季报基准日 ' + f.reportDate + '</span>'
    + '<span class="tag" style="margin-left:auto">' + f.nameFull.replace(/（QDII-LOF）/, '') + '（QDII-LOF）</span></div>'
    + '<div class="kpis">'
    + kpi('较前日收盘', '<span class="' + cls(L.fundDailyChgPct ?? 0) + '">' + sign(L.fundDailyChgPct ?? 0) + '%</span>', L.estNavAPrev != null ? '前日估算净值 ' + L.estNavAPrev.toFixed(4) : '')
    + kpi('最新估算净值', L.estNavA.toFixed(4) + ' <span style="font-size:13px" class="' + cls(L.chgSinceReportA) + '">' + sign(L.chgSinceReportA) + '%</span>', 'A类 · 较季报净值 ' + f.navA0.toFixed(4))
    + (offA ? kpi('官方公布净值（A类）', offA.navA.toFixed(4), offA.date + ' 公布 · ' + offChgA) : '')
    + (estVsOff != null ? kpi('估算 vs 最新官方', '<span class="' + cls(estVsOff) + '">' + sign(estVsOff) + '%</span>', '估算领先于 T+2 发布的官方净值') : '')
    + '</div>'
    + (f.warnings && f.warnings.length ? '<div class="warn">⚠ 价格序列检测到异常跳动：' + f.warnings.join('；') + '</div>' : '')
    + '<section class="holdings"><h3><span>持仓明细（数量由季报公允价值 ÷ 报告期末价格 × 汇率反推，按占估算总资产降序）</span><span>涨幅以前一交易日收盘为基准 · 单位：份 / 元人民币</span></h3>'
    + '<table><thead><tr>'
    + '<th style="width:32%">基金名称</th><th>持仓数量<br>(份)</th><th>最新价<br>(本币)</th><th>较前日<br>收盘涨幅</th><th>最新市值<br>(万元)</th><th>占估算<br>总资产</th>'
    + '</tr></thead><tbody>' + hrows + '</tbody></table></section>'
    + '<div class="chartbox"><h3>估算净值走势 vs 官方公布净值（A类）</h3><div id="chart' + fi + '"></div>'
    + '<div class="legend"><span><b style="background:var(--accent)"></b>静态持仓估算净值</span><span><b style="background:#8b949e"></b>官方公布净值（T+2）</span><span><b style="background:var(--gold)"></b>季报净值基准</span></div></div>'
    + '</div>';
}

/* ---------- chart (hand-rolled SVG) ---------- */
function drawChart(container, series, nav0) {
  const W = 1120, H = 300, padL = 56, padR = 16, padT = 18, padB = 34;
  const pts = series.filter(p => p.estNavA != null);
  if (!pts.length) return;
  const xs = d => padL + (new Date(d) - new Date(pts[0].date)) / Math.max(1, new Date(pts[pts.length - 1].date) - new Date(pts[0].date)) * (W - padL - padR);
  let lo = Infinity, hi = -Infinity;
  pts.forEach(p => { lo = Math.min(lo, p.estNavA, p.officialA ?? p.estNavA); hi = Math.max(hi, p.estNavA, p.officialA ?? p.estNavA); });
  const pad = (hi - lo) * 0.08 || 0.05; lo -= pad; hi += pad;
  const ys = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  let g = '';
  // gridlines + y ticks
  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * i / 4, y = ys(v);
    g += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#232b38"/>';
    g += '<text x="' + (padL - 8) + '" y="' + (y + 4) + '" fill="#8b949e" font-size="11" text-anchor="end">' + v.toFixed(3) + '</text>';
  }
  // x ticks (~6)
  const step = Math.max(1, Math.floor(pts.length / 6));
  for (let i = 0; i < pts.length; i += step) {
    const x = xs(pts[i].date);
    g += '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (H - padB) + '" stroke="#1b2130"/>';
    g += '<text x="' + x + '" y="' + (H - padB + 16) + '" fill="#8b949e" font-size="11" text-anchor="middle">' + pts[i].date.slice(5) + '</text>';
  }
  // base reference line at report NAV
  if (nav0 > lo && nav0 < hi) {
    g += '<line x1="' + padL + '" y1="' + ys(nav0) + '" x2="' + (W - padR) + '" y2="' + ys(nav0) + '" stroke="#d29922" stroke-dasharray="2 4" opacity=".7"/>';
  }
  // official line (gray dashed)
  const offPts = pts.filter(p => p.officialA != null);
  if (offPts.length > 1) g += '<polyline fill="none" stroke="#8b949e" stroke-width="1.6" stroke-dasharray="5 4" points="' + offPts.map(p => xs(p.date) + ',' + ys(p.officialA)).join(' ') + '"/>';
  // est line
  g += '<polyline fill="none" stroke="#58a6ff" stroke-width="2" points="' + pts.map(p => xs(p.date) + ',' + ys(p.estNavA)).join(' ') + '"/>';
  // hover targets
  pts.forEach((p, idx) => { g += '<circle cx="' + xs(p.date) + '" cy="' + ys(p.estNavA) + '" r="7" fill="transparent" class="hit" data-i="' + idx + '" style="cursor:crosshair"/>'; });
  container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' + g + '</svg>';

  const tip = document.getElementById('tooltip');
  container.querySelectorAll('.hit').forEach(c => {
    c.addEventListener('mouseenter', ev => {
      const p = pts[+c.dataset.i];
      tip.innerHTML = '<b>' + p.date + '</b><br>估算净值: ' + (p.estNavA ?? '-') + (p.officialA != null ? '<br>官方净值: ' + p.officialA : '');
      tip.style.display = 'block';
    });
    c.addEventListener('mousemove', ev => { tip.style.left = (ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY - 10) + 'px'; });
    c.addEventListener('mouseleave', () => tip.style.display = 'none');
  });
}

function renderAll() {
  document.getElementById('genAt').textContent = D.generatedAt;
  document.getElementById('fxLine').innerHTML = '汇率中间价：USD/CNY ' + D.fx.usdcny0 + ' → <b>' + D.fx.usdcnyLast + '</b>（' + D.fx.usdcnyLastDate + '）';
  document.getElementById('statusLine').textContent = '';
  const fd = document.getElementById('funds');
  fd.classList.add('funds-grid');
  fd.innerHTML = D.funds.map(fundCard).join('');
  D.funds.forEach((f, i) => drawChart(document.getElementById('chart' + i), f.series, f.navA0));
  document.getElementById('srcFooter').textContent = Object.values(D.sources).join(' | ');
}
renderAll();

/* ---------- live refresh via qt.gtimg.cn (script-tag injection) ---------- */
function parseQt(raw, isUS) {
  const f = raw.split('~');
  if (f.length < 32) return null;
  const price = parseFloat(f[3]), prevClose = parseFloat(f[4]);
  return { price, prevClose, time: f[30] };
}
function liveRefresh() {
  const btn = document.getElementById('btnRefresh');
  btn.disabled = true;
  const codes = [];
  D.funds.forEach(f => f.holdings.forEach(h => {
    if (h.market === 'US') codes.push('us' + h.ticker);
    else if (h.market === 'CN') codes.push(h.symbol);
  }));
  const s = document.createElement('script');
  const done = (ok, msg) => { btn.disabled = false; document.getElementById('statusLine').textContent = msg || ''; };
  window.__qtCb = () => {
    try {
      let gotUs = false, gotCn = false, usTime = '', cnTime = '';
      D.funds.forEach(f => {
        let portVal = 0, discVal = 0, portValPrev = 0;
        f.holdings.forEach(h => {
          let price = h.pLast, prevClose = h.prevClose;
          if (h.market === 'US') {
            const v = window['v_us' + h.ticker];
            if (typeof v === 'string') { const q = parseQt(v, true); if (q && q.price > 0) { price = q.price; if (q.prevClose > 0) prevClose = q.prevClose; gotUs = true; usTime = q.time; } }
            h.fxLastLive = D.fx.usdcnyLast;
          } else if (h.market === 'CN') {
            const v = window['v_' + h.symbol];
            if (typeof v === 'string') { const q = parseQt(v, false); if (q && q.price > 0) { price = q.price; if (q.prevClose > 0) prevClose = q.prevClose; gotCn = true; cnTime = q.time; } }
            h.fxLastLive = 1;
          } else {
            h.fxLastLive = h.fxLast; // JP keeps snapshot
          }
          h.pLastLive = price;
          h.prevCloseLive = prevClose; // 前一交易日收盘（美股即上一美股交易日）
          const fxBase = h.currency === 'USD' ? D.fx.usdcny0 : h.currency === 'JPY' ? D.fx.jpycny0 : 1;
          h.chgPctLive = +((price * h.fxLastLive / (fxBase * h.p0) - 1) * 100).toFixed(2);
          h.dailyChgLive = (prevClose > 0) ? +((price / prevClose - 1) * 100).toFixed(2) : null;
          const val = h.qty * price * h.fxLastLive;
          portVal += val; discVal += val;
          const pc = (prevClose != null && prevClose > 0) ? prevClose : price;
          portValPrev += h.qty * pc * h.fxLastLive;
        });
        const residVal = f.residualFV > 0 ? f.residualFV * (discVal / (f.disclosedSum || 1)) : 0;
        const estTot = f.otherNetAssets + portVal + residVal;
        const residPrev = f.residualFV > 0 ? f.residualFV * (portValPrev / (f.disclosedSum || 1)) : 0;
        const estTotPrev = f.otherNetAssets + portValPrev + residPrev;
        f.liveLive = {
          estNavA: +(f.navA0 * estTot / f.netAssetsTotal).toFixed(4),
          chgA: +((f.navA0 * estTot / f.netAssetsTotal / f.navA0 - 1) * 100).toFixed(2),
          fundDailyChgPct: +((estTot / estTotPrev - 1) * 100).toFixed(2),
          estNavAPrev: +(f.navA0 * estTotPrev / f.netAssetsTotal).toFixed(4),
          estTot,
        };
      });
      applyLive(usTime, cnTime);
      done(true, (gotUs ? '美股盘中价已更新(' + usTime + ' 美东)' : '') + (gotCn ? ' · A股收盘价已确认' : '') + ' · 汇率/日经持仓保持快照值');
    } catch (e) { done(false, '刷新失败：' + e.message); }
  };
  s.src = 'https://qt.gtimg.cn/q=' + codes.join(',') + '&r=' + Date.now();
  s.onerror = () => { delete window.__qtCb; done(false, '实时行情拉取失败（网络受限），当前展示构建时点数据'); };
  s.onload = () => { const cb = window.__qtCb; delete window.__qtCb; if (cb) cb(); };
  document.head.appendChild(s);
}
function applyLive(usTime, cnTime) {
  D.funds.forEach((f, fi) => {
    const L = f.liveLive;
    const card = document.getElementById('fund' + fi);
    const kpis = card.querySelectorAll('.kpi');
    kpis.forEach(k => {
      const lbl = k.querySelector('.label');
      if (!lbl) return;
      const t = lbl.textContent;
      if (t.includes('较前日收盘')) {
        k.querySelector('.value').innerHTML = '<span class="' + cls(L.fundDailyChgPct ?? 0) + '">' + sign(L.fundDailyChgPct ?? 0) + '%</span>';
        k.querySelector('.note').textContent = L.estNavAPrev != null ? '前日估算净值 ' + L.estNavAPrev.toFixed(4) : '';
      } else if (t.includes('最新估算净值')) {
        k.querySelector('.value').innerHTML = L.estNavA.toFixed(4) + ' <span style="font-size:13px" class="' + cls(L.chgA) + '">' + sign(L.chgA) + '%</span>';
      } else if (t.includes('估算 vs') && f.live.officialLatestA) {
        const d = (L.estNavA / f.live.officialLatestA.navA - 1) * 100;
        k.querySelector('.value').innerHTML = '<span class="' + cls(d) + '">' + sign(d) + '%</span>';
      }
    });
    // table rows (6 columns: name | qty | pLast | dailyChg | value | weight)
    const rows = card.querySelectorAll('tbody tr');
    f.holdings.forEach((h, ri) => {
      const td = rows[ri] ? rows[ri].querySelectorAll('td') : null;
      if (!td || td.length < 6) return;
      td[2].innerHTML = h.pLastLive.toFixed(h.pLastLive > 100 ? 2 : 4) + '<span class="srcdot">' + (h.market === 'JP' ? 'EOD' : h.market === 'US' ? '盘中' : '收盘') + '</span>';
      td[3].className = cls(h.dailyChgLive ?? 0);
      td[3].innerHTML = (h.dailyChgLive == null ? '-' : sign(h.dailyChgLive) + '%')
        + '<span class="srcdot">较6/30累计 ' + sign(h.chgPctLive) + '%</span>';
      td[4].textContent = fmtWan(h.qty * h.pLastLive * h.fxLastLive);
      td[5].textContent = (h.qty * h.pLastLive * h.fxLastLive / L.estTot * 100).toFixed(2) + '%';
    });
  });
  document.getElementById('genAt').textContent = D.generatedAt + (window.__liveApplied ? '（行情已实时刷新）' : '（行情已于刚才刷新）');
  window.__liveApplied = true;
}
</script>
</body>
</html>`;

const OUT_PATH = path.join(ROOT, 'qdii-nav.html'); // GitHub Pages 发布文件
fs.writeFileSync(OUT_PATH, html, 'utf8');
console.log('[make_page] wrote', OUT_PATH, (fs.statSync(OUT_PATH).size / 1024).toFixed(1) + 'KB');
