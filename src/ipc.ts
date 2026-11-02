// IPC registration: every namespaced harness channel plus the shared approval
// channel. Returns uniform { ok, data } | { ok, error } envelopes.
import { ipcMain } from 'electron';
import {
  listPlugins, readPlugin, reloadPluginsApi, installPluginFromUrl, removePlugin,
} from './api/plugins';
import {
  listSkills, readSkill, installSkillFromUrl, removeSkill,
} from './api/skills';
import {
  listMcpServers, addMcpServer, removeMcpServer, connectMcpServer, disconnectMcpServer, connectEnabled, shutdownMcp,
} from './api/mcp';
import {
  listMemories, addMemory, deleteMemory, clearMemories,
} from './api/memory';
import { listTools } from './api/tools';
import {
  tree, readWorkspaceFile, writeWorkspaceFile, deleteWorkspaceFile,
} from './api/workspace';
import {
  listSubagents, startSubagent, cancelSubagent, cancelAllSubagents, setAgentHooks,
} from './api/agents';
import { createHandoff } from './api/handoff';
import {
  getPermissionConfig, setPermissionConfig, setAutoApprove,
} from './api/permissions';
import {
  listSessionsWithMeta, forkSession, undoSession, redoSession, setSessionMeta, getSessionMeta,
} from './api/sessions-enhanced';
import {
  listAgents, getAgent, saveAgent, deleteAgent,
} from './api/agents-config';
import type { AgentEvent, ApproveFn, Json } from './types';

const ok = (data: any) => ({ ok: true, data });
const fail = (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// Shared approval channel: renderer resolves via ipcRenderer.send('approve', id, ok).
const pendingApprovals = new Map<string, (ok: boolean) => void>();
ipcMain.on('approve', (_e, id: string, ok: boolean) => {
  const resolve = pendingApprovals.get(id);
  if (resolve) { pendingApprovals.delete(id); resolve(ok); }
});

export function createApproveFn(emit: (e: AgentEvent) => void): ApproveFn {
  return (call: { name: string; args: Json }): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      const id = String(Date.now() + Math.random());
      pendingApprovals.set(id, resolve);
      emit({ type: 'approval', id, call });
      setTimeout(() => { pendingApprovals.delete(id); resolve(false); }, 300000);
    });
}

export function registerIpc(opts: { emit: (e: AgentEvent) => void }): void {
  const { emit } = opts;

  // --- plugins ---
  ipcMain.handle('plugins:list', () => ok(listPlugins()));
  ipcMain.handle('plugins:read', (_e, { name }: { name: string }) => ok(readPlugin(name)));
  ipcMain.handle('plugins:reload', () => ok(reloadPluginsApi()));
  ipcMain.handle('plugins:install', async (_e, arg: { url: string; name: string }) => ok(await installPluginFromUrl(arg.url, arg.name)));
  ipcMain.handle('plugins:remove', (_e, { name }: { name: string }) => ok(removePlugin(name)));

  // --- skills ---
  ipcMain.handle('skills:list', () => ok(listSkills()));
  ipcMain.handle('skills:read', (_e, { name }: { name: string }) => ok(readSkill(name)));
  ipcMain.handle('skills:install', async (_e, arg: { url: string; name?: string }) => ok(await installSkillFromUrl(arg.url, arg.name)));
  ipcMain.handle('skills:remove', (_e, { name }: { name: string }) => ok(removeSkill(name)));

  // --- mcp ---
  ipcMain.handle('mcp:list', () => ok(listMcpServers()));
  ipcMain.handle('mcp:add', (_e, cfg: any) => ok(addMcpServer(cfg)));
  ipcMain.handle('mcp:remove', (_e, { name }: { name: string }) => ok(removeMcpServer(name)));
  ipcMain.handle('mcp:connect', async (_e, { name }: { name: string }) => ok(await connectMcpServer(name)));
  ipcMain.handle('mcp:disconnect', async (_e, { name }: { name: string }) => ok(await disconnectMcpServer(name)));

  // --- memory ---
  ipcMain.handle('memory:list', (_e, { q }: { q?: string }) => ok(listMemories(q)));
  ipcMain.handle('memory:add', (_e, { text, tags }: { text: string; tags?: string[] }) => ok(addMemory(text, tags)));
  ipcMain.handle('memory:delete', (_e, { id }: { id: string }) => ok(deleteMemory(id)));
  ipcMain.handle('memory:clear', () => ok(clearMemories()));

  // --- tools ---
  ipcMain.handle('tools:list', () => ok(listTools()));

  // --- workspace ---
  ipcMain.handle('fs:tree', (_e, { path: p }: { path?: string }) => ok(tree(p)));
  ipcMain.handle('fs:read', (_e, { path }: { path: string }) => ok({ path, content: readWorkspaceFile(path) }));
  ipcMain.handle('fs:write', async (_e, { path, content }: { path: string; content: string }) => ok(writeWorkspaceFile(path, content)));
  ipcMain.handle('fs:delete', (_e, { path }: { path: string }) => ok(deleteWorkspaceFile(path)));

  // --- agents (subagents / delegation) ---
  ipcMain.handle('agents:list', () => ok(listSubagents()));
  ipcMain.handle('agents:start', (_e, arg: { name: string; task: string; model?: string; mode?: 'plan' | 'act'; allowedTools?: string[] }) => ok(startSubagent(arg)));
  ipcMain.handle('agents:cancel', (_e, { id }: { id: string }) => ok(cancelSubagent(id)));

  // --- handoff ---
  ipcMain.handle('handoff:create', (_e, { sessionId }: { sessionId: string }) => ok(createHandoff(sessionId)));

  // --- permissions ---
  ipcMain.handle('permissions:get', () => ok(getPermissionConfig()));
  ipcMain.handle('permissions:set', (_e, cfg: any) => ok(setPermissionConfig(cfg)));
  ipcMain.handle('permissions:auto-approve', (_e, { enabled }: { enabled: boolean }) => ok(setAutoApprove(enabled)));

  // --- enhanced sessions ---
  ipcMain.handle('sessions:meta', () => ok(listSessionsWithMeta()));
  ipcMain.handle('sessions:fork', (_e, { sessionId, title }: { sessionId: string; title?: string }) => {
    const s = forkSession(sessionId, title);
    return s ? ok(s) : { ok: false, error: 'Session not found' };
  });
  ipcMain.handle('sessions:undo', async (_e, { sessionId }: { sessionId: string }) => ok(await undoSession(sessionId)));
  ipcMain.handle('sessions:redo', (_e, { sessionId }: { sessionId: string }) => {
    const s = redoSession(sessionId);
    return s ? ok(s) : { ok: false, error: 'Session not found' };
  });
  ipcMain.handle('sessions:meta:set', (_e, { id, ...updates }: { id: string; title?: string; tags?: string[] }) => ok(setSessionMeta(id, updates)));

  // --- agent configs ---
  ipcMain.handle('agents:configs', () => ok(listAgents()));
  ipcMain.handle('agents:config:get', (_e, { name }: { name: string }) => {
    const a = getAgent(name);
    return a ? ok(a) : { ok: false, error: 'Agent not found' };
  });
  ipcMain.handle('agents:config:save', (_e, cfg: any) => ok(saveAgent(cfg)));
  ipcMain.handle('agents:config:delete', (_e, { name }: { name: string }) => ok(deleteAgent(name)));

  setAgentHooks({ emit, approve: createApproveFn(emit) });
}

export { connectEnabled, shutdownMcp };
export async function stopIpc(): Promise<void> {
  await shutdownMcp();
  cancelAllSubagents();
}
