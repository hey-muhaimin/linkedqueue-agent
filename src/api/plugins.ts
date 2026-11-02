// Plugin manager backed by the plugins/ folder.
import fs from 'fs';
import path from 'path';
import { PLUGINS, safeName } from '../util';
import type { Tool } from '../types';

export interface PluginToolInfo { name: string; description: string; risky: boolean | 'conditional' }
export interface PluginInfo { name: string; file: string; tools: PluginToolInfo[]; bytes: number; error?: string }

function pluginPath(name: string): string {
  return path.join(PLUGINS, safeName(name).replace(/\.js$/, '') + '.js');
}

export function listPlugins(): PluginInfo[] {
  const out: PluginInfo[] = [];
  try {
    for (const f of fs.readdirSync(PLUGINS).filter((f) => f.endsWith('.js')).sort()) {
      const file = path.join(PLUGINS, f);
      delete require.cache[require.resolve(file)];
      try {
        const p = require(file);
        const tools: PluginToolInfo[] = [];
        for (const [name, t] of Object.entries<Tool>(p.tools || {})) {
          tools.push({ name, description: t.description || '', risky: typeof t.risky === 'function' ? 'conditional' : (t.risky ?? false) });
        }
        out.push({
          name: p.name || f.slice(0, -3),
          file: f,
          tools,
          bytes: fs.statSync(file).size,
        });
      } catch (e) {
        out.push({ name: f.slice(0, -3), file: f, tools: [], bytes: 0, error: (e as Error).message });
      }
    }
  } catch { /* plugins dir missing */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function readPlugin(name: string): string {
  const file = pluginPath(name);
  const text = fs.readFileSync(file, 'utf8');
  return text.slice(0, 200000);
}

export function reloadPluginsApi(): { ok: true; plugins: PluginInfo[] } {
  return { ok: true, plugins: listPlugins() };
}

export async function installPluginFromUrl(url: string, name: string): Promise<{ installed: string; tools: string[] }> {
  const { fetchText } = await import('../util');
  const text = await fetchText(url);
  if (!text.includes('module.exports')) throw new Error('Not a plugin: no module.exports.');
  const n = safeName(name).replace(/\.js$/, '');
  fs.writeFileSync(path.join(PLUGINS, n + '.js'), text);
  const loaded = listPlugins();
  const inst = loaded.find((p) => p.name === n);
  return { installed: n, tools: inst ? inst.tools.map((t) => t.name) : [] };
}

export function removePlugin(name: string): { ok: boolean } {
  const file = pluginPath(name);
  try { fs.unlinkSync(file); } catch { return { ok: false }; }
  reloadPluginsApi();
  return { ok: true };
}
