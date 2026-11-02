// Permission engine — OpenCode-style allow/ask/deny rules keyed by tool name.
// Rules may be:
//   "*": "ask"
//   "read_file": "allow"
//   "shell(git status*)": "allow"   // argument-aware rule
//   "apply_edit(src/**)": "ask"
import fs from 'fs';
import path from 'path';
import { DATA, resolveInRoot } from '../util';
import type { Tool } from '../types';

export type Permission = 'allow' | 'ask' | 'deny';
export interface PermissionConfig { rules: Record<string, Permission>; autoApprove: boolean; }

const FILE = path.join(DATA, 'permissions.json');
const DEFAULT_CONFIG: PermissionConfig = {
  rules: {
    '*': 'ask',
    read_file: 'allow',
    list_files: 'allow',
    glob: 'allow',
    grep: 'allow',
    todo_write: 'allow',
    memory_write: 'allow',
    shell: 'ask',
    run_code: 'ask',
    install_plugin: 'ask',
    skill_install: 'ask',
  },
  autoApprove: false,
};

function loadConfig(): PermissionConfig {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const cfg = JSON.parse(raw) as Partial<PermissionConfig>;
    return { rules: { ...DEFAULT_CONFIG.rules, ...(cfg.rules || {}) }, autoApprove: cfg.autoApprove ?? false };
  } catch { return { ...DEFAULT_CONFIG }; }
}

function saveConfig(cfg: PermissionConfig): void { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2)); }

export function getPermissionConfig(): PermissionConfig { return loadConfig(); }
export function setPermissionConfig(cfg: PermissionConfig): PermissionConfig { saveConfig(cfg); return cfg; }
export function setAutoApprove(enabled: boolean): PermissionConfig { const cfg = loadConfig(); cfg.autoApprove = enabled; saveConfig(cfg); return cfg; }

function argValue(args: any): string {
  if (!args) return '';
  if (typeof args === 'string') return args;
  return String(args.command ?? args.path ?? args.file ?? args.url ?? Object.values(args)[0] ?? '');
}

function escapeRe(s: string): string { return s.replace(/[^\w ]/g, '$&'); }
function patternToRe(pattern: string): RegExp {
  return new RegExp('^' + escapeRe(pattern).replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*/?').replace(/\?/g, '.') + '$');
}

function matchRuleName(toolName: string, rule: string): boolean {
  return rule === toolName || rule === `${toolName}*` || (rule.endsWith('*') && toolName.startsWith(rule.slice(0, -1)));
}

function matchArgPattern(toolName: string, args: any, rule: string): boolean {
  const m = rule.match(/^([a-z0-9_]+)\((.*)\)$/);
  if (!m || m[1] !== toolName) return false;
  const value = argValue(args);
  return patternToRe(m[2]).test(value);
}

export function resolvePermission(toolName: string, args?: any, cfg?: PermissionConfig): Permission {
  const c = cfg ?? loadConfig();
  const candidates = Object.entries(c.rules).filter(([rule]) => matchRuleName(toolName, rule) || matchArgPattern(toolName, args, rule));
  // exact tool matches first, then arg patterns, then prefixes
  const arg = candidates.find(([rule]) => matchArgPattern(toolName, args, rule));
  if (arg) return arg[1];
  const exact = candidates.find(([rule]) => rule === toolName);
  if (exact) return exact[1];
  const prefix = candidates.find(([rule]) => rule.endsWith('*'));
  if (prefix) return prefix[1];
  return c.rules['*'] ?? 'ask';
}

function suggestPatterns(toolName: string, args: any): string[] {
  const v = argValue(args).split(/\s+/)[0] || '';
  if (toolName === 'shell' && args?.command) return [`shell(${v} *)*`];
  if (toolName === 'read_file' && args?.path) return [String(args.path)];
  if (toolName === 'apply_edit' && args?.path) return [String(args.path)];
  if (toolName.startsWith('mcp_')) return [toolName];
  return [];
}

export function shouldApprove(toolName: string, args: any, cfg: PermissionConfig) {
  const perm = resolvePermission(toolName, args, cfg);
  if (cfg.autoApprove && perm !== 'deny') return { approve: true, reason: 'allowed' as const };
  if (perm === 'deny') return { approve: false, reason: 'denied' as const };
  if (perm === 'allow') return { approve: true, reason: 'allowed' as const };
  return { approve: false, reason: 'ask' as const, suggestedPatterns: suggestPatterns(toolName, args) };
}

export function decide(tool: Tool, args: any, cfg: PermissionConfig, autoApprove = false): { approve: boolean; reason?: 'allowed'|'denied'|'ask'; suggestedPatterns?: string[] } {
  const toolName = tool.name || 'unknown';
  const auto = autoApprove || cfg.autoApprove;
  if (tool.risk === 'safe' && tool.readOnly) return { approve: true, reason: 'allowed' };
  let isRisky = tool.risk === 'risky';
  if (tool.risk === 'conditional' && typeof tool.risky === 'function') isRisky = !!tool.risky(args);
  const riskyFn = (tool as any).risky;
  if (typeof riskyFn === 'function' && tool.risk === undefined) isRisky = !!riskyFn(args);
  if (tool.pathArgs) {
    for (const p of tool.pathArgs) {
      const v = args?.[p];
      if (typeof v === 'string') {
        try { resolveInRoot(v); } catch { return { approve: false, reason: 'denied' }; }
      }
    }
  }
  const perm = resolvePermission(toolName, args, cfg);
  if (perm === 'deny') {
    if (!isRisky && tool.readOnly) return { approve: true, reason: 'allowed' };
    return { approve: false, reason: 'denied' };
  }
  if (auto) return { approve: true, reason: 'allowed' };
  if (isRisky && perm === 'ask') return { approve: false, reason: 'ask', suggestedPatterns: suggestPatterns(toolName, args) };
  if (perm === 'allow') return { approve: true, reason: 'allowed' };
  return { approve: false, reason: 'ask', suggestedPatterns: suggestPatterns(toolName, args) };
}
