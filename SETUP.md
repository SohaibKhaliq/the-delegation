# Setup with Muse — how the bridge is built

This document is about **one thing first: how to build the bridge between
Muse and this dashboard**. Local run and Coolify deploy are secondary
sections at the end. The WebSocket path is a separate branch and is
**not live yet** — see [WebSocket bridge (branch only, not live)](#7-websocket-bridge-branch-only-not-live).

> **Start here, in one sentence:** Muse does the real work in chat.
> At each milestone, Muse publishes a short metadata event into
> `public/muse-data.json`, commits **only that file**, and pushes it to
> `main`. The dashboard reads that file straight from GitHub every
> 10 seconds and shows it. Nothing on the dashboard ever talks back
> to Muse.

## 1. What the bridge is — and what it is not

### What it is

A **view-only, git-based event bridge**:

```text
Muse (main agent + subagents, in chat)
  │  milestone reached: started / milestone / file_changed / commit / done / blocked
  ▼
scripts/publish-muse-event.py        ← validates + writes the event
  │  only public/muse-data.json changes
  ▼
git add public/muse-data.json && git commit && git push origin main
  │  pushing to main IS the authentication — only the repo owner can push
  ▼
https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json
  │  dashboard polls this every 10s (cache-busted, no-store)
  ▼
Browser: Team Flow (hierarchy) · task details (Kanban board hidden, see §4)
```

### What it is NOT

- **No live terminal, no thinking stream.** Muse does not expose a
  second-by-second stream of its internal reasoning, tool calls, or
  typing. The bridge carries **milestone events only** — one event per
  real milestone, never every keystroke or every tool call.
- **No commands back.** The dashboard has no write path to Muse: no
  POST endpoint on `main`, no command queue, no approvals, no agent
  starts. Control stays in Muse chat. Viewing the dashboard can never
  start, approve, or change Muse work.
- **No Gemini.** The upstream simulation (Gemini provider, BYOK key
  modal, LLM tool-call loop) was deleted in this fork. Nothing in the
  bridge calls an LLM or needs a key.
- **No literal agent movement.** The 3D office is a visualisation of
  status events, not a live camera on agents. A character "working"
  means its status event said so; it is not Muse typing in real time.

### Latency, honestly

| Path | Typical latency | Notes |
|---|---|---|
| Feed event (git bridge + fast polling) | **~20–30 s** (target, not a guarantee) | Push ~10 s + 10 s polling. `raw.githubusercontent.com` may cache briefly despite cache-busting, so an occasional event takes longer. |
| Code change (any `src/`, `server.js`, `index.html` change) | **~1–2 min** | Needs a Coolify deploy after the push. Feed data does **not** wait for this. |
| WebSocket event (branch only, after merge + token) | **2–5 s** | See the WebSocket section. Not available on `main` yet. |

## 2. The building blocks (exact file paths)

Everything below is on `main` unless marked "branch only". All paths
are relative to the repo root.

### 2.1 `public/muse-data.json` — the feed (schema v1)

This single JSON file **is** the bridge. The dashboard never reads a
database; it reads this file. Its top-level shape (defined in
`src/muse/museTypes.ts`):

```json
{
  "version": 1,
  "source": "live",
  "sourceLabel": "LIVE — real Muse event feed, updated via the git-based bridge. View-only: control stays in Muse chat.",
  "generatedAt": "2026-10-26T16:07:08.022590Z",
  "note": "View-only snapshot. No agent is started, commanded, or approved from this dashboard.",
  "workspaces": [{ "id": "ade", "name": "ADE", "description": "ADE app and backend work" }],
  "agents": [{
    "id": "sonia", "name": "S.O.N.I.A", "role": "coordinator",
    "kind": "main-agent", "workspaceId": "the-delegation",
    "status": "idle", "currentTask": null, "lastReport": "..."
  }],
  "tasks": [{
    "id": "legacy-stats-restored", "title": "Legacy stats section restored",
    "workspaceId": "legacy-cms", "agentId": "legacy-admin",
    "status": "done", "report": "...", "filesChanged": ["shortcodes.php"]
  }],
  "events": [{
    "id": "evt-legacy-stats", "timestamp": "2026-10-26T18:12:00+05:00",
    "type": "done", "workspaceId": "legacy-cms", "agentId": "legacy-admin",
    "taskId": "legacy-stats-restored", "report": "...", "filesChanged": ["shortcodes.php"]
  }]
}
```

Field rules:

- `version` must be `1`. The loader rejects anything else.
- `source` is `"live"` or `"seed"` — nothing else. **`"live"` means
  real Muse data; `"seed"` means sample data.** Never set `"live"` on
  sample data: the loader accepts a GitHub-raw file as live **only**
  if `source` is `"live"`, and a seed file from GitHub falls through
  instead of being mislabelled as live.
- `workspaces[]`: `id` (slug, e.g. `legacy-cms`), `name`, optional
  `description`.
- `agents[]`: `id`, `name`, `role`, `kind`, `workspaceId`, `status`,
  optional `currentTask` (a task id, or `null`), optional `lastReport`.
- `tasks[]`: `id`, `title`, `workspaceId`, `agentId`, `status`,
  optional `report`, optional `filesChanged` (file names/paths only —
  never file contents, never secrets).
- `events[]`: `id`, `timestamp` (ISO 8601), `type`, `workspaceId`,
  `agentId`, optional `taskId`, optional `report`, optional
  `filesChanged`, optional `inputTokens`, `outputTokens`,
  `cachedInputTokens` (real Muse token counts for that event, if
  published — see §2.4 and "Token Usage" below). Events are capped
  at the latest 200 by the publisher.
- `tokenUsage` (optional, feed-level): `{ inputTokens, outputTokens,
  cachedInputTokens }` — the publisher's aggregate, the sum of token
  fields over the events currently in the feed. Absent means no
  counts have been published yet (the panel shows 0).

Allowed values (from `src/muse/museTypes.ts`):

- Agent status: `idle | running | done | blocked | pending`
- Task status: `pending | running | done | blocked`
  (the publisher script also accepts `idle` for a task, but prefer the
  four values above so the feed matches the type definitions).
- Event type: `started | milestone | file_changed | commit | done | blocked`

### 2.2 `src/muse/museTypes.ts` + `src/muse/museStore.ts` — the loader

`museTypes.ts` is only types — it starts no agent, sends no command,
and calls no LLM. `museStore.ts` is the loader, and its load order is
the whole reason feed events do not need a deploy:

1. **First:** the fresh file straight from GitHub,
   `https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json`,
   with a cache-busting `?t=<timestamp>` query and fetch
   `cache: 'no-store'`. Accepted **only** if it is a valid v1 feed
   whose `source` is `"live"`.
2. **Then:** `GET /api/muse-state` (deployed server feed, live only).
3. **Then:** `GET /muse-data.json` (the bundled file, copied into
   `dist/` at build time, labelled from its own `source` — seed unless
   its `source` is `"live"`).
4. **Otherwise:** `unavailable` (empty lists).

Polling is every **10 s** (`startMusePolling(10000)`, started in
`src/App.tsx`). Polling only re-reads the feed; it is a display
refresh, not a command channel. The store never POSTs. Project
Info's token panel subscribes to this store, so its totals
re-compute on **every** poll (and on WebSocket feed updates after
the `muse-realtime` branch is merged) — regular updates are poll
updates, not a separate counter.

On every successful load the store also calls `syncMuseToCore()` in
`src/muse/museSync.ts`, which converts the feed into one Delegation
team with id `muse` (lead agent = S.O.N.I.A, subagents = all
subagents) and every feed task into a core task with id
`muse:<taskId>`. That is what drives Team Flow (the Muse hierarchy) and
the Inspector (select a Muse agent to see its tasks). Tasks are
still synced into the core store with id `muse:<taskId>` — only
the Kanban board that displayed them is hidden (see §4). The active team
is switched to `muse` only when the stored selection is still the
factory default; a user who explicitly picks another team is never
snapped back by polling, and non-`muse:` editor tasks are never
touched by the sync. Muse events are **not** copied into the
simulation ActionLog.

### 2.3 `server.js` — the deployed server's two read endpoints

On `main`, `server.js` is a dependency-free Node static server. It
serves the Vite build output in `./dist` on `PORT` (default `3000`)
and exposes exactly two API-ish endpoints, both read-only:

- `GET /health` → `{"status":"ok"}` (container healthcheck).
- `GET /api/muse-state` → serves the built `dist/muse-data.json`
  (copied from `public/` at build time). If the file is absent it
  returns 404 so the UI falls back to `/muse-data.json` or
  `unavailable`.

**There is no POST endpoint on `main`.** No endpoint accepts events,
commands, or keys. That is deliberate (see §1): the git push is the
only write path, and it is authenticated by repo ownership, not by a
shared secret. The WebSocket POST endpoint exists only on the
`muse-realtime` branch — see the WebSocket section.

### 2.4 `scripts/publish-muse-event.py` — the publisher

The only supported way to write to the feed. It is standard-library
Python (no pip installs). Run `--help` to see the full interface:

```bash
python3 scripts/publish-muse-event.py --help
```

Required arguments: `--type`, `--workspace`, `--report`.
Optional: `--agent`, `--task`, `--task-title`, `--files`,
`--agent-status`, `--task-status`, `--event-id`, `--feed`
(default `public/muse-data.json`), `--dry-run`, plus token counts:
`--input-tokens`, `--output-tokens`, `--cached-tokens` (integers,
default 0, never negative — real Muse counts for this event, never
a secret, never estimated).

What it does, in order (verified against the script, not assumed):

1. **Validates the feed** — `version` must be `1`; `source`,
   `workspaces`, `agents`, `tasks`, `events` must exist; `source` must
   be `"seed"` or `"live"`; every section must be a list of objects
   with an `id`. A bad feed aborts with an error and writes nothing.
2. **Refuses secrets, exit code 2, nothing written** — any of
   `--workspace`, `--agent`, `--task`, `--report`, `--task-title`, or
   `--files` that looks like a credential is refused: an explicit
   `api_key=` / `token=` / `password=` / `secret=` / `session=` /
   `bearer=` / `private_key=` assignment, or a single long token-like
   string (40+ word characters). `--files` entries must also be
   **relative paths** — absolute paths or `..` paths are refused the
   same way. Publish metadata only: ids, names, statuses, file
   names, short reports.
3. **Enforces the 500-character report limit** — a longer `--report`
   is refused, nothing written.
4. **Matches by id, then by case-insensitive name/title.**
   `--workspace`, `--agent`, and `--task` each accept an id **or** a
   name/title (e.g. `sonia` or `S.O.N.I.A`, `legacy-admin` or
   `Legacy Admin`).
5. **Creates unknown workspaces and agents, but not unknown tasks
   without `--task-title`:**
   - Unknown workspace → created with a slugified id (see §5) and
     description `"Work tracked via the Muse event bridge."`
   - Unknown agent → created with a slugified id, `role: "builder"`,
     and the event's workspace as its `workspaceId`. (No `kind` is
     set by the script, so the UI treats it as a `subagent` unless
     it is named S.O.N.I.A — see §4 for how to add a real subagent
     properly.)
   - Unknown task → **refused** (exit code 1) unless `--task-title`
     is given, in which case the task is created with a slugified id,
     that title, the event's workspace, the event's agent, and status
     `--task-status` or `pending`.
6. **Applies statuses** — `--agent-status` updates the agent's
   `status` and `--task-status` updates the task's `status`; the
   agent's `lastReport` and the task's `report` become the new
   `--report`; `--files` replaces the task's `filesChanged`.
7. **Appends the event** — id auto-generated
   (`evt-<UTC timestamp>-<6 hex chars>`) unless `--event-id` is
   given; `timestamp` is UTC ISO. Events are capped at the latest
   200. Then it sets `source` to `"live"`, sets the live
   `sourceLabel`, updates `generatedAt`, recomputes feed-level
   `tokenUsage` as the sum of token fields over the events now in
   the feed, writes the file, and **re-reads it to prove the
   written file is valid JSON**.

One sharp edge, straight from the code: **every publish re-homes the
agent to the event's workspace** (`agent.workspaceId` is overwritten
with the `--workspace` value on every event). So publish a subagent's
events only under its own workspace, and publish main-agent
coordination events only under `the-delegation` — otherwise the
script will silently move that agent's home workspace in the feed.
Fix it by hand-editing the feed if it ever happens, and never by
publishing a correcting event under the wrong workspace.

## 3. Build the bridge from scratch, step by step

This is the reproducible recipe. It assumes a fresh checkout of this
fork; if the bridge already exists (it does, on `main`), start at
step 4 for day-to-day publishing and use steps 1–3 only to understand
or rebuild it.

### Step 1 — Create the feed file with workspaces, agents, tasks

Create `public/muse-data.json` with schema v1. Keep it minimal and
honest: one workspace, the main agent, one subagent, one task, no
events yet. **Set `source` to `"seed"` while it is sample data** —
only real published events flip it to `"live"` (the script does that
automatically). Never hand-set `"live"` on data that is not real
Muse activity, or the loader will present sample data as live.

```json
{
  "version": 1,
  "source": "seed",
  "sourceLabel": "SEED / SAMPLE DATA — not a live Muse feed yet.",
  "generatedAt": "2026-10-26T00:00:00Z",
  "note": "View-only snapshot. No agent is started, commanded, or approved from this dashboard.",
  "workspaces": [
    { "id": "the-delegation", "name": "the-delegation", "description": "Delegation dashboard work" }
  ],
  "agents": [
    { "id": "sonia", "name": "S.O.N.I.A", "role": "coordinator",
      "kind": "main-agent", "workspaceId": "the-delegation",
      "status": "idle", "currentTask": null, "lastReport": "" },
    { "id": "delegation-builder", "name": "Delegation Builder", "role": "builder",
      "kind": "subagent", "workspaceId": "the-delegation",
      "status": "idle", "currentTask": null, "lastReport": "" }
  ],
  "tasks": [
    { "id": "example-task", "title": "Example task",
      "workspaceId": "the-delegation", "agentId": "delegation-builder",
      "status": "pending", "report": "", "filesChanged": [] }
  ],
  "events": []
}
```

Validate it before anything else:

```bash
python3 -m json.tool public/muse-data.json > /dev/null && echo "feed JSON OK"
```

### Step 2 — Wire the store loader

The loader already exists in this fork; to recreate it you need
exactly three pieces, in this order:

1. **Types** — `src/muse/museTypes.ts`: `MuseFeed`, `MuseWorkspace`,
   `MuseAgent` (with `kind`), `MuseTask`, `MuseEvent`, and the
   status/event-type unions from §2.1. No logic, no network, no LLM.
2. **Loader + polling** — `src/muse/museStore.ts`: `loadMuseData()`
   implementing the load order in §2.2 (GitHub raw with
   `?t=${Date.now()}` and `cache: 'no-store'`, live-only on the
   first two sources, bundled file labelled from its own source),
   plus `startMusePolling(intervalMs = 10000)`.
3. **Core sync** — `src/muse/museSync.ts` + a call to
   `syncMuseToCore(feed)` after every successful load, so Team Flow
   and Inspector are driven by the same feed. Start polling
   in `src/App.tsx` alongside the rest of the app boot.

If any one of these is missing, the dashboard falls back to its
simulation teams and the bridge is not actually built — check all
three, not just the feed file.

### Step 3 — Add the publisher script

Copy `scripts/publish-muse-event.py` into the repo (stdlib only, no
dependencies). Confirm it refuses secrets before trusting it:

```bash
python3 scripts/publish-muse-event.py --type milestone --workspace the-delegation \
  --agent sonia --report "token=abc123" --dry-run
# Expected: REFUSED, exit code 2, nothing written — even a dry run refuses.
```

### Step 4 — Publish a test event: `--dry-run` first, then real

Always dry-run first. It prints the event that *would* be published
and writes nothing:

```bash
# From the repo root, after git pull:
python3 scripts/publish-muse-event.py \
  --type milestone --workspace the-delegation --agent delegation-builder \
  --task example-task --task-status done \
  --report "Bridge test event" --dry-run
```

Then publish for real (same command, no `--dry-run`). The script
sets `source` to `"live"`, updates `generatedAt`, appends the event,
and re-reads the file to prove it is valid JSON:

```bash
python3 scripts/publish-muse-event.py \
  --type milestone --workspace the-delegation --agent delegation-builder \
  --task example-task --task-status done \
  --report "Bridge test event"
# Expected output: Published event evt-... (milestone)
```

### Step 5 — Commit ONLY the feed file, and push

This is the rule that keeps the bridge clean and the deploy history
readable. One file, one commit, one push — never bundle a feed
update with a code change:

```bash
git status --short
# Expected: only " M public/muse-data.json" — if anything else shows,
# do not commit it in this commit.

git add public/muse-data.json
git commit -m "Muse event: <short title>"
git push origin main
```

Pushing to `main` is the authentication for the git bridge: only the
repo owner can push, so no shared secret is needed on this path.
Never commit a token, password, or key alongside a feed event — the
script refuses secret-like arguments, but it cannot stop a careless
`git add .`.

### Step 6 — Verify on GitHub raw and on the live site (no deploy needed)

Feed events do **not** need a Coolify deploy. Verify in this order:

1. **GitHub raw (the loader's first source):**
   ```bash
   curl -s "https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json" \
     | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['source'], len(d['events']), d['events'][-1]['report'])"
   # Expected: live, an event count, and your test report as the latest event.
   ```
   If the raw file still shows the old feed, wait ~10–20 s and retry
   — GitHub raw can cache briefly. Do not trigger a deploy to "fix"
   a feed delay; a deploy is not on the feed path.
2. **Live site:** open `https://agents.zentacode.com/`, wait for the
   next 10 s poll (or reload), and check the Muse team and
   task status. The view-only data banner is **hidden
   by design** (owner order; the component file is kept at
   `src/muse/MuseViewOnlyBanner.tsx` for easy restore), so do not
   expect a banner — check Team Flow / task details instead.
3. **Health:** `curl https://agents.zentacode.com/health` should
   return `{"status":"ok"}`. This proves the server, not the feed.

### Step 7 — Add a new workspace, a new subagent, a new task

**New workspace** — no code, no deploy. Publish an event under the
new workspace name and the script creates it:

```bash
python3 scripts/publish-muse-event.py --type started \
  --workspace "New Workspace" --agent sonia \
  --report "New workspace appears via the bridge" --dry-run
```

The workspace id is slugified: lowercase, every run of
non-alphanumeric characters becomes `-`, leading/trailing `-`
trimmed (`"New Workspace"` → `new-workspace`, `"Legacy CMS"` →
`legacy-cms`). If the slug is empty it becomes `item`. Use the id
after that, not the display name, in later commands.

**New subagent** — publish an event with the new agent name under
its own workspace:

```bash
python3 scripts/publish-muse-event.py --type started \
  --workspace ade --agent "New Builder" --agent-status idle \
  --report "New subagent registered" --dry-run
```

Rules that matter:

- **Role names only, never fake person names.** A subagent is a
  work function (`ADE Builder`, `Legacy Admin`), not a person.
- The script creates the agent with `role: "builder"` and **no
  `kind`** — the UI then treats it as a `subagent` (only an agent
  named S.O.N.I.A defaults to `main-agent`). If the subagent needs a
  different `role`, or an explicit `"kind": "subagent"` in the file,
  edit `public/muse-data.json` by hand in a separate feed-only
  commit — the script will not overwrite `kind` on later events,
  but it **will** re-home the agent if you publish under a different
  workspace (see the sharp edge in §2.4).
- **Never claim `running` unless a real event just reported it
  running.** Idle / done / pending are the honest defaults; a
  `running` status with no live work behind it is a fake activity
  claim.
- A subagent belongs to **exactly one workspace**. One agent id must
  never be duplicated across workspaces.

**New task** — an unknown task is refused unless `--task-title` is
given. This is the only creation path the script allows:

```bash
# Refused (exit 1): unknown task, no --task-title
python3 scripts/publish-muse-event.py --type started \
  --workspace ade --agent ade-builder --task "Brand new task" \
  --report "This will be refused"

# Created: same command plus --task-title
python3 scripts/publish-muse-event.py --type started \
  --workspace ade --agent ade-builder --task "Brand new task" \
  --task-title "Brand new task" --task-status pending \
  --report "New task created via the bridge"
```

The new task's id is slugified from `--task` (`"Brand new task"` →
`brand-new-task`), its `workspaceId` is the event's workspace, and
its `agentId` is the event's agent. After creation, later events
reference it by id or title. **Every task must carry both
`workspaceId` and `agentId`, and both must already exist in the feed
(or be created by this same event).** The script does not enforce
that the agent's workspace matches the task's workspace — the
publisher must check it by hand.

## 4. Hierarchy rules (the feed must always satisfy these)

These are not style preferences; the UI renders them directly, so a
broken hierarchy renders as a broken dashboard:

1. **Exactly one main agent:** `S.O.N.I.A`, `kind: "main-agent"`,
   `role: "coordinator"`. She is **global** — she coordinates every
   workspace even though her home `workspaceId` is `the-delegation`.
   Never duplicate her per workspace, because agent ids must stay
   unique.
2. **Subagents are role names only**, one per real work function per
   workspace, each with `kind: "subagent"` (or no `kind`, which
   defaults to subagent) and exactly one `workspaceId`. Current
   subagents: `ade-builder` (ADE), `legacy-admin` (Legacy CMS),
   `trevora-builder` (Trevora), `zentacode-builder` (ZentaCode),
   `delegation-builder` + `delegation-adapter-builder`
   (the-delegation).
3. **Every task links to its agent.** Coordination tasks done
   directly by the parent agent link to `sonia` (e.g. banner hide);
   build tasks link to their builder subagent (e.g. live bridge and
   fast bridge to `delegation-builder`, view-only adapter to
   `delegation-adapter-builder`, Legacy work to `legacy-admin`).
   A task must never be published with an `agentId` that is not in
   the feed.
4. **Statuses are real.** No agent or task is `running` unless a
   real event just reported it running. A subagent with no task yet
   (Trevora / ZentaCode today) stays `idle` with no task — that is
   honest, not a gap to fill with invented work.
5. **Milestones only.** One event per real milestone: started,
   milestone, file changed, commit, done, blocked. Not every
   keystroke, not every tool call, not a live log.

### Project Info, token usage, and removed UI (what the dashboard shows)

This section documents the current UI, so a future bridge publisher
knows what its feed data actually drives. It does not change the
bridge-first structure above.

- **Project Info shows ACTIVE PROJECTS, names only** — not a user
  brief. The old "User Brief" section was removed. Active
  definition: a workspace is active when it has at least one agent
  AND (at least one non-done task OR at least one event in the
  feed). Inactive/empty workspaces are omitted. Implementation:
  `src/interface/ProjectView.tsx`, function `activeProjectNames()`.
- **Token Usage uses Meta Muse Spark 1.3, Standard tier** (Meta
  Model API, September 2026; see `src/muse/musePricing.ts`):
  $1.25/1M input, $4.25/1M output, $0.15/1M cached input. Cost =
  (input/1M)*1.25 + (output/1M)*4.25 + (cached/1M)*0.15. No Gemini
  pricing is used in this panel, and the old Gemini pricing modal is
  no longer opened from Project Info.
- **Token counts update regularly — and only from published
  events.** The panel subscribes to the Muse store and re-computes
  on every 10 s feed poll (and on WebSocket feed updates after the
  `muse-realtime` branch is merged). To move the numbers, publish
  counts with a milestone event, e.g.:
  ```bash
  python3 scripts/publish-muse-event.py --type milestone \
    --workspace ade --agent ade-builder --task ade-groups-verification \
    --report "ADE verification milestone" \
    --input-tokens 1200 --output-tokens 300 --cached-tokens 0
  ```
  Then commit only `public/muse-data.json` and push (see §3 step
  5). There is **no** fake auto-incrementing counter, **no**
  estimation from text length, and **no** live Muse token API that
  the dashboard calls — if no counts are published, the panel
  honestly shows 0. Feed totals are the sum over the events
  currently in the feed (max 200), so totals can only fall if old
  events age out of the cap.
- **MANAGE TEAMS button removed.** The header no longer has a
  "MANAGE TEAMS" button (`src/interface/Header.tsx`, code deletion).
  The only team is the owner's Muse team, auto-selected from the
  feed by `museSync.ts`; the team editor is no longer reachable
  from the UI.
- **LOGS panel removed.** The LOGS panel (ACTIVITY / TECHNICAL
  tabs, "AWAITING ACTIONS..." empty state) no longer renders in
  the main view (`src/App.tsx`, code deletion).
  `src/interface/ActionLogPanel.tsx` remains on disk but is no
  longer mounted, and no other entry point opens it. Team Flow
  and Project Info are untouched by this removal (Kanban was
  removed separately, see below).
- **KANBAN board hidden.** The Kanban board (SCHEDULED / ON HOLD /
  IN PROGRESS / DONE columns) no longer renders in the main view
  (`src/App.tsx`, code deletion, not CSS hiding).
  `src/interface/KanbanPanel.tsx` remains on disk but is no longer
  mounted, and no other entry point (tab, button, menu) opened it —
  it was always mounted from `App.tsx`. Task DATA is untouched:
  `museSync.ts` still syncs every feed task into the core store,
  and tasks remain visible via Team Flow (Muse hierarchy), Project
  Info (active projects), and the Inspector (agent-linked tasks).
- **Branch name is `muse-realtime`**, not `websocket-realtime` —
  the WebSocket branch was renamed, and all references in this
  guide use the new name.

### Dynamic Environment v1 (Roadmap Step 1 — view-only)

A real Muse agent changes the 3D office **through a feed event**,
never through a dashboard command and never by a simulation agent
on its own. Implementation: `src/muse/museTypes.ts`
(`MuseEnvProp`, feed field `environmentProps`),
`src/simulation/world/MuseEnvironment.ts` (primitive prop builds),
`src/simulation/SceneManager.ts` (subscribes to the Muse store and
re-syncs props on every feed poll, including the 10 s polling
refresh). With no props, the scene is exactly the stock office +
characters; an absent `environmentProps` list (old feed) deletes
nothing, an explicitly empty list removes all props.

Publish a prop (workspace and agent must already exist in the
feed; type must be `desk | chair | plant | screen | board | lamp`;
x/z in `[-8, 8]`, y in `[0, 3]`, rotation in `[-180, 180]` degrees;
label is metadata only, not rendered as 3D text):

```bash
python3 scripts/publish-muse-event.py --type env_changed \
  --workspace the-delegation --agent delegation-builder \
  --report "Placed a plant in the office" \
  --env-prop-id office-plant-1 --env-prop-type plant \
  --env-prop-label "Office plant" --env-x 2.5 --env-y 0 --env-z -1.5
# Then commit only public/muse-data.json and push (see §3 step 5).
# Remove it later with the same command plus --env-status removed.
```

What a real (not yet published) prop event looks like in the feed:

```json
{
  "id": "office-plant-1", "workspaceId": "the-delegation",
  "agentId": "delegation-builder", "type": "plant",
  "label": "Office plant",
  "position": { "x": 2.5, "y": 0, "z": -1.5 },
  "rotationY": 0, "status": "active"
}
```

Limits: WebGPU only — confirmed working on the owner's Windows
Chrome; headless browsers without WebGPU still show a blank panel
(a browser limitation, not a scene bug). Props are primitives/
simple builds only in v1: no new GLBs, no downloaded models, no
AI-generated imagery. Test env publishing on a `--feed /tmp/…`
copy first (`--dry-run` writes nothing); never publish a fake prop
to the live feed.

### Advanced Embodied AI v1 (Roadmap Step 2 — view-only)

Upstream this is LLM reasoning driving 3D actions. Here there is
no LLM, so it is narrower: **real feed status drives character
behaviour** (`src/muse/museEmbodied.ts` derives it,
`src/simulation/SceneManager.ts` applies it on every 10 s poll
and once after scene init). Blocked task/agent status ->
boardroom + `listen` (waiting) pose; running task/agent status
-> `sit_work` desk; anything else -> spawn + `idle`. Only
existing animations/POIs/NavMesh paths; no new GLBs, no fake
thoughts, no dashboard commands. A state is applied only when
it changes, only while the Muse team is active, and only after
characters load. To see it: publish a real milestone event that
changes an agent/task to `running` (or `blocked`), commit only
the feed file, push, then on the owner's Chrome watch that
character walk to a desk (or the boardroom) within ~10 s plus
walk time. The existing core-store watcher (task changes ->
desk/boardroom/spawn) is left untouched; both paths converge
on the same destinations.

### Enhanced Animations v1 (Roadmap Step 3 — view-only)

Upstream this is richer simulation animation. Here it is only
smoother movement between the SAME feed-driven poses, using
the SAME 12 baked clips (`Idle, Walk, Talk, Listen, Sit,
Sit_Idle, Sit_Work, LookAround, Happy, Sad, Pick, Wave`) — no
new clips, GLBs, expressions or emotions. Before this step the
GPU buffer held exactly one clip index per character, so every
pose change snapped to frame 0 of the new clip. Now
`src/simulation/behavior/AgentStateBuffer.ts` holds 12 floats
per instance (was 8): a third vec4 stores the outgoing clip
(index, start time, loop flag, blend duration) and the old
unused slot stores the blend start time; the vertex shader in
`src/simulation/entities/CharacterManager.ts` samples both
clips and mixes their bone matrices over 0.35 s with a
smoothstep ease. Same-clip replays never blend, and with no
blend active the shader runs the old single-clip path exactly.
Looping idle-family clips (`Idle, Sit_Idle, Sit_Work, Listen`)
also start with a deterministic per-agent phase offset
(`(index + 1) * 0.73 s` modulo clip duration), so idle/working/
waiting agents no longer pose in sync; walk and one-shot clips
are unoffset. No new idle ticker: idle agents already vary via
the existing driver (`look_around` / `wave` / `happy`). The
Embodied AI mapping and Dynamic Environment prop sync are
untouched. To see it: flip a real agent `running` -> done and
watch walk -> sit-down -> work -> walk -> spawn idle ease
instead of snap, on the owner's Chrome only — smoothness
cannot be verified headlessly.

## 5. Secondary: local run

This is for developing the dashboard itself, not for publishing
events. The bridge needs no local server — publishing is just the
script + git — but to run the UI locally:

```bash
git clone https://github.com/SohaibKhaliq/the-delegation.git
cd the-delegation
npm ci
npm run build
node server.js
# Then open http://localhost:3000/ and check:
curl http://localhost:3000/health
# Expected: {"status":"ok"}
```

For development with hot reload instead of the production server:

```bash
npm run dev
# Vite on port 3000 (see package.json: vite --port=3000 --host=0.0.0.0)
```

The local feed is `public/muse-data.json` served as `/muse-data.json`
and via `/api/muse-state` (from the built `dist/` copy). The loader's
first source is still the GitHub-raw file, so a local run with
network access shows the live feed, not just the local file — that
is by design. `npm ci` (not `npm install`) is the reproducible
install used by the Dockerfile.

## 6. Secondary: Coolify deploy

The deployed site is `https://agents.zentacode.com/`. The deploy is
defined entirely by the repo, no manual server steps:

- **Dockerfile** (multi-stage, `node:20-alpine`): stage 1 copies
  `package.json` + `package-lock.json`, runs `npm ci`, copies the
  repo, runs `npm run build`; stage 2 copies only `dist/` and
  `server.js`, sets `ENV PORT=3000`, `EXPOSE 3000`, and runs
  `node server.js`. Healthcheck: `wget -qO- http://127.0.0.1:3000/health`.
- **Port:** `3000` (Dockerfile default; `server.js` uses `PORT` if
  set, else `3000`).
- **Environment variables:** **none needed for the current live
  version.** `server.js` reads only `PORT`. Do **not** set a
  `GEMINI_API_KEY` build variable: the upstream Dockerfile comment
  warns that Vite would embed it in the served client JavaScript.
  (The WebSocket token in §7 is the only future env var, and it
  lives on its branch, not on `main`.)
- **Deploy trigger:** push to `main` → Coolify webhook auto-deploy.
  No manual deploy is needed when one is already in progress for the
  pushed commit; triggering a duplicate only queues a second deploy.
- **Verify a deploy:** in Coolify, check Deployments for the pushed
  commit → status Success, container Running (healthy), then
  `curl https://agents.zentacode.com/health` → `{"status":"ok"}`.
  A deploy is required for **code** changes only. Feed events (step
  5–6 above) need only a push, not a deploy.
- **Webhook miss (known, happened before):** if a push shows no
  deployment within ~10 minutes, check Coolify → Deployments
  history for the commit. Pushing any new commit triggers a fresh
  deployment built from `main`, which then contains everything —
  that is the recovery, not a manual rebuild of the old commit.

## 7. WebSocket bridge (branch only, NOT LIVE)

> **Do not use this section against the live site yet.** Everything
> here exists only on branch `muse-realtime`. On `main` there
> is no POST endpoint, no WebSocket, and no token. The live site
> falls back to the 10 s GitHub-raw polling in §2.2 until this branch
> is merged and deployed.

How it works (on that branch):

- `server.js` serves `WS /ws` (WebSocket broadcast, package `ws`)
  and `POST /api/muse-events`. On connect, the server sends
  `{type:'state', feed}`; on each accepted POST it broadcasts
  `{type:'event', event, feed}` to all connected clients within
  milliseconds. The frontend client `src/muse/museSocket.ts` applies
  that feed via `applyLiveFeed()` in `museStore.ts` immediately.
- The 10 s GitHub-raw polling keeps running alongside, so if the
  socket fails or disconnects, the feed still refreshes via polling
  — the socket only accelerates updates, it is never the sole feed
  source.
- `GET /api/muse-state` returns the **in-memory** live feed (seeded
  from `dist/muse-data.json` at boot, updated by each accepted
  POST). **Server state is in-memory only: a container restart
  reverts to the bundled feed until the next POST.** The git bridge
  (§3) remains the durable record — use it for events that must
  survive restarts.
- Expected latency: event POST → broadcast in **2–5 seconds**
  (typically well under a second for the broadcast itself, plus
  network). Still milestone events only — not a live terminal or
  thinking stream.

Token setup (parent/owner step — **no token is invented here**):

1. Choose a long random token. Do **not** put it in chat, in git,
   or in any file in this repo.
2. In Coolify, for the Delegation app, set env var
   `MUSE_EVENT_TOKEN` to that token, then redeploy — and only after
   this branch is merged to `main`, because the endpoint exists
   only on this branch.
3. On the publisher side (the Muse VM), set the **same** value as
   env var `MUSE_EVENT_TOKEN` through the approved secure channel
   only. The publisher script reads it from the environment only.
4. If `MUSE_EVENT_TOKEN` is not set on the server, **all POSTs are
   rejected (403)** — unauthenticated posts are never accepted. A
   wrong token is rejected (401). No token is ever logged or printed
   by the server or by the publisher script.

Publish via the WebSocket path (only after merge + deploy + token;
the script `scripts/post-muse-event-ws.py` exists **only on the
`muse-realtime` branch**, not on `main` — do not try to run it
from a `main` checkout):

```bash
MUSE_EVENT_TOKEN=<from-environment-only> python3 scripts/post-muse-event-ws.py \
  --url https://agents.zentacode.com \
  --type milestone --workspace the-delegation --agent sonia \
  --task muse-event-bridge --report "Short milestone report"
```

The WS publisher takes **no `--token` argument** (that would leak
into shell history / process lists), reads the token from the
environment only, and refuses secret-like arguments the same way
the git publisher does. Metadata only, reports max 500 chars.
A failed POST here never breaks the feed — the git bridge remains
the fallback and the durable record.

Merge order: merge `muse-realtime` into `main` **only after**
the work already on `main` has settled, rebase it against the then
current `main` first (it touches `App.tsx`, so a merge against an
old `main` will diverge), then deploy via Coolify as usual. The
branch's Dockerfile change (installing production dependencies in
the runtime stage, so `ws` exists at runtime) is required for the
deployed runtime — do not merge the server change without it.

## 8. What is NOT possible (limits, stated once, plainly)

- **No live terminal / thinking stream from Muse, on any path.**
  Git, polling, and WebSocket all carry milestone events. Nothing in
  this repo can stream Muse's internal reasoning, tool calls, or
  typing, because Muse does not expose such a stream.
- **No commands from the dashboard, on any path.** The WebSocket
  path is still one-way (Muse → server → browser). It does not add
  a command queue, approvals, or agent starts.
- **No private events on this bridge.** The repo is public and the
  feed is public metadata. If an event must stay private, do not
  publish it to this repo at all.
- **No guaranteed latency.** 20–30 s (git + polling) and 2–5 s
  (WebSocket, after merge + token) are targets measured from the
  observed deploys and polling interval, not guarantees. GitHub raw
  caching, network, and container restarts (WebSocket in-memory
  state) can all add delay.
- **3D scene is a visualisation, not a live camera.** If the central
  3D pane is blank while Team Flow / task details load,
  that is a separate scene-rendering issue — it does not mean the
  bridge is down. Verify the bridge via §3 step 6, not via the 3D
  pane.

## 9. Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| Feed shows SEED / SAMPLE, not live | The accepted feed's `source` is not `"live"`, or no live source was reachable | Check `public/muse-data.json` on GitHub raw: `source` must be `"live"`. Publish a real event (§3 step 4) — the script flips `source` to `"live"` automatically. Never hand-set `"live"` on sample data. |
| Feed unavailable on first load | All three loader sources failed, or the first load raced the poll | Reload and wait one 10 s poll cycle. Check GitHub raw directly (§3 step 6). A first-load flash of empty/seed data before the live file arrives is a loading race, not a broken bridge. |
| New event not showing after push | GitHub raw caching, or the push did not actually land | Re-check raw with a cache-busting query and confirm the commit on GitHub. Wait, then retry. Do **not** trigger a Coolify deploy for a feed delay — a deploy is not on the feed path. |
| Push shows no Coolify deployment | Webhook miss (known, happened before) | Check Coolify → Deployments history for the commit. If none exists after ~10 min, push a new (even empty-trigger) commit; the fresh deploy is built from `main` and contains everything. |
| Banner not visible | By design | The view-only data banner is hidden per owner order (component kept at `src/muse/MuseViewOnlyBanner.tsx` for restore). Check Team Flow / task details instead. |
| `REFUSED` / exit 2 from the publisher | Secret-like argument or absolute/`..` file path | Remove the credential-looking text or fix the path to a relative one, then re-run. Nothing was written — the feed is untouched. |
| `ERROR: unknown task` / exit 1 | Task does not exist and no `--task-title` given | Add `--task-title "Full task title"` to create it (§3 step 7), or use an existing task id/title. |
| WebSocket POST returns 403 | `MUSE_EVENT_TOKEN` not set on the server | Expected by design until the token is set (see §7). The git bridge + polling still work; the 403 is not a feed outage. |
| WebSocket POST returns 401 | Wrong token | The token on the publisher side does not match Coolify. Re-check through the secure channel — never paste either value into chat or git to compare. |

## 10. Licensing

- **Source code: MIT.** The upstream `LICENSE` file is kept intact.
- **3D models and textures: CC BY-NC 4.0** (Creative Commons
  Attribution-NonCommercial 4.0 International), © Arturo
  Paracuellos (unboring.net). Full terms are in
  `public/models/README.txt`, kept untouched. Commercial use is
  strictly prohibited without permission, and credit to Arturo
  Paracuellos is required. **This dashboard is internal/personal use
  only.**
- **Header branding is the owner's** (S.O.N.I.A / Muse Agents,
  `@sohaibkhaliq`, GitHub link to `SohaibKhaliq/the-delegation`) —
  see [CREDITS.md](CREDITS.md). The rebrand does not claim the
  upstream code or models as the owner's original work.

## Further reading in this repo

- [README.md](README.md) — full Muse-data adapter, hierarchy, live
  bridge, and fast bridge sections (the code-level detail behind
  this guide).
- [CREDITS.md](CREDITS.md) — owner branding vs upstream attribution.
- `public/models/README.txt` — CC BY-NC 4.0 model terms.
- `src/muse/museTypes.ts`, `src/muse/museStore.ts`,
  `src/muse/museSync.ts`, `server.js`,
  `scripts/publish-muse-event.py` — the bridge code itself; this
  guide describes it, it does not replace reading it.
