// qdii_fetch.js — 每个交易日抓取「欧美市场 T+0 场内基金」数据，
// 将 JSON 写入 ../qdii_t0.html 的 QDII_DATA 标记块中。
//
// 数据源（东方财富公开接口，勿加高频轮询）：
//   ① push2.eastmoney.com/api/qt/ulist.np/get —— 一次批量拿全部场内行情（现价/涨幅/成交额）
//   ② fundmobapi.eastmoney.com FundMNBasicInformation —— 逐只拿净值/申购状态/公司/指数名（300ms 间隔）
// 任何单只失败只影响该只（字段留空），行情接口整体失败则不改动页面（保留上次数据）。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'qdii_t0.html');

// ============ 基金池：欧美市场、场内可 T+0 的 ETF / LOF（人工维护） ============
// 首位数字 5/6 = 上交所(secid 前缀 1)，其余 = 深交所(前缀 0)
// 追加方法：确认为跨境 QDII 场内品种且跟踪美/欧指数后，加入代码即可；
// 名称/公司/净值/相关指数等字段全部运行时从接口取，无需写死。
const POOL = [
    '513100', // 纳指ETF国泰            纳斯达克100
    '159941', // 纳指ETF广发            纳斯达克100
    '513300', // 纳斯达克ETF华夏        纳斯达克100
    '513390', // 纳指100ETF博时         纳斯达克100
    '159632', // 纳斯达克ETF华安        纳斯达克100
    '159659', // 纳斯达克100ETF招商     纳斯达克100
    '161130', // 纳斯达克100LOF         纳斯达克100
    '159509', // 纳指科技ETF景顺        纳斯达克科技类指数
    '513290', // 纳指生物科技ETF汇添富  纳斯达克生物科技
    '513500', // 标普500ETF博时         标普500
    '513650', // 标普500ETF南方         标普500
    '161125', // 标普500LOF             标普500
    '161128', // 标普信息科技LOF        标普500信息科技
    '161127', // 标普生物科技LOF        标普生物科技精选行业
    '159502', // 标普生物科技ETF嘉实    标普生物科技精选行业
    '161126', // 标普医疗保健LOF        标普500医疗保健等权重
    '162415', // 美国消费LOF            标普可选消费品精选
    '159529', // 标普消费ETF景顺        标普消费类指数
    '159518', // 标普油气ETF嘉实        标普石油天然气勘探生产
    '162411', // 华宝油气LOF            标普石油天然气勘探生产
    '162719', // 石油LOF                道琼斯美国石油开发生产
    '160140', // 美国REIT精选LOF        道琼斯美国精选REIT
    '501300', // 美元债LOF              美国债券综合指数
    '513030', // 德国ETF华安            德国DAX
    '513080', // 法国ETF华安            法国CAC40
];

const secid = code => `${code.charCodeAt(0) === 53 /* '5' */ || code.charCodeAt(0) === 54 /* '6' */ ? 1 : 0}.${code}`;
const kindOf = code => (/^(51|52|56|58)/.test(code) || /^15/.test(code) ? 'ETF' : 'LOF');

const UA = 'Mozilla/5.0'; // fundmobapi 对完整 Chrome UA 会返回空 Datas，保持短 UA

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, headers = {}, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 15000);
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctl.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            lastErr = e;
            await sleep(800 * 2 ** i); // 0.8s / 1.6s / 3.2s 退避
        } finally {
            clearTimeout(timer);
        }
    }
    throw lastErr;
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// ① 批量行情：一次请求拿全部（这就是不被封的关键 —— 全天共 1 次行情请求）
async function fetchQuotes() {
    const ids = POOL.map(secid).join(',');
    const url = 'https://push2.eastmoney.com/api/qt/ulist.np/get'
        + `?secids=${ids}&fields=f12,f14,f2,f3,f6,f124&fltt=2`;
    const j = await getJson(url);
    const diff = j && j.data && j.data.diff;
    if (!Array.isArray(diff) || diff.length === 0) throw new Error('quote API returned no rows');
    const map = {};
    for (const d of diff) map[String(d.f12)] = { nm: d.f14, price: num(d.f2), pct: num(d.f3), volW: num(d.f6) == null ? null : num(d.f6) / 1e4, ts: num(d.f124) };
    return map;
}

// ② 单只基金元数据：净值、净值日期、净值日涨跌、申购状态、公司、跟踪指数
async function fetchMeta(code) {
    const url = 'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNBasicInformation'
        + `?FCODE=${code}&deviceid=web&plat=Web&product=EFund&version=6.2.8`;
    const j = await getJson(url, {}, 2);
    const d = j && (j.Datas || j.datas || j.data);   // fundmobapi 载荷字段为 Datas
    if (!d || !d.DWJZ) return null;
    return {
        nav: num(d.DWJZ),
        navdt: d.FSRQ === '--' ? null : String(d.FSRQ || '').slice(2),   // 2026-09-02 -> 26-09-02
        navpct: num(d.RZDF),
        ast: d.SGZT === '--' ? null : d.SGZT,
        issuer: d.JJGS === '--' ? null : d.JJGS,
        idx: d.INDEXNAME === '--' ? null : d.INDEXNAME,
        nm: d.SHORTNAME || null,
    };
}

function buildData(quotes, metas) {
    const stamp = new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).replace(/\//g, '-'); // 与运行环境时区无关，始终输出北京时间 "YYYY-MM-DD HH:mm"
    const funds = [];
    for (const code of POOL) {
        const q = quotes[code];
        const m = metas[code] || {};
        if (!q && !m.nm) continue; // 行情与元数据都拿不到才跳过（正常情况极少）
        const prem = q && q.price != null && m.nav ? +((q.price / m.nav - 1) * 100).toFixed(2) : null;
        funds.push({
            id: code,
            nm: q && q.nm || m.nm || code,
            kind: kindOf(code),
            price: q ? q.price : null,
            pct: q ? q.pct : null,
            volW: q && q.volW != null ? +q.volW.toFixed(1) : null,
            nav: m.nav ?? null,
            navdt: m.navdt ?? null,
            navpct: m.navpct ?? null,
            prem,
            idx: m.idx ?? null,
            ast: m.ast ?? null,
            issuer: m.issuer ?? null,
        });
    }
    return {
        updated: stamp,
        funds,
    };
}

// 将 JSON 写入页面的 QDII_DATA 标记块（转义 </ 防止提前闭合 script 标签）
function patchPage(data) {
    const html = fs.readFileSync(PAGE, 'utf8');
    const BEGIN = '<!-- QDII_DATA:BEGIN';
    const END = '<!-- QDII_DATA:END -->';
    const b = html.indexOf(BEGIN), e = html.indexOf(END);
    if (b < 0 || e < 0) throw new Error('QDII_DATA markers not found in qdii_t0.html');
    const open = html.indexOf('>', html.indexOf('<script', b)) + 1;
    const close = html.lastIndexOf('</script>', e);
    const json = JSON.stringify(data).replace(/</g, '\\u003c');
    const out = html.slice(0, open) + '\n' + json + '\n' + html.slice(close);
    fs.writeFileSync(PAGE, out);
    return data.funds.length;
}

(async () => {
    console.log('[qdii_fetch] quotes ...');
    const quotes = await fetchQuotes();   // 整体失败会抛错 → 不改动页面
    const metas = {};
    for (const code of POOL) {            // 元数据逐只、限速 300ms
        try {
            metas[code] = await fetchMeta(code);
            if (!metas[code]) console.warn(`[qdii_fetch] meta empty for ${code}`);
        } catch (e) {
            console.warn(`[qdii_fetch] meta failed for ${code}: ${e.message}`);
        }
        await sleep(300);
    }
    const data = buildData(quotes, metas);
    if (data.funds.length < POOL.length * 0.8) {
        // 大量基金缺数据视为接口异常，保留旧页面
        throw new Error(`too few funds (${data.funds.length}/${POOL.length}), keep old page`);
    }
    const n = patchPage(data);
    console.log(`[qdii_fetch] wrote ${n} funds, updated=${data.updated}`);
})().catch(e => { console.error('[qdii_fetch] FAILED:', e.message); process.exit(1); });
