// Agent configurations — OpenCode parity: custom agents with system prompt,
// permissions, and model. Stored in data/agents/.
import fs from 'fs';
import path from 'path';
import { DATA, safeName } from '../util';
import type { SessionMode } from '../types';
import { resolvePermission, getPermissionConfig } from './permissions';

export interface AgentConfig {
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  mode: SessionMode;
  permissions: Record<string, 'allow' | 'ask' | 'deny'>;
  autoApprove: boolean;
  createdAt: number;
  updatedAt: number;
}

const AGENTS_DIR = path.join(DATA, 'agents');

export function agentPath(name: string): string {
  return path.join(AGENTS_DIR, safeName(name) + '.json');
}

export function listAgents(): AgentConfig[] {
  const out: AgentConfig[] = [];
  try {
    for (const f of fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.json')).sort()) {
      try {
        out.push(JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8')) as AgentConfig);
      } catch {}
    }
  } catch {}
  return out;
}

export function getAgent(name: string): AgentConfig | undefined {
  try {
    return JSON.parse(fs.readFileSync(agentPath(name), 'utf8')) as AgentConfig;
  } catch { return undefined; }
}

export function saveAgent(cfg: AgentConfig): AgentConfig {
  fs.mkdirSync(AGENTS_DIR, { recursive: true });
  const entry: AgentConfig = { ...cfg, updatedAt: Date.now() };
  fs.writeFileSync(agentPath(entry.name), JSON.stringify(entry, null, 2));
  return entry;
}

export function deleteAgent(name: string): boolean {
  try { fs.rmSync(agentPath(name), { force: true }); return true; } catch { return false; }
}

export const DEFAULT_AGENT: AgentConfig = {
  name: 'default',
  description: 'General purpose coding agent',
  systemPrompt: 'You are Sprig, a versatile AI agent. Use tools to understand tasks, plan, execute, verify, and report results clearly.',
  model: process.env.HARNESS_MODEL || 'gemma4:31b',
  mode: 'plan',
  permissions: {},
  autoApprove: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

export function resolveAgentPermission(agent: Partial<AgentConfig> | undefined, toolName: string): 'allow' | 'ask' | 'deny' {
  if (agent?.permissions && agent.permissions[toolName] !== undefined) return agent.permissions[toolName];
  const cfg = getPermissionConfig();
  return resolvePermission(toolName, cfg);
}
