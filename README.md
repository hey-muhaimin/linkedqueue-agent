# LinkedQueue

LinkedQueue is a versatile AI agent harness built on one TypeScript core. It runs behind an Electron desktop UI and a headless CLI, supports OpenAI-compatible model providers, tools, skills, plugins, MCP servers, sessions, memory, permissions, and OpenClaw-style specialist agents.

## Features

- Agent loop with plan/act modes, tool calling, approvals, and session persistence
- Electron desktop UI with a frameless window and functional window controls
- Headless CLI REPL
- OpenAI-compatible provider support: Ollama Cloud, OpenRouter, Groq, Google AI Studio, local Ollama, and custom endpoints
- Provider, API key, and model configuration from the UI or environment
- Built-in tools for files, shell, code execution, search, memory, delegation, and more
- Dynamic ClawHub skill search and installation
- Plugin loading and installation
- MCP stdio server support with project/global config files
- Specialist agent configs: coordinator, researcher, writer, reviewer, coder
- Session history, fork, undo/redo, handoff, and metadata
- Permissions with allow/ask/deny rules and auto-approve
- Project instructions via `AGENTS.md`, `.agents.md`, or `agents.md`

## Requirements

- Node.js 20+
- npm
- A model provider account or local Ollama installation

## Installation

```bash
npm install
```

Create a `.env` file in the project root:

```env
HARNESS_BASE_URL=https://ollama.com/v1
HARNESS_MODEL=gemma4:31b-cloud
HARNESS_API_KEY=your_api_key_here
```

Environment variables override `.env`. You can also configure the provider, API key, and model from the app with `/config`.

## Running

Development:

```bash
npm run typecheck
npm run build
npm start
```

CLI:

```bash
npm run cli
```

The CLI prompt is `linkedqueue > `. Supported commands include `exit`, `quit`, `sessions`, `mode`, and `resume`.

## Configuration

Environment overrides:

- `HARNESS_WORKSPACE` - workspace root for file tools
- `HARNESS_DATA` - runtime data directory
- `HARNESS_SKILLS` - skills directory
- `HARNESS_PLUGINS` - plugins directory
- `HARNESS_MODEL` - default model
- `HARNESS_BASE_URL` - OpenAI-compatible base URL
- `HARNESS_API_KEY` - provider API key

MCP servers are configured in:

- Project level: `.linkedqueue/mcp.json`
- Global: `~/.linkedqueue/mcp.json`

Project-level configuration takes precedence. Legacy `data/mcp.json` is still read as a fallback.

App settings are stored in `data/config.json` and can be edited from the UI with `/config`.

## Commands

```bash
npm run typecheck   # TypeScript type check
npm run build       # Compile to dist/
npm start           # Build and launch Electron
npm run cli         # Headless REPL
npm run deploy      # Vercel production deploy
```

## Verification

Backend smoke:

```bash
npx tsx scripts/smoke.ts
```

Electron UI smoke:

```bash
npx electron scripts/ui-smoke.js
```

Renderer syntax check:

```bash
node --check renderer/main.js
```

## Architecture

- `src/main.ts` - Electron main process, window creation, IPC handlers
- `src/preload.ts` - secure renderer bridge
- `src/harness.ts` - agent loop
- `src/planmode.ts` - system prompt and plan-mode helpers
- `src/ipc.ts` - namespaced IPC channels
- `src/api/*` - capability modules
- `src/tools/*` - built-in tools
- `src/util.ts` - paths, shell execution, fetch helpers, default seeding
- `renderer/*` - desktop UI
- `skills/` - installed skill definitions
- `plugins/` - installed plugin modules
- `data/` - runtime state

## Tools

Built-in tools include:

- `todo_write`
- `artifact_write`
- `shell`
- `run_code`
- `load_skill`
- `install_skill`
- `install_plugin`
- `read_file`
- `list_files`
- `apply_edit`
- `memory_write`
- `delegate`
- `grep`
- `glob`
- `web_search`
- `web_fetch`
- `skill_search`
- `skill_install`
- `send_email`

MCP tools are registered as `mcp_<server>_<tool>`.

## Skills

Skills are Markdown files with frontmatter, stored as `skills/<name>/SKILL.md`. LinkedQueue seeds common skills and can search/install skills from ClawHub.

Use `/skills` in the UI to list installed skills. Use `skill_search` and `skill_install` to add skills dynamically.

## Specialist Agents

Default specialist agent configs are seeded in `data/agents`:

- `coordinator` - coordinates specialists and synthesizes results
- `researcher` - gathers evidence and returns cited briefs
- `writer` - turns briefs into drafts
- `reviewer` - checks artifacts against requirements
- `coder` - implements and debugs software tasks

## Permissions

Permissions are stored in `data/permissions.json`:

```json
{
  "rules": {
    "*": "ask",
    "read": "allow",
    "todo_write": "allow",
    "memory_write": "allow"
  },
  "autoApprove": true
}
```

Agent configs can override permissions per agent.

## Notes

- The app uses request/response calls plus event broadcasts; streaming SSE is not implemented.
- `send_email` is currently a stub.
- Some desktop UI features, such as attachments, are not implemented yet.
