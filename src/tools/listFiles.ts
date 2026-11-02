import type { Tool } from '../types';
import { obj, str } from '../util';
import { listFiles as listFilesFn, findFiles } from '../fileedit';

export const listFiles: Tool<{ path: string; pattern?: string }> = {
  description: 'List files in a directory (relative to workspace root). Pass pattern (regex) to find files by name.',
  params: obj({ path: str, pattern: str }, ['path', 'pattern']),
  run: ({ path, pattern }) => (pattern ? findFiles(path, pattern) : listFilesFn(path)),
};
