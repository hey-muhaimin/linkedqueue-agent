/* ---------- real desktop renderer wired to LinkedQueue harness ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const C = $('#conv'), F = $('#feed'), Q = $('#q');
const root = document.documentElement;

function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text != null) d.textContent = text;
  return d;
}
function add(node, parent) { (parent || C).append(node); scroll(); return node; }
const near = () => F.scrollHeight - F.scrollTop - F.clientHeight < 160;
function scroll() { F.scrollTop = F.scrollHeight; }
let toastT = 0;
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800);
}
function badge(kind, text) { return el('span', 'badge c-' + kind, text); }
function unwrap(res) { return (res && typeof res === 'object' && 'data' in res) ? res.data : res; }

/* ---------- theme ---------- */
try { const s = localStorage.getItem('lq-theme'); if (s) root.dataset.theme = s; } catch (e) {}
const curTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
$('#th').onclick = () => {
  const n = curTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = n;
  try { localStorage.setItem('lq-theme', n); } catch (e) {}
  toast('Theme: ' + n);
};

/* ---------- panels ---------- */
const narrowSb = () => matchMedia('(max-width:719px)').matches;
const narrowRp = () => matchMedia('(max-width:959px)').matches;
function panel(side, on) {
  const b = document.body, nar = side === 'sb' ? narrowSb() : narrowRp();
  const cur = nar ? b.classList.contains('show-' + side) : !b.classList.contains('hide-' + side);
  if (on === undefined) on = !cur;
  if (nar) { b.classList.toggle('show-' + side, on); if (on) b.classList.remove('show-' + (side === 'sb' ? 'rp' : 'sb')); }
  else b.classList.toggle('hide-' + side, !on);
}
document.body.classList.add('hide-rp');
$('#tsb').onclick = () => panel('sb');
$('#trp').onclick = () => panel('rp');
$('#crp').onclick = () => panel('rp', false);
$('#scrim').onclick = () => document.body.classList.remove('show-sb', 'show-rp');
function tab(n) {
  $$('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === n));
  $$('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + n));
}
$$('.tabs [data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));

/* ---------- state ---------- */
let busy = false, abort = false, pend = null, tools = 0, hist = [], hi = 0, t0 = 0, tick = 0, thread = null;
const sleep = ms => new Promise((r, j) => setTimeout(() => abort ? j('abort') : r(), matchMedia('(prefers-reduced-motion: reduce)').matches ? Math.min(ms, 20) : ms));
let currentSessionId = null;
let currentModel = localStorage.getItem('lq-model') || 'gemma4:31b-cloud';
let currentMode = 'act';
const P = { todos: [], at: 0, el: null };
const FILES = {};
let sessions = [];

/* ---------- linked queue (session todos) ---------- */
function drawQueue() {
  const p = $('#p-queue'); p.replaceChildren();
  if (!P.todos.length) { p.append(el('div', 'empty', 'No tasks queued.')); $('#ne').textContent = '0'; $('#qn').textContent = '0'; $('#qp').classList.remove('on'); return; }
  P.todos.forEach((x, i) => {
    if (i) p.append(el('div', 'qlink'));
    const r = el('div', 'card qi'), t = el('div', 'qt');
    t.append(el('div', '', '#' + (i + 1) + '  ' + x.text), el('div', 'qd', x.status));
    r.append(el('span', 'qg ' + (x.status === 'done' ? 'c-ok' : x.status === 'in_progress' ? 'c-info' : 'c-faint'), x.status === 'done' ? '✓' : x.status === 'in_progress' ? '▸' : '○'), t, badge(x.status === 'done' ? 'ok' : x.status === 'in_progress' ? 'info' : 'warn', x.status));
    p.append(r);
  });
  $('#ne').textContent = P.todos.length;
  const w = P.todos.filter(x => x.status !== 'done').length;
  $('#qn').textContent = w; $('#qp').classList.toggle('on', w > 0);
}

/* ---------- files ---------- */
function diffLines(arr, start) {
  let o = start, n = start;
  return arr.map(([k, t]) => {
    const d = el('div', 'dl ' + k); let num;
    if (k === 'del') { num = o; o++; } else if (k === 'add') { num = n; n++; } else if (k === 'hunk') { num = ''; } else { num = n; o++; n++; }
    d.append(el('span', 'n', String(num)), el('span', 'g', k === 'add' ? '+' : k === 'del' ? '−' : ''), t || ' ');
    return d;
  });
}
function textLines(body) { return body.split('\n').map((t, i) => { const d = el('div', 'dl add'); d.append(el('span', 'n', String(i + 1)), el('span', 'g', '+'), t || ' '); return d; }); }
function openFile(n) {
  const f = FILES[n]; $('#vt').textContent = n;
  $('#vb').replaceChildren(...(f.type === 'diff' ? diffLines(f.lines, f.start) : textLines(f.body)));
  const b = $('#vbadge'); b.textContent = f.type === 'diff' ? 'modified' : 'new file'; b.className = 'badge ' + (f.type === 'diff' ? 'c-warn' : 'c-ok');
  $('#viewer').classList.add('on'); panel('rp', true); tab('files');
}
function railFile(n) {
  $('#fe').style.display = 'none';
  const o = $('#flist').querySelector('[data-n="' + n + '"]'); if (o) o.remove();
  const b = el('button', 'row'); b.dataset.n = n;
  b.append(el('span', 'ico c-info', '✎'), el('span', 'tt mono', n), el('span', 'meta', 'view'));
  b.onclick = () => openFile(n);
  $('#flist').append(b);
  $('#nf').textContent = $('#flist').children.length;
}
async function loadFiles() {
  try {
    const res = await harness.fs.tree('');
    const tree = unwrap(res) || [];
    $('#flist').replaceChildren();
    $('#fe').style.display = tree.length ? 'none' : '';
    for (const e of tree) {
      const row = el('button', 'row');
      row.append(el('span', 'ico', e.isDirectory ? '📁' : '📄'), el('span', 'tt mono', e.name), el('span', 'meta', e.isDirectory ? 'dir' : 'file'));
      row.onclick = async () => {
        if (e.isDirectory) return;
        try {
          const r = await harness.fs.read(e.name);
          const data = unwrap(r);
          FILES[e.name] = { type: 'text', body: data.content || '' };
          openFile(e.name);
        } catch (err) { toast('Read failed: ' + err.message); }
      };
      $('#flist').append(row);
    }
    $('#nf').textContent = $('#flist').children.length;
  } catch (e) { toast('Files failed: ' + e.message); }
}

/* ---------- threads ---------- */
function addThread(title, state, done) {
  const run = state === 'run';
  const b = el('button', 'row th' + (run ? ' on' : ''));
  const dot = el('span', 'dot ' + (run ? 'c-info' : done ? 'c-ok' : 'faint'), run ? '◐' : done ? '✓' : '○');
  b.append(dot, el('span', 'tt', title), el('span', 'meta', run ? 'now' : state));
  b.onclick = () => { currentSessionId = b.dataset.sid || currentSessionId; toast('Session selected'); };
  $('#threads').insertBefore(b, $('#threads').children[1]);
  return { el: b, dot, meta: b.querySelector('.meta') };
}
function endThread(ok) {
  if (!thread) return;
  thread.dot.textContent = ok ? '✓' : '✗';
  thread.dot.className = 'dot ' + (ok ? 'c-ok' : 'c-err');
  thread.meta.textContent = 'just now';
  thread.el.classList.remove('on');
}
async function loadSessions() {
  try {
    const res = await harness.sessions.meta();
    sessions = unwrap(res) || [];
    const container = $('#threads');
    container.replaceChildren();
    const proj = el('div', 'row proj');
    proj.append(el('span', 'ico', '▾'), el('span', 'tt', 'LinkedQueue'));
    container.append(proj);
    for (const s of sessions) {
      const b = el('button', 'row th');
      b.dataset.sid = s.id;
      const dot = el('span', 'dot ' + (s.state === 'running' ? 'c-info' : s.state === 'done' ? 'c-ok' : 'faint'), s.state === 'running' ? '◐' : s.state === 'done' ? '✓' : '○');
      b.append(dot, el('span', 'tt', s.title || s.id), el('span', 'meta', s.mode || 'act'));
      b.onclick = () => { currentSessionId = s.id; $('#ttl').textContent = s.title || s.id; toast('Session: ' + (s.title || s.id)); };
      container.append(b);
    }
  } catch (e) { toast('Sessions failed: ' + e.message); }
}
async function newThread() {
  C.replaceChildren(); P.todos = []; P.el = null; P.at = 0;
  $('#p-plan').replaceChildren(el('div', 'empty', 'No plan yet.\nRun a command to see steps.'));
  $('#ttl').textContent = 'New thread';
  thread = null; tools = 0; setSt();
  showEmpty();
  try {
    const res = await harness.newSession('New thread');
    const data = unwrap(res);
    if (Array.isArray(data?.sessions)) sessions = data.sessions;
    else if (Array.isArray(data)) sessions = data;
    const latest = sessions.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (latest) { currentSessionId = latest.id; $('#ttl').textContent = latest.title || 'New thread'; }
    await loadSessions();
  } catch (e) { toast('New session failed: ' + e.message); }
}

/* ---------- status ---------- */
function setSt() {
  document.body.classList.toggle('busy', busy);
  document.body.classList.toggle('wait', !!pend);
  const s = pend ? 'awaiting approval' : busy ? 'working' : 'ready';
  $('#ss').textContent = s;
  $('#sn').textContent = tools + ' tool call' + (tools === 1 ? '' : 's');
  Q.placeholder = busy ? 'LinkedQueue is working…  esc to stop' : 'Ask LinkedQueue to build, fix, or explain…  /  for commands';
  const g = $('#go'); g.textContent = busy ? '■' : '↑'; g.setAttribute('aria-label', busy ? 'Stop' : 'Send'); g.disabled = !busy && !Q.value.trim();
}
function spin(on) { clearInterval(tick); if (!on) return; t0 = Date.now(); tick = setInterval(() => { const w = $('.working .t'); if (w) w.textContent = 'Working ' + Math.floor((Date.now() - t0) / 1000) + 's'; }, 500); }

/* ---------- empty state ---------- */
function showEmpty() {
  const e = el('div', ''); e.id = 'empty';
  const mk = el('div', 'mark'); mk.append(logo()); e.append(mk, el('h1', '', 'What are we building?'), el('p', '', 'LinkedQueue plans, runs tools, and asks before it changes anything.'));
  const g = el('div', 'sug');
  [['/help', 'Show commands', 'List available commands'], ['/tools', 'List tools', 'Show registered tools'], ['/skills', 'Installed skills', 'Show installed skills'], ['/sessions', 'Sessions', 'List sessions']].forEach(([c, t, d]) => {
    const b = el('button'); b.append(el('b', '', t), el('span', '', d)); b.onclick = () => { if (!busy) cmd(c); }; g.append(b);
  });
  e.append(g); C.append(e);
}
function newThreadWrapper() { newThread(); }

/* ---------- plan ---------- */
function drawPlan() {
  if (!P.el) { P.el = add(el('div', 'card plan')); P.el.onclick = () => P.el.classList.toggle('collapsed'); }
  const n = P.todos.length || 1, d = Math.min(P.at, P.todos.length);
  P.el.replaceChildren();
  const h = el('div', 'ph'); const bar = el('div', 'pbar'); bar.append(Object.assign(el('i'), { style: 'width:' + (d / n * 100) + '%' })); h.append('Plan', bar, el('span', 'dim', d + '/' + P.todos.length)); P.el.append(h);
  P.todos.forEach((t, i) => { const r = el('div', 'pi ' + (i < P.at ? 'done' : i === P.at ? 'now' : '')); r.append(el('span', 'g', i < P.at ? '✓' : i === P.at ? '▸' : '○'), t.text || t); P.el.append(r); });
  const pp = $('#p-plan'); pp.replaceChildren(P.el.cloneNode(true)); pp.firstChild.classList.remove('collapsed');
  drawQueue();
}

/* ---------- tools ---------- */
function toolRow(name, arg) {
  const w = el('div', 'tl'), h = el('button'), ic = el('span', 'ti dim'), sum = el('span', 'sum'), ch = el('span', 'chev', '›');
  ic.append(el('span', 'spin', '◐'));
  h.append(ic, el('span', 'tn', name), el('span', 'ta dim', arg ? '(' + arg + ')' : ''), sum, ch);
  const out = el('pre', 'out card'); w.append(h, out);
  h.onclick = () => w.classList.toggle('open');
  add(w); return { w, ic, sum, out };
}
function toolDone(r, out, fail) {
  r.ic.replaceChildren(); r.ic.className = 'ti ' + (fail ? 'c-err' : 'c-ok'); r.ic.textContent = fail ? '✗' : '✓';
  r.sum.textContent = out[0] || ''; r.out.textContent = out.join('\n'); if (fail) r.sum.style.color = 'var(--err)';
}
function say(text) { const d = add(el('div', 'ai')); d.textContent = text; return d; }

/* ---------- approval ---------- */
function askApproval(ev) {
  const a = add(el('div', 'ask lvl-warn')), h = el('div', 'ah');
  h.append(el('span', 'shield c-warn', '◈'), el('span', 'b', 'Approve '), el('span', 'mono b', ev.call.name + '?'), el('span', 'sp'), badge('warn', 'tool'));
  a.append(h);
  const body = el('div', 'ab');
  body.append(el('pre', 'code', JSON.stringify(ev.call.args || {}, null, 2)));
  a.append(body);
  const f = el('div', 'af'), n = el('button', 'btn'), y = el('button', 'btn pri');
  n.append('Reject ', el('span', 'kbd', 'n')); y.append('Approve once ', el('span', 'kbd', 'y'));
  f.append(n, y); a.append(f);
  scroll();
  const decide = ok => {
    if (pend !== decide) return;
    pend = null; a.classList.add('done');
    a.append(el('div', 'res ' + (ok ? 'c-ok' : 'c-err'), ok ? '✓ Approved' : '✗ Rejected'));
    setSt();
    harness.approve(ev.id, ok);
  };
  pend = decide; setSt();
  y.onclick = () => decide(true); n.onclick = () => decide(false);
  y.focus({ preventScroll: true });
}

/* ---------- events ---------- */
harness.onEvent(e => {
  if (!e || typeof e !== 'object') return;
  if (e.agent) return;
  if (e.type === 'text' && e.text) say(e.text);
  else if (e.type === 'tool') {
    const r = toolRow(e.name, e.args ? JSON.stringify(e.args).slice(0, 80) : '');
    tools++; setSt();
    toolDone(r, [JSON.stringify(e.result).slice(0, 2000)], !!(e.result && e.result.error));
  } else if (e.type === 'plan') {
    P.todos = (e.todos || []).map(t => typeof t === 'string' ? { text: t, status: 'pending' } : t);
    P.at = 0; P.el = null; drawPlan();
  } else if (e.type === 'artifact') {
    FILES[e.name] = { type: 'text', body: e.content || '' };
    railFile(e.name);
  } else if (e.type === 'approval') {
    askApproval(e);
  } else if (e.type === 'error') {
    add(el('div', 'ai dim', 'Error: ' + e.message));
  } else if (e.type === 'session') {
    if (e.sessionId) currentSessionId = e.sessionId;
  }
});

/* ---------- run ---------- */
async function runHarness(v) {
  if (!window.harness) { cmd(v); return; }
  const empty = $('#empty'); if (empty) empty.remove();
  msg(v); hist.push(v); hi = hist.length;
  busy = true; abort = false; thread = addThread('LinkedQueue', 'run'); $('#ttl').textContent = 'LinkedQueue run';
  const q = addQ(v.length > 48 ? v.slice(0, 47) + '…' : v, 'running');
  const w = el('div', 'working'); w.append(el('span', 'spin', '◐'), Object.assign(el('span', 'shimmer t'), { textContent: 'Working…' }));
  C.append(w); setSt(); spin(true); let ok = true;
  try {
    await harness.run(v, { sessionId: currentSessionId, mode: currentMode, model: currentModel });
  } catch (e) {
    ok = false; add(el('div', 'ai dim', 'Error: ' + (e && e.message ? e.message : e)));
  } finally {
    busy = false; pend = null; spin(false); w.remove(); endThread(ok); q.s = ok ? 'done' : 'failed'; drawQueue(); setSt();
    loadSessions();
  }
}
function addQ(t, s) { const q = { id: ++qid, t, s, dep: null }; QUE.push(q); drawQueue(); return q; }
const QUE = []; let qid = 0;

/* ---------- commands ---------- */
const CM = [['/help', 'Show help'], ['/models', 'Model picker'], ['/config', 'Configure provider/API'], ['/skills', 'Installed skills'], ['/tools', 'List tools'], ['/mcp', 'MCP servers'], ['/sessions', 'Sessions'], ['/memory', 'Memory'], ['/agents', 'Agent configs'], ['/queue', 'Task queue'], ['/artifacts', 'Changed files'], ['/design', 'Design system'], ['/clear', 'New thread'], ['/theme', 'Toggle theme']];
function msg(t) { add(el('div', 'user', t)); }
function cmd(s) {
  s = s.trim(); if (!s) return; hist.push(s); hi = hist.length;
  const em = $('#empty'); if (em) em.remove();
  msg(s);
  const l = s.toLowerCase();
  if (l === '/clear') return newThreadWrapper();
  if (l === '/theme') return $('#th').click();
  if (l === '/help' || l === 'help') {
    const c = add(el('div', 'card')); c.style.cssText = 'padding:8px 12px;display:grid;grid-template-columns:auto 1fr;gap:2px 20px';
    CM.forEach(([a, b]) => c.append(el('span', 'mono', a), el('span', 'dim', b)));
    return;
  }
  if (l === '/models') return loadModels();
  if (l === '/config') return showConfig();
  if (l === '/skills') return loadSkills();
  if (l === '/tools') return loadTools();
  if (l === '/mcp') return loadMcp();
  if (l === '/sessions') return loadSessionsCmd();
  if (l === '/memory') return loadMemory();
  if (l === '/agents') return loadAgents();
  if (l === '/queue') { panel('rp', true); tab('queue'); return add(el('div', 'ai dim', 'Showing the task queue in the review panel.')); }
  if (l === '/artifacts') { panel('rp', true); tab('files'); loadFiles(); return add(el('div', 'ai dim', 'Loaded workspace files in the review panel.')); }
  if (l === '/design') return design();
  runHarness(s);
}

async function loadModels() {
  try {
    const res = await harness.ollama.models();
    const data = unwrap(res);
    const models = (data && data.models) || [];
    const c = add(el('div', 'card')); c.style.padding = '8px 12px';
    if (!models.length) { c.append(el('div', 'dim', 'No models returned. Set HARNESS_MODEL / HARNESS_BASE_URL.')); return; }
    models.forEach(m => {
      const r = el('div'); r.append(el('span', m === currentModel ? 'c-ok' : 'faint', m === currentModel ? '● ' : '○ '), el('span', 'mono', m));
      c.append(r);
    });
    toast('Models loaded');
  } catch (e) { add(el('div', 'ai dim', 'Models failed: ' + e.message)); }
}
async function showConfig() {
  const cfgRes = await harness.config.get();
  const cfg = unwrap(cfgRes) || {};
  const c = add(el('div', 'card')); c.style.cssText = 'padding:12px;display:flex;flex-direction:column;gap:8px';
  c.append(el('div', 'b', 'Provider / API configuration'));
  const presets = el('div', ''); presets.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  [['Ollama Cloud', 'https://ollama.com/v1', 'gemma4:31b-cloud'], ['OpenRouter', 'https://openrouter.ai/api/v1', 'google/gemma-3-27b-it:free'], ['Groq', 'https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'], ['Google AI Studio', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-flash'], ['Local Ollama', 'http://localhost:11434/v1', 'gemma4:31b-cloud']].forEach(([name, url, model]) => {
    const b = el('button', 'btn ghost'); b.textContent = name; b.onclick = () => { baseUrl.value = url; modelInput.value = model; toast('Preset: ' + name); }; presets.append(b);
  });
  c.append(presets);
  const baseUrl = el('input'); baseUrl.value = cfg.baseUrl || ''; baseUrl.placeholder = 'Base URL'; baseUrl.style.cssText = 'width:100%;padding:6px 8px;border:1px solid var(--line);border-radius:var(--r1);background:var(--bg)';
  const apiKey = el('input'); apiKey.value = cfg.apiKey || ''; apiKey.placeholder = 'API key'; apiKey.type = 'password'; apiKey.style.cssText = baseUrl.style.cssText;
  const modelInput = el('input'); modelInput.value = cfg.model || currentModel; modelInput.placeholder = 'Model'; modelInput.style.cssText = baseUrl.style.cssText;
  c.append(baseUrl, apiKey, modelInput);
  const save = el('button', 'btn pri'); save.textContent = 'Save';
  save.onclick = async () => {
    try {
      const res = await harness.config.set({ baseUrl: baseUrl.value.trim(), apiKey: apiKey.value, model: modelInput.value.trim() });
      const data = unwrap(res) || {};
      if (data.model) { currentModel = data.model; $('#mdl').firstChild.textContent = currentModel + ' '; $('#smd').textContent = currentModel; try { localStorage.setItem('lq-model', currentModel); } catch (e) {} }
      toast('Configuration saved');
    } catch (e) { toast('Save failed: ' + e.message); }
  };
  c.append(save);
  c.append(el('div', 'dim', 'Base URL, API key, and model are stored in data/config.json and applied to the running app.'));
}
async function loadMcp() {
  try {
    const res = await harness.mcp.list();
    const list = unwrap(res) || [];
    const c = add(el('div', 'card')); c.style.padding = '8px 12px';
    if (!list.length) { c.append(el('div', 'dim', 'No MCP servers configured. Use /install or mcp:add.')); return; }
    list.forEach(srv => {
      const r = el('div', 'row');
      r.append(el('span', 'ico', srv.connected ? '●' : '○'), el('span', 'tt mono', srv.name), el('span', 'meta', (srv.tools || []).length + ' tools'));
      const btn = el('button', 'btn ghost'); btn.textContent = srv.connected ? 'Disconnect' : 'Connect';
      btn.onclick = async () => {
        try {
          if (srv.connected) await harness.mcp.disconnect(srv.name); else await harness.mcp.connect(srv.name);
          toast((srv.connected ? 'Disconnected ' : 'Connected ') + srv.name);
          loadMcp();
        } catch (e) { toast('MCP failed: ' + e.message); }
      };
      r.append(btn);
      c.append(r);
    });
  } catch (e) { add(el('div', 'ai dim', 'MCP failed: ' + e.message)); }
}

async function loadSkills() {
  try {
    const res = await harness.skills.list();
    const list = unwrap(res) || [];
    const c = add(el('div', 'card')); c.style.padding = '4px';
    if (!list.length) { c.append(el('div', 'row', 'No skills installed.')); return; }
    list.forEach(s => { const r = el('div', 'row'); r.append(el('span', 'ico', '◈'), el('span', 'tt mono', s.name), badge('ok', s.description || 'installed')); c.append(r); });
  } catch (e) { add(el('div', 'ai dim', 'Skills failed: ' + e.message)); }
}
async function loadTools() {
  try {
    const res = await harness.tools.list();
    const list = (unwrap(res) || []).filter(t => !String(t.name).startsWith('mcp_'));
    const c = add(el('div', 'card')); c.style.padding = '8px 12px';
    list.forEach(t => { const r = el('div'); r.append(el('span', 'mono', t.name), el('span', 'dim', '  ' + (t.description || ''))); c.append(r); });
  } catch (e) { add(el('div', 'ai dim', 'Tools failed: ' + e.message)); }
}
async function loadSessionsCmd() {
  await loadSessions();
  const c = add(el('div', 'card')); c.style.padding = '8px 12px';
  if (!sessions.length) { c.append(el('div', 'dim', 'No sessions.')); return; }
  sessions.forEach(s => { const r = el('div'); r.append(el('span', 'mono', s.id), el('span', 'dim', '  ' + (s.title || '') + ' · ' + (s.mode || '') + ' · ' + (s.state || ''))); c.append(r); });
}
async function loadMemory() {
  try {
    const res = await harness.memory.list();
    const list = unwrap(res) || [];
    const c = add(el('div', 'card')); c.style.padding = '8px 12px';
    if (!list.length) { c.append(el('div', 'dim', 'No memories.')); return; }
    list.forEach(m => c.append(el('div', '', (m.text || m.content || JSON.stringify(m)))));
  } catch (e) { add(el('div', 'ai dim', 'Memory failed: ' + e.message)); }
}
async function loadAgents() {
  try {
    const res = await harness.agentConfigs.list();
    const list = unwrap(res) || [];
    const c = add(el('div', 'card')); c.style.padding = '8px 12px';
    if (!list.length) { c.append(el('div', 'dim', 'No agent configs.')); return; }
    list.forEach(a => { const r = el('div'); r.append(el('span', 'mono', a.name), el('span', 'dim', '  ' + (a.description || ''))); c.append(r); });
  } catch (e) { add(el('div', 'ai dim', 'Agents failed: ' + e.message)); }
}

/* ---------- design system ---------- */
function sect(t) { add(el('div', 'faint b', t.toUpperCase())).style.cssText = 'font-size:11px;letter-spacing:.08em;margin-top:10px'; }
function design() {
  add(el('div', 'ai head', 'LinkedQueue design system'));
  add(el('div', 'ai dim', 'Monospace throughout, neutral surfaces, one green accent.'));
  sect('Palette');
  const g = add(el('div', 'card')); g.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;padding:12px';
  [['--bg', 'Background'], ['--side', 'Sidebar'], ['--card', 'Card'], ['--hover', 'Hover'], ['--line', 'Border'], ['--dim', 'Muted text'], ['--ac', 'Accent'], ['--ok', 'Success'], ['--warn', 'Caution'], ['--err', 'Danger'], ['--info', 'Active']].forEach(([v, n]) => {
    const d = el('div'); d.style.cssText = 'display:flex;gap:8px;align-items:center';
    const s = el('span'); s.style.cssText = 'width:22px;height:22px;border-radius:6px;border:1px solid var(--line);flex:none;background:var(--' + v.slice(2) + ')';
    d.append(s, el('span', '', n)); g.append(d);
  });
}
/* ---------- composer ---------- */
function grow() { Q.style.height = 'auto'; Q.style.height = Math.min(Q.scrollHeight, 200) + 'px'; setSt(); }
Q.addEventListener('input', grow);
function send() {
  if (busy) { abort = true; pend && pend.decide(false); return; }
  const v = Q.value; if (!v.trim()) return; Q.value = ''; grow();
  if (v.startsWith('!')) { $('#empty')?.remove(); msg(v); harness.shell.run(v.slice(1)).then(r => { const d = unwrap(r); add(el('div', 'ai dim mono', (d && (d.stdout || d.stderr)) || JSON.stringify(d))); }).catch(e => add(el('div', 'ai dim', 'Shell failed: ' + e.message))); return; }
  if (v.startsWith('/')) { cmd(v); return; }
  runHarness(v);
}
$('#go').onclick = send;
Q.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!busy) send(); }
  if (e.key === 'ArrowUp' && !Q.value && hi > 0) { e.preventDefault(); Q.value = hist[--hi]; grow(); }
  if (e.key === 'ArrowDown' && hi < hist.length && Q.value === hist[hi]) { e.preventDefault(); hi++; Q.value = hist[hi] || ''; grow(); }
});
$$('.seg button').forEach(b => b.onclick = () => { $$('.seg button').forEach(x => x.classList.toggle('on', x === b)); currentMode = b.dataset.m.toLowerCase() === 'act' ? 'act' : 'plan'; toast('Mode: ' + b.dataset.m); });
const MODELS = []; let mi = 0;
async function initModels() {
  try {
    const res = await harness.ollama.models();
    const data = unwrap(res);
    const models = (data && data.models) || [];
    if (models.length) {
      MODELS.splice(0, MODELS.length, ...models);
      if (!MODELS.includes(currentModel)) currentModel = MODELS[0];
      $('#mdl').firstChild.textContent = currentModel + ' ';
      $('#smd').textContent = currentModel;
    }
  } catch (e) {}
}
$('#mdl').onclick = () => {
  if (!MODELS.length) return;
  mi = (mi + 1) % MODELS.length; currentModel = MODELS[mi];
  $('#mdl').firstChild.textContent = currentModel + ' '; $('#smd').textContent = currentModel;
  try { localStorage.setItem('lq-model', currentModel); } catch (e) {}
  toast('Model: ' + currentModel);
};
$('#att').onclick = () => toast('Attachments are not implemented');

/* ---------- command palette ---------- */
let palIsOpen = false, palQuery = '', palIdx = 0;
const palItems = () => { const q = palQuery.toLowerCase().replace(/^\//, ''); return CM.filter(c => !q || c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q)); };
function palRender() { const o = $('#pal-o'); o.replaceChildren(); palItems().forEach((c, i) => { const r = el('div', 'pal-i' + (i === palIdx ? ' on' : '')); r.append(el('span', 'c', c[0]), el('span', 'dim', c[1])); r.onclick = () => palExec(c); o.append(r); }); }
function palOpen_() { palIsOpen = true; palQuery = ''; palIdx = 0; $('#pal').style.display = 'flex'; const l = $('#pal-l'); l.value = ''; palRender(); l.focus(); }
function palClose_() { palIsOpen = false; $('#pal').style.display = 'none'; Q.focus(); }
function palExec(c) { palClose_(); if (!busy) cmd(c[0]); }
$('#pal-l').addEventListener('input', e => { palQuery = e.target.value; palIdx = 0; palRender(); });
$('#pal').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); palClose_(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palIdx + 1, palItems().length - 1); palRender(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); palRender(); }
  if (e.key === 'Enter') { e.preventDefault(); const n = palItems(); if (n[palIdx]) palExec(n[palIdx]); }
});
$('#pal').addEventListener('mousedown', e => { if (e.target.id === 'pal') palClose_(); });
$('#srch').onclick = $('#pk').onclick = () => { if (!busy) palOpen_(); };
$('#cfg').onclick = () => { if (!busy) cmd('/config'); };
$('#newth').onclick = () => { if (!busy) newThreadWrapper(); if (narrowSb()) panel('sb', false); Q.focus(); };

addEventListener('keydown', e => {
  const m = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape' && busy && !palIsOpen) { abort = true; pend && pend.decide(false); }
  if (pend && !palIsOpen && !m && !Q.value && (e.key === 'y' || e.key === 'n')) { e.preventDefault(); pend.decide(e.key === 'y'); }
  if (m && e.key === 'k') { e.preventDefault(); Q.focus(); }
  if (m && e.key === 'p') { e.preventDefault(); if (!busy && !palIsOpen) palOpen_(); }
  if (m && e.key === 'n') { e.preventDefault(); if (!busy) newThreadWrapper(); }
  if (m && e.key === 'b') { e.preventDefault(); panel('sb'); }
});
function logo(small) {
  const n = 'http://www.w3.org/2000/svg', s = document.createElementNS(n, 'svg'), u = document.createElementNS(n, 'use');
  s.setAttribute('class', 'lg' + (small ? ' sm' : '')); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#lq'); s.append(u); return s;
}

/* ---------- sidebar library ---------- */
(function wireLibrary() {
  const items = [
    ['◈', 'Skills', () => cmd('/skills')],
    ['⊞', 'MCP servers', () => cmd('/tools')],
    ['LQ', 'Queue', () => { panel('rp', true); tab('queue'); }],
    ['▤', 'Changes', () => { panel('rp', true); tab('files'); loadFiles(); }],
    ['◧', 'Design system', () => cmd('/design')],
  ];
  const lib = $('#lib'); lib.replaceChildren();
  items.forEach(([i, t, fn]) => {
    const b = el('button', 'row'), ic = el('span', 'ico');
    if (i === 'LQ') ic.append(logo(true)); else ic.textContent = i;
    b.append(ic, el('span', 'tt', t));
    b.onclick = () => { if (!busy) fn(); if (narrowSb()) panel('sb', false); };
    lib.append(b);
  });
})();

/* ---------- boot ---------- */
drawQueue();
showEmpty();
setSt();
initModels();
loadSessions();
if (matchMedia('(pointer: fine)').matches) Q.focus();

/* ---------- window controls ---------- */
(function () {
  const lights = document.querySelectorAll('.lights i');
  const actions = [() => window.win?.close(), () => window.win?.minimize(), () => window.win?.maximize()];
  lights.forEach((elx, i) => { elx.style.cursor = 'pointer'; elx.title = ['Close', 'Minimize', 'Maximize'][i]; elx.addEventListener('click', (e) => { e.stopPropagation(); actions[i] && actions[i](); }); });
  document.querySelector('.tb')?.addEventListener('dblclick', () => window.win?.maximize());
})();
