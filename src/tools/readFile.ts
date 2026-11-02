import type { Tool } from '../types';
import { obj, str } from '../util';
import { readFile as readFileFn } from '../fileedit';

export const readFile: Tool<{ path: string }> = {
  description: 'Read a file from the workspace and return its contents.',
  params: obj({ path: str }, ['path']),
  run: ({ path }) => readFileFn(path),
};
