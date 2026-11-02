// File-editing tools with diffs.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Ctx } from './types';
import { ROOT, clip, obj, str, safeName } from './util';

const lines = (s: string) => s.split(/\r?\n/);

export function diffText(oldText: string, newText: string): string {
  const a = lines(oldText), b = lines(newText);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  if (a.length > 2000 || b.length > 2000) return '[diff too large: ' + a.length + ' vs ' + b.length + ' lines]';
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push('  ' + a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push('- ' + a[i]); i++; }
    else { out.push('+ ' + b[j]); j++; }
  }
  while (i < n) { out.push('- ' + a[i++]); }
  while (j < m) { out.push('+ ' + b[j++]); }
  return out.join('\n');
}

export function renderDiff(oldText: string, newText: string): string {
  const d = diffText(oldText, newText);
  const out: string[] = [];
  d.split('\n').forEach((l) => {
    if (l.startsWith('  ')) out.push('  ' + l.slice(2));
    else if (l.startsWith('- ')) out.push('\x1b[31m- ' + l.slice(2) + '\x1b[m');
    else if (l.startsWith('+ ')) out.push('\x1b[32m+ ' + l.slice(2) + '\x1b[m');
  });
  return out.join('\n');
}

export function applyEdit(oldText: string, newText: string): { ok: boolean; applied: string; discarded: string } {
  if (oldText === newText) return { ok: false, applied: newText, discarded: oldText };
  return { ok: true, applied: newText, discarded: oldText };
}

export function fileExists(p: string): boolean { return fs.existsSync(p); }

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const c = stack.pop();
    if (!c) continue;
    try {
      for (const f of fs.readdirSync(c, { withFileTypes: true })) {
        const full = path.join(c, f.name);
        if (f.isDirectory()) stack.push(full);
        else if (!f.name.startsWith('.')) out.push(full);
      }
    } catch {}
  }
  return out.sort();
}

export function findFiles(root: string, pattern: string): string[] {
  const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return listFiles(root).filter((p) => re.test(p));
}

export function readFile(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

export function writeFile(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

export function removeFile(p: string): void {
  fs.rmSync(p, { force: true });
}
