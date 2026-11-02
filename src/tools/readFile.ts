import type { Tool } from '../types';
import { obj, str, resolveInRoot, clip } from '../util';
import fs from 'fs';

export const readFile: Tool<{ path: string; offset?: number; limit?: number }> = {
  name: 'read_file',
  description: 'Read a file from the workspace and return its contents.',
  params: obj({ path: str, offset: { type: 'number' }, limit: { type: 'number' } }, ['path']),
  readOnly: true,
  risk: 'safe',
  pathArgs: ['path'],
  run: ({ path, offset, limit }, ctx) => {
    const full = resolveInRoot(path);
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, Math.floor(offset || 0));
    const end = limit ? Math.min(lines.length, start + Math.floor(limit)) : lines.length;
    ctx?.readFiles?.push(full);
    return clip(lines.slice(start, end).join('\n'), 8000);
  },
};
