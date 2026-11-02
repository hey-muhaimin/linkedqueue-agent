// Sprig types — extended for session persistence, plan mode, hooks, and file editing.
export type Json = Record<string, any>;

export interface Todo { text: string; status: 'pending' | 'in_progress' | 'done' }

export type BaseAgentEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; args: Json; result: unknown }
  | { type: 'plan'; todos: Todo[] }
  | { type: 'agent'; id: string; name: string; status: 'start' | 'done' | 'error' | 'cancelled'; task?: string; result?: string }
  | { type: 'artifact'; name: string; content: string }
  | { type: 'approval'; id: string; call: { name: string; args: Json } }
  | { type: 'error'; message: string }
  | { type: 'session'; sessionId: string; payload: Json };

export type AgentEvent = BaseAgentEvent & { agent?: { id: string; name: string } };

export interface Ctx { emit: (e: AgentEvent) => void; model?: string; sessionId?: string }

export interface Tool<A = any> {
  description: string;
  params: Json;
  risky?: boolean | 'conditional' | ((args: A) => boolean);
  run: (args: A, ctx: Ctx) => Promise<unknown> | unknown;
}

export type ApproveFn = (call: { name: string; args: Json }) => Promise<boolean>;

export type SessionMode = 'plan' | 'act';
export type SessionState = 'idle' | 'plan' | 'running' | 'waiting' | 'done' | 'error';

export interface Session {
  id: string;
  title: string;
  model: string;
  mode: SessionMode;
  state: SessionState;
  history: Json[];
  todos: Todo[];
  pid: number | null;
  createdAt: number;
  updatedAt: number;
  error?: string;
  lastPrompt?: string;
}

export interface Hooks {
  registry: Array<{
    name: string;
    event: 'session-start' | 'pre-tool' | 'post-tool' | 'agent-step' | 'session-end';
    fn: (ctx: HookCtx) => Promise<void> | void;
  }>;
}

export interface HookCtx {
  emit: (e: AgentEvent) => void;
  log: (msg: string) => void;
  sessionId: string;
}
