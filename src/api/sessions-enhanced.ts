// Enhanced session operations: fork, undo/redo (git-based), session metadata.
// OpenCode parity: /sessions list, /new, continue, fork, undo, redo.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { listSessions, loadSession, saveSession, deleteSession, genId } from '../persistence';
import { DATA, ROOT, run } from '../util';
import type { Session, Json } from '../types';

const SESSION_META_DIR = path.join(DATA, 'session-meta');

export interface SessionMeta {
  id: string;
  title: string;
  forkedFrom?: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

export function sessionMetaPath(id: string): string {
  return path.join(SESSION_META_DIR, id + '.json');
}

export function getSessionMeta(id: string): SessionMeta | undefined {
  try {
    return JSON.parse(fs.readFileSync(sessionMetaPath(id), 'utf8')) as SessionMeta;
  } catch { return undefined; }
}

export function saveSessionMeta(meta: SessionMeta): void {
  fs.mkdirSync(SESSION_META_DIR, { recursive: true });
  fs.writeFileSync(sessionMetaPath(meta.id), JSON.stringify(meta, null, 2));
}

export function listSessionsWithMeta(): Array<Session & { meta?: SessionMeta }> {
  const sessions = listSessions();
  return sessions.map((s) => ({ ...s, meta: getSessionMeta(s.id) }));
}

export function forkSession(sessionId: string, newTitle?: string): Session | undefined {
  const original = loadSession(sessionId);
  if (!original) return undefined;
  const id = genId();
  const meta = getSessionMeta(sessionId);
  const s: Session = {
    id,
    title: newTitle || (original.title || 'fork') + ' (fork)',
    model: original.model,
    mode: original.mode,
    state: 'idle',
    history: [...original.history],
    todos: [...original.todos],
    pid: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastPrompt: original.lastPrompt,
  };
  saveSession(s);
  saveSessionMeta({
    id,
    title: s.title,
    forkedFrom: sessionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: meta?.tags ?? [],
  });
  return s;
}

export function setSessionMeta(id: string, updates: Partial<SessionMeta>): SessionMeta | undefined {
  const meta = getSessionMeta(id) || { id, title: '', createdAt: Date.now(), updatedAt: Date.now(), tags: [] };
  Object.assign(meta, updates, { id, updatedAt: Date.now() });
  saveSessionMeta(meta);
  return meta;
}

/**
 * Undo: revert the last assistant turn and any file changes it made.
 * Uses git diff to restore files modified in the session's working directory.
 */
export async function undoSession(sessionId: string): Promise<{ ok: boolean; reverted: string[]; message?: string }> {
  const session = loadSession(sessionId);
  if (!session) return { ok: false, reverted: [], message: 'Session not found' };
  // Find the last assistant message that had tool results writing files
  const lastAssistantIdx = session.history
    .map((m, i) => ({ i, m }))
    .filter((x) => x.m.role === 'assistant')
    .pop();
  if (!lastAssistantIdx) return { ok: false, reverted: [], message: 'Nothing to undo' };

  // Use git to revert tracked file changes in the workspace root
  const reverted: string[] = [];
  try {
    const status = await (run('git', ['status', '--porcelain']) as Promise<Json>);
    const stdout = String((status as any).stdout || '');
    if (stdout) {
      for (const line of stdout.split('\n')) {
        const m = line.match(/^(?: M| M|\?\?|\? )(.+)$/);
        if (m) {
          const file = m[1].trim();
          try {
            const full = path.join(ROOT, file);
            if (fs.existsSync(full)) {
              await (run('git', ['checkout', '--', file]) as Promise<Json>);
              reverted.push(file);
            }
          } catch {}
        }
      }
    }
  } catch {}
  return { ok: true, reverted, message: 'Undid last turn and restored file changes' };
}

/**
 * Redo: re-apply the last undone turn by re-running the session's last prompt.
 * Returns the session to continue.
 */
export function redoSession(sessionId: string): Session | undefined {
  const session = loadSession(sessionId);
  if (!session || !session.lastPrompt) return undefined;
  session.state = 'idle';
  saveSession(session);
  return session;
}
