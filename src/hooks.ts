// Hook engine. Register named callbacks per event; run them at each lifecycle point.
import type { HookCtx, Hooks } from './types';

let registry: Hooks['registry'] = [];

export function registerHook(name: string, event: 'session-start' | 'pre-tool' | 'post-tool' | 'agent-step' | 'session-end', fn: (ctx: HookCtx) => void | Promise<void>): void {
  registry.push({ name, event, fn });
}

export async function runHooks(event: 'session-start' | 'pre-tool' | 'post-tool' | 'agent-step' | 'session-end', ctx: HookCtx): Promise<void> {
  for (const h of registry.filter((x) => x.event === event)) {
    await h.fn(ctx);
  }
}
