import type { Tool } from '../types';
import { obj, str } from '../util';
import { globFiles } from '../api/search';

export const globTool: Tool<{ pattern: string; path?: string }> = {
  description: 'Find files matching a glob pattern (supports **, *, ?). Returns matching file paths.',
  params: obj({ pattern: str, path: str }, ['pattern']),
  run: ({ pattern, path }) => globFiles(pattern, path),
};
