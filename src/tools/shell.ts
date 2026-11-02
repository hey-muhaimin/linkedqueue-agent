import type { Tool } from '../types';
import { obj, str, ROOT, clip } from '../util';
import { spawn } from 'child_process';

const SAFE = /^(ls|pwd|cat|head|tail|wc|echo|date|git (status|log|diff))(\s|$)/;
const UNSAFE = /[;&|><\$]/;

function isSafeCommand(command: string): boolean {
  return SAFE.test(command) && !UNSAFE.test(command);
}

export const shell: Tool<{ command: string }> = {
  name: 'shell',
  description: 'Run a shell command in the workspace. Short read-only allowlist runs directly; everything else needs approval.',
  params: obj({ command: str }, ['command']),
  readOnly: false,
  risk: 'conditional',
  timeoutMs: 30_000,
  risky: ({ command }: any) => !isSafeCommand(String(command || '')),
  run: async ({ command }) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'cmd' : 'bash';
    const args = isWindows ? ['/c', String(command)] : ['-c', String(command)];
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true, shell: false });
      let stdout = '';
      let stderr = '';
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        try {
          if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch {}
        resolve({ exit_code: 124, timed_out: true, stdout: clip(stdout), stderr: clip(stderr || 'timed out') });
      }, 30_000);
      child.stdout.on('data', d => { stdout += d; });
      child.stderr.on('data', d => { stderr += d; });
      child.on('error', e => { finished = true; clearTimeout(timer); reject(e); });
      child.on('close', code => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({ exit_code: typeof code === 'number' ? code : 0, timed_out: false, stdout: clip(stdout), stderr: clip(stderr) });
      });
    });
  },
};
