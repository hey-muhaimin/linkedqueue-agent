// Harness hub — agent loop with session persistence, plan mode, multi-model,
// project instructions (AGENTS.md), permission engine, and OpenCode-style UX
// (@file references, ! shell commands, auto-approve).
import { allTools } from './registry';
import { saveSession } from './persistence';
import { runHooks } from './hooks';
import { shouldPauseForPlan, buildPlanEvent, planModeSystem, loadProjectInstructions } from './planmode';
import { readFile as readFileFn } from './fileedit';
import { getPermissionConfig, decide } from './api/permissions';
import type { PermissionConfig } from './api/permissions';
import { resolveAgentPermission } from './api/agents-config';
import path from 'path';
import fs from 'fs';
import { compactHistory } from './context';
import type {
  AgentEvent, ApproveFn, Json, Tool, Session, SessionMode, Ctx,
} from './types';

const DEFAULT_MODEL = process.env.HARNESS_MODEL || 'gemma4:31b-cloud';
const MAX_STEPS = Number(process.env.HARNESS_MAX_STEPS || 12) || 12;

export { loadProjectInstructions };

async function chat(messages: Json[], tools: Record<string, Tool>, model: string, signal?: AbortSignal, emit?: (e: AgentEvent) => void): Promise<Json> {
  const base = process.env.HARNESS_BASE_URL || 'http://localhost:11434/v1';
  const normalizedMessages = (messages || []).map((m: any) => ({ ...m, content: typeof m.content === 'string' ? m.content : (m.content == null ? '' : String(m.content ?? '')) }));
  const body = {
    model, messages: normalizedMessages, stream: true,
    tools: Object.entries(tools).map(([name, t]) => ({ type: 'function', function: { name, description: t.description, parameters: t.params } })),
  };
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), Number(process.env.HARNESS_TIMEOUT_MS || 30000));
    try {
      const res = await fetch(base + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.HARNESS_API_KEY || 'none') },
        body: JSON.stringify(body), signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const reader = res.body?.getReader?.();
      if (!reader) {
        const json = await res.json();
        const message = (json as any).choices?.[0]?.message;
        return message || { role: 'assistant', content: '' };
      }
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      const calls: Record<number, any> = {};
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = (json as any)?.choices?.[0]?.delta || {};
            if (typeof delta.content === 'string') {
              content += delta.content;
              emit?.({ type: 'text-delta', text: delta.content });
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = Number(tc.index || 0);
                calls[idx] = calls[idx] || { id: '', type: 'function', function: { name: '', arguments: '' } };
                if (tc.id) calls[idx].id = tc.id;
                if (tc.function?.name) calls[idx].function.name += tc.function.name;
                if (tc.function?.arguments) calls[idx].function.arguments += tc.function.arguments;
                emit?.({ type: 'tool-call-delta', delta: { index: idx, id: tc.id, name: tc.function?.name, arguments: tc.function?.arguments } });
              }
            }
          } catch {}
        }
      }
      const tool_calls = Object.values(calls);
      return { role: 'assistant', content: content || null, tool_calls: tool_calls.length ? tool_calls : undefined };
    } catch (err) {
      clearTimeout(timer);
      lastError = err as Error;
      if (signal?.aborted) throw new Error('cancelled');
      if (attempt < 2) await new Promise(r => setTimeout(r, Math.min(5000, 1000 * Math.pow(2, attempt))));
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastError || new Error('chat failed');
}

/**
 * Expand @file references in a prompt. Finds @path patterns (with optional
 * line ranges @path#10-20), reads the files, and prepends their content
 * to the prompt so the model sees them as context.
 */
export function expandFileRefs(prompt: string, rootDir: string): { prompt: string; refs: string[] } {
  const refs: string[] = [];
  const ROOT_REAL = path.resolve(rootDir);
  let out = prompt;
  // Match @path optionally followed by #start-end line range
  const re = /@([^\s#]+)(?:#(\d+)(?:-(\d+))?)?/g;
  out = out.replace(re, (match, filePath, startStr, endStr) => {
    refs.push(filePath);
    try {
      const full = path.resolve(ROOT_REAL, filePath);
      // guard: must be inside root
      if (full !== ROOT_REAL && !full.startsWith(ROOT_REAL + path.sep)) {
        return `[ref: ${filePath} (path escapes workspace)]`;
      }
      const text = readFileFn(full);
      const lines = text.split(/\r?\n/);
      let selected = text;
      if (startStr !== undefined) {
        const start = parseInt(startStr, 10);
        const end = endStr !== undefined ? parseInt(endStr, 10) : start;
        selected = lines.slice(Math.max(0, start - 1), Math.min(lines.length, end)).join('\n');
      }
      return `\n--- @${filePath} (lines ${startStr || '1'}-${endStr || lines.length}) ---\n${selected}\n--- end @${filePath} ---`;
    } catch (e) {
      return `[ref: ${filePath} (error: ${(e as Error).message})]`;
    }
  });
  return { prompt: out, refs };
}

/**
 * Detect a shell command prefix (!). If the prompt starts with !, it's a
 * shell command to run directly via the shell tool.
 */
export function detectShellCommand(prompt: string): { isShell: boolean; command?: string } {
  const trimmed = prompt.trim();
  if (trimmed.startsWith('!')) {
    return { isShell: true, command: trimmed.slice(1).trim() };
  }
  return { isShell: false };
}


function spillResult(raw: unknown, sessionId: string): unknown {
  const text = JSON.stringify(raw);
  const threshold = Number(process.env.HARNESS_SPILL_THRESHOLD || 50000);
  if (text.length <= threshold) return raw;
  const dir = path.join(process.env.HARNESS_DATA || path.join(process.cwd(), 'data'), 'artifacts');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const file = path.join(dir, `toolresult_${sessionId}_${Date.now()}.txt`);
  try { fs.writeFileSync(file, text, 'utf8'); } catch {}
  return { spilled: true, path: file, preview: text.slice(0, 1000) + String.fromCharCode(10) + "...[truncated]" };
}

export async function runAgent(opts: {
  prompt?: string;
  session?: Session;
  title?: string;
  mode?: SessionMode;
  model?: string;
  emit: (e: AgentEvent) => void;
  approve: ApproveFn;
  ctx?: Ctx;
  signal?: AbortSignal;
  allowedTools?: string[];
  agentConfig?: { name: string; systemPrompt?: string; permissions?: Record<string, 'allow'|'ask'|'deny'>; autoApprove?: boolean };
  rootDir?: string;
}): Promise<Json[]> {
  const { emit, approve, mode: modeOver, model: modelOver, session, signal, allowedTools, agentConfig, rootDir } = opts;
  const prompt = opts.prompt ?? '';
  const mode: SessionMode = (opts.mode ?? session?.mode) as SessionMode;
  const model = modelOver ?? session?.model ?? DEFAULT_MODEL;
  const permCfg = getPermissionConfig();
  const permOverrides: Record<string, 'allow' | 'ask' | 'deny'> = (agentConfig?.permissions as any) || {};
  const cfg: PermissionConfig = { rules: { ...permCfg.rules, ...permOverrides }, autoApprove: agentConfig?.autoApprove ?? permCfg.autoApprove };
  const autoApprove = cfg.autoApprove;
  let s: Session;
  if (session) {
    s = { ...session, model, mode, state: 'running', updatedAt: Date.now(), error: undefined };
  } else {
    const title = opts.title || prompt.split('\n')[0].slice(0, 60) || 'New session';
    const id = 'session_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    s = { id, title, model, mode, state: 'idle', history: [], todos: [], lastPrompt: prompt || (session as any)?.lastPrompt, createdAt: Date.now(), updatedAt: Date.now(), pid: null };
  }

  // Build the tool set
  let tools = allowedTools ? pickAllowedTools(allTools(), allowedTools) : allTools();

  // Expand @file references in the user prompt
  let finalPrompt = prompt || '';
  let refs: string[] = [];
  if (rootDir && finalPrompt) {
    const expanded = expandFileRefs(finalPrompt, rootDir);
    finalPrompt = expanded.prompt;
    refs = expanded.refs;
  }
  if (refs.length) {
    emit({ type: 'text', text: `Attached ${refs.length} file reference(s): ${refs.join(', ')}` });
  }

  // Build system prompt: agent config overrides plan mode system
  const systemPrompt = agentConfig?.systemPrompt || planModeSystem(mode, model);

  let messages: Json[] = [];
  messages.push({ role: 'system', content: systemPrompt });
  if (s.history.length) {
    for (const m of s.history) { if (m.role !== 'system') messages.push(m); }
  }
  if (finalPrompt) messages.push({ role: 'user', content: finalPrompt });
  s.history = messages;

  const ctx: Ctx = { emit, model, sessionId: s.id, readFiles: [], history: messages };


  await runHooks('session-start', { emit, log: () => {}, sessionId: s.id });
  s.state = 'running';
  saveSession(s);



  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) { s.state = 'error'; s.error = 'cancelled'; saveSession(s); emit({ type: 'error', message: 'cancelled' }); throw new Error('cancelled'); }
    try {
      messages = compactHistory(messages);
      const msg = await chat(messages, tools, model, signal, emit);
      messages.push(msg);
      if (msg.content) emit({ type: 'text', text: msg.content });

      if (!msg.tool_calls?.length) {
        s.state = 'done'; s.updatedAt = Date.now();
        saveSession(s);
        return messages;
      }

      const calls = (msg.tool_calls as Json[]) ?? [];
      const allReadOnly = calls.length > 0 && calls.every((c) => {
        const t = tools[c.function.name];
        return !!t?.readOnly && (typeof t.risky !== 'function' || !(t as any).risky(JSON.parse(c.function.arguments || '{}')));
      });

      const runOne = async (call: Json) => {
        const name: string = call.function.name;
        const tool = tools[name];
        let args: Json = {};
        let result: unknown;
        try {
          if (!tool) throw new Error(`Unknown tool: ${name}`);
          const raw = call.function.arguments;
          args = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
          await runHooks('pre-tool', { emit, log: () => {}, sessionId: s.id });
          const decision = decide(tool, args, cfg, autoApprove);
          if (decision.reason === 'denied') {
            result = { error: `Tool '${name}' is denied by permission rules.` };
          } else if (decision.approve) {
            result = await tool.run(args, ctx);
          } else {
            const allowed = await approve({ name, args });
            if (!allowed) result = { error: 'Rejected by user.' };
            else result = await tool.run(args, ctx);
          }
        } catch (e) {
          if (typeof e === 'object' && e !== null && (e as Error).name === 'AbortError') {
            s.state = 'error'; s.error = 'cancelled'; saveSession(s); emit({ type: 'error', message: 'cancelled' }); throw new Error('cancelled');
          }
          result = { error: (e as Error).message };
        }
        const spilled = spillResult(result, s.id);
        if (name !== 'todo_write' && name !== 'artifact_write') emit({ type: 'tool', name, args, result: spilled });
        return { id: call.id, name, args, result: spilled };
      };

      const executed = allReadOnly
        ? await Promise.all(calls.map(runOne))
        : await (async () => {
            const out: any[] = [];
            for (const call of calls) out.push(await runOne(call));
            return out;
          })();

      for (const item of executed) {
        messages.push({ role: 'tool', tool_call_id: item.id, content: JSON.stringify(item.result) });
      }

      await runHooks('agent-step', { emit, log: () => {}, sessionId: s.id });
      if (shouldPauseForPlan({ mode, history: messages })) {
        s.state = 'waiting'; s.updatedAt = Date.now();
        saveSession(s);
        emit(buildPlanEvent(s.todos));
        return messages;
      }

      s.updatedAt = Date.now();
      saveSession(s);
      await runHooks('post-tool', { emit, log: () => {}, sessionId: s.id });
    } catch (e) {
      if ((e as Error).message === 'cancelled') throw e;
      emit({ type: 'error', message: (e as Error).message });
      s.state = 'error'; s.error = (e as Error).message; saveSession(s);
      throw e;
    }
  }

  s.state = 'waiting'; s.error = 'Reached ' + MAX_STEPS + ' steps.';
  saveSession(s);
  await runHooks('session-end', { emit, log: () => {}, sessionId: s.id });
  emit({ type: 'text', text: 'Reached ' + MAX_STEPS + ' steps. Continue? (y/N)' });
  return messages;
}

function pickAllowedTools(all: Record<string, Tool>, allowed: string[]): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const name of allowed) {
    if (all[name]) out[name] = all[name];
  }
  return out;
}
