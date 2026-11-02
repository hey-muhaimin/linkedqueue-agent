// Unified diff rendering for file edits (OpenCode-style diff viewer).
import { diffText } from '../fileedit';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: { type: 'context' | 'add' | 'remove'; content: string }[];
}

export function parseDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!m) { i++; continue; }
    const hunk: DiffHunk = {
      oldStart: parseInt(m[1], 10),
      oldLines: m[2] ? parseInt(m[2], 10) : 1,
      newStart: parseInt(m[3], 10),
      newLines: m[4] ? parseInt(m[4], 10) : 1,
      lines: [],
    };
    i++;
    while (i < lines.length && lines[i].startsWith(' ')) {
      hunk.lines.push({ type: 'context', content: lines[i].slice(1) });
      i++;
    }
    while (i < lines.length && lines[i].startsWith('-')) {
      hunk.lines.push({ type: 'remove', content: lines[i].slice(1) });
      i++;
    }
    while (i < lines.length && lines[i].startsWith('+')) {
      hunk.lines.push({ type: 'add', content: lines[i].slice(1) });
      i++;
    }
    hunks.push(hunk);
  }
  return hunks;
}

export function renderDiffHtml(diff: string): string {
  const hunks = parseDiff(diff);
  let html = '<pre style="font-family:ui-monospace,monospace;font-size:12px;line-height:1.4;white-space:pre-wrap;">';
  for (const h of hunks) {
    html += `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@\n`;
    for (const line of h.lines) {
      const esc = line.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (line.type === 'add') html += `<span style="color:#0a0;background:#eaffea;">+ ${esc}</span>\n`;
      else if (line.type === 'remove') html += `<span style="color:#a00;background:#ffeaea;">- ${esc}</span>\n`;
      else html += `  ${esc}\n`;
    }
  }
  html += '</pre>';
  return html;
}

export function diffFiles(oldText: string, newText: string): string {
  return diffText(oldText, newText);
}
