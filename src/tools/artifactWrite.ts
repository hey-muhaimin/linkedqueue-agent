import type { Tool } from '../types';
import { obj, str } from '../util';
import fs from 'fs';
import path from 'path';
import { ART, safeName } from '../util';

export const artifactWrite: Tool<{ name: string; content: string }> = {
  description: 'Save a deliverable (report.md, page.html, leads.csv, data.json) to the Artifacts panel. HTML must be self-contained.',
  params: obj({ name: str, content: str }, ['name', 'content']),
  run: ({ name, content }, ctx) => {
    const n = safeName(name);
    fs.writeFileSync(path.join(ART, n), content);
    ctx.emit({ type: 'artifact', name: n, content });
    return { saved: n };
  },
};
