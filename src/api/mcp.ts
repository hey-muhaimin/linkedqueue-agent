// Minimal MCP stdio client: JSON-RPC 2.0 over newline-delimited JSON, no new deps.
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { DATA } from '../util';
import type { Tool } from '../types';

const FILE = path.join(DATA, 'mcp.json');

export interface McpServerConfig { name: string; command: string; args?: string[]; env?: Record<string, string>; enabled?: boolean }
export interface McpToolInfo { name: string; description: string; inputSchema: any }
export interface McpServerStatus { name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean; connected: boolean; tools: McpToolInfo[]; error?: string | null }

interface ServerState {
  proc: ChildProcess | null;
  name: string;
  buffer: string;
  nextId: number;
  pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>;
  tools: McpToolInfo[];
  connected: boolean;
  error: string | null;
}

const servers = new Map<string, ServerState>();

function readConfig(): { servers: McpServerConfig[] } {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return { servers: [] }; }
}
function writeConfig(cfg: { servers: McpServerConfig[] }) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}
function sanitize(s: string): string { return s.replace(/[^A-Za-z0-9]/g, '_').slice(0, 40); }

export function listMcpServers(): McpServerStatus[] {
  const cfg = readConfig();
  return cfg.servers.map((c) => {
    const st = servers.get(c.name);
    return { name: c.name, command: c.command, args: c.args ?? [], env: c.env, enabled: c.enabled !== false, connected: !!st?.connected, tools: st ? st.tools : [], error: st ? st.error ?? null : null };
  });
}

export function addMcpServer(cfg: McpServerConfig): McpServerStatus {
  const current = readConfig();
  if (current.servers.some((c) => c.name === cfg.name)) throw new Error('Server already exists: ' + cfg.name);
  current.servers.push(cfg);
  writeConfig(current);
  return listMcpServers().find((s) => s.name === cfg.name)!;
}

export function removeMcpServer(name: string): { ok: boolean } {
  disconnectMcpServerSync(name);
  const current = readConfig();
  const kept = current.servers.filter((c) => c.name !== name);
  if (kept.length === current.servers.length) return { ok: false };
  writeConfig({ servers: kept });
  return { ok: true };
}

function errOf(e: unknown): Error { return e instanceof Error ? e : new Error(String(e)); }

function requestJson<T = any>(proc: ChildProcess, state: ServerState, method: string, params: any, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++state.nextId;
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
      try { proc.kill('SIGTERM'); } catch {}
    }, ms);
    state.pending.set(id, { resolve: (v: any) => resolve(v), reject: (e: Error) => reject(e), timer });
    try { proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); } catch (e) {
      state.pending.delete(id);
      clearTimeout(timer);
      reject(errOf(e));
    }
  });
}

function notifyJson(proc: ChildProcess, method: string, params: any): void {
  try { proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); } catch {}
}

function settlePending(state: ServerState, rejectWith: Error) {
  for (const pend of state.pending.values()) { clearTimeout(pend.timer); pend.reject(rejectWith); }
  state.pending.clear();
}

async function connectOne(name: string): Promise<McpServerStatus> {
  const cfg = readConfig().servers.find((c) => c.name === name);
  if (!cfg) throw new Error('Unknown MCP server: ' + name);
  disconnectMcpServerSync(name);

  const state: ServerState = { proc: null, name, buffer: '', nextId: 0, pending: new Map(), tools: [], connected: false, error: null };
  servers.set(name, state);

  const shell = process.platform === 'win32';
  const proc = spawn(cfg.command, cfg.args ?? [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...cfg.env },
    shell,
  });
  state.proc = proc;
  const stdin = proc.stdin;
  if (!stdin) throw new Error('MCP process has no stdin: ' + name);

  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });
  proc.stdout.on('data', (d) => {
    state.buffer += d.toString();
    let idx: number;
    while ((idx = state.buffer.indexOf('\n')) >= 0) {
      const line = state.buffer.slice(0, idx).trim();
      state.buffer = state.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg && typeof msg === 'object' && typeof msg.id === 'number') {
          const pend = state.pending.get(msg.id);
          if (pend) {
            clearTimeout(pend.timer);
            state.pending.delete(msg.id);
            if (msg.error) pend.reject(new Error('MCP error ' + String(msg.error.code) + ': ' + String(msg.error.message)));
            else pend.resolve(msg.result);
          }
        }
      } catch { /* ignore unparseable line */ }
    }
  });

  const onExit = () => {
    state.proc = null;
    state.connected = false;
    settlePending(state, new Error('MCP process exited'));
  };
  proc.on('exit', onExit);
  proc.on('error', (e) => { state.error = e.message; onExit(); });

  try {
    await requestJson(proc, state, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sprig', version: '0.4.0' },
    }, 10000);
    notifyJson(proc, 'notifications/initialized', {});
    const tools = await requestJson<{ tools: McpToolInfo[] }>(proc, state, 'tools/list', {}, 10000);
    state.tools = tools?.tools ?? [];
    state.connected = true;
    state.error = null;
  } catch (e) {
    state.connected = false;
    state.error = errOf(e).message;
    state.tools = [];
    try { proc.kill('SIGTERM'); } catch {}
    throw new Error(state.error || errOf(e).message);
  }

  return listMcpServers().find((s) => s.name === name)!;
}

export async function connectMcpServer(name: string): Promise<McpServerStatus> {
  const st = servers.get(name);
  if (st && st.proc && st.connected) return listMcpServers().find((s) => s.name === name)!;
  await connectOne(name);
  return listMcpServers().find((s) => s.name === name)!;
}

export async function disconnectMcpServer(name: string): Promise<McpServerStatus> {
  disconnectMcpServerSync(name);
  const current = readConfig();
  return listMcpServers().find((s) => s.name === name) ?? { name, command: '', args: [], enabled: false, connected: false, tools: [], error: null };
}

export function disconnectMcpServerSync(name: string): void {
  const st = servers.get(name);
  if (!st) return;
  try { st.proc?.kill('SIGTERM'); } catch {}
  st.proc = null;
  settlePending(st, new Error('disconnected'));
  servers.delete(name);
}

export async function connectEnabled(): Promise<McpServerStatus[]> {
  const cfg = readConfig();
  const results = await Promise.allSettled(cfg.servers.filter((c) => c.enabled !== false).map((c) => connectMcpServer(c.name)));
  return results.map((r, i) => r.status === 'fulfilled'
    ? r.value
    : ({ name: cfg.servers[i].name, command: cfg.servers[i].command, args: cfg.servers[i].args ?? [], enabled: true, connected: false, tools: [], error: r.reason instanceof Error ? r.reason.message : String(r.reason) } as unknown as McpServerStatus));
}

export async function shutdownMcp(): Promise<void> {
  for (const name of [...servers.keys()]) disconnectMcpServerSync(name);
}

export function getMcpTools(): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const [name, st] of servers) {
    if (!st.proc || !st.connected) continue;
    for (const t of st.tools) {
      const key = `mcp_${sanitize(name)}_${sanitize(t.name)}`;
      out[key] = {
        description: `${t.description || t.name} (MCP server: ${name})`,
        params: t.inputSchema || { type: 'object', properties: {} },
        risky: true,
        run: async (args: any) => {
          const st2 = servers.get(name);
          if (!st2?.proc || !st2.connected) throw new Error('MCP server not connected: ' + name);
          const res = await requestJson<any>(st2.proc, st2, 'tools/call', { name: t.name, arguments: args }, 30000);
          if (res?.isError) return { error: Array.isArray(res.content) ? res.content.map((c: any) => c.text).join('\n') : String(res.content) };
          const parts = Array.isArray(res?.content) ? res.content.filter((c: any) => c.type === 'text').map((c: any) => c.text) : [];
          return { content: parts.join('\n') };
        },
      };
    }
  }
  return out;
}
