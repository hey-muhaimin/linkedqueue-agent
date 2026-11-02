// Plugin loader: plugins/<name>.js exporting { name, tools }.
import fs from 'fs';
import path from 'path';
import { PLUGINS } from './util';
import type { Tool } from './types';

function load(): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const f of fs.readdirSync(PLUGINS).filter((f) => f.endsWith('.js'))) {
    try {
      const file = path.join(PLUGINS, f);
      delete require.cache[require.resolve(file)];
      const p = require(file);
      for (const [n, t] of Object.entries<Tool>(p.tools || {})) out[`${p.name || f.slice(0, -3)}_${n}`] = t;
    } catch (e) { console.error('Plugin failed:', f, (e as Error).message); }
  }
  return out;
}

let current = load();
export const getPlugins = () => current;
export const reloadPlugins = () => (current = load());
