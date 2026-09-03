/* ============ Git 交互式教学 · 交互脚本 ============ */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 1) 代码块复制按钮 ---------- */
  $$('pre[data-code]').forEach(function (pre) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy';
    btn.textContent = '复制';
    btn.addEventListener('click', function () {
      var text = pre.querySelector('code').innerText.replace(/\s*\n\s{0,}$/g, '\n');
      var done = function () {
        btn.textContent = '已复制 ✓';
        btn.classList.add('done');
        setTimeout(function () { btn.textContent = '复制'; btn.classList.remove('done'); }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { btn.textContent = '复制失败'; }
        document.body.removeChild(ta);
      }
    });
    pre.appendChild(btn);
  });

  /* ---------- 2) 三区流转演示 ---------- */
  (function zoneLab() {
    var term = $('#zone-term'), explain = $('#zone-status');
    var boxWork = $('#zone-work'), boxStage = $('#zone-stage'), boxRepo = $('#zone-repo');
    if (!term) return;

    var lines = [];
    var commits = []; // {sha, msg}
    var stage = false;      // app.js 是否在暂存区
    var modified = false;   // 工作区是否有未暂存改动
    var EDIT_COUNT = 0;

    function rhex(n) {
      var h = '0123456789abcdef', s = '';
      for (var i = 0; i < n; i++) s += h[Math.floor(Math.random() * 16)];
      return s;
    }
    function card(cls, label, extra) {
      return '<div class="file-card ' + cls + '">📄 app.js<span class="dim" style="margin-left:auto;font-size:10.5px">' +
        label + '</span>' + (extra || '') + '</div>';
    }
    function render() {
      boxWork.innerHTML = modified
        ? card('mod', 'modified')
        : '<p class="zone-hint">你正在编辑的真实文件<br><span class="dim">工作区干净</span></p>';
      boxStage.innerHTML = stage
        ? card('staged', 'staged')
        : '<p class="zone-hint">下次提交的「购物车」<br><span class="dim">（空）</span></p>';
      boxRepo.innerHTML = commits.length
        ? commits.map(function (c) {
            return '<div class="file-card comm">✅ <b style="color:#8ee6b6">' + c.sha.slice(0, 7) + '</b>&nbsp;<span class="dim">' + c.msg + '</span></div>';
          }).join('')
        : '<p class="zone-hint">还没有任何提交<br><span class="dim">initial commit 待创建</span></p>';
      term.innerHTML = lines.map(function (l) { return '<span class="' + l.k + '">' + l.t + '</span>'; }).join('') + '<span class="cursor"></span>';
      term.scrollTop = term.scrollHeight;
      status();
    }
    function out(k, t) { lines.push({ k: k, t: t }); if (lines.length > 60) lines.shift(); }
    function run(cmd, outs) {
      out('cmd', '<b>$</b> ' + cmd);
      (outs || []).forEach(function (o) { out(o.k || 'out', o.t !== undefined ? o.t : o); });
    }
    function flash(el, good) {
      if (!el) return;
      el.classList.remove('flash', 'flash-good');
      void el.offsetWidth;
      el.classList.add(good ? 'flash-good' : 'flash');
      setTimeout(function () { el.classList.remove('flash', 'flash-good'); }, 900);
    }
    function status() {
      var n = commits.length;
      var branch = n ? 'main (root-commit → ' + commits[n - 1].sha.slice(0, 7) + ')' : 'main (无提交)';
      var st = 'On branch ' + branch + '\n\nChanges to be committed:\n  (use "git restore --staged <file>…" to unstage)\n' +
        (stage ? '\tnew file:   app.js\n' : '\t(none)\n') +
        '\nChanges not staged for commit:\n' +
        (modified ? '\tmodified:   app.js\n' : '\t(none)\n');
      var tips = {
        clean: '工作区与暂存区都干净，且无提交。先点 <b>✏️ 修改文件</b> 造一点改动。',
        mod: 'Git 现在<b>知道</b> app.js 变了，但它不会自动跟踪内容。要提交得先 <code>add</code>；不想要就 <code>restore</code> 丢弃。',
        both: '注意：暂存的是你 <code>add</code> <b>那一刻</b>的内容快照。之后又改了工作区，就必须再 <code>add</code> 一次，否则提交里没有新改动 —— 这是新手最常见的坑。',
        staged: '暂存 ≠ 提交。此刻仓库里什么也没变，关掉终端也不会留下历史。<code>add</code> 只是把「要提交什么」这件事说清楚。',
        committed: '提交成功了：历史里多了一个不可变快照。<b>回退这一步</b>用 <code>git reset --soft HEAD~1</code>（回到暂存状态）或 <code>git reset --hard HEAD~1</code>（连改动一起丢）。'
      };
      var key = n && !stage && !modified ? 'committed' : (stage && modified ? 'both' : stage ? 'staged' : modified ? 'mod' : (commits.length ? 'clean' : 'clean'));
      if (!n && !stage && !modified) key = 'clean';
      explain.innerHTML = '<h4>此刻 <code>git status</code> 会告诉你：</h4><span class="st">' + st + '</span>' +
        '<div>' + tips[key] + '</div>';
    }

  var acts = {
      edit: function () {
        EDIT_COUNT++; modified = true;
        run('echo "// 第 ' + EDIT_COUNT + ' 次改动" >> app.js',
          stage ? [{ k: 'bad', t: '提示：app.js 已在暂存区，新改动「尚未暂存」。稍后需再次 git add。' }] : []);
      },
      add: function () {
        if (!modified && stage) { run('git add app.js', [{ k: 'out', t: '（无新改动可暂存，暂存区已是最新）' }]); return; }
        if (!modified && !stage) { run('git add app.js', [{ k: 'bad', t: 'warning: 工作区没有任何改动可暂存。先点「✏️ 修改文件」。' }]); return; }
        stage = true; modified = false; flash(boxStage);
        run('git add app.js', [{ k: 'ok', t: '✔ 已写入暂存区。现在 "Changes to be committed" 里有它了。' }]);
      },
      unstage: function () {
        if (!stage) { run('git restore --staged app.js', [{ k: 'bad', t: 'error: 路径 "app.js" 与暂存区不匹配（它没被 add 过）' }]); return; }
        stage = false; modified = true; flash(boxWork);
        run('git restore --staged app.js', [{ k: 'ok', t: '✔ 已从暂存区撤出，文件内容一字未改（安全操作）。' }]);
      },
      commit: function () {
        if (!stage) {
          run('git commit -m "…"', [
            { k: 'bad', t: 'On branch main\nInitial commit\nUntracked files:\n\tapp.js\n\nnothing added to commit but untracked files present' },
            { k: 'ok', t: '→ 先 git add app.js，把「要提交什么」告诉 Git。' }
          ]);
          return;
        }
        if (modified) {
          run('git commit -m "…"', [{ k: 'bad', t: '⚠ 提交只包含暂存的内容：工作区里更晚的改动不会进入本次提交。' }]);
        }
        var n = commits.length + 1;
        var sha = rhex(40);
        commits.push({ sha: sha, msg: '第 ' + n + ' 次提交（快照 #' + n + '）' });
        stage = false; modified = false; flash(boxRepo, true);
        run('git commit -m "update app.js (#' + n + ')"', [
          { k: 'ok', t: '[main ' + sha.slice(0, 7) + '] update app.js (#' + n + ')\n 1 file changed, 1 insertion(+)' },
          { k: 'out', t: '→ 提交 = 给当前暂存内容拍一张只读快照，并把 main 指针前移一格。' }
        ]);
      },
      discard: function () {
        if (!modified) { run('git restore app.js', [{ k: 'bad', t: 'error: 工作区没有未暂存的改动可丢弃。' }]); return; }
        modified = false; flash(boxWork);
        run('git restore app.js', [{ k: 'ok', t: '✔ 工作区文件已还原为暂存区/HEAD 的版本 —— 你的改动没了。' }]);
        out('bad', '这不会写进任何日志。改前不放心就 git stash -u 或先复制一份。');
      },
      reset: function () {
        lines = []; commits = []; stage = false; modified = false; EDIT_COUNT = 0;
        run('rm -rf .git && git init', [{ k: 'ok', t: 'Initialized empty Git repository in /demo/.git/' }]);
      }
    };

    $$('.lab-toolbar .btn[data-zone]').forEach(function (b) {
      b.addEventListener('click', function () { var a = acts[b.dataset.zone]; if (a) { a(); render(); } });
    });
    acts.reset(); render();
  })();

  /* ---------- 3) 分支实验室 ---------- */
  (function branchLab() {
    var svg = $('#graph');
    if (!svg) return;
    var NS = 'http://www.w3.org/2000/svg';
    var COLS = 7, COLW = 96, LANEH = 54, X0 = 54, Y0 = 46, R = 15;
    var colors = ['#4f8cff', '#3ecf8e', '#f0b429', '#a78bfa', '#ff8fa3', '#5eead4', '#fb923c'];
    var commits, branches, head, timer, seq;

    function hex(n) {
      var h = '0123456789abcdef', s = '';
      for (var i = 0; i < n; i++) s += h[Math.floor(Math.random() * 16)];
      return s;
    }
    function el(name, attrs, text) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text;
      return e;
    }
    function xy(c) { return [X0 + c.col * COLW, Y0 + c.lane * LANEH]; }
    function find(id) { for (var i = 0; i < commits.length; i++) if (commits[i].id === id) return commits[i]; return null; }
    function short(id) { var c = find(id); return c ? c.sha.slice(0, 7) : '(无)'; }

    function log(t) {
      var box = $('#lab-term');
      var span = document.createElement('span');
      span.className = t.k;
      span.textContent = t.t;
      box.appendChild(span);
      box.scrollTop = box.scrollHeight;
      while (box.childNodes.length > 70) box.removeChild(box.firstChild);
    }
    function run(cmd, outs) {
      clearTimeout(timer);
      var all = [{ k: 'cmd', t: '$ ' + cmd }].concat((outs || []).map(function (o) {
        return typeof o === 'string' ? { k: 'out', t: o } : o;
      }));
      var i = 0;
      (function step() {
        if (i >= all.length) return;
        log(all[i++]);
        timer = setTimeout(step, 190);
      })();
    }
    function sync() {
      $('#cur-branch').textContent = head;
      $('#head-info').textContent = 'refs/heads/' + head + ' → ' + short(branches[head].sha);
      $('#branch-list').innerHTML = Object.keys(branches).map(function (b) {
        return '<span class="pill' + (b === head ? ' cur' : '') + '">' + b + '</span>';
      }).join('');
    }

    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var rows = Object.keys(branches).length;
      var maxCol = 0;
      commits.forEach(function (c) { maxCol = Math.max(maxCol, c.col); });
      var W = Math.max(760, X0 + maxCol * COLW + 250);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + (Y0 + (rows - 1) * LANEH + 66));

      // 每条分支的泳道基线
      Object.keys(branches).forEach(function (b, i) {
        svg.appendChild(el('line', { x1: 22, y1: Y0 + i * LANEH, x2: W - 22, y2: Y0 + i * LANEH, stroke: branches[b].color, 'class': 'lane' }));
      });
      // 边（父子连线）
      commits.forEach(function (c) {
        if (!c.parents.length) return;
        var p0 = xy(c);
        c.parents.forEach(function (pid) {
          var pa = find(pid);
          if (!pa) return;
          var q = xy(pa);
          var mx = (p0[0] + q[0]) / 2;
          var d = (Math.abs(p0[1] - q[1]) < 1)
            ? 'M' + p0[0] + ',' + p0[1] + ' L' + q[0] + ',' + q[1]
            : 'M' + q[0] + ',' + q[1] + ' C' + mx + ',' + q[1] + ' ' + mx + ',' + p0[1] + ' ' + p0[0] + ',' + p0[1];
          svg.appendChild(el('path', { d: d, stroke: branches[c.branch].color, 'class': 'edge' }));
        });
      });
      // 节点
      commits.forEach(function (c) {
        var p = xy(c), col = branches[c.branch] ? branches[c.branch].color : '#7dd3fc';
        svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: R, stroke: col, 'class': 'node' }));
        svg.appendChild(el('text', { x: p[0], y: p[1] + 3.2, 'text-anchor': 'middle', 'class': 'ntext' }, c.sha.slice(0, 3)));
      });
      // 分支标签 + HEAD
      Object.keys(branches).forEach(function (b, i) {
        var c = find(branches[b].sha);
        if (!c) return;
        var p = xy(c);
        var g = el('g', {});
        var txt = b;
        var w = 14 + txt.length * 6.6;
        g.appendChild(el('rect', { x: p[0] + R + 4, y: p[1] - 23, width: w, height: 17, rx: 5, fill: branches[b].color, opacity: '.9' }));
        g.appendChild(el('text', { x: p[0] + R + 10, y: p[1] - 10.5, 'class': 'lbl', fill: '#0d1220' }, txt));
        if (b === head) {
          var t2 = 'HEAD → ' + b, w2 = 14 + t2.length * 6.2;
          g.appendChild(el('rect', { x: p[0] + R + 4, y: p[1] + 6, width: w2, height: 17, rx: 5, fill: 'none', stroke: '#fff', 'stroke-dasharray': '3 2' }));
          g.appendChild(el('text', { x: p[0] + R + 10, y: p[1] + 18.5, 'class': 'headlbl' }, t2));
        }
        svg.appendChild(g);
      });
      // 提交信息
      commits.forEach(function (c) {
        var p = xy(c);
        svg.appendChild(el('text', { x: p[0] + R + 6, y: p[1] + 34, 'font-size': '9.5', fill: '#7f8ea8' }, c.msg));
      });
      sync();
    }

    function mkCol(lane) {
      var max = -1;
      commits.forEach(function (c) { if (c.lane === lane && c.col > max) max = c.col; });
      return max + 1;
    }
    function commit(msg) {
      var b = branches[head];
      var c = {
        id: 'c' + (++seq), sha: hex(40), msg: msg, branch: head,
        lane: b.lane, col: mkCol(b.lane), parents: b.sha ? [b.sha] : []
      };
      commits.push(c);
      b.sha = c.id;
      return c;
    }

    function nameAsk(what) {
      var v = window.prompt(what, what.indexOf('新分支') >= 0 ? 'feat' : (what.indexOf('合并') >= 0 ? 'feat' : 'main'));
      return v ? v.trim().replace(/\s+/g, '-') : null;
    }

    var actions = {
      commit: function () {
        var n = commits.filter(function (c) { return c.branch === head; }).length + 1;
        var parent = branches[head].sha;
        var c = commit(head + ' 改动 #' + n);
        draw();
        run('git commit -m "' + c.msg + '"', [
          { k: 'ok', t: '[' + head + ' ' + c.sha.slice(0, 7) + '] ' + c.msg },
          { k: 'out', t: '分支指针 ' + head + ' 从 ' + short(parent) + ' 前移到 ' + c.sha.slice(0, 7) + '。所谓「提交」，就是存一个不可变快照 + 把这个指针挪一格。' }
        ]);
      },
      newBranch: function () {
        var name = nameAsk('新分支名（在当前提交上创建并切换）');
        if (!name) return;
        if (branches[name]) { run('git switch -c ' + name, [{ k: 'bad', t: "fatal: a branch named '" + name + "' already exists" }]); return; }
        var lane = Object.keys(branches).length, from = head;
        branches[name] = { sha: branches[head].sha, color: colors[lane % colors.length], lane: lane };
        head = name;
        draw();
        run('git switch -c ' + name, [
          { k: 'ok', t: "Switched to a new branch '" + name + "'" },
          { k: 'out', t: '注意：' + name + ' 现在和 ' + from + ' 指向同一个提交（' + short(branches[name].sha) + '）—— 建分支只是贴了张新便利贴，没有复制任何文件，所以再大的仓库也是瞬间完成。' }
        ]);
      },
      switchB: function () {
        var others = Object.keys(branches).filter(function (b) { return b !== head; });
        if (!others.length) { run('git switch <branch>', [{ k: 'bad', t: '当前只有一个分支，先「新建并切换分支」。' }]); return; }
        var t = window.prompt('切换到哪个分支？\n可选：' + others.join(' / '), others[0]);
        if (!t) return;
        if (!branches[t]) { run('git switch ' + t, [{ k: 'bad', t: "fatal: invalid reference: " + t }]); return; }
        var from = head; head = t; draw();
        run('git switch ' + t, [
          { k: 'ok', t: "Switched to branch '" + t + "'" },
          { k: 'out', t: '从 ' + from + '（' + short(branches[from].sha) + '）到 ' + t + '（' + short(branches[t].sha) + '）：Git 把工作区从 ' + from + ' 的快照原地换成 ' + t + ' 的快照，磁盘上只改写有差异的文件。' }
        ]);
      },
      merge: function () {
        var others = Object.keys(branches).filter(function (b) { return b !== head; });
        if (!others.length) { run('git merge <branch>', [{ k: 'bad', t: '只有一个分支，无法合并。先「新建分支」并在那上面提交一次。' }]); return; }
        var t = window.prompt('把哪个分支并入当前分支 ' + head + '？\n可选：' + others.join(' / '), others[0]);
        if (!t) return;
        if (!branches[t]) { run('git merge ' + t, [{ k: 'bad', t: "fatal: Not a valid object name " + t }]); return; }
        var src = branches[t], dst = branches[head], cur = branches[head].sha;

        if (!cur) { // 目标分支还没有提交
          dst.sha = src.sha; draw();
          run('git merge ' + t, [{ k: 'ok', t: 'Fast-forward\n（目标分支还没有提交，指针直接搬过去）' }]); return;
        }
        if (cur === src.sha) {
          run('git merge ' + t, [{ k: 'ok', t: 'Already up to date.' }, '两者指向同一个提交，无事发生。']); return;
        }
        if (!src.sha) { run('git merge ' + t, [{ k: 'ok', t: 'Already up to date.' }, t + ' 上还没有任何提交。']); return; }
        // src 已包含 dst（可快进）
        if (hasAncestor(src.sha, cur)) {
          dst.sha = src.sha; draw();
          run('git merge ' + t, [
            { k: 'ok', t: 'Updating ' + short(cur) + '..' + short(src.sha) + '\nFast-forward' },
            { k: 'out', t: '快进合并（fast-forward）：' + head + ' 是 ' + t + ' 的祖先，只需把指针前移，不产生新提交。想在历史里留下合并痕迹用 git merge --no-ff。' }
          ]);
          return;
        }
        // 真正的三方合并 → merge commit
        var both = [];
        collect(src.sha, both);
        var keep = {};
        (function walk(id) {
          var c = find(id);
          if (!c) return;
          c.parents.forEach(function (p) { if (!keep[p]) { keep[p] = 1; walk(p); } });
        })(cur);
        var extra = both.filter(function (id) { return !keep[id]; });
        var merged = {
          id: 'c' + (++seq), sha: hex(40), msg: "Merge branch '" + t + "' into " + head,
          branch: head, lane: dst.lane, col: mkCol(dst.lane) + (extra.length ? extra.length : 1),
          parents: [cur, src.sha]
        };
        commits.push(merged);
        dst.sha = merged.id;
        draw();
        run('git merge ' + t, [
          { k: 'ok', t: 'Merge made by the "ort" strategy.\n ' + extra.length + ' files changed' },
          { k: 'out', t: '两条线各自都有独立提交，Git 找到共同祖先做三方合并，生成一个有两个父提交的 merge commit（' + merged.sha.slice(0, 7) + '，带进 ' + extra.length + ' 处改动）。若同一行被双方改过 → 报 CONFLICT，需手工解决后 git add + git commit。' }
        ]);
      },
      rebase: function () {
        if (head === 'main') { run('git rebase main', [{ k: 'bad', t: '你正在 main 上，rebase 到自己没有意义。先切到功能分支（如 feat）再试。' }]); return; }
        if (!branches.main) { run('git rebase main', [{ k: 'bad', t: "fatal: invalid reference: main —— 先「清空重来」恢复 main。" }]); return; }
        var base = branches.main.sha, cur = branches[head].sha;
        if (!cur) { run('git rebase main', [{ k: 'bad', t: '当前分支没有提交，无需 rebase。' }]); return; }
        if (base === cur) { run('git rebase main', [{ k: 'ok', t: 'Current branch ' + head + ' is up to date.' }]); return; }
        if (hasAncestor(cur, base)) { run('git rebase main', [{ k: 'ok', t: 'Current branch ' + head + ' is up to date.' }, 'main 已经在你这条线上了。']); return; }
        var tail = [];
        (function walk(id) {
          if (!id || id === base) return;
          var c = find(id);
          if (!c || c.branch !== head) return;
          tail.unshift(c);
          walk(c.parents[0]);
        })(cur);
        if (!tail.length) { run('git rebase main', [{ k: 'ok', t: 'Current branch ' + head + ' is up to date.' }]); return; }
        var from = find(base);
        var firstCol = (from ? from.col : 0) + 1;
        commits = commits.filter(function (c) { return tail.indexOf(c) < 0; });
        tail.forEach(function (c, i) {
          // 重放：同 id、新哈希、新位置；父提交指向 base 或上一个重放出的提交
          commits.push({
            id: c.id, sha: hex(40), msg: c.msg, branch: head,
            lane: branches[head].lane, col: firstCol + i,
            parents: [i ? tail[i - 1].id : base]
          });
        });
        branches[head].sha = tail[tail.length - 1].id;
        draw();
        run('git rebase main', [
          { k: 'ok', t: 'Successfully rebased and updated refs/heads/' + head + '.' },
          { k: 'out', t: '把 ' + head + ' 上的 ' + tail.length + ' 个提交「摘下来 → 重放」到 main 最新提交（' + short(base) + '）之后，历史变成一条直线。代价：这些提交的哈希全部变了（等于重写历史），所以已推送给别人的分支不要这样干；真要推就得 git push --force-with-lease。' }
        ]);
      },
      resetAll: function () { init(); }
    };

    function collect(id, acc) {
      var c = find(id);
      if (!c) return;
      acc.push(id);
      c.parents.forEach(function (p) {
        if (acc.indexOf(p) < 0) collect(p, acc);
      });
    }
    function hasAncestor(from, target) {
      var seen = [], ok = false;
      (function walk(id) {
        if (!id || ok) return;
        if (id === target) { ok = true; return; }
        if (seen.indexOf(id) >= 0) return;
        seen.push(id);
        var c = find(id);
        if (c) c.parents.forEach(walk);
      })(from);
      return ok;
    }

    function init() {
      commits = []; branches = {}; head = 'main'; seq = 0;
      branches.main = { sha: null, color: colors[0], lane: 0 };
      $('#lab-term').innerHTML = '';
      draw();
      run('git init', [
        { k: 'ok', t: 'Initialized empty Git repository in /demo/.git/' },
        'main 上还没有任何提交。建议顺序：①「💾 在当前分支提交」两次 → ②「🌿 新建分支 feat」→ ③ 在 feat 上提交两次 → ④「🔀 切换」回 main 并提交一次 → ⑤「🔗 合并 feat」。'
      ]);
    }

    [['lb-commit', 'commit'], ['lb-new', 'newBranch'], ['lb-switch', 'switchB'],
     ['lb-merge', 'merge'], ['lb-rebase', 'rebase'], ['lb-reset', 'resetAll']].forEach(function (p) {
      var b = document.getElementById(p[0]);
      if (b) b.addEventListener('click', actions[p[1]]);
    });
    init();
  })();

  /* ---------- 4) 协作工作流：GitHub Flow 循环图 ---------- */
  (function flowLab() {
    var svg = $('#flow-svg');
    if (!svg) return;
    var NS = 'http://www.w3.org/2000/svg';
    var W = 180, H = 84;
    var NODES = [
      { t: '① 开分支', s: '从 main 切出短命分支', x: 30, y: 34 },
      { t: '② 本地提交', s: '小步 commit，信息写清楚', x: 300, y: 34 },
      { t: '③ 保持同步', s: 'rebase 最新 origin/main', x: 570, y: 34 },
      { t: '④ 推送分支', s: 'push -u origin feat', x: 570, y: 196 },
      { t: '⑤ PR + 评审', s: 'CI 跑测试，同事评论', x: 300, y: 196 },
      { t: '⑥ 合并并部署', s: 'main 前进 → 发布', x: 30, y: 196 }
    ];
    var INFO = [
      {
        h: '① 开分支：一切从 main 开始',
        c: 'git switch main && git pull\ngit switch -c feat/csv-import',
        li: [
          '分支名用前缀表达意图：<code>feat/</code> <code>fix/</code> <code>docs/</code> <code>chore/</code>，别人扫一眼侧栏就懂。',
          '一个分支只做一件事。想顺手改点别的？<b>另开一个分支</b>，别塞进同一个 PR。',
          '分支越短命越好（1~3 天）。长期分支 = 未来的冲突地狱。'
        ]
      },
      {
        h: '② 本地提交：给自己留台阶',
        c: 'git add -p\ngit commit -m "feat: 支持 CSV 批量导入"',
        li: [
          '提交是「本地草稿」，不必完美，但每个提交最好都能独立编译通过。',
          '主题行说「做了什么」，正文说「为什么」。见本页下面的 ③ 提交信息生成器。',
          '脏提交（wip / typo）没关系，合并时用 Squash 收干净。'
        ]
      },
      {
        h: '③ 保持同步：别攒冲突',
        c: 'git fetch origin\ngit rebase origin/main     <span class="hl-c"># 本地未推送，rebase 安全</span>',
        li: [
          'main 每前进一次就早一点接进来 —— 冲突要趁记忆还热的时候解决。',
          '只在<b>自己尚未推送</b>（或明确只有自己在用）的分支上 rebase。',
          '已经推过的分支要重写：用 <code>git push --force-with-lease</code>，绝不用裸 <code>-f</code>。'
        ]
      },
      {
        h: '④ 推送分支：让改动可见',
        c: 'git push -u origin feat/csv-import',
        li: [
          '<code>-u</code> 建立跟踪关系，之后一条 <code>git push</code> 即可。',
          '只推自己的分支，永远不直接推 main —— 打开保护分支，让机器替你守住规矩。',
          '推完就是备份：换电脑、硬盘挂了，工作都在。'
        ]
      },
      {
        h: '⑤ 开 PR + 评审：改的是同一分支',
        c: 'git commit -m "fix: 处理空行报错"\ngit push               <span class="hl-c"># PR 自动更新</span>',
        li: [
          '评审中被要求修改时，<b>在同一个分支继续提交并 push</b>，PR 会自动刷新 —— 不要新开 PR。',
          'CI 红了先修 CI。跳过检查合并一次，就会有第二次。',
          '描述里写「为什么 + 怎么测的 + 影响面」，比贴一大段 diff 有价值得多。'
        ]
      },
      {
        h: '⑥ 合并 → 部署 → 删分支',
        c: 'Squash and merge      <span class="hl-c"># 或团队约定的方式</span>\ngit push origin --delete feat/csv-import\ngit switch main && git pull',
        li: [
          '合并方式怎么挑见下面 ②；合并后<b>立刻部署</b>，这才是 GitHub Flow 的意义。',
          '删掉功能分支：使命已结束，留着只会让人误以为还有未完成的工作。',
          '回到 main 拉最新，下一个循环从 ① 重新开始。'
        ]
      }
    ];

    function el(n, a, t) {
      var e = document.createElementNS(NS, n);
      for (var k in a) e.setAttribute(k, a[k]);
      if (t !== undefined) e.textContent = t;
      return e;
    }
    // 每条边连接节点 i 与 i+1（最后一条回到节点 0）
    function edgeList() {
      var P = NODES.map(function (n) { return { cx: n.x + W / 2, cy: n.y + H / 2, l: n.x, r: n.x + W, t: n.y, b: n.y + H }; });
      return [
        [P[0].r, P[0].cy, P[1].l, P[1].cy],
        [P[1].r, P[1].cy, P[2].l, P[2].cy],
        [P[2].cx, P[2].b, P[3].cx, P[3].t],
        [P[3].l, P[3].cy, P[4].r, P[4].cy],
        [P[4].l, P[4].cy, P[5].r, P[5].cy],
        [P[5].cx, P[5].t, P[0].cx, P[0].b]
      ];
    }

    var defs = el('defs', {});
    var mk = el('marker', { id: 'fah', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6.5', markerHeight: '6.5', orient: 'auto-start-reverse' });
    mk.appendChild(el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#7f8ea8' }));
    defs.appendChild(mk);
    svg.appendChild(defs);

    var E = edgeList();
    E.forEach(function (e) {
      svg.appendChild(el('line', { x1: e[0], y1: e[1], x2: e[2], y2: e[3], stroke: '#3a4560', 'class': 'arc', 'marker-end': 'url(#fah)' }));
    });
    var live = E.map(function (e) {
      var l = el('line', { x1: e[0], y1: e[1], x2: e[2], y2: e[3], stroke: '#3ecf8e', 'class': 'arc-live', opacity: '0' });
      svg.appendChild(l); return l;
    });
    var boxes = [], titles = [];
    NODES.forEach(function (n) {
      var g = el('g', {});
      var r = el('rect', { x: n.x, y: n.y, width: W, height: H, rx: 11, 'class': 'nbox' });
      g.appendChild(r); boxes.push(r);
      var t = el('text', { x: n.x + 15, y: n.y + 34, 'class': 'nt' }, n.t);
      g.appendChild(t); titles.push(t);
      g.appendChild(el('text', { x: n.x + 15, y: n.y + 58, 'class': 'ns' }, n.s));
      svg.appendChild(g);
    });
    var dot = el('circle', { r: 7, cx: NODES[0].x + 12, cy: NODES[0].y - 9, fill: '#4f8cff', 'class': 'dot glow' });
    svg.appendChild(dot);

    var cur = 0, anim = 0, timer = null;
    function paint() {
      boxes.forEach(function (b, i) { b.setAttribute('class', 'nbox' + (i === cur ? ' on' : (i < cur ? ' done' : ''))); });
      titles.forEach(function (t, i) { t.setAttribute('class', 'nt' + (i === cur ? ' on' : (i < cur ? ' done' : ''))); });
      live.forEach(function (l, i) { l.setAttribute('opacity', i <= cur - 1 ? '1' : '0'); });
      $('#flow-step').textContent = (cur + 1) + ' / ' + NODES.length + (cur === NODES.length - 1 ? ' · 下一步回到 ①' : '');
      var info = INFO[cur];
      $('#flow-explain').innerHTML = '<h4>' + info.h + '</h4>' +
        '<span class="cmdline">' + info.c + '</span><ul>' + info.li.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ul>';
    }
    function travel(edgeIdx, fill, done) {
      var e = E[edgeIdx];
      if (e === undefined) { if (done) done(); return; }
      var token = ++anim, t0 = null, dur = 520;
      dot.setAttribute('fill', fill);
      (function step(ts) {
        if (token !== anim) return;
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        var ease = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        dot.setAttribute('cx', e[0] + (e[2] - e[0]) * ease);
        dot.setAttribute('cy', e[1] + (e[3] - e[1]) * ease);
        if (k < 1) requestAnimationFrame(step); else if (done) done();
      })(performance.now());
    }
    function placeDot() {
      dot.setAttribute('cx', NODES[cur].x + 12);
      dot.setAttribute('cy', NODES[cur].y - 9);
    }
    function go(next) {
      next = (next + NODES.length) % NODES.length;
      if (next === cur + 1) {
        // 前进一步：沿边动画
        travel(cur, cur === NODES.length - 2 ? '#3ecf8e' : '#4f8cff', function () {
          cur = next; paint();
        });
      } else {
        // 后退 / 环形跳转（⑥→①、①→⑥）：直接落位，不做五边巡游
        anim++; cur = next; paint(); placeDot();
      }
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; $('#flow-auto').textContent = '▶ 自动播放'; }
    }
    $('#flow-next').addEventListener('click', function () { stop(); go(cur + 1); });
    $('#flow-prev').addEventListener('click', function () { stop(); go(cur - 1); });
    $('#flow-auto').addEventListener('click', function () {
      if (timer) { stop(); return; }
      this.textContent = '⏸ 暂停';
      timer = setInterval(function () { go(cur + 1); }, 2800);
    });
    paint();
  })();

  /* ---------- 5) 提交信息生成器 ---------- */
  (function commitBuilder() {
    var out = $('#b-out');
    if (!out) return;
    var TYPES = [
      ['feat', '新功能 → semver minor'],
      ['fix', '修 bug → semver patch'],
      ['docs', '只改文档'],
      ['style', '格式（不改逻辑：空格、格式化）'],
      ['refactor', '重构：既不加功能也不修 bug'],
      ['perf', '性能优化'],
      ['test', '增删测试'],
      ['build', '构建系统 / 依赖（npm、docker…）'],
      ['ci', 'CI 配置与脚本'],
      ['chore', '杂务：不属于以上任何一类'],
      ['revert', '回滚某次提交']
    ];
    var state = { type: 'feat', scope: '', brk: false, subj: '', body: '' };

    $('#b-type').innerHTML = TYPES.map(function (t, i) {
      return '<span class="pill' + (i === 0 ? ' on' : '') + '" data-t="' + t[0] + '" title="' + t[1] + '">' + t[0] + '</span>';
    }).join('');

    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function render() {
      var tips = [];
      var td = TYPES.filter(function (t) { return t[0] === state.type; })[0][1];
      out.innerHTML = '<span class="t-scope">' + esc(state.type + (state.scope ? '(' + state.scope + ')' : '')) + '</span>' +
        (state.brk ? '<span class="t-brk">!</span>' : '') + ': ' +
        '<span style="color:#fff">' + esc(state.subj || '‹描述›') + '</span>' +
        (state.body ? '\n\n' + esc(state.body) : '') +
        (state.brk ? '\n\n<span class="t-brk">BREAKING CHANGE: </span>' + esc(state.body || '说明破坏了什么、如何迁移') : '');

      tips.push('<b>' + state.type + '</b>：' + td + '。');
      if (!state.subj) {
        tips.push('<span class="no">主题必填</span> —— 动词开头、第一人称现在时（「新增」而不是「新增了」）。');
      } else {
        if (state.subj.length > 50) tips.push('<span class="no">主题 ' + state.subj.length + ' 字偏长</span>：git log --oneline 和 GitHub 标题都会被截断，建议 ≤50。');
        if (/[。.，,；;]$/.test(state.subj)) tips.push('<span class="no">去掉结尾标点</span> —— 它是标题，不是句子。');
        if (state.type === 'feat' && /^(fix|修复|修改)/.test(state.subj)) tips.push('类型与内容似乎不符：写的是修复，类型却是 feat。');
        if (state.subj.length <= 50 && !/[。.，,；;]$/.test(state.subj)) tips.push('✅ 格式合法，可被 commitlint 接受并用于自动生成 CHANGELOG。');
      }
      if (state.brk) tips.push('破坏性变更：除 <code>!</code> 外还要有 <code>BREAKING CHANGE:</code> 页脚，semver 进 <b>major</b>。');
      $('#b-tips').innerHTML = tips.join(' ');
    }

    $('#b-type').addEventListener('click', function (e) {
      var p = e.target.closest('.pill'); if (!p) return;
      $$('#b-type .pill').forEach(function (x) { x.classList.remove('on'); });
      p.classList.add('on'); state.type = p.dataset.t; render();
    });
    $('#b-scope').addEventListener('input', function () { state.scope = this.value.trim().replace(/[()\s]/g, ''); render(); });
    $('#b-subj').addEventListener('input', function () { state.subj = this.value.trim(); render(); });
    $('#b-body').addEventListener('input', function () { state.body = this.value.trim(); render(); });
    $('#b-break').addEventListener('change', function () { state.brk = this.checked; render(); });
    render();
  })();

  /* ---------- 6) 速查表 ---------- */
  (function cheatsheet() {
    var tbody = $('#cmd-table tbody');
    if (!tbody) return;
    var CATS = ['全部', '入门', '暂存提交', '分支', '查看历史', '远程', '协作', '撤销恢复', '技巧'];
    var DATA = [
      ['git init', '把当前目录变成 Git 仓库（新增 .git 目录）', '入门'],
      ['git clone &lt;url&gt;', '克隆远程仓库（含全部分支与完整历史）', '入门'],
      ['git config --global user.name "…"', '设置提交作者名（写进每个提交）', '入门'],
      ['git config --list', '查看当前生效的配置', '入门'],
      ['git status', '当前分支、已改动、已暂存、未跟踪 —— 卡住先跑它', '入门'],
      ['git add &lt;file&gt;', '暂存指定文件', '暂存提交'],
      ['git add .', '暂存当前目录下所有已跟踪+新文件', '暂存提交'],
      ['git add -p', '逐块交互式挑选要暂存的改动', '暂存提交'],
      ['git commit -m "msg"', '把暂存区内容做成一次提交', '暂存提交'],
      ['git commit -am "msg"', '自动暂存已跟踪文件的改动后提交（不含新文件）', '暂存提交'],
      ['git commit --amend', '修改最后一次提交的信息或内容（未推送时用）', '暂存提交'],
      ['git switch -c &lt;br&gt;', '新建并切换到分支（旧写法 git checkout -b）', '分支'],
      ['git switch &lt;br&gt;', '切换分支', '分支'],
      ['git branch', '列出本地分支；-a 含远程；-d 删除；-D 强删', '分支'],
      ['git merge &lt;br&gt;', '把分支并入当前分支（可能生成 merge commit）', '分支'],
      ['git merge --no-ff &lt;br&gt;', '禁止快进，强制保留一个合并提交', '分支'],
      ['git rebase &lt;base&gt;', '把当前分支的提交重放到 base 之后（重写历史）', '分支'],
      ['git cherry-pick &lt;sha&gt;', '把某一次提交单独摘到当前分支', '分支'],
      ['git log --oneline --graph', '单行历史图，最实用的查看方式', '查看历史'],
      ['git show &lt;sha&gt;', '某次提交的元信息与完整差异', '查看历史'],
      ['git diff', '工作区 vs 暂存区（还没 add 的改动）', '查看历史'],
      ['git diff --staged', '暂存区 vs 仓库（即将提交的内容）', '查看历史'],
      ['git blame &lt;file&gt;', '每行代码由哪个提交、谁写的', '查看历史'],
      ['git tag -a v1.0 -m "…"', '给提交打标签（版本发布）', '查看历史'],
      ['git remote -v', '查看远程别名与地址', '远程'],
      ['git remote add origin &lt;url&gt;', '添加远程仓库', '远程'],
      ['git fetch --all --prune', '下载远程状态但不改动工作区', '远程'],
      ['git pull', 'fetch + merge（--rebase 则 fetch + rebase）', '远程'],
      ['git push -u origin &lt;br&gt;', '推送并建立跟踪关系，之后可裸 push', '远程'],
      ['git push --force-with-lease', '安全强推：远程被别人动过就拒绝', '远程'],
      ['git push origin --delete &lt;br&gt;', '删除远程分支（PR 合并后收尾）', '协作'],
      ['git branch -d &lt;br&gt;', '删除已合并的本地分支（-D 不强检查）', '协作'],
      ['git log origin/main..HEAD', '列出「我有、上游没有」的提交，PR 里就是这些', '协作'],
      ['gh pr create / view / checkout', 'GitHub CLI：命令行开 PR、看状态、拉对方分支', '协作'],
      ['gh pr checks / merge --squash', '看 CI 状态 / 用 squash 方式合并 PR', '协作'],
      ['git config pull.rebase true', '让 pull 默认用 rebase，避免满天飞 Merge branch', '协作'],
      ['git restore &lt;file&gt;', '丢弃工作区里某文件的未暂存改动', '撤销恢复'],
      ['git restore --staged &lt;file&gt;', '取消暂存，保留文件内容（旧写法 git reset &lt;file&gt;）', '撤销恢复'],
      ['git reset --soft HEAD~1', '撤销上一次提交，改动留在暂存区', '撤销恢复'],
      ['git reset --mixed HEAD~1', '撤销提交并取消暂存，改动留在工作区（默认）', '撤销恢复'],
      ['git reset --hard HEAD~1', '彻底丢弃提交与改动（可用 reflog 找回）', '撤销恢复'],
      ['git revert &lt;sha&gt;', '用一次新提交抵消某次提交，适合已推送的历史', '撤销恢复'],
      ['git clean -nd / -fd', '删除未跟踪文件；先 -n 预演再动手', '撤销恢复'],
      ['git stash push -u -m "…"', '把当前改动（含未跟踪）临时收起', '撤销恢复'],
      ['git stash pop / list / drop', '恢复并删除 / 列表 / 丢弃某条 stash', '撤销恢复'],
      ['git reflog', 'HEAD 移动流水账，误删提交的救命稻草', '撤销恢复'],
      ['git rm --cached &lt;file&gt;', '停止跟踪某文件但保留本地副本', '技巧'],
      ['git checkout --ours / --theirs &lt;file&gt;', '冲突时整个文件选自己或选对方', '技巧'],
      ['git mergetool', '调用图形化合并工具解决冲突', '技巧'],
      ['git bisect start / good / bad', '二分定位引入 bug 的提交，自动 checkout', '技巧'],
      ['git worktree add ../w dev', '同一仓库同时检出多个分支到不同目录', '技巧'],
      ['git blame -L 10,20 &lt;file&gt;', '只看第 10~20 行的来源', '技巧'],
      ['git &lt;cmd&gt; -h', '任何命令的用法速查（比 man 更快）', '技巧']
    ];
    tbody.innerHTML = DATA.map(function (r) {
      return '<tr data-cat="' + r[2] + '"><td><code>' + r[0] + '</code></td><td>' + r[1] + '</td></tr>';
    }).join('');

    var tabs = $('#cmd-tabs');
    tabs.innerHTML = CATS.map(function (c, i) {
      return '<button type="button" class="tab' + (i === 0 ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>';
    }).join('');

    var input = $('#cmd-search'), empty = $('#cmd-empty');
    function apply() {
      var cat = ($('.tab.on', tabs) || {}).dataset.cat || '全部';
      var q = (input.value || '').trim().toLowerCase();
      var shown = 0;
      $$('tr', tbody).forEach(function (tr) {
        var okCat = cat === '全部' || tr.dataset.cat === cat;
        var okQ = !q || tr.textContent.toLowerCase().indexOf(q) >= 0;
        var show = okCat && okQ;
        tr.classList.toggle('hide', !show);
        if (show) shown++;
      });
      empty.hidden = shown !== 0;
    }
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (!b) return;
      $$('.tab', tabs).forEach(function (t) { t.classList.remove('on'); });
      b.classList.add('on');
      apply();
    });
    input.addEventListener('input', apply);
    apply();
  })();

  /* ---------- 5) 测验 ---------- */
  (function quiz() {
    var box = $('#quiz-box'), form = $('#quiz-form');
    if (!box) return;
    var QS = [
      {
        q: 'git add 的作用是？',
        opts: ['把文件改动立即保存到仓库历史中', '把当前改动放进暂存区，作为下一次提交的内容', '把本地提交上传到远程仓库'],
        a: 1,
        why: 'add 只做「暂存」，仓库历史里什么都没有；只有 commit 才生成快照，push 才上传。'
      },
      {
        q: 'git status 显示 <code>Changes to be committed</code>，这些改动处于哪个区域？',
        opts: ['工作区（未 add）', '暂存区（已 add、未 commit）', '仓库（已 commit）'],
        a: 1,
        why: '这段标题就是暂存区内容，即「下次 commit 会带上它们」。<code>Changes not staged for commit</code> 才是工作区改动。'
      },
      {
        q: '把 main 分支上的工作换成 feat 分支的内容，现代推荐写法是？',
        opts: ['git checkout feat', 'git switch feat', 'git merge feat'],
        a: 1,
        why: 'Git 2.23 起 switch 负责切分支、restore 负责还原文件，把旧 checkout 的两个职责拆开，语义更清楚。merge 是合并不是切换。'
      },
      {
        q: '工作区有未提交改动，需要马上切分支，最稳妥的做法是？',
        opts: ['git stash 把改动临时收起来', '直接删掉改动文件', 'git reset --hard 后切换'],
        a: 0,
        why: 'stash 可逆；reset --hard 会连带丢掉未提交内容（虽可用 reflog 尝试救，但通常救不回来 —— 因为它根本没进过仓库）。'
      },
      {
        q: 'main 已有新提交，想把 dev 改成「基于最新 main」且只保留一条直线历史：在 dev 上执行？',
        opts: ['git merge main', 'git pull origin main', 'git rebase main'],
        a: 2,
        why: 'rebase 把 dev 的提交重放到 main 之后，历史线性；但会重写哈希，dev 若已共享需 --force-with-lease 推送。'
      },
      {
        q: 'main 上已有新提交，此时把 dev 并入 main，结果是？',
        opts: ['一定是快进（fast-forward）', '生成一个新的 merge commit', 'Git 直接拒绝合并'],
        a: 1,
        why: '快进只在目标分支是当前分支祖先时发生。双方各自前进后，Git 会做三方合并并创建有两个父提交的 merge commit（--no-ff 可强制如此）。'
      },
      {
        q: '解决冲突时，处理完文件内容后下一步是？',
        opts: ['git add &lt;文件&gt;，然后 git commit 或 git rebase --continue', '直接 git push', '删掉 .git 目录重新 clone'],
        a: 0,
        why: 'add 就是告诉 Git「这个文件我处理好了」。全部处理完再 commit（merge 场景）或 rebase --continue（rebase 场景）。'
      },
      {
        q: '不小心执行了 git reset --hard，丢了 3 个提交，怎么找回？',
        opts: ['git reflog 找到那几次提交，再 reset --hard 或 cherry-pick 回去', '不可能找回，Git 是单向的', '重新 git init'],
        a: 0,
        why: 'reflog 记录 HEAD 的每一步移动，被 reset 掉的提交默认至少保留 30 天。以后折腾历史前先 git branch backup 更保险。'
      },
      {
        q: 'GitHub Flow 里，PR 评审时被要求修改，正确做法是？',
        opts: ['在同一个分支继续 commit + push，PR 自动更新', '关掉 PR，新开一个分支重新开 PR', '直接在 main 上改并 push'],
        a: 0,
        why: 'PR 跟踪的是分支，往同一分支 push 会自动刷新 diff 与评论线。main 通常受保护，也不该被直接推送。'
      },
      {
        q: '团队希望 main 的历史就是「功能清单」，一个 PR 只留一条提交，合并方式选？',
        opts: ['Squash and merge', 'Create a merge commit', 'Rebase and merge'],
        a: 0,
        why: 'Squash 把 PR 里的 wip / typo 等提交压成一个功能单位；merge commit 会保留全部细节，rebase merge 保留细节且改哈希。配套纪律是「一个 PR 只做一件事」。'
      }
    ];

    box.innerHTML = QS.map(function (x, i) {
      return '<div class="q" data-i="' + i + '"><p class="qt">' + (i + 1) + '. ' + x.q + '</p>' +
        x.opts.map(function (o, j) {
          return '<label><input type="radio" name="q' + i + '" value="' + j + '"><span>' + o + '</span></label>';
        }).join('') +
        '<div class="why"></div></div>';
    }).join('');

    function scoreShow() {
      var right = 0;
      $$('.q', box).forEach(function (card) {
        var i = +card.dataset.i, ans = QS[i].a;
        var sel = $('input:checked', card);
        card.classList.add('done');
        card.classList.toggle('right', !!sel && +sel.value === ans);
        card.classList.toggle('wrong', !!sel && +sel.value !== ans);
        var ok = !!sel && +sel.value === ans;
        if (ok) right++;
        card.querySelector('.why').innerHTML =
          (ok ? '<span class="tag ok">正确</span>' : '<span class="tag no">再看看</span>') +
          ' 正确答案：' + String.fromCharCode(65 + ans) + '。' + QS[i].why;
      });
      var s = $('#quiz-score');
      s.textContent = '得分 ' + right + ' / ' + QS.length + '　' +
        (right === QS.length ? '🎉 全对，可以去带别人了' :
         right >= QS.length - 2 ? '👍 很稳，错的看解释' :
         right >= QS.length / 2 ? '🙂 基础有了，重点复习「三区流转」与「急救包」' : '💪 建议先回到第 2 节把三区流转点几遍');
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); scoreShow(); });
    $('#quiz-reset').addEventListener('click', function (e) {
      e.preventDefault();
      $$('input', box).forEach(function (i) { i.checked = false; });
      $$('.q', box).forEach(function (c) { c.classList.remove('done', 'right', 'wrong'); });
      $$('.why', box).forEach(function (w) { w.innerHTML = ''; });
      $('#quiz-score').textContent = '';
    });
  })();

  /* ---------- 7) TOC 高亮 ---------- */
  (function toc() {
    var links = $$('#toc a');
    if (!links.length || !window.IntersectionObserver) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.style.background = ''; a.style.borderColor = ''; a.style.color = ''; });
        var a = map[e.target.id];
        if (a) { a.style.background = '#4f8cff'; a.style.borderColor = '#4f8cff'; a.style.color = '#fff'; }
      });
    }, { rootMargin: '-20% 0px -65% 0px' });
    $$('main section').forEach(function (s) { io.observe(s); });
  })();
})();
