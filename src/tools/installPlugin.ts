import type { Tool } from '../types';
import { obj, str } from '../util';
import fs from 'fs';
import path from 'path';
import { PLUGINS, safeName, fetchText } from '../util';
import { reloadPlugins } from '../plugins';

export const installPlugin: Tool<{ url: string; name: string }> = {
  description: 'Install a plugin (a .js file exporting tools) from an HTTPS URL. Plugins run with full local access, so only trusted code. Needs approval.',
  params: obj({ url: str, name: str }, ['url', 'name']),
  risky: true,
  run: async ({ url, name }) => {
    const text = await fetchText(url);
    if (!text.includes('module.exports')) throw new Error('Not a plugin: no module.exports.');
    const n = safeName(name).replace(/\.js$/, '');
    fs.writeFileSync(path.join(PLUGINS, n + '.js'), text);
    const loaded = reloadPlugins();
    return { installed: n, tools: Object.keys(loaded).filter((k) => k.startsWith(n + '_')) };
  },
};
