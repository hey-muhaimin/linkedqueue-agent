import type { Tool } from '../types';
import { obj, str } from '../util';
import { writeFile, renderDiff, readFile as readFileFn } from '../fileedit';
import { resolveInRoot } from '../util';

export const writeFileTool: Tool<{ path: string; content: string }> = {
  name: 'write_file',
  description: 'Create or fully replace a file (full-file write).',
  params: obj({ path: str, content: str }, ['path', 'content']),
  readOnly: false,
  risk: 'risky',
  pathArgs: ['path'],
  run: ({ path, content }) => {
    const full = resolveInRoot(path);
    let before = '';
    let exists = false;
    try { before = readFileFn(full); exists = true; } catch {}
    writeFile(full, content);
    return { path: full, ok: true, created: !exists, diff: exists ? renderDiff(before, content) : undefined };
  },
};
