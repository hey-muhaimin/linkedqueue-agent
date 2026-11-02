// Plan mode: the agent lays out a plan (via todo_write) and waits for approval
// before touching files. Also owns the shared system prompt (single source used
// by both harness.ts entry points — must stay in sync).
import type { AgentEvent, SessionMode, Todo, Json } from './types';
import { readFile } from './fileedit';
import { memoryPrompt } from './api/memory';
import { skillIndex } from './store';
import path from 'path';

const AGENTS_MD_NAMES = ['.agents.md', 'AGENTS.md', 'agents.md'] as const;

export function loadProjectInstructions(): string {
  const root = process.env.HARNESS_WORKSPACE || process.cwd();
  for (const f of AGENTS_MD_NAMES) {
    try { return '\n' + readFile(path.join(root, f)); } catch { /* no project instructions */ }
  }
  return '';
}

export function planModeSystem(mode: SessionMode, model: string): string {
  const label = mode === 'plan' ? 'PLAN' : 'ACT';
  const blocking = mode === 'plan'
    ? 'First lay out a concrete, ordered todo list (one item in_progress), then STOP and wait for approval before making any changes.'
    : 'Execute the approved plan using the available tools.';
  return `You are LinkedQueue, a versatile AI agent that acts through tools.
Mode: ${label} mode
Model: ${model}

MEMORY (persistent, from earlier sessions):
${memoryPrompt() || '(none)'}

SKILLS (call load_skill with the exact name when a skill matches):
${skillIndex() || '(none)'}

${blocking}

RULES:
- For any task with 3+ steps, call todo_write first and keep it updated (one item in_progress).
- Use run_code for calculations, shell for files, artifact_write for deliverables.
- When a skill matches, call load_skill first.
- If a task needs specialized knowledge or capabilities not present, use skill_search and skill_install to find and install a relevant skill.
- Use web_search and web_fetch to gather current information before answering.
- Never invent facts, sources, or results; verify with tools when possible.
- Tool schema may include plugin and MCP tools (mcp_ prefix). Use memory_write to persist decisions; use delegate to run independent work in a background subagent that inherits this model's settings.
- Keep replies concise.
${loadProjectInstructions()}
`;
}

export function shouldPauseForPlan({ mode, history }: { mode: SessionMode; history: Json[] }): boolean {
  if (mode !== 'plan') return false;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      const names = msg.tool_calls.map((t: any) => t.function?.name);
      if (names.includes('todo_write')) return true;
    }
  }
  return false;
}

export function buildPlanEvent(todos: Todo[]): AgentEvent {
  return { type: 'plan', todos };
}
