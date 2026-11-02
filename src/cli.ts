// CLI: interactive agent loop with plan approval.
import './env';
import readline from 'readline/promises';
import { runAgent } from './harness';
import type { AgentEvent, Json, Todo } from './types';

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let history: Json[] = [];
  const mark: Record<string, string> = { done: '[x]', in_progress: '[~]', pending: '[ ]' };

  const emit = (e: AgentEvent) => {
    if (e.type === 'text') console.log('\n' + e.text + '\n');
    if (e.type === 'tool') console.log('  > ' + e.name + ' ' + JSON.stringify(e.args).slice(0, 120));
    if (e.type === 'plan') console.log(e.todos.map((t) => `  ${mark[t.status]} ${t.text}`).join('\n'));
    if (e.type === 'artifact') console.log('  * saved artifact: workspace/artifacts/' + e.name);
    if (e.type === 'agent') console.log('  · subagent ' + e.name + ' (' + e.id + ')');
  };

  const approve = async ({ name, args }: { name: string; args: Json }) =>
    /^y/i.test(await rl.question('\nApprove ' + name + '? ' + JSON.stringify(args, null, 2) + ' [y/N] '));

  const run = async (prompt: string) => {
    try { await runAgent({ prompt, emit, approve }); }
    catch (e) { console.error('Error:', (e as Error).message); }
  };

  for (;;) {
    const prompt = (await rl.question('sprig > ')).trim();
    if (!prompt) continue;
    if (prompt === 'exit' || prompt === 'quit') break;
    if (prompt === 'sessions') {
      const { listSessions } = await import('./persistence');
      const all = listSessions();
      console.log(all.map((s, i) => `${i}: [${s.mode}] ${s.title} (updated ${new Date(s.updatedAt).toISOString()})`).join('\n') || 'No sessions.');
      continue;
    }
    if (prompt === 'mode') {
      const mv = await rl.question('Mode [plan/act] (current: ' + (history[0]?.text || 'act') + '): ');
      if (mv === 'plan' || mv === 'act') run(prompt);
      continue;
    }
    if (prompt === 'resume') {
      const { loadSession } = await import('./persistence');
      const id = await rl.question('Session id: ');
      const s = loadSession(id);
      if (s) run(s.lastPrompt || prompt);
      continue;
    }
    run(prompt);
  }
  rl.close();
})();
