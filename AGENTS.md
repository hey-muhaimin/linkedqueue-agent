# AGENTS.md

Sprig — versatile AI agent harness with OpenClaw-style specialist agents: one TypeScript agent loop (tools, plan mode, hooks) behind an Electron UI and a CLI. Agent-facing operational notes, kept short.

## Commands

- `npm run typecheck` — `tsc --noEmit`. Passes.
- `npm run build` — `tsc` → emits to `dist/` (tsconfig: rootDir `src`, outDir `dist`, `include: ["src"]`).
- `npm start` — `tsc && electron .`; main is `dist/main.js`, renderer loads from repo-root `renderer/`.
- `npm run cli` — `tsx src/cli.ts`; REPL (`sprig > ` prompt; subcommands: `exit|quit`, `sessions`, `mode`, `resume`).
- `npm run deploy` — `vercel --prod --cwd .`.

No lint / test / format scripts and no CI config. Verification: typecheck + build + smoke scripts.

## Smoke / verification

- `npx tsx scripts/smoke.ts` — backend smoke (memory, workspace traversal guard, tools registry, plugins, skills, real MCP stdio round-trip via `scripts/mock-mcp.js`, handoff, subagents). Uses temp dirs via `scripts/smoke-env.ts`.
- `npx electron scripts/ui-smoke.js` — headless Electron smoke: all 10 views + command palette, zero console errors.
- `node --check renderer/main.js` — syntax check renderer JS.

## Layout

- `src/main.ts` — Electron main: window creation, `run`/`execute`/`list-sessions`/`set-mode`/`delete-session`/`new-session`/`workspace-files`/`ollama:models`/`shell:run` IPC handlers, approval pending map, MCP auto-connect on startup, shutdown on quit.
- `src/ipc.ts` — `registerIpc()`: all namespaced channels (`plugins:*`, `skills:*`, `mcp:*`, `memory:*`, `tools:list`, `fs:*`, `agents:*`, `handoff:create`, `permissions:*`, `sessions:*`, `agents:configs:*`, `shell:run`) plus shared `approve` channel and `createApproveFn`.
- `src/harness.ts` — agent loop: OpenAI-compatible chat completions with tools, `MAX_STEPS = 12`, permission enforcement, `@file` ref expansion, `!` shell detection, agent config support. Imports `planModeSystem` + `loadProjectInstructions` from `./planmode` (single source).
- `src/planmode.ts` — single source of system prompt (MEMORY/SKILLS/TOOLING sections injected). Contains `loadProjectInstructions`, `shouldPauseForPlan`, `buildPlanEvent`.
- `src/preload.ts` — exposes `window.harness` with all namespaces: `run`, `approve`, `execute`, `listSessions`, `setMode`, `deleteSession`, `newSession`, `workspaceFiles`, `ollama`, `plugins`, `skills`, `mcp`, `memory`, `tools`, `fs`, `agents`, `handoff`, `permissions`, `sessions`, `agentConfigs`, `shell`, `onStartup`, `onEvent`.
- `src/cli.ts` — headless REPL loop over `runAgent`.
- `src/tools/*` — builtins: `todo_write`, `artifact_write`, `shell`, `run_code`, `load_skill`, `install_skill`, `install_plugin`, `get_kpis`, `list_experiments`, `log_experiment`, `send_email`, `read_file`, `list_files`, `apply_edit`, `memory_write`, `delegate`, `grep`, `glob`. Registry merges builtins + plugins + MCP tools.
- `src/api/*` — capability modules (no Electron imports): `memory`, `plugins`, `skills`, `mcp` (stdio JSON-RPC client), `agents`, `handoff`, `tools`, `workspace`, `permissions`, `sessions-enhanced`, `agents-config`, `search`, `diff`.
- `src/persistence.ts` — sessions JSONL in `data/`. `src/store.ts` — experiments/skills/artifacts. `src/fileedit.ts` — file read/write/diff. `src/hooks.ts` — lifecycle hooks. `src/types.ts` — types. `src/util.ts` — paths + shell exec. `src/env.ts` — `.env` loader.
- `renderer/*` — terminal-style UI (index.html, main.css, main.js, tokens.css). Plain JS, no framework. CSP allows inline script/style.

## Agent loop gotchas

- Chat is OpenAI-compatible: POST `{HARNESS_BASE_URL}/chat/completions`; default base `https://ollama.com/v1` (Ollama Cloud), default model `gemma4:31b`. Overridable via `HARNESS_MODEL`, `HARNESS_BASE_URL`, `HARNESS_API_KEY`. `.env` in cwd; real env vars win.
- Ollama Cloud requires paid credits. Free alternatives: OpenRouter (`google/gemma-3-27b-it:free`), Groq (`llama-3.3-70b-versatile`), Google AI Studio (`gemini-2.5-flash`), local Ollama.
- Hard cap `MAX_STEPS = 12` per run.
- Plan mode pauses after assistant emits `todo_write`; resume via IPC `execute` or CLI.
- Project instructions read from `.agents.md`/`AGENTS.md`/`agents.md` under `HARNESS_WORKSPACE || cwd`.
- System prompt is single-source in `src/planmode.ts` — do not duplicate in harness.ts.
- `@file` refs (e.g. `@src/foo.ts` or `@src/foo.ts#10-20`) are expanded in prompts before sending to the model.
- Prompts starting with `!` run as shell commands directly (not via agent loop).

## Tool behavior notes

- `apply_edit` replaces full file contents (not a diff/patch apply).
- `shell` runs via `bash -lc` / `cmd /c`, cwd = workspace root, 30s timeout, 1MB buffer.
- `run_code` runs python|node only; temp file in workspace, 30s timeout, auto-deleted, always requires approval.
- `send_email` is a stub. `get_kpis` reads `data/kpis.json`.
- Permissions: `data/permissions.json` with `allow`/`ask`/`deny` per tool name + `autoApprove` flag. Agent configs override per-agent.
- MCP tools registered as `mcp_<server>_<tool>` with `risky: true`.

## Env / paths

- `src/env.ts` loads `KEY=value` lines from `./.env` (cwd); real env vars win; entry points import it first.
- Env overrides: `HARNESS_WORKSPACE`, `HARNESS_DATA`, `HARNESS_SKILLS`, `HARNESS_PLUGINS`, `HARNESS_MODEL`, `HARNESS_BASE_URL`, `HARNESS_API_KEY`.
- Agent file tools use workspace root = `HARNESS_WORKSPACE || <cwd>/workspace`; project instructions use `HARNESS_WORKSPACE || cwd`.

## Gotchas

- Renderer talks over IPC via preload bridge `window.harness` — all namespaces listed above.
- Renderer is plain JS + `renderer/index.html`; CSP allows inline script/style.
- `src/api/*` must have no Electron imports (testable with tsx).
- `src/types.ts` AgentEvent is subagent-taggable: every event may carry `agent?: {id, name}`.
- Sessions IPC returns `{ok, data}` envelope — renderer must unwrap `.data`.
- `dist/` is build output; not committed (no git repo).
- `data/` contains runtime state (sessions, memory, agents, mcp config, permissions). Smoke tests use temp dirs.
- `scripts/smoke-env.ts` must be imported first in smoke tests (sets env before `src/util.ts` loads).

## Known gaps

- No lint / test / format scripts, no CI. Email sending and KPIs are stubs.
- `undoSession` uses git checkout which may not work in non-git workspaces.
- Streaming SSE not implemented (request/response only).