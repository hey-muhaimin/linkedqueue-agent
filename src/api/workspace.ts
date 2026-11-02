// Workspace file access, guarded so nothing escapes ROOT.
import fs from 'fs';
import path from 'path';
import { ROOT, clip } from '../util';

const ROOT_REAL = path.resolve(ROOT);

export interface FsEntry { name: string; path: string; isDirectory: boolean; size?: number; updatedAt?: number }

function resolveInside(rel?: string): string {
  const full = path.resolve(ROOT_REAL, rel || '.');
  if (full !== ROOT_REAL && !full.startsWith(ROOT_REAL + path.sep)) throw new Error('Path escapes workspace root');
  return full;
}

export function workspaceRoot(): string { return ROOT_REAL; }

export function tree(relDir?: string): FsEntry[] {
  const dir = resolveInside(relDir);
  const out: FsEntry[] = [];
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, f.name);
      const stat = f.isSymbolicLink() ? fs.statSync(full) : null;
      const isDir = f.isDirectory() || (!!stat && stat.isDirectory());
      if (f.name.startsWith('.')) continue;
      out.push({ name: f.name, path: path.relative(ROOT_REAL, full).split(path.sep).join('/'), isDirectory: isDir, size: stat?.size, updatedAt: stat?.mtimeMs });
    }
  } catch {}
  return out;
}

export function readWorkspaceFile(rel: string): string {
  const full = resolveInside(rel);
  const text = fs.readFileSync(full, 'utf8');
  if (text.includes('\0')) throw new Error('Binary file: not readable');
  return clip(text, 200000);
}

export function writeWorkspaceFile(rel: string, content: string): { ok: true; path: string; bytes: number } {
  const full = resolveInside(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return { ok: true, path: full, bytes: Buffer.byteLength(content, 'utf8') };
}

export function deleteWorkspaceFile(rel: string): { ok: true } {
  const full = resolveInside(rel);
  if (full === ROOT_REAL) throw new Error('Refusing to delete workspace root');
  fs.rmSync(full, { recursive: true, force: true });
  return { ok: true };
}
