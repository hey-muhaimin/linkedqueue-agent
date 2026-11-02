// Search tools: grep (content search via regex) and glob (file pattern matching).
// OpenCode parity: grep + glob built-in tools.
import fs from 'fs';
import path from 'path';
import { ROOT, clip, safeName } from '../util';
import type { Json } from '../types';

const ROOT_REAL = path.resolve(ROOT);

function resolveInside(rel?: string): string {
  const full = path.resolve(ROOT_REAL, rel || '.');
  if (full !== ROOT_REAL && !full.startsWith(ROOT_REAL + path.sep)) throw new Error('Path escapes workspace root');
  return full;
}

function listAllFiles(dir: string, out: string[]): void {
  try {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.name.startsWith('.')) continue;
      if (f.isDirectory()) {
        listAllFiles(full, out);
      } else {
        out.push(full);
      }
    }
  } catch {}
}

/**
 * glob: find files matching a pattern (minimatch-style, simplified).
 * Supports ** (recursive), * (within a segment), ? (single char).
 */
export function globFiles(pattern: string, cwd?: string): string[] {
  const dir = resolveInside(cwd);
  const all: string[] = [];
  listAllFiles(dir, all);
  const re = patternToRegex(pattern);
  const base = dir.endsWith(path.sep) ? dir : dir + path.sep;
  return all
    .filter((full) => {
      const rel = path.relative(dir, full).split(path.sep).join('/');
      return re.test(rel);
    })
    .map((full) => path.relative(ROOT_REAL, full).split(path.sep).join('/'))
    .sort();
}

const specialChars = /[.+^${}()|[\]\\]/g;
function patternToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && i + 1 < pattern.length && pattern[i + 1] === '*') {
      // ** : match any number of segments
      regex += '(?:.*)';
      i += 2;
      if (i < pattern.length && pattern[i] === '/') i++;
    } else if (c === '*') {
      regex += '[^/]*';
      i++;
    } else if (c === '?') {
      regex += '[^/]';
      i++;
    } else if (c === '/') {
      regex += '/';
      i++;
    } else {
      regex += c.replace(specialChars, '\\$&');
      i++;
    }
  }
  return new RegExp('^' + regex + '$');
}

/**
 * grep: search file contents for a regex pattern.
 */
export function grepFiles(pattern: string, cwd?: string, filePattern?: string): { file: string; line: number; match: string }[] {
  const dir = resolveInside(cwd);
  const re = new RegExp(pattern);
  const fileRe = filePattern ? new RegExp(globToRegex(filePattern)) : null;
  const results: { file: string; line: number; match: string }[] = [];
  const all: string[] = [];
  listAllFiles(dir, all);
  for (const full of all) {
    const rel = path.relative(ROOT_REAL, full).split(path.sep).join('/');
    if (fileRe && !fileRe.test(rel)) continue;
    try {
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split(/\r?\n/);
      let count = 0;
      for (let li = 0; li < lines.length; li++) {
        if (re.test(lines[li])) {
          results.push({ file: rel, line: li + 1, match: clip(lines[li], 200) });
          count++;
          if (count >= 50) break;
        }
      }
    } catch {}
  }
  return results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function globToRegex(pattern: string): string {
  return '^' + patternToRegexMinimatch(pattern) + '$';
}

function patternToRegexMinimatch(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') out += '.*';
    else if (c === '?') out += '[^/]';
    else if (c === '.') out += '\\.';
    else if (c === '/' || c === '\\') out += '/';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}
