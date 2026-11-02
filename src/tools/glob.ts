import type { Tool } from '../types';
import { obj, str, resolveInRoot } from '../util';
import { globFiles } from '../api/search';

export const globTool: Tool<{ pattern: string; path?: string }> = {
  name: 'glob',
  description: 'Find files matching a glob pattern (supports **, *, ?). Returns matching file paths.',
  params: obj({ pattern: str, path: str }, ['pattern']),
  readOnly: true,
  risk: 'safe',
  pathArgs: ['path'],
  run: ({ pattern, path }) => globFiles(pattern, path ? resolveInRoot(path) : undefined),
};
