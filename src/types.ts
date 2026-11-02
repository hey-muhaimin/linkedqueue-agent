// LinkedQueue types — extended for session persistence, plan mode, hooks, and file editing.
export type Json = Record<string, any>;

export interface Todo { text: string; status: 'pending' | 'in_progress' | 'done' }

export type BaseAgentEvent =
  | { type: 'text'; text: string }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call-delta'; delta: { index: number; id?: string; name?: string; arguments?: string } }
  | { type: 'tool'; name: string; args: Json; result: unknown }
  | { type: 'plan'; todos: Todo[] }
  | { type: 'agent'; id: string; name: string; status: 'start' | 'done' | 'error' | 'cancelled'; task?: string; result?: string }
  | { type: 'artifact'; name: string; content: string }
  | { type: 'approval'; id: string; call: { name: string; args: Json } }
  | { type: 'error'; message: string }
  | { type: 'session'; sessionId: string; payload: Json };

export type AgentEvent = BaseAgentEvent & { agent?: { id: string; name: string } };

export interface Ctx { emit: (e: AgentEvent) => void; model?: string; sessionId?: string; agentConfig?: { name: string; systemPrompt?: string; permissions?: Record<string, 'allow'|'ask'|'deny'>; autoApprove?: boolean }; history?: Json[]; readFiles?: string[] }

export interface ToolSpec {
  name?: string;
  readOnly?: boolean;
  risk?: 'safe' | 'conditional' | 'risky';
  timeoutMs?: number;
  pathArgs?: string[];
  /** Legacy compatibility. New tools should prefer `risk`. */
  risky?: boolean | 'conditional' | ((args: any) => boolean);
}

export interface Tool<A = any> extends ToolSpec {
  description: string;
  params: Json;
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
  proposedAgenda?: string[];
  createdAt: number;
  updatedAt: number;
  error?: string;
  lastPrompt?: string;
  maxSteps?: number;
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
