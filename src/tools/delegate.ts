import type { Tool } from '../types';
import { obj, str } from '../util';
import { startSubagent } from '../api/agents';

export const delegate: Tool<{ name: string; task: string; allowedTools?: string[] }> = {
  description: 'Start a background subagent with its own session to work on a self-contained task. The subagent inherits this model\'s settings and returns immediately; its events stream to the UI. Do not wait for its result.',
  params: obj({ name: str, task: str, allowedTools: { type: 'array', items: { type: 'string' } } }, ['name', 'task']),
  run: ({ name, task, allowedTools }, ctx) => {
    const rec = startSubagent({ name, task, allowedTools, model: ctx?.model });
    return { started: true, id: rec.id, name: rec.name, note: 'Subagent running in background; its events stream to the UI.' };
  },
};
