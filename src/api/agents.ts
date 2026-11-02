// Background subagents with cancellation. Persisted snapshots in data/agents.jsonl.
import fs from 'fs';
import path from 'path';
import { runAgent } from '../harness';
import { saveSession } from '../persistence';
import { DATA } from '../util';
import type { AgentEvent, ApproveFn, Json, Session, SessionMode } from '../types';

const FILE = path.join(DATA, 'agents.jsonl');

export interface SubagentRecord {
  id: string;
  name: string;
  task: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  sessionId?: string;
  model: string;
  mode: SessionMode;
  createdAt: number;
  updatedAt: number;
  result?: string;
  error?: string;
}

let hooks: { emit: (e: AgentEvent) => void; approve: ApproveFn } | null = null;
const controllers = new Map<string, AbortController>();

export function setAgentHooks(h: { emit: (e: AgentEvent) => void; approve: ApproveFn }): void {
  hooks = h;
}

export function cancelSubagent(id: string): { ok: boolean } {
  const rec = getSubagent(id);
  if (!rec || rec.status !== 'running') return { ok: false };
  const ctrl = controllers.get(id);
  if (ctrl) ctrl.abort();
  else { rec.status = 'cancelled'; rec.updatedAt = Date.now(); snap(rec); }
  hooks?.emit({ type: 'agent', id, name: rec.name, status: 'cancelled', task: rec.task });
  return { ok: true };
}

export function cancelAllSubagents(): void {
  for (const id of controllers.keys()) cancelSubagent(id);
}

function readAll(): SubagentRecord[] {
  try {
    return fs.readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) as SubagentRecord; } catch { return null; } }).filter((r): r is SubagentRecord => !!r).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function listSubagents(): SubagentRecord[] {
  const byId = new Map<string, SubagentRecord>();
  for (const r of readAll()) {
    if (!byId.has(r.id)) byId.set(r.id, r); // readAll is newest-first, so keep the first (latest) snapshot
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getSubagent(id: string): SubagentRecord | undefined {
  return listSubagents().find((r) => r.id === id);
}

function snap(rec: SubagentRecord): void {
  fs.mkdirSync(DATA, { recursive: true });
  fs.appendFileSync(FILE, JSON.stringify(rec) + '\n');
}

export function startSubagent(opts: { name: string; task: string; model?: string; mode?: SessionMode; allowedTools?: string[] }): SubagentRecord {
  const id = 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rec: SubagentRecord = {
    id, name: opts.name, task: opts.task, status: 'running', model: opts.model || (process.env.HARNESS_MODEL || 'qwen3-coder'),
    mode: opts.mode || 'act', createdAt: Date.now(), updatedAt: Date.now(),
  };
  snap(rec);

  const controller = new AbortController();
  controllers.set(id, controller);
  void (async () => {
    try {
      if (!hooks) throw new Error('subagent hooks not configured');
      const h = hooks;
      const emit = (e: AgentEvent) => h.emit({ ...e, agent: { id, name: opts.name } });
      emit({ type: 'agent', id, name: opts.name, status: 'start', task: opts.task });
      const result = await runAgent({
        prompt: `You are subagent "${opts.name}". Complete this task independently and return a concise result. Task:\n${opts.task}`,
        emit,
        approve: h.approve,
        mode: rec.mode,
        model: rec.model,
        signal: controller.signal,
        allowedTools: opts.allowedTools,
        title: '[sub] ' + opts.name,
      });
      const last = [...result].reverse().find((m: Json) => m.role === 'assistant' && typeof m.content === 'string');
      rec.status = 'done'; rec.result = last ? String(last.content).slice(0, 4000) : 'done';
    } catch (e) {
      rec.status = (e as Error).message === 'cancelled' ? 'cancelled' : 'error';
      rec.error = (e as Error).message;
    } finally {
      controllers.delete(id);
    }
    rec.updatedAt = Date.now();
    snap(rec);
    hooks?.emit({ type: 'agent', id, name: opts.name, status: rec.status, task: opts.task, result: rec.result });
  })();

  return rec;
}
