const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const T = $('#t');
const F = $('#feed');
const Q = $('#q');
const RM = matchMedia('prefers-reduced-motion: reduce)').matches;

const root = document.documentElement;
try {
  const s = localStorage.getItem('linkedqueue-theme');
  if (s) root.dataset.theme = s;
} catch (e) {}

$('#th').onclick = () => {
  const d = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const n = d === 'dark' ? 'light' : 'dark';
  root.dataset.theme = n;
  try { localStorage.setItem('linkedqueue-theme', n); } catch (e) {}
};

function ln(cls, ...parts) {
  const d = document.createElement('div');
  d.className = cls || '';
  parts.forEach(p => {
    if (typeof p === 'string') d.append(p);
    else {
      const s = document.createElement('span');
      s.className = p[0];
      s.textContent = p[1];
      d.append(s);
    }
  });
  T.append(d);
  scroll();
  return d;
}

const near = () => F.scrollHeight - F.scrollTop - F.clientHeight < 140;
function scroll() { F.scrollTop = F.scrollHeight; }

let busy = false;
let abort = false;
let pend = null;
let tools = 0;
let hist = [];
let hi = 0;
let t0 = 0;
let tick = 0;
let fr = 0;

const R = { p: $('#rp'), f: $('#rf'), e: $('#re') };

let currentSessionId = null;
let currentSession = null;
const KNOWN_MODELS = ['gemma4:31b', 'gpt-oss:120b', 'gpt-oss:20b', 'glm-5.3', 'glm-5.3-flash', 'deepseek-v4-pro:0813', 'deepseek-v4.1-flash', 'kimi-k2.7-code', 'mistral-large-4', 'minimax-m3', 'nemotron-3-ultra', 'nemotron-3-super', 'mimo-v2.6-pro', 'muse-spark-open', 'beam'];
let currentModel = localStorage.getItem('linkedqueue-model') || 'gemma4:31b';
// If cached model is not in our known list, reset to default
if (!KNOWN_MODELS.includes(currentModel)) {
  currentModel = 'gemma4:31b';
  localStorage.setItem('linkedqueue-model', currentModel);
}
let currentMode = localStorage.getItem('linkedqueue-mode') || 'plan';
let autoApprove = localStorage.getItem('linkedqueue-auto-approve') === 'true';
let fsDir = '';
let availableModels = [currentModel];

// --- @ file reference autocomplete ---
let acOpen = false, acIdx = 0, acItems = [];
const AC = $('#ac') || (() => {
  const d = document.createElement('div');
  d.id = 'ac';
  d.style = 'display:none;position:absolute;z-index:60;background:var(--bg);border:1px solid var(--fg);max-height:240px;overflow:auto;width:min(60vw,600px)';
  document.body.appendChild(d);
  return d;
})();

function acRender() {
  AC.replaceChildren();
  AC.style.display = acOpen ? 'block' : 'none';
  if (!acOpen) return;
  acItems.forEach((it, i) => {
    const r = document.createElement('div');
    r.className = 'ac-i' + (i === acIdx ? ' on' : '');
    r.textContent = it;
    r.onclick = () => { acSelect(it); };
    AC.appendChild(r);
  });
  // position below input
  const rect = Q.getBoundingClientRect();
  AC.style.left = rect.left + 'px';
  AC.style.top = (rect.top + rect.height + 4) + 'px';
}
function acOpenAt(query) {
  acOpen = true; acIdx = 0;
  // list workspace files matching query
  const files = [];
  try {
    const walk = (dir) => {
      const entries = fsTreeCache[dir] || [];
      entries.forEach(e => {
        if (!e.isDirectory && (!query || e.name.toLowerCase().includes(query.toLowerCase()))) files.push(e.path);
        if (e.isDirectory && (!query || e.path.toLowerCase().includes(query.toLowerCase()))) files.push(e.path + '/');
      });
    };
    walk(fsDir || '');
  } catch {}
  acItems = files.slice(0, 30);
  acRender();
}
function acClose() { acOpen = false; acRender(); }
function acSelect(it) {
  acClose();
  const pos = Q.selectionStart;
  const before = Q.value.slice(0, pos);
  const after = Q.value.slice(pos);
  const atIdx = before.lastIndexOf('@');
  const newBefore = atIdx >= 0 ? before.slice(0, atIdx) + '@' + it : before + '@' + it;
  Q.value = newBefore + after;
  Q.selectionStart = Q.selectionEnd = newBefore.length;
  Q.focus();
}

// --- file tree cache ---
const fsTreeCache = {};

async function loadFsTreeCached(dir) {
  if (!window.harness) return [];
  const entries = await harness.fs.tree(dir || undefined);
  fsTreeCache[dir || ''] = entries;
  return entries;
}

// --- status bar ---
function setSt() {
  document.body.classList.toggle('busy', busy);
  document.body.classList.toggle('wait', !!pend);
  const stText = pend ? 'awaiting approval' : busy ? 'working' : 'ready';
  const ssEl = $('#ss');
  if (ssEl) ssEl.textContent = stText;
  const sstEl = $('#sst');
  if (sstEl) sstEl.textContent = stText;
  const snEl = $('#sn');
  if (snEl) snEl.textContent = tools + ' tool' + (tools === 1 ? '' : 's');
  if (Q) Q.placeholder = busy ? 'working… esc to interrupt' : 'message or /help';
  const lsEl = $('#ls');
  if (lsEl) lsEl.textContent = stText;
  const ltcEl = $('#ltc');
  if (ltcEl) ltcEl.textContent = tools;
  const lstateEl = $('#lstate');
  if (lstateEl) lstateEl.textContent = currentSession?.state || (busy ? 'running' : 'idle');
  const lsidEl = $('#lsid');
  if (lsidEl) lsidEl.textContent = currentSessionId ? currentSessionId.slice(0, 12) + '…' : '—';
  const aa = $('#auto-approve');
  if (aa) aa.textContent = autoApprove ? 'AUTO' : 'ask';
}
function spin(on) {
  clearInterval(tick);
  if (!on) return;
  t0 = Date.now();
  tick = setInterval(() => {
    fr = (fr + 1) % 10;
    $('#sp').textContent = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[fr];
    $('#wt').textContent = 'working ' + Math.floor((Date.now() - t0) / 1000) + 's';
  }, 90);
}

// --- plan ---
const P = { todos: [], at: 0, el: null };
function drawPlan() {
  if (!P.el) {
    P.el = ln('plan');
    P.el.onclick = () => P.el.classList.toggle('open');
  }
  const n = P.todos.length;
  const d = Math.min(P.at, n);
  const w = 14;
  const f = n === 0 ? 0 : Math.round((d / n) * w);
  P.el.replaceChildren();
  const h = document.createElement('div');
  h.className = 'b ph';
  h.append('plan  ');
  const bar = document.createElement('span');
  bar.className = 'bar';
  bar.textContent = '█'.repeat(f) + '░'.repeat(w - f);
  h.append(bar, '  ' + d + '/' + n);
  const cu = document.createElement('span');
  cu.className = 'cur';
  cu.textContent = '  ▸ ' + (P.todos[d]?.text || 'done');
  h.append(cu);
  P.el.append(h);
  P.todos.forEach((t, i) => {
    const r = document.createElement('div');
    const s = i < P.at ? '✓ ' : i === P.at ? '▸ ' : '○ ';
    r.textContent = s + t.text;
    r.className = i < P.at ? 'dim' : i === P.at ? 'b' : 'faint';
    P.el.append(r);
  });
  R.p.replaceChildren();
  const clone = P.el.cloneNode(true);
  clone.onclick = () => { /* keep */ };
  R.p.appendChild(clone);
}

async function type(node, text) {
  for (let i = 0; i < text.length; i += 3) {
    node.textContent = text.slice(0, i + 3);
    if (near()) scroll();
    await sleep(RM ? 0 : 12);
  }
  node.textContent = text;
}
const sleep = ms => new Promise((r, j) => setTimeout(() => abort ? j('abort') : r(), RM ? Math.min(ms, 20) : ms));

function toolRow(name, args, result) {
  const d = ln('tool', ['dim', '○ '], ['b', name], ['dim', '(' + (args?.command || args?.path || Object.keys(args || {}).join(',')) + ')']);
  d.dataset.tool = name;
  tools++;
  setSt();
  setTimeout(() => {
    const first = ln('res t', '⎿ ', statusText(result));
    if (statusText(result).includes('fail') || statusText(result).includes('Rejected')) first.className += ' b';
    if (result && result.diff) {
      first.onclick = () => showDiff(name, result.diff, args.path || 'file');
    } else {
      first.onclick = () => {
        const m = ln('more');
        m.textContent = JSON.stringify({ args, result }, null, 2);
        m.classList.toggle('on');
        if (m.classList.contains('on')) first.onclick = () => m.remove();
      };
    }
  }, 200);
}
function statusText(r) {
  if (!r || typeof r !== 'object') return 'ok';
  if (r.error === 'Rejected by user.') return 'Rejected by user.';
  if (r.error || r.timed_out || (r.exit_code != null && r.exit_code !== 0)) return 'fail';
  return 'ok';
}

function file(name, body) {
  const d = ln('file', ['b', '✎ '], 'wrote ', ['b', name], ['dim', '  [view]']);
  const doc = document.createElement('div');
  doc.className = 'doc';
  const p = document.createElement('pre');
  p.textContent = body;
  doc.append(p);
  T.append(doc);
  FILES[name] = body;
  FD[name] = doc;
  d.onclick = () => openFile(name, body);
  railFile(name);
  if (wide()) openFile(name, body);
}

const FILES = {};
const FD = {};

function openFile(n, body) {
  if (wide()) {
    $('#rvt').textContent = n;
    $('#rvb').textContent = body !== undefined ? body : (FILES[n] || '(file content not loaded)');
    $('#rv').classList.add('on');
  } else {
    if (FD[n]) FD[n].classList.toggle('on');
    scroll();
  }
}
function railFile(n) {
  const o = R.f.querySelector('[data-n="' + n + '"]');
  if (o) o.remove();
  const b = document.createElement('button');
  b.className = 'ri cmd';
  b.dataset.n = n;
  const a = document.createElement('span');
  a.textContent = '✎ ' + n;
  const c = document.createElement('span');
  c.textContent = 'view';
  b.append(a, c);
  b.onclick = () => openFile(n, FILES[n]);
  R.f.append(b);
}
$('#rvx').onclick = () => $('#rv').classList.remove('on');

// --- diff viewer modal ---
const DIFF_MODAL = $('#diffModal') || (() => {
  const d = document.createElement('div');
  d.id = 'diffModal';
  d.className = 'modal';
  d.style.display = 'none';
  d.innerHTML = `
    <div class="modal-content" style="width:min(90vw,1000px);max-height:80vh;display:flex;flex-direction:column">
      <div class="modal-header">diff <span id="diffTitle" style="margin-left:1ch"></span><button class="tx" id="diffClose" aria-label="Close">[x]</button></div>
      <div id="diffBody" style="flex:1;overflow:auto;padding:12px"></div>
      <div class="modal-actions" style="justify-content:flex-end"><button class="btn" id="diffDone">[done]</button></div>
    </div>`;
  document.body.appendChild(d);
  $('#diffClose').onclick = () => { d.style.display = 'none'; };
  $('#diffDone').onclick = () => { d.style.display = 'none'; };
  d.onclick = (e) => { if (e.target === d) d.style.display = 'none'; };
  return d;
})();
function showDiff(toolName, diff, path) {
  $('#diffTitle').textContent = ' ' + path + '  ·  ' + toolName;
  $('#diffBody').innerHTML = '';
  const hunks = parseDiff(diff);
  const pre = document.createElement('pre');
  pre.style = 'font-family:ui-monospace,monospace;font-size:12px;line-height:1.4;white-space:pre-wrap';
  let html = '';
  for (const h of hunks) {
    html += `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n`;
    for (const line of h.lines) {
      const esc = line.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      if (line.type === 'add') html += `<span style="color:#0a0;background:#eaffea;">+ ${esc}</span>\n`;
      else if (line.type === 'remove') html += `<span style="color:#a00;background:#ffeaea;">- ${esc}</span>\n`;
      else html += `  ${esc}\n`;
    }
  }
  pre.innerHTML = html;
  $('#diffBody').appendChild(pre);
  DIFF_MODAL.style.display = 'flex';
}
function parseDiff(diff) {
  const hunks = [];
  const lines = diff.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!m) { i++; continue; }
    const h = { oldStart: parseInt(m[1],10), oldLines: m[2]?parseInt(m[2],10):1, newStart: parseInt(m[3],10), newLines: m[4]?parseInt(m[4],10):1, lines: [] };
    i++;
    while (i < lines.length && lines[i].startsWith(' ')) { h.lines.push({type:'context',content:lines[i].slice(1)}); i++; }
    while (i < lines.length && lines[i].startsWith('-')) { h.lines.push({type:'remove',content:lines[i].slice(1)}); i++; }
    while (i < lines.length && lines[i].startsWith('+')) { h.lines.push({type:'add',content:lines[i].slice(1)}); i++; }
    hunks.push(h);
  }
  return hunks;
}

// --- approval modal ---
function showApproval(e) {
  pend = e;
  const modal = $('#approvalModal');
  const body = $('#approvalBody');
  const perm = e.args && e.args._permission ? e.args._permission : '';
  body.textContent = 'Tool: ' + e.call.name + '\nPermission: ' + perm + '\n\n' + JSON.stringify(e.call.args, null, 2);
  modal.style.display = 'flex';
  setSt();
}
$('#approvalApprove').onclick = () => {
  if (pend) { harness.approve(pend.id, true); }
  $('#approvalModal').style.display = 'none';
  pend = null;
  setSt();
};
$('#approvalReject').onclick = () => {
  if (pend) { harness.approve(pend.id, false); }
  $('#approvalModal').style.display = 'none';
  pend = null;
  setSt();
};

// --- slash commands ---
const CM = [
  ['/install', 'add a plugin'],
  ['/artifacts', 'list files'],
  ['/models', 'model picker'],
  ['/config', 'agent config'],
  ['/skills', 'installed skills'],
  ['/sessions', 'sessions'],
  ['/plugins', 'plugins panel'],
  ['/tools', 'tools panel'],
  ['/mcp', 'mcp panel'],
  ['/memory', 'memory panel'],
  ['/agents', 'agents panel'],
  ['/fs', 'filesystem panel'],
  ['/new', 'new session'],
  ['/undo', 'undo last turn'],
  ['/redo', 'redo last turn'],
  ['/compact', 'compact context'],
  ['/btw', 'side question'],
  ['/help', 'show help']
];
CM.forEach(([c, t]) => {
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = c;
  b.title = t;
  b.onclick = () => { if (!busy) cmd(c); };
  $('#chips').append(b);
});

// --- session management ---
async function loadSessions() {
  const list = $('#session-list');
  list.innerHTML = '';
  const navSessions = $('#nav-sessions');
  if (navSessions) navSessions.textContent = '…';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  try {
    const res = await harness.sessions.meta();
    const sessions = (res && res.ok ? res.data : res) || [];
    if (navSessions) navSessions.textContent = sessions.length;
    sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'session-item';
      const title = document.createElement('div');
      title.textContent = (s.meta?.title || s.title || s.id.slice(0, 12));
      const meta = document.createElement('div');
      meta.className = 'dim';
      meta.textContent = s.mode + '/' + s.state + ' · ' + s.model + (s.meta?.forkedFrom ? ' (fork)' : '');
      item.appendChild(title);
      item.appendChild(meta);
      const acts = document.createElement('div');
      acts.className = 'entry-actions';
      const use = document.createElement('button');
      use.className = 'tx';
      use.textContent = s.id === currentSessionId ? '[active]' : '[use]';
      use.onclick = (ev) => { ev.stopPropagation(); useSession(s); ln('dim', 'switched to session ' + s.id.slice(0, 12)); };
      acts.appendChild(use);
      const fork = document.createElement('button');
      fork.className = 'tx';
      fork.textContent = '[fork]';
      fork.onclick = (e) => { e.stopPropagation(); busy = true; setSt();
        harness.sessions.fork(s.id).then(ns => { ln('dim', 'forked: ' + ns.title); useSession(ns); loadSessions(); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
      };
      acts.appendChild(fork);
      const del = document.createElement('button');
      del.className = 'tx';
      del.textContent = '[delete]';
      del.onclick = (e) => {
        e.stopPropagation();
        harness.deleteSession(s.id).then(() => {
          if (s.id === currentSessionId) { currentSessionId = null; currentSession = null; setSt(); }
          ln('dim', 'deleted session');
          loadSessions();
        }).catch(err => ln('dim', 'Error: ' + err.message));
      };
      acts.appendChild(del);
      item.appendChild(acts);
      item.onclick = () => { useSession(s); ln('dim', 'switched to session ' + s.id.slice(0, 12)); loadSessions(); };
      list.appendChild(item);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
function useSession(s) {
  if (!s) return;
  currentSessionId = s.id;
  currentSession = s;
  currentMode = s.mode || currentMode;
  currentModel = s.model || currentModel;
  const cm = $('#curMode'); const cmm = $('#curModel');
  if (cm) cm.textContent = currentMode;
  if (cmm) cmm.textContent = currentModel;
  setSt();
}
function executeSession(sid, okMsg) {
  busy = true;
  setSt();
  spin(true);
  harness.execute(sid).then(res => {
    if (res && res.ok) ln('dim', okMsg);
    else ln('dim', 'Error: ' + ((res && res.error) || 'resume failed'));
  }).catch(err => {
    ln('dim', 'Error: ' + err.message);
  }).finally(() => {
    busy = false;
    pend = null;
    spin(false);
    setSt();
  });
}

// --- filesystem tree view ---
async function loadFsTree(dir) {
  const list = $('#fs-tree');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  const pathEl = $('#fs-path');
  if (pathEl) pathEl.value = dir || '(root)';
  fsDir = dir || '';
  try {
    const entries = await loadFsTreeCached(dir || undefined);
    entries.forEach(en => {
      const e = document.createElement('div');
      e.className = 'fs-entry ' + (en.isDirectory ? 'dir' : 'file');
      const prefix = document.createElement('span');
      prefix.textContent = en.isDirectory ? '[D] ' : '[F] ';
      const name = document.createElement('span');
      name.textContent = en.name + (en.size != null ? '  (' + en.size + 'b)' : '');
      const act = document.createElement('span');
      act.className = 'entry-actions';
      if (en.isDirectory) {
        const go = document.createElement('button');
        go.className = 'tx';
        go.textContent = '[cd]';
        go.onclick = (ev) => { ev.stopPropagation(); loadFsTree(en.path); };
        act.appendChild(go);
      } else {
        const view = document.createElement('button');
        view.className = 'tx';
        view.textContent = '[view]';
        view.onclick = (ev) => { ev.stopPropagation(); busy = true; setSt();
          harness.fs.read(en.path).then(r => { FILES[en.path] = r.content; openFile(en.path, r.content); railFile(en.path); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
        };
        act.appendChild(view);
        const ref = document.createElement('button');
        ref.className = 'tx';
        ref.textContent = '[@ref]';
        ref.onclick = (ev) => { ev.stopPropagation(); acSelect(en.path); };
        act.appendChild(ref);
        const dl = document.createElement('button');
        dl.className = 'tx';
        dl.textContent = '[del]';
        dl.onclick = (ev) => { ev.stopPropagation();
          harness.fs.delete(en.path).then(() => { ln('dim', 'deleted ' + en.path); loadFsTree(fsDir); }).catch(err => ln('dim', 'Error: ' + err.message));
        };
        act.appendChild(dl);
      }
      e.append(prefix, name, act);
      e.onclick = () => {
        if (en.isDirectory) loadFsTree(en.path);
        else { busy = true; setSt(); harness.fs.read(en.path).then(r => { FILES[en.path] = r.content; openFile(en.path, r.content); railFile(en.path); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); }); }
      };
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
$('#fs-refresh').onclick = () => { busy = true; setSt(); loadFsTree(fsDir).finally(() => { busy = false; setSt(); }); };

// --- panels: plugins, skills, mcp, memory, agents, tools ---
async function loadTools() {
  const list = $('#tools-list');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  try {
    const tl = await harness.tools.list();
    tl.forEach(t => {
      const e = document.createElement('div');
      e.className = 'tool-entry';
      const src = document.createElement('span');
      src.className = 'tag source';
      src.textContent = t.source;
      const rk = document.createElement('span');
      rk.className = 'tag ' + (t.risky === true ? 'risky' : t.risky === 'conditional' ? 'risky' : 'off');
      rk.textContent = t.risky === true ? 'risky' : t.risky === 'conditional' ? 'cond' : 'safe';
      const d = document.createElement('div');
      d.textContent = t.name + '  ' + t.description;
      e.append(src, rk, d);
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}

async function loadPlugins() {
  const list = $('#plugin-list');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  try {
    const plugins = await harness.plugins.list();
    plugins.forEach(p => {
      const e = document.createElement('div');
      e.className = 'plugin-entry';
      const main = document.createElement('div');
      main.textContent = p.name + '  (' + p.tools.length + ' tool' + (p.tools.length === 1 ? '' : 's') + ', ' + p.bytes + 'b)';
      if (p.error) { main.textContent += '  [error: ' + p.error + ']'; main.className = 'faint'; }
      const acts = document.createElement('div');
      acts.className = 'entry-actions';
      const view = document.createElement('button');
      view.className = 'tx';
      view.textContent = '[view]';
      view.onclick = (ev) => { ev.stopPropagation(); busy = true; setSt();
        harness.plugins.read(p.name).then(txt => { FILES['plugins/' + p.name + '.js'] = txt; openFile('plugins/' + p.name + '.js', txt); railFile('plugins/' + p.name + '.js'); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
      };
      acts.appendChild(view);
      const rm = document.createElement('button');
      rm.className = 'tx';
      rm.textContent = '[remove]';
      rm.onclick = (ev) => { ev.stopPropagation();
        harness.plugins.remove(p.name).then(() => { ln('dim', 'removed plugin ' + p.name); loadPlugins(); }).catch(err => ln('dim', 'Error: ' + err.message));
      };
      acts.appendChild(rm);
      e.append(main, acts);
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
$('#plugin-reload').onclick = () => { busy = true; setSt(); harness.plugins.reload().then(() => { ln('dim', 'plugins reloaded'); loadPlugins(); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); }); };
$('#plugin-install').onclick = () => {
  const url = $('#plugin-url').value.trim();
  const name = $('#plugin-name').value.trim();
  if (!url) return ln('dim', 'url required');
  busy = true; setSt();
  harness.plugins.install(url, name).then(res => {
    ln('dim', 'installed plugin ' + res.installed + ' · tools: ' + (res.tools || []).join(', ') || 'none');
    $('#plugin-url').value = ''; $('#plugin-name').value = '';
    loadPlugins();
    busy = false; setSt();
  }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
};

async function loadSkills() {
  const list = $('#skill-list');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  try {
    const skills = await harness.skills.list();
    skills.forEach(s => {
      const e = document.createElement('div');
      e.className = 'skill-entry';
      const main = document.createElement('div');
      main.textContent = s.name + '  (' + s.bytes + 'b)  ' + s.description;
      const acts = document.createElement('div');
      acts.className = 'entry-actions';
      const view = document.createElement('button');
      view.className = 'tx';
      view.textContent = '[view]';
      view.onclick = (ev) => { ev.stopPropagation(); busy = true; setSt();
        harness.skills.read(s.name).then(txt => { FILES['skills/' + s.name + '/SKILL.md'] = txt; openFile('skills/' + s.name + '/SKILL.md', txt); railFile('skills/' + s.name + '/SKILL.md'); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
      };
      acts.appendChild(view);
      const rm = document.createElement('button');
      rm.className = 'tx';
      rm.textContent = '[remove]';
      rm.onclick = (ev) => { ev.stopPropagation();
        harness.skills.remove(s.name).then(() => { ln('dim', 'removed skill ' + s.name); loadSkills(); }).catch(err => ln('dim', 'Error: ' + err.message));
      };
      acts.appendChild(rm);
      e.append(main, acts);
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
$('#skill-install').onclick = () => {
  const url = $('#skill-url').value.trim();
  const name = $('#skill-name').value.trim() || undefined;
  if (!url) return ln('dim', 'url required');
  busy = true; setSt();
  harness.skills.install(url, name).then(res => {
    ln('dim', 'installed skill ' + res.installed);
    $('#skill-url').value = ''; $('#skill-name').value = '';
    loadSkills();
    busy = false; setSt();
  }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
};

async function loadMcp() {
  const list = $('#mcp-list');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  try {
    const servers = await harness.mcp.list();
    servers.forEach(s => {
      const e = document.createElement('div');
      e.className = 'mcp-entry';
      const main = document.createElement('div');
      main.textContent = s.name + '  ' + s.command + ' ' + (s.args || []).join(' ') + '  tools: ' + s.tools.length;
      const st = document.createElement('span');
      st.className = 'mcp-status ' + (s.connected ? 'connected' : 'off');
      st.textContent = s.connected ? 'connected' : 'disconnected';
      if (s.error) st.textContent += '  error: ' + s.error;
      const acts = document.createElement('div');
      acts.className = 'entry-actions';
      if (s.connected) {
        const dc = document.createElement('button');
        dc.className = 'tx';
        dc.textContent = '[disconnect]';
        dc.onclick = (ev) => { ev.stopPropagation(); mcpToggle(s.name); };
        acts.appendChild(dc);
        s.tools.forEach(t => {
          const tv = document.createElement('button');
          tv.className = 'tx';
          tv.textContent = '[' + String(t.name).replace(/[^A-Za-z0-9]/g,'_') + ']';
          tv.title = t.description || '';
          tv.onclick = (ev) => { ev.stopPropagation(); ln('dim', 'MCP tool call via agent: delegate or call through chat'); };
          acts.appendChild(tv);
        });
      } else {
        const cn = document.createElement('button');
        cn.className = 'tx';
        cn.textContent = '[connect]';
        cn.onclick = (ev) => { ev.stopPropagation(); mcpToggle(s.name); };
        acts.appendChild(cn);
      }
      const rm = document.createElement('button');
      rm.className = 'tx';
      rm.textContent = '[remove]';
      rm.onclick = (ev) => { ev.stopPropagation();
        harness.mcp.remove(s.name).then(() => { ln('dim', 'removed mcp server ' + s.name); loadMcp(); }).catch(err => ln('dim', 'Error: ' + err.message));
      };
      acts.appendChild(rm);
      e.append(main, st, acts);
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
async function mcpToggle(name) {
  busy = true; setSt();
  const servers = await harness.mcp.list();
  const s = servers.find(x => x.name === name);
  try {
    if (s && s.connected) await harness.mcp.disconnect(name);
    else await harness.mcp.connect(name);
    ln('dim', 'mcp ' + name + ' ' + (s && s.connected ? 'disconnected' : 'connected'));
    loadMcp();
  } catch (err) { ln('dim', 'Error: ' + err.message); }
  busy = false; setSt();
}
$('#mcp-add').onclick = () => {
  const name = $('#mcp-name').value.trim();
  const command = $('#mcp-command').value.trim();
  const args = $('#mcp-args').value.trim().split(/\s+/).filter(Boolean);
  if (!name || !command) return ln('dim', 'name and command required');
  busy = true; setSt();
  harness.mcp.add({ name, command, args }).then(() => {
    $('#mcp-name').value = ''; $('#mcp-command').value = ''; $('#mcp-args').value = '';
    loadMcp();
    busy = false; setSt();
  }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
};

async function loadMemory() {
  const list = $('#memory-list');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  const q = $('#memory-q').value.trim();
  try {
    const mems = await harness.memory.list(q || undefined);
    mems.forEach(m => {
      const e = document.createElement('div');
      e.className = 'mem-entry';
      const text = document.createElement('div');
      text.textContent = m.text + (m.tags.length ? '  #' + m.tags.join(' #') : '');
      const ts = document.createElement('div');
      ts.className = 'dim';
      ts.textContent = new Date(m.ts).toLocaleString();
      const acts = document.createElement('div');
      acts.className = 'entry-actions';
      const del = document.createElement('button');
      del.className = 'tx';
      del.textContent = '[del]';
      del.onclick = (ev) => { ev.stopPropagation();
        harness.memory.delete(m.id).then(() => { loadMemory(); }).catch(err => ln('dim', 'Error: ' + err.message));
      };
      acts.appendChild(del);
      e.append(text, ts, acts);
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
$('#memory-search').onclick = () => { loadMemory(); };
$('#memory-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); loadMemory(); } });
$('#memory-add').onclick = () => {
  const text = $('#memory-text').value.trim();
  const tags = $('#memory-tags').value.trim().split(/\s*,\s*/).filter(Boolean);
  if (!text) return ln('dim', 'text required');
  busy = true; setSt();
  harness.memory.add(text, tags).then(() => {
    $('#memory-text').value = ''; $('#memory-tags').value = '';
    loadMemory();
    ln('dim', 'memory saved');
    busy = false; setSt();
  }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
};
$('#memory-clear').onclick = () => {
  if (!confirm('Clear all memories?')) return;
  busy = true; setSt();
  harness.memory.clear().then(() => { loadMemory(); ln('dim', 'memories cleared'); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
};

async function loadAgents() {
  const list = $('#agent-list');
  list.innerHTML = '';
  if (!window.harness) { list.textContent = 'no harness'; return; }
  try {
    const ags = await harness.agents.list();
    ags.forEach(a => {
      const e = document.createElement('div');
      e.className = 'agent-entry';
      const main = document.createElement('div');
      main.textContent = a.name + '  ' + a.task.slice(0, 100) + '  model: ' + a.model + '  mode: ' + a.mode;
      const st = document.createElement('span');
      st.className = 'agent-status ' + a.status;
      st.textContent = a.status;
      const acts = document.createElement('div');
      acts.className = 'entry-actions';
      if (a.status === 'running') {
        const cn = document.createElement('button');
        cn.className = 'tx';
        cn.textContent = '[cancel]';
        cn.onclick = (ev) => { ev.stopPropagation(); busy = true; setSt();
          harness.agents.cancel(a.id).then(() => { ln('dim', 'cancelling subagent ' + a.id); loadAgents(); busy = false; setSt(); }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
        };
        acts.appendChild(cn);
      }
      if (a.result) {
        const rs = document.createElement('button');
        rs.className = 'tx';
        rs.textContent = '[result]';
        rs.onclick = () => openFile('subagent-' + a.id, a.result);
        acts.appendChild(rs);
      }
      e.append(main, st, acts);
      list.appendChild(e);
    });
  } catch (err) { ln('dim', 'Error: ' + err.message); }
}
$('#agent-start').onclick = () => {
  const name = $('#agent-name').value.trim();
  const task = $('#agent-task').value.trim();
  const model = $('#agent-model').value.trim() || currentModel;
  if (!name || !task) return ln('dim', 'name and task required');
  busy = true; setSt();
  harness.agents.start({ name, task, model, mode: currentMode }).then(rec => {
    ln('dim', 'subagent started: ' + rec.name + ' (' + rec.id + ')');
    $('#agent-task').value = '';
    loadAgents();
    busy = false; setSt();
  }).catch(err => { busy = false; setSt(); ln('dim', 'Error: ' + err.message); });
};

// --- permissions panel ---
async function loadPermissions() {
  if (!window.harness) return;
  try {
    const cfg = await harness.permissions.get();
    const container = $('#perm-list');
    if (!container) return;
    container.innerHTML = '';
    const rules = cfg.rules || {};
    Object.entries(rules).forEach(([tool, perm]) => {
      const row = document.createElement('div');
      row.className = 'perm-row';
      const name = document.createElement('span');
      name.textContent = tool;
      const sel = document.createElement('select');
      ['allow','ask','deny'].forEach(p => {
        const o = document.createElement('option');
        o.value = p; o.textContent = p; o.selected = p === perm;
        sel.appendChild(o);
      });
      sel.onchange = () => savePerms(cfg, tool, sel.value);
      row.appendChild(name);
      row.appendChild(sel);
      container.appendChild(row);
    });
    $('#auto-approve-toggle').checked = cfg.autoApprove === true;
  } catch (e) { ln('dim', 'Error loading permissions: ' + e.message); }
}
async function savePerms(cfg, tool, val) {
  cfg.rules[tool] = val;
  await harness.permissions.set(cfg);
  ln('dim', 'permission ' + tool + ' → ' + val);
}
$('#auto-approve-toggle').onchange = async () => {
  try {
    await harness.permissions.autoApprove($('#auto-approve-toggle').checked);
    autoApprove = $('#auto-approve-toggle').checked;
    localStorage.setItem('linkedqueue-auto-approve', autoApprove);
    ln('dim', 'auto-approve ' + (autoApprove ? 'on' : 'off'));
    setSt();
  } catch (e) { ln('dim', 'Error: ' + e.message); }
};

// --- model refresh ---
async function refreshModels() {
  if (!window.harness) return;
  try {
    const res = await harness.ollama.models();
    if (res.ok && res.models && res.models.length) {
      availableModels = res.models;
    } else if (!availableModels.includes(currentModel)) {
      availableModels = [currentModel];
    }
  } catch (e) {
    if (!availableModels.includes(currentModel)) availableModels = [currentModel];
  }
  $('#curModel').textContent = currentModel;
}

$('#modelBtn').onclick = async () => {
  await refreshModels();
  const idx = MODELS.indexOf(currentModel);
  const next = MODELS[(idx + 1) % MODELS.length] || currentModel;
  setModel(next);
};
function setModel(name) {
  currentModel = name;
  localStorage.setItem('linkedqueue-model', currentModel);
  $('#curModel').textContent = currentModel;
  ln('dim', 'model → ' + currentModel);
}
$('#modeBtn').onclick = () => {
  currentMode = currentMode === 'plan' ? 'act' : 'plan';
  localStorage.setItem('linkedqueue-mode', currentMode);
  $('#curMode').textContent = currentMode;
  if (currentSessionId && window.harness) {
    harness.setMode(currentSessionId, currentMode);
  }
};

// --- view switching ---
const MODELS = KNOWN_MODELS;
function switchView(view) {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = $$('.nav-btn').find(b => b.dataset.view === view);
  if (btn) btn.classList.add('active');
  $$('.view-panel').forEach(p => p.style.display = 'none');
  $('#feed').style.display = view === 'chat' ? 'block' : 'none';
  const panel = $('#view-' + view);
  if (panel) panel.style.display = 'block';
  if (view === 'sessions') loadSessions();
  if (view === 'filesystem') { fsDir = ''; loadFsTree(); }
  if (view === 'tools') loadTools();
  if (view === 'plugins') loadPlugins();
  if (view === 'skills') loadSkills();
  if (view === 'mcp') loadMcp();
  if (view === 'memory') loadMemory();
  if (view === 'agents') loadAgents();
  if (view === 'permissions') loadPermissions();
}
$$('.nav-btn').forEach(btn => {
  btn.onclick = () => switchView(btn.dataset.view);
});

// --- command palette (ctrl+p) ---
const PAL = [
  ['/install', 'add a plugin'],
  ['/artifacts', 'list files'], ['/models', 'model picker'], ['/config', 'agent config'],
  ['/skills', 'installed skills'], ['/sessions', 'sessions'], ['/plugins', 'plugins panel'], ['/tools', 'tools panel'],
  ['/mcp', 'mcp panel'], ['/memory', 'memory panel'], ['/agents', 'agents panel'], ['/fs', 'filesystem panel'], ['/permissions', 'permissions'],
  ['/new', 'new session'], ['/undo', 'undo last turn'], ['/redo', 'redo last turn'], ['/compact', 'compact context'],
  ['/btw', 'side question'], ['/help', 'show help']
];
let palOpen = false, palQuery = '', palIdx = 0;
function openPal() {
  palOpen = true; palQuery = ''; palIdx = 0;
  const d = $('#pal'); d.style.display = 'flex';
  let input = $('#pal-l');
  if (!input) {
    input = document.createElement('input');
    input.id = 'pal-l';
    input.style = 'outline:none;width:100%;background:none;border:0;color:var(--fg);font:inherit';
    d.firstElementChild.appendChild(input);
    input.addEventListener('input', () => { palQuery = input.value; palIdx = 0; palRender(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closePal(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = palItems(); palIdx = Math.min(palIdx + 1, n.length - 1); palRender(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); palRender(); }
      if (e.key === 'Enter') { e.preventDefault(); const n = palItems(); if (n[palIdx]) palExec(n[palIdx]); }
    });
  }
  input.value = '';
  palRender();
  input.focus();
}
function closePal() { palOpen = false; $('#pal').style.display = 'none'; }
function palItems() {
  const q = palQuery.toLowerCase().replace(/^\//, '');
  return PAL.filter(c => !q || c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q));
}
function palRender() {
  const o = $('#pal-o'); o.replaceChildren();
  const items = palItems();
  items.forEach((c, i) => {
    const r = document.createElement('div');
    r.className = 'pal-i' + (i === palIdx ? ' on' : '');
    const a = document.createElement('span');
    a.textContent = c[0];
    const b = document.createElement('span');
    b.className = 'dim';
    b.textContent = c[1];
    r.append(a, b);
    r.onclick = () => { palExec(c); };
    o.append(r);
  });
  $('#pal-t').textContent = palQuery ? (' /' + palQuery + ' - filter') : ' commands';
}
function palExec(c) { closePal(); if (!busy) cmd(c[0]); }

// --- core command handler ---
async function cmd(s) {
  s = s.trim();
  if (!s) return;
  hist.push(s);
  hi = hist.length;
  ln('you', s);
  const l = s.toLowerCase();
  const VIEW = { '/plugins': 'plugins', '/skills': 'skills', '/mcp': 'mcp', '/memory': 'memory', '/agents': 'agents', '/tools': 'tools', '/fs': 'filesystem', '/sessions': 'sessions', '/permissions': 'permissions' };
  if (VIEW[l]) { switchView(VIEW[l]); return; }
  if (l === '/help' || l === 'help') return ln('dim', CM.map(([c,t]) => c.padEnd(14) + t).join('\n'));
  if (l === '/clear') {
    T.replaceChildren();
    P.el = null;
    P.todos = [];
    R.p.replaceChildren();
    return banner();
  }
  if (l === '/theme') return $('#th').click();
  if (l === '/artifacts') {
    const k = Object.keys(FILES);
    return k.length ? k.forEach(n => { const d = ln('file', ['b','✎ '], n, ['dim','  [view]']); d.onclick = () => openFile(n, FILES[n]); }) : ln('dim', 'no files yet');
  }
  if (l === '/models') {
    await refreshModels();
    ln('b', 'models (cloud / ollama)');
    ln('dim', 'current: ' + currentModel);
    ln('dim', 'cycle: ' + MODELS.join(', '));
    ln('dim', 'set any: /model <id>   e.g. /model google/gemma-3-27b-it:free');
    return;
  }
  if (l.startsWith('/model ')) {
    const name = l.slice(7).trim();
    if (!name) return ln('dim', 'usage: /model <id>');
    setModel(name);
    return;
  }
  if (l === '/config') {
    ln('b', 'config');
    ln('dim', 'model: ' + currentModel);
    ln('dim', 'mode: ' + currentMode);
    ln('dim', 'auto-approve: ' + autoApprove);
    ln('dim', 'base: set via HARNESS_BASE_URL env (default https://ollama.com/v1)');
    ln('dim', 'skills/plugins/mcp via agent or panels');
    return;
  }
  if (l === '/new') {
    if (window.harness) {
      harness.newSession(s.slice(4).trim() || undefined).then(res => {
        ln('dim', 'new session created');
        useSession(res?.sessions?.[0]);
        loadSessions();
      }).catch(err => ln('dim', 'Error: ' + err.message));
    }
    return;
  }
  if (l === '/undo') {
    if (!currentSessionId) return ln('dim', 'no active session');
    busy = true; setSt();
    const res = await harness.sessions.undo(currentSessionId);
    ln('dim', res.message || 'undone');
    if (res.reverted.length) ln('dim', 'restored: ' + res.reverted.join(', '));
    busy = false; setSt();
    return;
  }
  if (l === '/redo') {
    if (!currentSessionId) return ln('dim', 'no active session');
    const s2 = harness.sessions.redo(currentSessionId);
    if (s2) { useSession(s2); ln('dim', 'redo ready: ' + s2.title); }
    else ln('dim', 'nothing to redo');
    return;
  }
  if (l === '/compact') {
    ln('dim', 'compact: not yet implemented (context is auto-managed)');
    return;
  }
  if (l.startsWith('/btw ')) {
    ln('dim', 'btw: side question not yet implemented');
    return;
  }
  if (l === '/connect') {
    ln('dim', 'connect: add providers via .env (HARNESS_BASE_URL)');
    return;
  }
  if (l === '/editor') {
    ln('dim', 'editor: set EDITOR/VISUAL env var; not yet wired');
    return;
  }

  // shell command: ! prefix
  if (l.startsWith('!')) {
    const command = s.slice(1).trim();
    if (!command) return ln('dim', 'usage: !<command>');
    ln('dim', '$ ' + command);
    busy = true; setSt();
    try {
      const res = await harness.shell.run(command);
      if (res.ok) {
        const data = res.data || {};
        const out = data.stdout || '';
        const err = data.stderr || '';
        if (out) ln('res t', '⎿ ', out.slice(0, 3000));
        if (err) ln('res t', '⎿ ', 'stderr: ' + err.slice(0, 1000));
        if (data.exit_code != null && data.exit_code !== 0) ln('dim', 'exit code: ' + data.exit_code);
      } else {
        ln('dim', 'shell error: ' + res.error);
      }
    } catch (e) { ln('dim', 'shell error: ' + e.message); }
    busy = false; setSt();
    return;
  }

  if (window.harness) {
    busy = true;
    setSt();
    spin(true);
    harness.run(s, { sessionId: currentSessionId, mode: currentMode, model: currentModel })
      .then(async res => {
        try {
           if (window.harness.sessions.meta) {
             const res2 = await harness.sessions.meta();
             const sess = (res2 && res2.ok ? res2.data : res2) || [];
             if (sess && sess.length) {
              currentSessionId = sess[0].id;
              currentSession = sess[0];
            }
          }
        } catch (e) {}
        busy = false;
        spin(false);
        setSt();
      })
      .catch(e => {
        ln('dim', 'Error: ' + e.message);
        busy = false;
        spin(false);
        setSt();
      });
  } else {
    ln('dim', 'mockup: try /help');
  }
}

function banner() {
  ln('b', 'linkedqueue');
  ln('dim', 'versatile agent · terminal\n@file to reference a file · !cmd to run shell · / for commands\nplans, runs tools, asks before anything risky.');
}

Q.addEventListener('keydown', async e => {
  if (slashAcOpen) return; // handled by slash-ac handler
  if (acOpen && e.key === 'Enter') { e.preventDefault(); acSelect(acItems[acIdx]); return; }
  if (acOpen && e.key === 'ArrowDown') { e.preventDefault(); acIdx = Math.min(acIdx + 1, acItems.length - 1); acRender(); return; }
  if (acOpen && e.key === 'ArrowUp') { e.preventDefault(); acIdx = Math.max(acIdx - 1, 0); acRender(); return; }
  if (acOpen && e.key === 'Escape') { e.preventDefault(); acClose(); return; }
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (busy) return;
    const v = Q.value;
    Q.value = '';
    acClose();
    if (v.startsWith('!')) {
      ln('dim', '$ ' + v.slice(1));
      busy = true; setSt();
      try {
        const res = await harness.shell.run(v.slice(1).trim());
        if (res.ok) {
          const data = res.data || {};
          if (data.stdout) ln('res t', '⎿ ', String(data.stdout).slice(0, 3000));
          if (data.stderr) ln('res t', '⎿ ', 'stderr: ' + String(data.stderr).slice(0, 1000));
          if (data.exit_code != null && data.exit_code !== 0) ln('dim', 'exit code: ' + data.exit_code);
        } else {
          ln('dim', 'shell error: ' + res.error);
        }
      } catch (err) { ln('dim', 'shell error: ' + err.message); }
      busy = false; setSt();
      return;
    }
    cmd(v);
  }
  if (e.key === '@') {
    e.preventDefault();
    const pos = Q.selectionStart;
    const before = Q.value.slice(0, pos);
    if (before.endsWith('@') || before.trim() === '') {
      Q.value = before + '@' + (before.trim() === '' ? '' : '');
      Q.selectionStart = Q.selectionEnd = Q.value.length;
    }
    acOpenAt(Q.value.slice(Q.value.lastIndexOf('@') + 1));
    return;
  }
  if (e.key === 'ArrowUp' && hi > 0) {
    e.preventDefault();
    Q.value = hist[--hi];
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    Q.value = hi < hist.length - 1 ? hist[++hi] : (hi = hist.length, '');
  }
});

addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    abort = true;
    acClose();
    if (pend) {
      if (window.harness) harness.approve(pend.id, false);
      pend = null;
      $('#approvalModal').style.display = 'none';
      setSt();
    }
    closePal();
  }
  if (pend && !e.metaKey && !e.ctrlKey && Q.value === '' && (e.key === 'y' || e.key === 'n')) {
    e.preventDefault();
    if (window.harness) harness.approve(pend.id, e.key === 'y');
    pend = null;
    $('#approvalModal').style.display = 'none';
    setSt();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    Q.focus();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    const lr = $('#lr');
    lr.style.display = lr.style.display === 'flex' ? 'none' : 'flex';
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault();
    if (!busy) openPal();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault();
    if (!busy) openPal();
  }
});

// --- slash command autocomplete ---
const SLASH_CMDS = [
  ['/install', 'add a plugin'],
  ['/artifacts', 'list files'],
  ['/models', 'model picker'],
  ['/config', 'agent config'],
  ['/skills', 'installed skills'],
  ['/sessions', 'sessions'],
  ['/plugins', 'plugins panel'],
  ['/tools', 'tools panel'],
  ['/mcp', 'mcp panel'],
  ['/memory', 'memory panel'],
  ['/agents', 'agents panel'],
  ['/fs', 'filesystem panel'],
  ['/permissions', 'permissions'],
  ['/new', 'new session'],
  ['/undo', 'undo last turn'],
  ['/redo', 'redo last turn'],
  ['/compact', 'compact context'],
  ['/btw', 'side question'],
  ['/connect', 'connect provider'],
  ['/editor', 'open editor'],
  ['/model', 'set model'],
  ['/help', 'show help'],
];

let slashAcOpen = false, slashAcIdx = 0, slashAcItems = [];
const SLASH_AC = $('#slash-ac') || (() => {
  const d = document.createElement('div');
  d.id = 'slash-ac';
  d.style = 'display:none;position:absolute;z-index:60;background:var(--bg);border:1px solid var(--fg);max-height:240px;overflow:auto;width:min(60vw,600px);box-shadow:2px 2px 0 var(--fg)';
  document.body.appendChild(d);
  return d;
})();

function slashAcRender() {
  SLASH_AC.replaceChildren();
  SLASH_AC.style.display = slashAcOpen ? 'block' : 'none';
  if (!slashAcOpen) return;
  slashAcItems.forEach((it, i) => {
    const r = document.createElement('div');
    r.className = 'ac-i' + (i === slashAcIdx ? ' on' : '');
    const cmd = document.createElement('span');
    cmd.textContent = it[0];
    const desc = document.createElement('span');
    desc.className = 'dim';
    desc.style.marginLeft = '1ch';
    desc.textContent = it[1];
    r.append(cmd, desc);
    r.onclick = () => { slashAcSelect(it[0]); };
    SLASH_AC.appendChild(r);
  });
  const rect = Q.getBoundingClientRect();
  SLASH_AC.style.left = rect.left + 'px';
  // position above the input box
  SLASH_AC.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  SLASH_AC.style.top = 'auto';
}
function slashAcOpenAt(query) {
  slashAcOpen = true; slashAcIdx = 0;
  const q = query.toLowerCase();
  slashAcItems = SLASH_CMDS.filter(([c]) => !q || c.toLowerCase().includes(q));
  if (slashAcItems.length === 0) { slashAcClose(); return; }
  slashAcRender();
}
function slashAcClose() { slashAcOpen = false; slashAcRender(); }
function slashAcSelect(cmd) {
  slashAcClose();
  Q.value = cmd + ' ';
  Q.selectionStart = Q.selectionEnd = Q.value.length;
  Q.focus();
}

// --- @ reference detection on input ---
Q.addEventListener('input', e => {
  const val = Q.value;
  // slash command autocomplete
  if (val.startsWith('/') && !val.includes(' ')) {
    slashAcOpenAt(val);
  } else {
    slashAcClose();
  }
  // @ file autocomplete
  const atIdx = val.lastIndexOf('@');
  if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === ' ')) {
    const query = val.slice(atIdx + 1);
    if (query.length > 0) acOpenAt(query);
    else acClose();
  } else {
    acClose();
  }
});

// close dropdowns on Enter/Escape
Q.addEventListener('keydown', e => {
  if (slashAcOpen && e.key === 'Enter') { e.preventDefault(); slashAcSelect(slashAcItems[slashAcIdx][0]); return; }
  if (slashAcOpen && e.key === 'ArrowDown') { e.preventDefault(); slashAcIdx = Math.min(slashAcIdx + 1, slashAcItems.length - 1); slashAcRender(); return; }
  if (slashAcOpen && e.key === 'ArrowUp') { e.preventDefault(); slashAcIdx = Math.max(slashAcIdx - 1, 0); slashAcRender(); return; }
  if (slashAcOpen && e.key === 'Escape') { e.preventDefault(); slashAcClose(); return; }
});

$('#modelBtn').textContent = '[model:' + currentModel + ']';

// --- core loop ---
if (window.harness) {
  harness.onStartup(data => {
    ln('dim', 'connected · ' + data.sessionCount + ' sessions');
    refreshModels();
    loadSessions();
    loadPermissions();
  });

  harness.onEvent(e => {
    if (!e || typeof e !== 'object') return;
    if (e.agent) {
      const { id, name, status, task, result } = e;
      if (status === 'start') ln('dim', 'subagent start ', ['b', name], ' · ', task);
      else if (status === 'done') ln('dim', 'subagent done ', ['b', name], result ? ' → ' + result : '');
      else if (status === 'error') ln('dim', 'subagent error ', ['b', name], ' · ', e.error || '');
      else ln('dim', 'subagent cancelled ', ['b', name]);
      if (document.querySelector('.nav-btn[data-view="agents"]').classList.contains('active')) loadAgents();
      setSt();
      return;
    }
    if (e.type === 'text') {
      if (e.text && e.text.trim()) ln('say', '● ', ['b', 'linkedqueue'], ' ' + e.text);
    } else if (e.type === 'plan') {
      P.todos = e.todos || [];
      P.at = 0;
      P.el = null;
      drawPlan();
      ln('dim', 'plan received · waiting for approval');
      const planWrap = document.createElement('div');
      planWrap.className = 'ask';
      const h = document.createElement('div');
      h.className = 'h';
      h.appendChild(document.createElement('span'));
      h.lastChild.textContent = 'execute plan? ';
      planWrap.appendChild(h);
      const acts = document.createElement('div');
      acts.className = 'acts';
      const ex = document.createElement('button');
      ex.className = 'btn primary';
      ex.textContent = '[execute plan]';
      ex.onclick = () => {
        if (!window.harness || busy) return;
        if (currentSessionId) {
          executeSession(currentSessionId, 'plan execution started');
        } else {
           harness.sessions.meta().then(res => {
             const sess = (res && res.ok ? res.data : res) || [];
             const s = sess && sess[0];
            if (s) { useSession(s); executeSession(currentSessionId, 'plan execution started'); }
            else ln('dim', 'Error: no session to resume');
          }).catch(err => ln('dim', 'Error: ' + err.message));
        }
      };
      acts.appendChild(ex);
      planWrap.appendChild(acts);
      T.appendChild(planWrap);
      scroll();
    } else if (e.type === 'tool') {
      toolRow(e.name, e.args, e.result);
    } else if (e.type === 'artifact') {
      file(e.name, e.content);
      ln('dim', 'artifact: ' + e.name);
    } else if (e.type === 'error') {
      ln('dim', 'Error: ' + e.message);
    } else if (e.type === 'approval') {
      showApproval(e);
    } else if (e.type === 'session') {
      if (e.payload?.id) {
        currentSessionId = e.payload.id;
        currentSession = e.payload;
      }
    }
    setSt();
  });
} else {
  ln('dim', 'running in mockup mode (no harness)');
}

banner();
setSt();
if (matchMedia('pointer: fine').matches) Q.focus();
