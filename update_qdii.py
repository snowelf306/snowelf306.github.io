# -*- coding: utf-8 -*-
"""
QDII 场内基金页面自动更新脚本
- 每次运行：抓取东方财富最新行情(收盘价/参考净值)与最新公布净值，更新
  D:\\DSH\\qdii-publish\\nasdaq100-etf-overview.html 中各基金数据行的
  price/iopv/prem/nav/nd 字段（溢价率 = 市价/参考净值 - 1）。
- 定期报告：当某基金的资产配置接口返回新的报告日期(fsrq)时，同步更新该基金的
  ad(报告日期)/stock(股票或基金占比)/sk(联接式标记)/asset(净资产)。
- 数据无变化时不写文件（节假日/非交易日自动跳过）。
用法：python update_qdii.py
"""
import json
import datetime
import os
import re
import sys
import time
import urllib.request
import urllib.error

PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nasdaq100-etf-overview.html')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
UT = 'fa5fd1943c7b386f172d6893dbfba10b'

CODES = (
    '513100 159941 513300 159632 159513 159659 159501 513390 513110 159660 159696 513870 161130 '
    '513650 159655 513500 159612 '
    '513350 159502 159518 159529 159509 513400 513290 159577 513850 501225 161128 161127 162415 501312 '
    '159866 513520 513310 513800 159561 513000 513880 513080 513030 '
    '501018 160723 161126 162719 162411 161815 163208 160416 164701 160719 161116 165513'
).split()

LINE_RE = re.compile(
    r"\{ code: '(?P<code>\d{6})', name: '(?P<name>[^']*)', nd: '(?P<nd>[^']*)', "
    r"ad: '(?P<ad>[^']*)', nav: (?P<nav>-?[\d.]+), price: (?P<price>-?[\d.]+), "
    r"iopv: (?P<iopv>-?[\d.]+), prem: (?P<prem>-?[\d.]+), asset: (?P<asset>-?[\d.]+), "
    r"stock: (?P<stock>-?[\d.]+)(?P<sk>, sk: '(?P<skv>\w+)')? \}"
)


def fetch(url, referer=None, retries=2):
    headers = {'User-Agent': UA}
    if referer:
        headers['Referer'] = referer
    last_err = None
    for _ in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5)
    raise last_err


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def get_quote(code):
    """返回 (最新价, 参考净值/IOPV, 行情时间戳)；未挂牌或停牌返回 (None, None, None)。"""
    mkt = '1' if code.startswith('5') else '0'
    url = ('https://push2.eastmoney.com/api/qt/stock/get?ut=%s&invt=2&fltt=2'
           '&fields=f43,f130,f124&secid=%s.%s' % (UT, mkt, code))
    d = json.loads(fetch(url)).get('data') or {}
    return fnum(d.get('f43')), fnum(d.get('f130')), fnum(d.get('f124'))


def get_nav(code):
    """返回 (最新公布单位净值, 净值日期)。"""
    url = ('https://api.fund.eastmoney.com/f10/lsjz?fundCode=%s&pageIndex=1&pageSize=1'
           % code)
    d = json.loads(fetch(url, referer='https://fundf10.eastmoney.com/'))
    lst = (d.get('Data') or {}).get('LSJZList') or []
    if not lst:
        return None, None
    return fnum(lst[0].get('DWJZ')), lst[0].get('FSRQ')


def get_alloc(code):
    """返回 (股票或基金占比, sk, 净资产, 报告日期)。"""
    url = ('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNAssetAllocationNew'
           '?FCODE=%s&deviceid=Wap&plat=Wap&product=EFund&version=6.2.8' % code)
    j = json.loads(fetch(url))
    datas = j.get('Datas') or []
    if not datas:
        return None, None, None, None
    a = datas[0]
    gp, jj = fnum(a.get('GP')), fnum(a.get('JJ'))
    if gp is not None:
        return gp, None, fnum(a.get('JZC')), a.get('FSRQ')
    if jj is not None:
        return jj, 'jj', fnum(a.get('JZC')), a.get('FSRQ')
    return None, None, fnum(a.get('JZC')), a.get('FSRQ')


def main():
    html = open(PAGE, encoding='utf-8').read()

    found = {m.group('code'): m for m in LINE_RE.finditer(html)}
    missing = [c for c in CODES if c not in found]
    if missing:
        print('WARN 页面中未找到基金数据行: %s' % ' '.join(missing))

    changed, errors, unchanged, skipped = [], [], 0, 0
    new_html = html
    max_nd = None
    max_ad = None
    for code in CODES:
        m = found.get(code)
        if not m:
            continue
        g = m.groupdict()
        price = iopv = nav = None
        nd = alloc = None
        quote_ts = None
        try:
            price, iopv, quote_ts = get_quote(code)
        except Exception as e:  # noqa: BLE001
            errors.append('%s 行情: %s' % (code, e))
        try:
            nav, nd = get_nav(code)
        except Exception as e:  # noqa: BLE001
            errors.append('%s 净值: %s' % (code, e))
        try:
            alloc = get_alloc(code)
        except Exception as e:  # noqa: BLE001
            errors.append('%s 资产配置: %s' % (code, e))

        quote_ok = price is not None and iopv is not None
        nav_ok = nav is not None
        if nav_ok and (max_nd is None or nd > max_nd):
            max_nd = nd
        alloc_ok = bool(alloc and alloc[3] and alloc[3] >= g['ad']
                        and alloc[0] is not None and alloc[2] is not None)
        if alloc_ok and (max_ad is None or alloc[3] > max_ad):
            max_ad = alloc[3]
        if not (quote_ok or nav_ok or alloc_ok):
            skipped += 1
            continue

        if quote_ok:
            price_n, iopv_n = json.dumps(price), json.dumps(iopv)
            prem_n = json.dumps(round((price / iopv - 1) * 100, 2))
        else:
            price_n, iopv_n, prem_n = g['price'], g['iopv'], g['prem']
        nav_n, nd_n = (json.dumps(nav), nd) if nav_ok else (g['nav'], g['nd'])
        if alloc_ok:
            ad_n, stock_n, sk_n, asset_n = alloc[3], json.dumps(alloc[0]), (alloc[1] or ''), json.dumps(alloc[2])
        else:
            ad_n, stock_n, sk_n, asset_n = g['ad'], g['stock'], g['skv'], g['asset']

        new_line = ("{ code: '%s', name: '%s', nd: '%s', ad: '%s', nav: %s, price: %s, "
                    "iopv: %s, prem: %s, asset: %s, stock: %s%s }" % (
                        code, g['name'], nd_n, ad_n, nav_n, price_n,
                        iopv_n, prem_n, asset_n, stock_n,
                        (", sk: '%s'" % sk_n) if sk_n else ''))

        old_line = m.group(0)
        if new_line != old_line:
            new_html = new_html.replace(old_line, new_line, 1)
            detail = []
            if prem_n != g['prem']:
                detail.append('prem %s->%s' % (g['prem'], prem_n))
            if nav_n != g['nav']:
                detail.append('nav %s->%s' % (g['nav'], nav_n))
            if ad_n != g['ad']:
                detail.append('报告期->%s' % ad_n)
            if stock_n != g['stock']:
                detail.append('股票占比 %s%%->%s%%' % (g['stock'], stock_n))
            changed.append('%s %s: %s' % (code, g['name'], '; '.join(detail)))
        else:
            unchanged += 1
        time.sleep(0.4)

    if max_nd:
        # 净值披露日期与定期报告期取自数据本身，避免任何"假今日"标注
        new_html = re.sub(r'最新披露截至 [^（]*', '最新披露截至 %s（' % max_nd, new_html, count=1)
    if max_ad:
        new_html = re.sub(r'最新定期报告（[^）]*）', '最新定期报告（%s）' % max_ad, new_html, count=1)
        new_html = re.sub(r"var REPORT_DATE = '[^']*'",
                          "var REPORT_DATE = '%s'" % max_ad, new_html, count=1)

    if errors and len(errors) >= len(CODES):
        print('ERROR 全部请求失败，最后错误: %s' % errors[-1])
        sys.exit(1)

    if changed:
        # 顶部"行情：……更新"标注 = 最近一次实际更新到数据的时间
        ts_str = datetime.datetime.now(
            datetime.timezone(datetime.timedelta(hours=8))).strftime('%Y-%m-%d %H:%M')
        if '行情：' in new_html:
            new_html = re.sub(r'行情：[^·]*?更新', '行情：%s 更新' % ts_str, new_html, count=1)
        else:
            new_html = new_html.replace('行情：每交易日收盘后自动更新',
                                        '行情：%s 更新' % ts_str, 1)
        open(PAGE, 'w', encoding='utf-8', newline='').write(new_html)
        print('UPDATED %d 只基金已更新:' % len(changed))
        for line in changed:
            print('  ' + line)
    else:
        print('NOCHANGE 数据无更新 (基金 %d 只, 内容未变 %d, 无行情跳过 %d, 请求错误 %d)'
              % (len(CODES), unchanged, skipped, len(errors)))


if __name__ == '__main__':
    main()
