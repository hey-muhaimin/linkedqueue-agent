import type { Tool } from '../types';
import { obj, str, resolveInRoot } from '../util';
import { grepFiles } from '../api/search';

export const grepTool: Tool<{ pattern: string; path?: string; filePattern?: string }> = {
  name: 'grep',
  description: 'Search file contents for a regex pattern. Returns matching file, line, and matched text.',
  params: obj({ pattern: str, path: str, filePattern: str }, ['pattern']),
  readOnly: true,
  risk: 'safe',
  pathArgs: ['path'],
  run: ({ pattern, path, filePattern }) => grepFiles(pattern, path ? resolveInRoot(path) : undefined, filePattern),
};
