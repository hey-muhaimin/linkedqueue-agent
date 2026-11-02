// Session persistence: sessions stored one JSON per line in data/sessions.jsonl.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Session } from './types';

const SESSIONS = process.env.HARNESS_DATA || path.join(process.cwd(), 'data');
const FILE = path.join(SESSIONS, 'sessions.jsonl');

export function genId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function saveSession(s: Session): void {
  fs.mkdirSync(SESSIONS, { recursive: true });
  const entry = JSON.stringify({ ...s, createdAt: s.createdAt, updatedAt: Date.now() });
  fs.appendFileSync(FILE, entry + '\n');
}

export function listSessions(): Session[] {
  try {
    return fs.readFileSync(FILE, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function loadSession(id: string): Session | undefined {
  return listSessions().find((s) => s.id === id);
}

export function deleteSession(id: string): void {
  const list = listSessions().filter((s) => s.id !== id);
  fs.mkdirSync(SESSIONS, { recursive: true });
  fs.writeFileSync(FILE, list.map((s) => JSON.stringify(s)).join('\n') + '\n');
}
