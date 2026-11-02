// Store: skills index, experiments, artifacts.
import fs from 'fs';
import path from 'path';
import { SKILLS, ART, DATA, clip } from './util';
import type { Json } from './types';

export const EXP = path.join(DATA, 'experiments.jsonl');

export function listExperiments(): Json[] {
  try {
    return fs.readFileSync(EXP, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).reverse();
  } catch { return []; }
}

export function listArtifacts(): { name: string; content: string }[] {
  return fs.readdirSync(ART).map((name) => ({ name, content: clip(fs.readFileSync(path.join(ART, name), 'utf8'), 200000) }));
}

// One line per installed skill; the full SKILL.md loads on demand via load_skill.
export function skillIndex(): string {
  return fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      try {
        const t = fs.readFileSync(path.join(SKILLS, d.name, 'SKILL.md'), 'utf8');
        return `- ${d.name}: ${(t.match(/^description:\s*(.+)$/m) || [])[1] || ''}`;
      } catch { return null; }
    })
    .filter(Boolean)
    .join('\n');
}
