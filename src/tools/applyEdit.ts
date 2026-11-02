import type { Tool } from '../types';
import { obj, str } from '../util';
import { readFile as readFileFn, writeFile, renderDiff, applyEdit as applyEditFn } from '../fileedit';

export const applyEdit: Tool<{ path: string; newText: string }> = {
  description: 'Replace a file\'s full contents. Returns the diff of old vs new. (Full-file replace.)',
  params: obj({ path: str, newText: str }, ['path', 'newText']),
  run: ({ path, newText }) => {
    const existing = readFileFn(path);
    const { ok, applied } = applyEditFn(existing, newText);
    if (ok) writeFile(path, applied);
    return {
      path,
      ok,
      changed: ok,
      diff: ok ? renderDiff(existing, applied) : 'Rejected: no change.',
    };
  },
};
