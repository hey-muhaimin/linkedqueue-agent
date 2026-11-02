// Backend smoke test for the harness capability modules.
// Usage: npx tsx scripts/smoke.ts
import './smoke-env'; // must be first: sets HARNESS_* before src/util.ts loads
import fs from 'fs';
import path from 'path';
import { memoryPrompt, listMemories, addMemory, deleteMemory, clearMemories } from '../src/api/memory';
import { workspaceRoot, tree, readWorkspaceFile, writeWorkspaceFile, deleteWorkspaceFile } from '../src/api/workspace';
import { listTools } from '../src/api/tools';
import { listPlugins } from '../src/api/plugins';
import { listSkills } from '../src/api/skills';
import { listMcpServers, addMcpServer, removeMcpServer, connectMcpServer, disconnectMcpServer, getMcpTools, shutdownMcp } from '../src/api/mcp';
import { setAgentHooks, listSubagents, getSubagent, startSubagent, cancelSubagent, cancelAllSubagents } from '../src/api/agents';
import { createHandoff } from '../src/api/handoff';
import { saveSession } from '../src/persistence';

const DATA = process.env.HARNESS_DATA;
let fails = 0;
function check(name, cond, extra = '') {
  if (cond) { console.log('PASS', name); } else { fails++; console.error('FAIL', name, extra); }
}

async function main() {
  // memory
  check('memory dir', fs.existsSync(DATA));
  const m = addMemory('hello smoke test', ['smoke']);
  check('memory add', !!m.id && m.text === 'hello smoke test');
  const all = listMemories();
  check('memory list', all.some(x => x.id === m.id));
  const found = listMemories('smoke');
  check('memory search', found.length >= 1);
  const pm = memoryPrompt();
  check('memory prompt', pm.includes('hello smoke test'));
  check('memory delete', deleteMemory(m.id).ok);
  check('memory gone', listMemories().length === 0);
  check('memory clear', clearMemories().removed === 0);

  // workspace
  const root = workspaceRoot();
  check('workspace root', fs.existsSync(root));
  check('workspace write', writeWorkspaceFile('sub/deep/note.txt', 'hello file').ok);
  check('workspace tree', tree('sub').some(e => e.name === 'deep'));
  check('workspace read', readWorkspaceFile('sub/deep/note.txt') === 'hello file');
  check('workspace delete', deleteWorkspaceFile('sub').ok);
  try { readWorkspaceFile('../package.json'); check('workspace guard', false, 'should have thrown'); } catch { check('workspace guard', true); }

  // tools registry
  const tl = listTools();
  check('tools list non-empty', tl.length > 0);
  check('tools has delegate', tl.some(t => t.name === 'delegate'));
  check('tools has memory_write', tl.some(t => t.name === 'memory_write'));
  check('tools sources sane', tl.every(t => ['builtin', 'plugin', 'mcp'].includes(t.source)));

  // plugins / skills
  check('plugins list', Array.isArray(listPlugins()));
  check('skills list', Array.isArray(listSkills()));

  // mcp with mock server
  const mockPath = path.join(__dirname, 'mock-mcp.js');
  const mcpName = 'mock-echo-' + Date.now();
  removeMcpServer(mcpName); // tolerant cleanup from previous runs
  const added = addMcpServer({ name: mcpName, command: process.execPath, args: [mockPath], enabled: true });
  check('mcp add', !!added && added.name === mcpName);
  const before = listMcpServers();
  check('mcp list', before.some(s => s.name === mcpName && !s.connected));
  const connected = await connectMcpServer(mcpName);
  check('mcp connect', connected.connected && connected.tools.length === 1 && connected.tools[0].name === 'echo');
  const tools = getMcpTools();
  const echoKey = Object.keys(tools).find(k => k.endsWith('_echo'));
  check('mcp tools wrapper', !!echoKey);
  if (echoKey) {
    const res = await tools[echoKey].run({ message: 'hello mcp' }, { emit: () => {}, model: 'x' });
    check('mcp echo call', res.content === 'echo: hello mcp', JSON.stringify(res));
  }
  await disconnectMcpServer(mcpName);
  check('mcp disconnect', !listMcpServers().find(s => s.name === mcpName)?.connected);
  check('mcp remove', removeMcpServer(mcpName).ok);
  await shutdownMcp();

  // handoff needs a session
  const session = { id: 'sess-smoke', title: 'smoke session', model: 'qwen3-coder', mode: 'act', state: 'idle', history: [], todos: [{ text: 't1', status: 'done' }], pid: null, createdAt: Date.now(), updatedAt: Date.now(), lastPrompt: 'do it' };
  saveSession(session);
  const handoff = createHandoff('sess-smoke');
  check('handoff creates session', !!handoff.id && handoff.title === 'handoff: smoke session');
  check('handoff prompt contains summary', typeof handoff.lastPrompt === 'string' && handoff.lastPrompt.includes('smoke session'));
  const hf = path.join(DATA, 'handoffs', session.id + '.md');
  const hdir = path.join(DATA, 'handoffs');
  check('handoff file exists', fs.existsSync(hf), 'DATA=' + DATA + ' hf=' + hf + ' dir=' + (fs.existsSync(hdir) ? fs.readdirSync(hdir).join(',') : 'missing dir'));

  // agents (no hooks → background loop still runs but emits nothing; runAgent will try fetch to localhost)
  setAgentHooks({ emit: () => {}, approve: () => Promise.resolve(true) });
  check('agents no running at start', !listSubagents().some((r) => r.status === 'running'));
  const rec = startSubagent({ name: 'smoke-sub', task: 'say hi', model: 'qwen3-coder' });
  check('agents start', rec.id.startsWith('sub_') && rec.status === 'running');
  let settled = getSubagent(rec.id);
  for (let i = 0; i < 50 && (!settled || settled.status === 'running'); i++) {
    await new Promise(r => setTimeout(r, 100));
    settled = getSubagent(rec.id);
  }
  check('agents settles quickly', settled && (settled.status === 'error' || settled.status === 'done' || settled.status === 'cancelled'), settled ? settled.status : 'missing');
  cancelAllSubagents();
  const remaining = listSubagents().filter(r => r.status === 'running');
  check('agents cancel all', remaining.length === 0);
  console.log(fails === 0 ? 'SMOKE OK' : 'SMOKE FAILURES: ' + fails);
  process.exit(fails === 0 ? 0 : 1);
}

function getSubagentIfPresent(id: string) {
  try { return listSubagents().find(r => r.id === id); } catch { return undefined; }
}

main().catch(e => { console.error('SMOKE CRASH', e); process.exit(2); });
