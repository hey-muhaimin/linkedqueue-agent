// Harness hub — agent loop with session persistence, plan mode, multi-model,
// project instructions (AGENTS.md), permission engine, and OpenCode-style UX
// (@file references, ! shell commands, auto-approve).
import { allTools } from './registry';
import { saveSession } from './persistence';
import { runHooks } from './hooks';
import { shouldPauseForPlan, buildPlanEvent, planModeSystem, loadProjectInstructions } from './planmode';
import { readFile as readFileFn } from './fileedit';
import { getPermissionConfig } from './api/permissions';
import { resolveAgentPermission } from './api/agents-config';
import path from 'path';
import type {
  AgentEvent, ApproveFn, Json, Tool, Session, SessionMode, Ctx,
} from './types';

const DEFAULT_MODEL = process.env.HARNESS_MODEL || 'gemma4:31b';
const MAX_STEPS = 12;

export { loadProjectInstructions };

async function chat(messages: Json[], tools: Record<string, Tool>, model: string, signal?: AbortSignal): Promise<Json> {
  const base = process.env.HARNESS_BASE_URL || 'http://localhost:11434/v1';
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.HARNESS_API_KEY || 'none') },
    signal,
    body: JSON.stringify({
      model, messages,
      tools: Object.entries(tools).map(([name, t]) => ({
        type: 'function', function: { name, description: t.description, parameters: t.params },
      })),
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).choices[0].message;
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

export async function runAgent(opts: {
  prompt: string;
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
  const { prompt, emit, approve, mode: modeOver, model: modelOver, session, signal, allowedTools, agentConfig, rootDir } = opts;
  const mode: SessionMode = (opts.mode ?? session?.mode) as SessionMode;
  const model = modelOver ?? session?.model ?? DEFAULT_MODEL;
  const permCfg = getPermissionConfig();
  const autoApprove = agentConfig?.autoApprove ?? permCfg.autoApprove;

  let s: Session;
  if (session) {
    s = { ...session, model, mode, state: 'running', updatedAt: Date.now(), error: undefined };
  } else {
    const title = opts.title || prompt.split('\n')[0].slice(0, 60) || 'New session';
    const id = 'session_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    s = { id, title, model, mode, state: 'idle', history: [], todos: [], lastPrompt: prompt, createdAt: Date.now(), updatedAt: Date.now(), pid: null };
  }

  // Build the tool set
  let tools = allowedTools ? pickAllowedTools(allTools(), allowedTools) : allTools();

  // Expand @file references in the user prompt
  let finalPrompt = prompt;
  let refs: string[] = [];
  if (rootDir) {
    const expanded = expandFileRefs(prompt, rootDir);
    finalPrompt = expanded.prompt;
    refs = expanded.refs;
  }
  if (refs.length) {
    emit({ type: 'text', text: `Attached ${refs.length} file reference(s): ${refs.join(', ')}` });
  }

  // Build system prompt: agent config overrides plan mode system
  const systemPrompt = agentConfig?.systemPrompt || planModeSystem(mode, model);

  const messages: Json[] = [];
  messages.push({ role: 'system', content: systemPrompt });
  if (s.history.length) {
    for (const m of s.history) { if (m.role !== 'system') messages.push(m); }
  }
  messages.push({ role: 'user', content: finalPrompt });
  s.history = messages;

  const ctx: Ctx = { emit, model, sessionId: s.id };

  await runHooks('session-start', { emit, log: () => {}, sessionId: s.id });
  s.state = 'running';
  saveSession(s);



  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal?.aborted) { s.state = 'error'; s.error = 'cancelled'; saveSession(s); emit({ type: 'error', message: 'cancelled' }); throw new Error('cancelled'); }
    try {
      const msg = await chat(messages, tools, model, signal);
      messages.push(msg);
      if (msg.content) emit({ type: 'text', text: msg.content });

      if (!msg.tool_calls?.length) {
        s.state = 'done'; s.updatedAt = Date.now();
        saveSession(s);
        return messages;
      }

      for (const call of msg.tool_calls as Json[]) {
        const name: string = call.function.name;
        const tool = tools[name];
        let args: Json = {};
        let result: unknown;
        try {
          if (!tool) throw new Error(`Unknown tool: ${name}`);
          const raw = call.function.arguments;
          args = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};

            // Permission check (OpenCode-style allow/ask/deny + auto-approve)
          const perm = resolveAgentPermission(agentConfig, name);
          if (perm === 'deny') {
            result = { error: `Tool '${name}' is denied by permission rules.` };
          } else if (perm === 'allow' || autoApprove) {
            result = await tool.run(args, ctx);
          } else {
            // "ask" — prompt user via the UI approve function
            const allowed = await approve({ name, args });
            if (!allowed) {
              result = { error: 'Rejected by user.' };
            } else {
              result = await tool.run(args, ctx);
            }
          }
        } catch (e) {
          if (typeof e === 'object' && e !== null && (e as Error).name === 'AbortError') {
            s.state = 'error'; s.error = 'cancelled'; saveSession(s); emit({ type: 'error', message: 'cancelled' }); throw new Error('cancelled');
          }
          result = { error: (e as Error).message };
        }
        if (name !== 'todo_write' && name !== 'artifact_write') emit({ type: 'tool', name, args, result });
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }

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

  s.state = 'done'; s.error = 'Stopped after ' + MAX_STEPS + ' steps.';
  saveSession(s);
  emit({ type: 'text', text: 'Stopped after ' + MAX_STEPS + ' steps.' });
  return messages;
}

function pickAllowedTools(all: Record<string, Tool>, allowed: string[]): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const name of allowed) {
    if (all[name]) out[name] = all[name];
  }
  return out;
}
