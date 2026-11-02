import type { Tool } from '../types';
import { obj, str } from '../util';

export const todoWrite: Tool<{ todos: Todo[] }> = {
  description: 'Create or update the plan. Send the FULL list every time. Keep exactly one item in_progress.',
  params: obj({
    todos: { type: 'array', items: obj({ text: str, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] } }, ['text', 'status']) },
  }, ['todos']),
  run: ({ todos }, ctx) => {
    ctx.emit({ type: 'plan', todos });
    return { ok: true, remaining: todos.filter((t) => t.status !== 'done').length };
  },
};

export type Todo = { text: string; status: 'pending' | 'in_progress' | 'done' };
