import type { Tool } from '../types';
import { obj, str } from '../util';
import { addMemory } from '../api/memory';

export const memoryWrite: Tool<{ text: string; tags?: string[] }> = {
  description: 'Save a durable memory for future sessions (user preferences, decisions, recurring context). Memory persists across sessions and is injected into the system prompt.',
  params: obj({ text: str, tags: { type: 'array', items: { type: 'string' } } }, ['text']),
  run: ({ text, tags = [] }) => addMemory(text, tags),
};
