import type { Tool } from '../types';
import { obj, str, run } from '../util';
import fs from 'fs';
import path from 'path';

export const shell: Tool<{ command: string }> = {
  description: 'Run a shell command in the workspace folder (30s timeout). A short read-only allowlist runs directly; everything else needs approval.',
  params: obj({ command: str }, ['command']),
  risky: ({ command }) => {
    const SAFE = /^(ls|pwd|cat|head|tail|wc|echo|date|git (status|log|diff))(\s|$)/;
    const UNSAFE = /[;&|><`$\\|]/;
    return !SAFE.test(command) || UNSAFE.test(command);
  },
  run: ({ command }) => run('bash', ['-lc', command]),
};
