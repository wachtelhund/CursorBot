# Cursor Bots

Desktop teammates. Each bot is a Cursor Cloud Agent via `@cursor/sdk`. Usage is billed on the user's Cursor account (SDK).

## Layout

- `src/main` — Electron main: settings, IPC, harness, in-app update install (download GitHub asset, do not open the release page). Roster is Cursor Cloud, not a local file.
- `src/preload` — `window.cursorBots`
- `src/shared` — types, mentions, wake prompts, queue/steer, task joins, thread digest, Cursor Cloud REST helpers
- `src/renderer` — chat UI. Browser/phone uses `cloud-api.ts` + Vite `/cursor-api` (or `workers/cursor-proxy`)
- `workers/cursor-proxy` — CORS proxy so a phone browser can call `api.cursor.com`

## Source of truth

Cursor Cloud (`GET/POST /v1/agents`, archive to delete, runs for chat history) is the roster. `store.json` is not written and is not the product database. The API key may live on each device (`settings.json` / localStorage). That is the credential, not the chats.

Desktop Electron still uses `@cursor/sdk` (`Agent.create` / `resume` / `send`). Phone/browser is REST only.

Team and groups are not first-class in the Cursor API. Desktop keeps them in memory for the current session (harness bus). Phone: `listTeam` / `listGroups` return `[]`; creating a group throws. Do not treat a leftover Mac file as the team log.

The phone is a client of `api.cursor.com`, not a viewport onto the Mac. No Tailscale. The desktop app does not need to stay open for the phone. Browsers cannot call `api.cursor.com` directly (CORS):

- Dev: Vite `server.host: true` and proxy `/cursor-api` → `https://api.cursor.com`. Open the Vite URL on the phone and paste the same API key.
- Prod: `npx wrangler deploy --config workers/cursor-proxy/wrangler.toml`, then set `VITE_CURSOR_PROXY` to that origin when building the renderer.

## Harness

Bots do not share Cloud Agent memory. The app is the bus (same idea as Paperclip's heartbeat/wakeup).

- A send is a **wake**: `{ bot, text, source: user | handoff | question | result, taskId, sendMode }`. The trigger text is never dropped.
- **Team** is the shared log. A line `@Name: request` or `@Name request` assigns work. Names may contain spaces; match the longest unique roster prefix (case-insensitive). Mid-sentence `@Name` does not assign. `@all:` / line-start `@all` takes everyone (`@alla` still parsed). No assignment → most recently active bot.
- A directed DM (`botId` set) wakes only that bot. Mentions in that message do not auto-wake extras.
- `@Name: request` from a bot wakes that bot with the request body. Context is clipped in only when the request is empty (assignment pings stripped). Max 3 hops.
- Three ways for a bot to reach a teammate, all on a line of their own. `@Name: request` queues. `@Name!: request` steers — it cancels the run that bot is in, for corrections only. `@Name?: question` asks: the answer goes back to the asker as a `result`, stays an inspect row on the bus, and never becomes a new assignment. A question is the one line allowed to point back at the sender.
- Routing parsers never read inside a ``` / ~~~ fence or a whole-line code span (`src/shared/fences.ts`). Bots can quote assignment syntax without firing it — the wake prompt tells them to.
- Every wake carries a **thread digest** (`src/shared/digest.ts`): the last turns of the thread it happened on, clipped to ~2200 chars, plus `This came out of: <original request>` on a hop. Bots cannot read the app's threads any other way. A wake also names the teammates whose runs are already going.
- `@new Name: role` / `@ny Name: role` on its own line creates a teammate (`createBot` → Cursor Cloud). A markdown roster with `**Name** — role https://cursor.com/agents/bc-…` is also parsed (speaker skipped; existing `agentId` is attached from Cloud). No auto-wake unless the same message also has `@Name: request`.
- Every wake injects `App roster (only these exist): @Name (role); …` from `listBots` (speaker included). One bot: "You are the only bot. Do not invent teammates." Cloud Agents and leftover docs are not teammates unless they are on that list. When asked which bots exist, answer only this roster.
- Do not invent local bots from an old team log. `listBots` is `GET /v1/agents`.
- Desktop groups are session-only (not persisted). Team is everyone; a group is a subset with its own thread. Unique names, case-insensitive.
- `@team Name: Member, Member` / `@grupp Name: Member, Member` creates a group. `@team Name +: Member` adds people. `@team Name` plus `@Writer: do X` posts the result and assignment on that group thread. Name conflict is reported on Team, not thrown. In-app help shows the English command names.
- Sending in a group wakes `@Name:` assignments among members; no mention → most recently active member.
- Leave the `@Name:` assignment on the bus (Team / group / inspect). A DM hop stays on that DM — do not copy it onto Team. When a hop finishes with public text, write that result onto the same user thread immediately.
- One delegating turn is one **task** (`src/shared/tasks.ts`), and the id rides every branch. A single delegated result stands on the thread on its own — the sender is **not** woken to restate it. The sender is woken once when it asked a question, or when it fanned out to 2+ teammates and every branch has settled; the relay then carries all results together. A branch that errors or is cancelled settles too, so a join never hangs. One return hop, then stop — do not ping-pong.
- User-facing threads (Team, group, bot DM) show plain text meant for the human as normal bubbles. `@Name:` assignment lines, raw hops, and roster echoes stay behind a compact Messaged row (inspect). On the target bot's DM those hops are inspect rows (preview + time in the sidebar), not fake user messages. A finished public result must appear as a normal bubble on the user thread — never only in inspect.
- `@new` / `@ny` / `@team` / `@grupp` alone is harness: create/add, no wake, no plain-text echo. Same message plus `@Name: request` still wakes.
- Queue and steer are the same two modes for humans and bots (`src/shared/queue.ts`). One pending queue per bot. **Queue** (Enter, or a plain `@Name:`) waits for the current `agent.send`; consecutive queued wakes on the same lane — same bot, thread, source and sender — **merge into one run** instead of paying for one run each. **Steer** (Steer button / ⌘Enter, or `@Name!:`) cancels the active run (`run.cancel()` when supported) and jumps the queue, keeping steer order. A wake carrying the task the target is running right now steers automatically: it is a correction, not a new job. Byte-identical wakes already pending or running are dropped; nothing else is. The SDK has no queue/steer field.
- A wake that does not happen is posted on the thread as a `source: "notice"` row (visible, not behind inspect): hop limit reached, `@Name` matching nobody on the roster, or empty text. Silence is never the answer.
- Shared tokens are env vars on every `Agent.create` / `agent.send`. Names must not start with `CURSOR_`.
- GitHub / AWS / Cloudflare logins stay in Cursor Integrations + MCP.
- Local MCP server `cursor-bots` (stdio, `.cursor/mcp.json`) may still read a leftover `store.json` if one exists. That file is not the roster and is no longer written. It does not read `settings.json` or token values.

## Run

Main and preload do not hot-reload. After IPC changes, quit Electron and start again:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
npm test
npm run typecheck
```
