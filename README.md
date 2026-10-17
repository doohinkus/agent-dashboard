# Agent Activity Dashboard

A live dashboard that visualizes agent (Claude Code, Codex, OpenCode, Pi) tool activity over HTTP. Tool hooks/extensions POST events to this server and see real-time usage in a Gradio UI backed by FastAPI.

![Agent Activity Dashboard live UI](docs/screenshot.png)

## How it works

- `POST http://localhost:8000/event` — receivers for all platforms; payloads are normalized to a shared shape (`platform`, `event`, `tool`, `args`) and kept in an in-memory ring buffer (500 events max)
- `GET http://localhost:8000/health` — liveness + current event count
- `/` (browser) — live Gradio UI with event table, tool usage bar chart, and summary; refreshes once per second via `gr.Timer`

## Run it

Python is managed with [uv](https://docs.astral.sh/uv/):

```sh
uv sync                  # install pinned deps from uv.lock into .venv
uv run agent-dashboard   # serve on HOST/PORT (default 127.0.0.1:8000)
```

Then open <http://localhost:8000>. Set `HOST=0.0.0.0` to listen on all interfaces (the Docker image does this already).

Or with Docker:

```sh
docker build -t agent-dashboard .
docker run --rm -p 8000:8000 agent-dashboard
```

## Wiring up opencode

This repo ships an opencode plugin at `.opencode/plugins/dashboard.ts` that streams every tool execution and session event to the dashboard. It is written against the **OpenCode V2 plugin API** (requires opencode v2.0.x): a default export built with `Plugin.define` from `@opencode/plugin`, with tool hooks registered via `ctx.tool.hook("execute.before" / "execute.after")` (`PreToolUse` / `PostToolUse`) and server events streamed through `ctx.event.subscribe()` (`SessionStart` / `Stop`).

```ts
// .opencode/plugins/dashboard.ts
const URL = process.env.DASHBOARD_URL ?? "http://localhost:8000/event";
```

It is auto-discovered from `.opencode/plugins/` by opencode (no config entry needed; V2 also supports declaring plugins under a `plugins` config key if you ever need one). The plugin dependency is pinned in `.opencode/package.json` to `@opencode/plugin@2.0.32`, matching the targeted opencode release, and TypeScript resolution is handled by `.opencode/tsconfig.json`.

Set `DASHBOARD_URL=""` in the environment to disable streaming without removing the plugin.

Other platforms: point their hooks (Claude Code `PreToolUse`/`PostToolUse`/`Stop`, Codex, Pi) at `POST http://localhost:8000/event` with a JSON body; unknown shapes are normalized via fallbacks (`hook_event_name`, `tool_name`, `tool_input`, `x-platform` header).

## Tests & CI

```sh
uv run pytest             # unit tests (FastAPI TestClient)
uv run ruff check .       # lint
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint + tests, and type-checks the opencode plugin with `tsc --noEmit`.

## Project layout

| Path | Purpose |
| --- | --- |
| `app.py` | FastAPI receiver + mounted Gradio UI (single process) |
| `pyproject.toml` / `uv.lock` | Python deps managed by uv; `[project.scripts]` provides `agent-dashboard` |
| `Dockerfile` / `.dockerignore` | uv-based container build |
| `.opencode/plugins/dashboard.ts` | opencode V2 plugin streaming tool events |
