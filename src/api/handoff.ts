// Session handoff: summarize a session into a markdown doc and spawn a new
// session seeded with it, so work can be resumed without restarting context.
import fs from 'fs';
import path from 'path';
import { loadSession, saveSession } from '../persistence';
import { DATA } from '../util';
import type { Session, Json } from '../types';

const HANDOFF_DIR = path.join(DATA, 'handoffs');

function clipMsg(m: Json): string {
  const role = m.role || '?';
  let content = '';
  if (typeof m.content === 'string') content = String(m.content);
  else if (m.tool_calls) content = m.tool_calls.map((t: any) => `→ ${t.function?.name}`).join('; ');
  return `${role}: ${content.slice(0, 1200)}`;
}

export function createHandoff(sessionId: string): Session {
  const old = loadSession(sessionId);
  if (!old) throw new Error('Session not found: ' + sessionId);

  const lines: string[] = [];
  lines.push('# Handoff: ' + old.title);
  lines.push('- model: ' + old.model);
  lines.push('- mode: ' + old.mode);
  lines.push('- state: ' + old.state);
  if (old.todos && old.todos.length) {
    lines.push('- todos: ' + old.todos.map((t) => `[${t.status}] ${t.text}`).join('; '));
  }
  const hist = old.history.filter((m: Json) => m.role !== 'system').slice(-20);
  if (hist.length) {
    lines.push('');
    lines.push('## Recent conversation');
    for (const m of hist) lines.push('- ' + clipMsg(m));
  }
  const md = lines.join('\n');

  fs.mkdirSync(HANDOFF_DIR, { recursive: true });
  fs.writeFileSync(path.join(HANDOFF_DIR, old.id + '.md'), md, 'utf8');

  const id = 'handoff_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const prompt = 'Resume from this handoff. Continue the work; do not restart it.\n\n' + md;
  const s: Session = {
    id, title: 'handoff: ' + old.title, model: old.model, mode: 'act', state: 'idle',
    history: [], todos: [], pid: null, createdAt: Date.now(), updatedAt: Date.now(), lastPrompt: prompt,
  };
  saveSession(s);
  return s;
}
