// Electron hub — session management, event streaming, approvals, plans.
import './env';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { runAgent } from './harness';
import { listSessions, deleteSession, loadSession, saveSession } from './persistence';
import fs from 'fs';
import { registerIpc, createApproveFn, stopIpc, connectEnabled } from './ipc';
import type { AgentEvent, Session, SessionMode, Json } from './types';

let win: BrowserWindow;
let sessions: Session[] = [];

const CONFIG_FILE = path.join(process.env.HARNESS_DATA || path.join(process.cwd(), 'data'), 'config.json');
function loadConfigFile() {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (cfg.baseUrl) process.env.HARNESS_BASE_URL = cfg.baseUrl;
    if (cfg.apiKey) process.env.HARNESS_API_KEY = cfg.apiKey;
    if (cfg.model) process.env.HARNESS_MODEL = cfg.model;
  } catch { /* no config yet */ }
}
function readConfigFile() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function writeConfigFile(cfg: any) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}
loadConfigFile();

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 1440, height: 950, minWidth: 900, minHeight: 600,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#131a29',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  sessions = listSessions();

  const emit = (e: AgentEvent): void => {
    if (win && !win.isDestroyed()) win.webContents.send('event', e);
  };
  const approve = createApproveFn(emit);
  registerIpc({ emit });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('startup', { sessionCount: sessions.length });
  });

  // Connect enabled MCP servers at startup (never blocks the window).
  connectEnabled().catch(() => { /* status surfaced via mcp:list */ });
});

function approve(call: { name: string; args: Json }): Promise<boolean> {
  return createApproveFn((e: AgentEvent) => {
    if (win && !win.isDestroyed()) win.webContents.send('event', e);
  })(call);
}

ipcMain.handle('run', async (_e, arg: { prompt: string; sessionId?: string; mode?: SessionMode; model?: string; rootDir?: string; agentConfig?: any }) => {
  let session: Session | undefined = undefined;
  if (arg.sessionId) {
    session = loadSession(arg.sessionId);
    if (!session) throw new Error('Session not found');
  }
  const did = await runAgent({
    prompt: arg.prompt,
    session,
    mode: arg.mode,
    model: arg.model,
    rootDir: arg.rootDir || (process.env.HARNESS_WORKSPACE || path.join(process.cwd(), 'workspace')),
    agentConfig: arg.agentConfig,
    emit: (e: AgentEvent) => { if (win && !win.isDestroyed()) win.webContents.send('event', e); },
    approve,
  });
  sessions = listSessions();
  return did;
});

// Re-run a paused (plan-ready) session in act mode with its original prompt.
ipcMain.handle('execute', async (_e, arg: { sessionId: string }) => {
  const session = loadSession(arg.sessionId);
  if (!session) return { ok: false, error: 'Session not found' };
  session.mode = 'act';
  session.state = 'running';
  sessions = listSessions();
  const emit = (e: AgentEvent) => win.webContents.send('event', e);
  const did = await runAgent({ session, emit, approve });
  saveSession(session);
  sessions = listSessions();
  return { ok: true, messages: did.length };
});

ipcMain.handle('list-sessions', () => listSessions());
ipcMain.handle('set-mode', async (_e, arg: { sessionId: string; mode: SessionMode }) => {
  const session = loadSession(arg.sessionId);
  if (!session) return { ok: false, error: 'Session not found' };
  session.mode = arg.mode;
  sessions = listSessions();
  return { ok: true };
});
ipcMain.handle('delete-session', async (_e, arg: { sessionId: string }) => {
  deleteSession(arg.sessionId);
  sessions = listSessions();
  return { ok: true };
});
ipcMain.handle('new-session', async (_e, arg: { prompt?: string }) => {
  const emit = (e: AgentEvent) => win.webContents.send('event', e);
  const did = await runAgent({
    prompt: arg.prompt || 'Start a new session',
    session: undefined,
    emit,
    approve,
  });
  return { ok: true, sessions: listSessions() };
});
// Proxy Ollama's OpenAI-compatible /v1/models so the renderer can list
// installed models without calling Ollama directly (CSP blocks cross-origin fetch).
ipcMain.handle('ollama:models', async () => {
  const base = process.env.HARNESS_BASE_URL || 'http://localhost:11434/v1';
  try {
    const res = await fetch(base.endsWith('/v1') ? base + '/models' : base + '/v1/models', {
      headers: { Authorization: 'Bearer ' + (process.env.HARNESS_API_KEY || 'none') },
    });
    if (!res.ok) return { ok: false, error: `Ollama ${res.status}` };
    const data = await res.json();
    const models = (data.data || []).map((m: any) => m.id).filter(Boolean);
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('shell:run', async (_e, { command }: { command: string }) => {
  try {
    const { run } = await import('./util');
    const bin = 'bash';
    const args = ['-lc', command];
    const result = await (run(bin, args) as Promise<any>);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});

ipcMain.handle('window:minimize', () => { if (win && !win.isDestroyed()) win.minimize(); return { ok: true }; });
ipcMain.handle('window:maximize', () => {
  if (!win || win.isDestroyed()) return { ok: false };
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
  return { ok: true, maximized: win.isMaximized() };
});
ipcMain.handle('window:close', () => { if (win && !win.isDestroyed()) win.close(); return { ok: true }; });
ipcMain.handle('window:is-maximized', () => ({ ok: true, maximized: !!win && !win.isDestroyed() && win.isMaximized() }));

ipcMain.handle('config:get', () => {
  const cfg = readConfigFile();
  return { ok: true, data: {
    baseUrl: process.env.HARNESS_BASE_URL || cfg.baseUrl || 'https://ollama.com/v1',
    apiKey: process.env.HARNESS_API_KEY || cfg.apiKey || '',
    model: process.env.HARNESS_MODEL || cfg.model || 'gemma4:31b-cloud',
  } };
});
ipcMain.handle('config:set', (_e, arg: { baseUrl?: string; apiKey?: string; model?: string }) => {
  const cfg = readConfigFile();
  if (arg.baseUrl) { process.env.HARNESS_BASE_URL = arg.baseUrl; cfg.baseUrl = arg.baseUrl; }
  if (arg.apiKey !== undefined) { process.env.HARNESS_API_KEY = arg.apiKey; cfg.apiKey = arg.apiKey; }
  if (arg.model) { process.env.HARNESS_MODEL = arg.model; cfg.model = arg.model; }
  writeConfigFile(cfg);
  return { ok: true, data: { baseUrl: process.env.HARNESS_BASE_URL, apiKey: process.env.HARNESS_API_KEY || '', model: process.env.HARNESS_MODEL } };
});

ipcMain.handle('workspace-files', () => {
  const root = process.env.HARNESS_WORKSPACE || path.join(process.cwd(), 'workspace');
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() })).sort((a, b) => a.name.localeCompare(b.name));
  } catch { return []; }
});

app.on('before-quit', async () => {
  await stopIpc();
});

app.on('window-all-closed', () => app.quit());
