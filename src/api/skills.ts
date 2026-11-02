// Skill manager backed by the skills/ folder (one SKILL.md per skill dir).
import fs from 'fs';
import path from 'path';
import { SKILLS, safeName, fetchText } from '../util';

export interface SkillInfo { name: string; description: string; bytes: number; updatedAt: number }

function skillDir(name: string): string {
  return path.join(SKILLS, safeName(name));
}

function parseFrontmatter(text: string): { name?: string; description?: string } {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*$/);
  if (!m) return {};
  const out: Record<string, string> = {};
  m[1].split('\n').forEach((line) => {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kv) out[kv[1].trim()] = kv[2].trim();
  });
  return { name: out.name, description: out.description };
}

export function listSkills(): SkillInfo[] {
  const out: SkillInfo[] = [];
  try {
    for (const d of fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const file = path.join(SKILLS, d.name, 'SKILL.md');
        const text = fs.readFileSync(file, 'utf8');
        const stat = fs.statSync(file);
        const front = parseFrontmatter(text);
        out.push({ name: front.name || d.name, description: front.description || '', bytes: text.length, updatedAt: stat.mtimeMs });
      } catch {}
    }
  } catch { /* skills dir missing */ }
  return out;
}

export function readSkill(name: string): string {
  const text = fs.readFileSync(path.join(skillDir(name), 'SKILL.md'), 'utf8');
  return text.slice(0, 200000);
}

export async function installSkillFromUrl(url: string, name?: string): Promise<{ installed: string }> {
  const text = await fetchText(url);
  if (!/^---\s*\n[\s\S]*?name:/.test(text)) throw new Error('Not a SKILL.md: frontmatter with name is missing.');
  const front = parseFrontmatter(text);
  const n = safeName(name || front.name || 'skill').toLowerCase();
  const dir = skillDir(n);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), text);
  return { installed: n };
}

export function removeSkill(name: string): { ok: boolean } {
  const dir = skillDir(name);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { return { ok: false }; }
  return { ok: true };
}
