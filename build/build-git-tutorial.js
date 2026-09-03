/**
 * 生成 GitHub Pages 用的单文件版 Git 教学页。
 *
 *   源文件：  build/git-tutorial.{html,css,js}
 *   输出：    ../git-tutorial.html （站点根目录，与 qdii-nav.html / weather.html 同级）
 *
 * 用法（在仓库任意位置）：node build/build-git-tutorial.js
 *
 * 约定（与站点其它页面一致）：
 *   - 单文件、零外部依赖：CSS/JS 内联，favicon 用 data URI
 *   - 注入站点的 AdSense 加载脚本 + 页尾广告位占位
 */
const fs = require('fs');
const path = require('path');

const BUILD = __dirname;
const OUT = path.join(__dirname, '..', 'git-tutorial.html');

const AD_SCRIPT = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' +
  '?client=ca-pub-2349553897911628" crossorigin="anonymous"></script>';
const AD_SLOT =
  '<div class="adslot" style="min-height:70px;display:flex;align-items:center;justify-content:center;' +
  'border:1.5px dashed #2b3548;border-radius:12px;background:#161a24;color:#66748d;font-size:11px;' +
  'letter-spacing:.5px;max-width:1160px;margin:0 auto 26px;padding:0 clamp(12px,2.6vw,30px)">' +
  'AD · 广告位招租 · 此处展示 Google AdSense 广告</div>';

const read = f => fs.readFileSync(path.join(BUILD, f), 'utf8');
let html = read('git-tutorial.html');
const css = read('git-tutorial.css');
const js = read('git-tutorial.js');

// 注意：String.prototype.replace 的字符串替换会把 `$&` / `$'` 等当成特殊序列，
// 而本项目 JS 里大量使用 `$$()`，因此一律用函数形式的替换，避免内容被改写。
const sub = (str, re, text) => str.replace(re, () => text);

// `</script` 出现在内联 JS 字符串里会提前闭合标签，必须转义
const jsSafe = js.replace(/<\/script/gi, '<\\/script');
if (/<\/script/i.test(jsSafe)) throw new Error('内联 JS 仍含未转义的 </script>');

// 1) 内联 CSS
const before = html.length;
html = sub(html, /<link rel="stylesheet" href="git-tutorial\.css">/, '<style>\n' + css.trimEnd() + '\n</style>');
if (/<link rel="stylesheet" href="git-tutorial\.css">/.test(html)) throw new Error('CSS 未内联');

// 2) 内联 JS
html = sub(html, /<script src="git-tutorial\.js"><\/script>/, '<script>\n' + jsSafe.trimEnd() + '\n</script>');
if (/<script src="git-tutorial\.js">/.test(html)) throw new Error('JS 未内联');

// 3) AdSense 加载脚本：插到 <title> 之后（favicon 的 data URI 里含 '>'，不能拿它当锚点）
html = html.replace(/<title>[^<]*<\/title>/, m => m + '\n' + AD_SCRIPT);
if (!/<script async src="https:\/\/pagead2/.test(html)) throw new Error('AdSense 脚本未注入');

// 4) 页尾广告位：footer 之前
html = sub(html, /<footer class="foot">/, AD_SLOT + '\n<footer class="foot">');

// 5) 防御性检查：内联 JS 的 $ 系列辅助函数必须原样保留
const DOLLAR = 'var $ = function (s, r) { return (r || document).querySelector(s); };';
const DOLLARS = 'var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };';
if (!js.includes(DOLLAR) || !js.includes(DOLLARS)) throw new Error('源文件里找不到 $ / $$ 定义，请检查锚点');
if (!html.includes(DOLLAR) || !html.includes(DOLLARS)) throw new Error('输出中 $ / $$ 被改写（$ 转义问题）');
if (/<link[^>]+git-tutorial\.(css|js)/.test(html)) throw new Error('仍残留外部引用');

fs.writeFileSync(OUT, html, 'utf8');
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log('OK → ' + OUT + '  (' + kb + ' KB)  源：' +
  (css.length + js.length + before).toLocaleString('en') + ' 字符');
