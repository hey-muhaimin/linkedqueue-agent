import { builtin } from './tools';
import { getPlugins } from './plugins';
import { getMcpTools } from './api/mcp';
import type { Tool } from './types';

export const allTools = (): Record<string, Tool> => {
  const merged = { ...builtin, ...getPlugins(), ...getMcpTools() };
  for (const name of Object.keys(merged)) { (merged as any)[name].name = name; }
  return merged;
};
