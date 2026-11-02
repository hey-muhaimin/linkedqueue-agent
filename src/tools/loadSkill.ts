import type { Tool } from '../types';
import { obj, str } from '../util';
import fs from 'fs';
import path from 'path';
import { SKILLS, clip, safeName } from '../util';

export const loadSkill: Tool<{ name: string }> = {
  description: 'Load the full instructions of an installed skill by name.',
  params: obj({ name: str }, ['name']),
  run: ({ name }) => clip(fs.readFileSync(path.join(SKILLS, safeName(name), 'SKILL.md'), 'utf8'), 20000),
};
