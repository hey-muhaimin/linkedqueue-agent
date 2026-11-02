import type { Tool } from '../types';
import { obj, str } from '../util';
import { listFiles as listFilesFn, findFiles } from '../fileedit';
import { resolveInRoot } from '../util';

export const listFiles: Tool<{ path: string; pattern?: string }> = {
  name: 'list_files',
  description: 'List files in a directory (relative to workspace root). Pass pattern (regex) to find files by name.',
  params: obj({ path: str, pattern: str }, []),
  readOnly: true,
  risk: 'safe',
  pathArgs: ['path'],
  run: ({ path, pattern }) => (pattern ? findFiles(resolveInRoot(path), pattern) : listFilesFn(resolveInRoot(path))),
};
