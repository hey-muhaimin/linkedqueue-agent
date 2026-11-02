// LinkedQueue utilities — paths, shell execution, JSON helpers.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { Json } from './types';

const cwd = process.cwd();
export const ROOT = process.env.HARNESS_WORKSPACE || path.join(cwd, 'workspace');
export function resolveInRoot(p: string): string {
  const full = path.resolve(ROOT, String(p));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) throw new Error(`Path escapes workspace: ${p}`);
  return full;
}
export const DATA = process.env.HARNESS_DATA || path.join(cwd, 'data');
export const SKILLS = process.env.HARNESS_SKILLS || path.join(cwd, 'skills');
export const PLUGINS = process.env.HARNESS_PLUGINS || path.join(cwd, 'plugins');
export const ART = path.join(ROOT, 'artifacts');
for (const d of [ROOT, DATA, SKILLS, PLUGINS, ART]) fs.mkdirSync(d, { recursive: true });

export const clip = (s = '', n = 8000) => (s.length > n ? s.slice(0, n) + '\n...[truncated]' : s);
export const safeName = (s: string) => path.basename(String(s)).replace(/[^\w.-]/g, '_') || 'untitled';
export const obj = (properties: Json, required: string[] = []) => ({ type: 'object', properties, required });
export const str = { type: 'string' };

export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return fallback; }
}

export const run = (file: string, args: string[]) =>
  new Promise<Json>((resolve) =>
    execFile(file, args, { cwd: ROOT, timeout: 30000, maxBuffer: 1e6 }, (err, stdout, stderr) =>
      resolve({
        exit_code: err ? (err as any).code ?? 1 : 0,
        timed_out: !!(err as any)?.killed,
        stdout: clip(stdout),
        stderr: clip(stderr),
      })
    )
  );

export async function fetchText(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new Error('HTTPS URLs only.');
  const raw = url.replace(/^https:\/\/github\.com\/(.+?)\/blob\//, 'https://raw.githubusercontent.com/$1/');
  const r = await fetch(raw);
  if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
  return r.text();
}

// Seed a small set of common skills/plugins on first run so the harness is
// usable out of the box. Never overwrites existing user content.
function seedDefaults(): void {
  const defaultSkills: Record<string, string> = {
    'code-review': `---
name: code-review
description: Review code changes for correctness, architecture, security, and maintainability.
---
# Code Review

- Read the diff first; understand intent before judging.
- Check for correctness, edge cases, error handling, and security.
- Prefer small, focused findings with suggested fixes.
- Avoid style-only nitpicks unless they affect readability.
`,
    'debugging': `---
name: debugging
description: Systematic debugging: reproduce, isolate, fix, verify.
---
# Debugging

1. Reproduce reliably.
2. Isolate the failing layer (input, state, data, integration).
3. Form a hypothesis and test it.
4. Fix the root cause, not the symptom.
5. Add a regression check.
`,
    'refactoring': `---
name: refactoring
description: Safe refactoring without behavior changes.
---
# Refactoring

- Keep behavior identical; verify with tests before and after.
- Make small, reversible steps.
- Rename for clarity; extract only when reused.
`,
    'documentation': `---
name: documentation
description: Write and maintain clear technical documentation.
---
# Documentation

- Document intent and usage, not implementation details.
- Keep examples runnable and up to date.
- Prefer concise reference over prose.
`,
    'testing': `---
name: testing
description: Write meaningful tests for behavior and edge cases.
---
# Testing

- Test behavior, not implementation.
- Cover happy path, edge cases, and failure modes.
- Keep tests fast and deterministic.
`,
  };

  for (const [name, content] of Object.entries(defaultSkills)) {
    const dir = path.join(SKILLS, name);
    const file = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, content);
    }
  }

  const defaultPlugins: Record<string, string> = {
    'core-utils.js': `module.exports = {
  name: 'core',
  tools: {
    echo: {
      description: 'Echo back the provided text.',
      params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      run: async ({ text }) => ({ text }),
    },
    now: {
      description: 'Return the current ISO timestamp.',
      params: { type: 'object', properties: {} },
      run: async () => ({ now: new Date().toISOString() }),
    },
  },
};
`,
  };

  for (const [file, content] of Object.entries(defaultPlugins)) {
    const p = path.join(PLUGINS, file);
    if (!fs.existsSync(p)) {
      fs.writeFileSync(p, content);
    }
  }

  const agentsDir = path.join(DATA, 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const defaultAgents = [
    {
      name: 'coordinator',
      description: 'Chief of staff: coordinates specialists and synthesizes results.',
      systemPrompt: 'You are the coordinator. Understand the user request, break it into bounded tasks, delegate to the right specialist, verify their outputs, and return one coherent result.',
      mode: 'plan',
    },
    {
      name: 'researcher',
      description: 'Researcher: gathers evidence and returns a cited brief.',
      systemPrompt: 'You are the researcher. Gather relevant facts, compare sources, and return a concise, cited research brief with evidence and open questions.',
      mode: 'act',
    },
    {
      name: 'writer',
      description: 'Writer: turns a brief and source material into a usable draft.',
      systemPrompt: 'You are the writer. Turn the provided brief and sources into a clear, well-structured draft tailored to the requested format and audience.',
      mode: 'act',
    },
    {
      name: 'reviewer',
      description: 'Reviewer: checks artifacts against requirements and returns actionable findings.',
      systemPrompt: 'You are the reviewer. Check the artifact against requirements, identify correctness, clarity, and completeness issues, and return actionable findings.',
      mode: 'act',
    },
    {
      name: 'coder',
      description: 'Coder: implements and debugs software tasks.',
      systemPrompt: 'You are the coder. Read the codebase, implement focused changes, run relevant checks, and report what changed and what remains.',
      mode: 'act',
    },
  ];
  for (const a of defaultAgents) {
    const file = path.join(agentsDir, a.name + '.json');
    if (!fs.existsSync(file)) {
      const now = Date.now();
      const cfg = {
        name: a.name,
        description: a.description,
        systemPrompt: a.systemPrompt,
        model: process.env.HARNESS_MODEL || 'gemma4:31b-cloud',
        mode: a.mode,
        permissions: {},
        autoApprove: false,
        createdAt: now,
        updatedAt: now,
      };
      fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    }
  }
}

try { seedDefaults(); } catch (e) { /* ignore seeding errors */ }
