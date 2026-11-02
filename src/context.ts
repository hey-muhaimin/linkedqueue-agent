import type { Json } from './types';

export const estimateTokens = (messages: Json[]): number => {
  return Math.ceil(JSON.stringify(messages).length / 4);
};

const CONTEXT_WINDOW = Number(process.env.HARNESS_CONTEXT_TOKENS || 32000);
const KEEP_RECENT = 8;

export function compactHistory(messages: Json[], maxTokens = CONTEXT_WINDOW): Json[] {
  if (estimateTokens(messages) <= Math.floor(maxTokens * 0.7)) return messages;
  const systems = messages.filter(m => m.role === 'system');
  const recent = messages.slice(-KEEP_RECENT);
  const keptIds = new Set([...systems, ...recent].map((_, i) => i));
  const omitted = messages.filter(m => !systems.includes(m) && !recent.includes(m));
  const summary = `...[compacted ${omitted.length} older messages; see session history]`;
  const compacted: Json[] = [...systems, { role: 'assistant', content: summary }, ...recent];
  return compacted;
}
