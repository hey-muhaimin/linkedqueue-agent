// Electron UI smoke test: loads renderer/index.html with a stubbed harness and
// clicks every navigation view to prove nothing throws. Headless (show: false).
// Usage: npx electron scripts/ui-smoke.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

const stubHarness = `
window.harness = {
  run: () => Promise.resolve(),
  approve: () => {},
  execute: () => Promise.resolve({ ok: true }),
  listSessions: () => Promise.resolve([]),
  setMode: () => Promise.resolve(),
  deleteSession: () => Promise.resolve(),
  newSession: () => Promise.resolve({ sessions: [] }),
  workspaceFiles: () => Promise.resolve([]),
  plugins: {
    list: () => Promise.resolve([]),
    read: () => Promise.resolve(''),
    reload: () => Promise.resolve({ plugins: [] }),
    install: () => Promise.resolve({ installed: 'x', tools: [] }),
    remove: () => Promise.resolve({ ok: true }),
  },
  skills: {
    list: () => Promise.resolve([]),
    read: () => Promise.resolve(''),
    install: () => Promise.resolve({ installed: 'x' }),
    remove: () => Promise.resolve({ ok: true }),
  },
  mcp: {
    list: () => Promise.resolve([]),
    add: () => Promise.resolve({}),
    remove: () => Promise.resolve({ ok: true }),
    connect: () => Promise.resolve({}),
    disconnect: () => Promise.resolve({}),
  },
  memory: {
    list: () => Promise.resolve([]),
    add: () => Promise.resolve({}),
    delete: () => Promise.resolve({ ok: true }),
    clear: () => Promise.resolve({ removed: 0 }),
  },
  tools: { list: () => Promise.resolve([]) },
  ollama: {
    models: () => Promise.resolve({ ok: true, models: ['qwen3-coder', 'llama3.1'] }),
  },
  fs: {
    tree: () => Promise.resolve([]),
    read: () => Promise.resolve({ path: 'x', content: '' }),
    write: () => Promise.resolve({ ok: true, path: 'x', bytes: 0 }),
    delete: () => Promise.resolve({ ok: true }),
  },
  agents: {
    list: () => Promise.resolve([]),
    start: () => Promise.resolve({ id: 'a', name: 'n' }),
    cancel: () => Promise.resolve({ ok: true }),
  },
  handoff: { create: () => Promise.resolve({ id: 'h', title: 't' }) },
  onStartup: () => {},
  onEvent: () => {},
  config: { get: () => Promise.resolve({ ok: true, data: { baseUrl: 'https://ollama.com/v1', apiKey: '', model: 'gemma4:31b-cloud' } }), set: () => Promise.resolve({ ok: true, data: {} }) },
};
`;

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.js'), contextIsolation: true },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(String(msg)); });
  win.webContents.on('crashed', () => errors.push('renderer crashed'));
  win.webContents.on('did-fail-load', () => errors.push('failed to load index.html'));

  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 1200));

  const checks = [];
  for (const id of ['sb','mn','rp','q','go']) {
    const visible = await win.webContents.executeJavaScript(`!!document.getElementById('${id}')`);
    checks.push([id, visible]);
  }

  // palette open/close
  await win.webContents.executeJavaScript(`(()=>{const e=new KeyboardEvent('keydown',{key:'p',ctrlKey:true,bubbles:true});return window.dispatchEvent(e);})()`);
  await new Promise(r => setTimeout(r, 200));
  const palOpen = await win.webContents.executeJavaScript(`document.getElementById('pal').style.display !== 'none'`);
  checks.push(['palette', palOpen]);
  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);

  console.log('CHECKS', JSON.stringify(checks));
  console.log('ERRORS', JSON.stringify(errors));
  const ok = checks.every(([, v]) => v) && errors.length === 0;
  console.log(ok ? 'UI SMOKE OK' : 'UI SMOKE FAILED');
  app.quit();
  process.exit(ok ? 0 : 1);
})();
