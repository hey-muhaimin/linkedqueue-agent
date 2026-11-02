import { allTools } from '../registry';
import { builtin } from '../tools';
import type { Tool } from '../types';

export interface ToolInfo { name: string; description: string; risky: boolean | 'conditional'; source: 'builtin' | 'plugin' | 'mcp' }

export function listTools(): ToolInfo[] {
  const all = allTools();
  const out: ToolInfo[] = [];
  for (const [name, tool] of Object.entries(all)) {
    const risky = typeof tool.risky === 'function' ? 'conditional' : !!tool.risky;
    const source: ToolInfo['source'] = name.startsWith('mcp_') ? 'mcp' : (builtin[name] ? 'builtin' : 'plugin');
    out.push({ name, description: tool.description || '', risky, source });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
