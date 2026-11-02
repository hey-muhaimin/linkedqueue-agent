import type { Tool } from '../types';
import { obj, str } from '../util';
import fs from 'fs';
import path from 'path';
import { ROOT, run } from '../util';

export const runCode: Tool<{ language: 'python' | 'node'; code: string }> = {
  description: 'Run Python or Node code in the workspace and return stdout/stderr (30s timeout). Always needs approval.',
  params: obj({ language: { type: 'string', enum: ['python', 'node'] }, code: str }, ['language', 'code']),
  risky: true,
  run: async ({ language, code }) => {
    const file = path.join(ROOT, `.run_${Date.now()}.${language === 'python' ? 'py' : 'js'}`);
    fs.writeFileSync(file, code);
    try {
      const bin = language === 'python' ? (process.platform === 'win32' ? 'python' : 'python3') : 'node';
      return await run(bin, [file]);
    } finally {
      fs.rmSync(file, { force: true });
    }
  },
};
