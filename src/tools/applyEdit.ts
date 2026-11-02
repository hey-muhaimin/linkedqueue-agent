import type { Tool } from '../types';
import { obj, str } from '../util';
import { readFile as readFileFn, writeFile, renderDiff } from '../fileedit';
import { resolveInRoot } from '../util';
import fs from 'fs';
import path from 'path';
import { DATA } from '../util';

function snapshot(sessionId: string | undefined, full: string): void {
  if (!sessionId) return;
  const dir = path.join(DATA, 'checkpoints', sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${Date.now()}_${path.basename(full)}`), fs.readFileSync(full));
}

export const applyEdit: Tool<{ path: string; oldText?: string; newText: string; replaceAll?: boolean }> = {
  name: 'apply_edit',
  description: 'Replace exact text in a file. Requires reading the file earlier in the session.',
  params: obj({ path: str, oldText: str, newText: str, replaceAll: { type: 'boolean' } }, ['path', 'newText']),
  readOnly: false,
  risk: 'risky',
  pathArgs: ['path'],
  run: ({ path, oldText, newText, replaceAll }, ctx) => {
    const full = resolveInRoot(path);
    if (!ctx?.readFiles?.includes(full)) throw new Error('Must read_file before editing this path');
    const existing = readFileFn(full);
    if (!oldText) throw new Error('oldText is required for apply_edit; use write_file to create or overwrite a new file');
    const count = existing.split(oldText).length - 1;
    if (replaceAll !== true && count !== 1) throw new Error(`Expected exactly one match for oldText (found ${count}); pass replaceAll:true to replace every match`);
    const applied = replaceAll ? existing.split(oldText).join(newText) : existing.replace(oldText, newText);
    snapshot(ctx?.sessionId, full);
    if (applied !== existing) writeFile(full, applied);
    return { path: full, ok: true, changed: applied !== existing, count, diff: renderDiff(existing, applied) };
  },
};
