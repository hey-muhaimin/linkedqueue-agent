import type { Tool } from '../types';
import { obj, str } from '../util';
import { runSubagentSync, startSubagent } from '../api/agents';
import { getAgent } from '../api/agents-config';

export const delegate: Tool<{ name: string; task: string; allowedTools?: string[]; background?: boolean }> = {
  name: 'delegate',
  description: 'Run a subagent. Waits for the result by default; pass background:true to fire and forget.',
  params: obj({ name: str, task: str, allowedTools: { type: 'array', items: { type: 'string' } }, background: { type: 'boolean' } }, ['name', 'task']),
  timeoutMs: 120_000,
  run: async ({ name, task, allowedTools, background }, ctx) => {
    const cfg = getAgent(name);
    if (background === true) {
      const rec = startSubagent({ name, task, allowedTools, model: ctx?.model });
      return { started: true, id: rec.id, name: rec.name, note: 'Subagent running in background.' };
    }
    return await runSubagentSync({ name, task, allowedTools, model: ctx?.model, agentConfig: cfg });
  },
};
