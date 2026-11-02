// Persistent long-term memory: JSONL at data/memory.jsonl.
import fs from 'fs';
import path from 'path';
import { DATA } from '../util';
import type { Json } from '../types';

const FILE = path.join(DATA, 'memory.jsonl');

export interface Memory { id: string; text: string; tags: string[]; ts: number }

function readAll(): Memory[] {
  try {
    return fs.readFileSync(FILE, 'utf8')
      .trim().split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) as Memory; } catch { return null; } })
      .filter((m): m is Memory => !!m && typeof m.text === 'string')
      .sort((a, b) => b.ts - a.ts);
  } catch { return []; }
}

export function listMemories(q?: string): Memory[] {
  const all = readAll();
  if (!q) return all;
  const needle = q.toLowerCase();
  return all.filter((m) => m.text.toLowerCase().includes(needle) || m.tags.some((t) => t.toLowerCase().includes(needle)));
}

export function addMemory(text: string, tags: string[] = []): Memory {
  const entry: Memory = {
    id: 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: String(text).trim().slice(0, 4000),
    tags: tags.filter((t) => typeof t === 'string').slice(0, 10),
    ts: Date.now(),
  };
  fs.mkdirSync(DATA, { recursive: true });
  fs.appendFileSync(FILE, JSON.stringify(entry) + '\n');
  return entry;
}

export function deleteMemory(id: string): { ok: boolean } {
  const all = readAll();
  const kept = all.filter((m) => m.id !== id);
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, kept.map((m) => JSON.stringify(m)).join('\n') + (kept.length ? '\n' : ''));
  return { ok: kept.length !== all.length };
}

export function clearMemories(): { ok: true; removed: number } {
  const all = readAll();
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, '');
  return { ok: true, removed: all.length };
}

export function memoryPrompt(limit = 8): string {
  const mems = listMemories();
  if (!mems.length) return '';
  return mems.slice(0, limit).map((m) => {
    const tag = m.tags.length ? ' #' + m.tags.join(' #') : '';
    return `- ${m.text}${tag}`;
  }).join('\n');
}
