import { builtin } from './tools';
import { getPlugins } from './plugins';
import { getMcpTools } from './api/mcp';
import type { Tool } from './types';

export const allTools = (): Record<string, Tool> => ({ ...builtin, ...getPlugins(), ...getMcpTools() });
