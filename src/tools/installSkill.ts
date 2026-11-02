import type { Tool } from '../types';
import { obj, str } from '../util';
import fs from 'fs';
import path from 'path';
import { SKILLS, safeName, fetchText } from '../util';

export const installSkill: Tool<{ url: string; name?: string }> = {
  description: 'Install a skill from an HTTPS URL to a SKILL.md file (GitHub blob or raw links work). Needs approval.',
  params: obj({ url: str }, ['url']),
  risky: true,
  run: async ({ url, name }) => {
    const text = await fetchText(url);
    if (!/^---\s*name:/.test(text)) throw new Error('Not a SKILL.md: frontmatter with name is missing.');
    const n = safeName(name || (text.match(/^name:\s*(.+)$/m) || [])[1] || 'skill').toLowerCase();
    fs.mkdirSync(path.join(SKILLS, n), { recursive: true });
    fs.writeFileSync(path.join(SKILLS, n, 'SKILL.md'), text);
    return { installed: n };
  },
};
