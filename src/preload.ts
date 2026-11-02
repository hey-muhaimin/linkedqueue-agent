// Electron preload bridge — exposes the harness API to the renderer process.
import { contextBridge, ipcRenderer } from 'electron';

export type StartSubagentArgs = {
  name: string;
  task: string;
  model?: string;
  mode?: 'plan' | 'act';
  allowedTools?: string[];
};

export type PermissionConfig = {
  rules: Record<string, 'allow' | 'ask' | 'deny'>;
  autoApprove: boolean;
};

export type SessionMeta = {
  id: string;
  title: string;
  forkedFrom?: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
};

export type AgentConfig = {
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  mode: 'plan' | 'act';
  permissions: Record<string, 'allow' | 'ask' | 'deny'>;
  autoApprove: boolean;
  createdAt: number;
  updatedAt: number;
};

const harness = {
  run: (prompt: string, opts: { sessionId?: string; mode?: 'plan' | 'act'; model?: string } = {}) =>
    ipcRenderer.invoke('run', { prompt, ...opts }),
  approve: (id: string, ok: boolean) => ipcRenderer.send('approve', id, ok),
  execute: (sessionId: string) => ipcRenderer.invoke('execute', { sessionId }),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  setMode: (sessionId: string, mode: 'plan' | 'act') =>
    ipcRenderer.invoke('set-mode', { sessionId, mode }),
  deleteSession: (sessionId: string) => ipcRenderer.invoke('delete-session', { sessionId }),
  newSession: (prompt?: string) => ipcRenderer.invoke('new-session', { prompt }),
  workspaceFiles: () => ipcRenderer.invoke('workspace-files'),
  ollama: {
    models: () => ipcRenderer.invoke('ollama:models'),
  },
  onStartup: (cb: (data: { sessionCount: number }) => void) =>
    ipcRenderer.on('startup', (_e, data) => cb(data)),
  onEvent: (cb: (e: unknown) => void) => ipcRenderer.on('event', (_e, ev) => cb(ev)),

  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    read: (name: string) => ipcRenderer.invoke('plugins:read', { name }),
    reload: () => ipcRenderer.invoke('plugins:reload'),
    install: (url: string, name: string) => ipcRenderer.invoke('plugins:install', { url, name }),
    remove: (name: string) => ipcRenderer.invoke('plugins:remove', { name }),
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    read: (name: string) => ipcRenderer.invoke('skills:read', { name }),
    install: (url: string, name?: string) => ipcRenderer.invoke('skills:install', { url, name }),
    remove: (name: string) => ipcRenderer.invoke('skills:remove', { name }),
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    add: (cfg: any) => ipcRenderer.invoke('mcp:add', cfg),
    remove: (name: string) => ipcRenderer.invoke('mcp:remove', { name }),
    connect: (name: string) => ipcRenderer.invoke('mcp:connect', { name }),
    disconnect: (name: string) => ipcRenderer.invoke('mcp:disconnect', { name }),
  },
  memory: {
    list: (q?: string) => ipcRenderer.invoke('memory:list', { q }),
    add: (text: string, tags?: string[]) => ipcRenderer.invoke('memory:add', { text, tags }),
    delete: (id: string) => ipcRenderer.invoke('memory:delete', { id }),
    clear: () => ipcRenderer.invoke('memory:clear'),
  },
  tools: {
    list: () => ipcRenderer.invoke('tools:list'),
  },
  fs: {
    tree: (p?: string) => ipcRenderer.invoke('fs:tree', { path: p }),
    read: (path: string) => ipcRenderer.invoke('fs:read', { path }),
    write: (path: string, content: string) => ipcRenderer.invoke('fs:write', { path, content }),
    delete: (path: string) => ipcRenderer.invoke('fs:delete', { path }),
  },
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    start: (arg: StartSubagentArgs) => ipcRenderer.invoke('agents:start', arg),
    cancel: (id: string) => ipcRenderer.invoke('agents:cancel', { id }),
  },
  handoff: {
    create: (sessionId: string) => ipcRenderer.invoke('handoff:create', { sessionId }),
  },
  permissions: {
    get: () => ipcRenderer.invoke('permissions:get'),
    set: (cfg: PermissionConfig) => ipcRenderer.invoke('permissions:set', cfg),
    autoApprove: (enabled: boolean) => ipcRenderer.invoke('permissions:auto-approve', { enabled }),
  },
  sessions: {
    meta: () => ipcRenderer.invoke('sessions:meta'),
    fork: (sessionId: string, title?: string) => ipcRenderer.invoke('sessions:fork', { sessionId, title }),
    undo: (sessionId: string) => ipcRenderer.invoke('sessions:undo', { sessionId }),
    redo: (sessionId: string) => ipcRenderer.invoke('sessions:redo', { sessionId }),
    metaSet: (id: string, updates: Partial<SessionMeta>) => ipcRenderer.invoke('sessions:meta:set', { id, ...updates }),
  },
  agentConfigs: {
    list: () => ipcRenderer.invoke('agents:configs'),
    get: (name: string) => ipcRenderer.invoke('agents:config:get', { name }),
    save: (cfg: AgentConfig) => ipcRenderer.invoke('agents:config:save', cfg),
    delete: (name: string) => ipcRenderer.invoke('agents:config:delete', { name }),
  },
  shell: {
    run: (command: string) => ipcRenderer.invoke('shell:run', { command }),
  },
};

const winControls = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
};
contextBridge.exposeInMainWorld('win', winControls);

contextBridge.exposeInMainWorld('harness', harness);
