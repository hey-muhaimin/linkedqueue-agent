// Permission engine — OpenCode-style allow/ask/deny rules keyed by tool name.
// Config: data/permissions.json  { "rules": { "*": "ask", "bash": "allow", "edit": "deny" }, "autoApprove": false }
// Rule values: "allow" | "ask" | "deny". "*" is the catch-all. Tool-specific
// rules (e.g. "mcp_*", "read") override the catch-all. Prefix rules ending in
// "*" match any tool whose name starts with the prefix (before the "*").
import fs from 'fs';
import path from 'path';
import { DATA } from '../util';

export type Permission = 'allow' | 'ask' | 'deny';

export interface PermissionConfig {
  rules: Record<string, Permission>;
  autoApprove: boolean;
}

const FILE = path.join(DATA, 'permissions.json');

const DEFAULT_CONFIG: PermissionConfig = {
  rules: {
    '*': 'ask',
    read: 'allow',
    todo_write: 'allow',
    memory_write: 'allow',
  },
  autoApprove: false,
};

function loadConfig(): PermissionConfig {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const cfg = JSON.parse(raw) as Partial<PermissionConfig>;
    return {
      rules: { ...DEFAULT_CONFIG.rules, ...(cfg.rules || {}) },
      autoApprove: cfg.autoApprove ?? false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg: PermissionConfig): void {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

export function getPermissionConfig(): PermissionConfig {
  return loadConfig();
}

export function setPermissionConfig(cfg: PermissionConfig): PermissionConfig {
  saveConfig(cfg);
  return cfg;
}

export function setAutoApprove(enabled: boolean): PermissionConfig {
  const cfg = loadConfig();
  cfg.autoApprove = enabled;
  saveConfig(cfg);
  return cfg;
}

/**
 * Resolve the permission for a tool name.
 * Order: exact match > prefix match ("mcp_*") > catch-all ("*").
 */
export function resolvePermission(toolName: string, cfg: PermissionConfig): Permission {
  if (cfg.rules[toolName] !== undefined) return cfg.rules[toolName];
  // prefix matches (rule ends with "*")
  for (const [rule, perm] of Object.entries(cfg.rules)) {
    if (rule.endsWith('*') && rule !== '*' && toolName.startsWith(rule.slice(0, -1))) {
      return perm;
    }
  }
  return cfg.rules['*'] ?? 'ask';
}

/**
 * Decide whether a tool call needs user approval.
 * Returns:
 *  { approve: true }   — run without asking
 *  { approve: false, reason: 'denied' } — blocked
 *  { approve: false, reason: 'ask', suggestedPatterns: string[] } — needs approval
 */
export function shouldApprove(toolName: string, args: any, cfg: PermissionConfig): {
  approve: boolean;
  reason?: 'allowed' | 'denied' | 'ask';
  suggestedPatterns?: string[];
} {
  const perm = resolvePermission(toolName, cfg);
  if (cfg.autoApprove && perm !== 'deny') return { approve: true, reason: 'allowed' };
  if (perm === 'deny') return { approve: false, reason: 'denied' };
  if (perm === 'allow') return { approve: true, reason: 'allowed' };
  // "ask" — needs approval. Suggest safe patterns for common tools.
  const suggested = suggestPatterns(toolName, args);
  return { approve: false, reason: 'ask', suggestedPatterns: suggested };
}

function suggestPatterns(toolName: string, args: any): string[] {
  if (toolName === 'shell' && args?.command) {
    const cmd = String(args.command).split(/\s+/)[0];
    return [`${cmd}*`];
  }
  if (toolName === 'read_file' && args?.path) return [String(args.path)];
  if (toolName === 'apply_edit' && args?.path) return [String(args.path)];
  if (toolName === 'memory_write') return ['memory_write*'];
  if (toolName.startsWith('mcp_')) return [toolName];
  return [];
}
