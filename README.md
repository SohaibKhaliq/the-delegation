# S.O.N.I.A — Muse Agents

**A view-only window into real Muse agents.** Live at
[https://agents.zentacode.com/](https://agents.zentacode.com/).
Header branding is the owner's (S.O.N.I.A / Muse Agents,
`v0.2.0-muse`, `@sohaibkhaliq`); this is a fork of upstream
The Delegation, not the upstream product itself — see
[History (upstream)](#history-upstream) and [CREDITS.md](CREDITS.md).
The old upstream logo file (`public/images/the-delegation.svg`) is
no longer used by the header.

> [!IMPORTANT]
> **This fork is VIEW-ONLY and does not use Gemini.** There is no API key to
> enter, no simulation to run, and no command channel back to Muse. The
> dashboard displays real Muse agent data through the Muse-data adapter
> below. Agents are controlled from Muse chat only.
<div align="center">
  <img src="public/images/the-delegation-UI.jpg" width="100%" alt="The Delegation Hero">
</div>

<br/>

## What this fork is

This fork is **not** a simulation playground you run with an API key.
It is a **view-only dashboard for real Muse work**: the main agent
S.O.N.I.A and her subagents, their workspaces, and their tasks,
fed by milestone events published from Muse (see [SETUP.md](SETUP.md)
for how the bridge is built). There is no Gemini, no simulation run,
no command channel back to Muse, and no approval flow from this
dashboard — control stays in Muse chat.

Known limitation, stated plainly: the **3D office scene does not
currently render on the live site** (central panel blank in every
live browser check so far). The hierarchy and task views
below are verified live (the Kanban board was later hidden by
owner order; see below); the 3D scene is a separate, unresolved
rendering issue and must not be claimed as working.

## Branding (owner's header)

The visible header branding is the owner's: logo text "S.O.N.I.A /
Muse Agents", version label `v0.2.0-muse` (upstream `package.json`
version plus a `-muse` suffix applied in the header only, so the
lockfile stays in sync), handle `@sohaibkhaliq`, GitHub link to
`SohaibKhaliq/the-delegation`, and tab title "S.O.N.I.A — Muse
Agents". Upstream code/model attribution is NOT removed with the
header handle — see `CREDITS.md` and `public/models/README.txt`
(MIT code; 3D models CC BY-NC 4.0, Arturo Paracuellos).

Also removed (owner order): the header "MANAGE TEAMS" button
(`src/interface/Header.tsx`, code deletion, not CSS hiding). The
only team is the owner's Muse team, auto-selected from the feed by
`src/muse/museSync.ts`; there is no team manager entry point left in
the header, and the team editor (`VisualConfigurator`) is no longer
reachable from the UI. Underlying team data and the Muse sync are
untouched.

## Project Info, Token Usage, and LOGS (owner UI batch)

- **Project Info — ACTIVE PROJECTS, names only:** the old "User
  Brief" section is gone. Project Info now lists active project
  names from the Muse feed only. Active definition: a workspace is
  active when it has at least one agent AND (at least one non-done
  task OR at least one event in the feed). No brief text is shown,
  and inactive/empty workspaces are omitted. With the current feed
  that lists ADE, Legacy CMS, and the-delegation; Trevora and
  ZentaCode are omitted until they have a task or an event.
- **Token Usage — Meta Muse Spark 1.3, Standard tier:** rates are
  $1.25/1M input, $4.25/1M output, $0.15/1M cached input (Meta Model
  API, September 2026; see `src/muse/musePricing.ts`). Cost =
  (input/1M)*1.25 + (output/1M)*4.25 + (cached/1M)*0.15. The panel
  shows input, output, cached input, and total cost from the feed
  only — no Gemini price table (the old `PricingModal` is no longer
  opened from Project Info), no simulated totals, no invented counts.
- **Token counts update regularly:** the panel subscribes to the
  Muse store, so totals re-compute on every 10s feed poll (and on
  WebSocket feed updates after the `muse-realtime` branch is
  merged). The publisher accepts `--input-tokens`,
  `--output-tokens`, `--cached-tokens` (integers, never negative),
  stores them on the event, and aggregates `tokenUsage` as the sum
  over the events currently in the feed (max 200). Counts move only
  when Muse publishes them with a milestone event — there is no
  fake auto-counter, no text-length estimation, and no live Muse
  token API. Until a count-bearing event is published, the panel
  honestly shows 0.
- **LOGS panel removed:** the LOGS panel (ACTIVITY / TECHNICAL tabs,
  "AWAITING ACTIONS..." empty state) no longer renders in the main
  view (`src/App.tsx`, code deletion, not CSS hiding).
  `src/interface/ActionLogPanel.tsx` remains on disk but is no
  longer mounted; its only `setLogOpen` callers were internal to
  itself, so no other entry point opens it. Team Flow and
  Project Info are untouched (Kanban was removed separately,
  see below).
- **KANBAN board hidden:** the Kanban board (SCHEDULED / ON HOLD /
  IN PROGRESS / DONE columns) no longer renders in the main view
  (`src/App.tsx`, code deletion, not CSS hiding, including its
  drawer resize bar). `src/interface/KanbanPanel.tsx` remains on
  disk but is no longer mounted, and no other entry point (tab,
  button, menu) opened it. Task data and `museSync` task sync are
  untouched; tasks remain visible via Team Flow, Project Info
  (active projects), and the Inspector.

Also removed (owner order, same batch): the Inspector
"REVIEW REQUESTED / Review the user brief with the team / Chat
about the brief" card and its task-on-hold "Review Task" variant
in `src/interface/InspectorPanel.tsx` — a simulation-only
brief-review flow with no place in a view-only Muse dashboard.
Team Flow and task-detail views are untouched; the
Kanban task-review modal for simulation teams was deliberately
left alone (it is task detail, not the brief card).

## Setup with Muse

For the step-by-step method to build the bridge with Muse — feed
schema, store loader, publisher script, test event, adding a
workspace / subagent / task, verification without a deploy, plus
local run, Coolify deploy, and the branch-only WebSocket path — see
[SETUP.md](SETUP.md). That guide is the bridge method; this README
is the code-level detail behind it.

## Muse-data adapter (VIEW-ONLY — this fork)

Upstream The Delegation runs a Gemini simulation: `AgentBrain` calls
`GeminiProvider`, tasks are proposed/completed by LLM tool calls, and the
BYOK modal collects a Gemini key. **All of that is removed in this fork:**

- `src/core/llm/providers/GeminiProvider.ts` — deleted.
- `src/core/agent/AgentBrain.ts` — replaced with a view-only stub: `think`,
  `spark`, `executeTask`, and `concludeProject` return a view-only message
  and make no LLM call, read no key, and open no key modal.
- `src/interface/BYOKModal.tsx` — replaced with a "View-only — no key
  needed" notice (same props, no key input, no key storage, no link to a
  key-issuing page). The header key button is now a view-only eye badge.
- `vite.config.ts` — the build-time `GEMINI_API_KEY` define was removed, so
  no key can be baked into client JS. `@google/genai` was dropped from
  `package.json` / `package-lock.json`.
- `server.js` — serves the SPA on `PORT` (default 3000), `GET /health`, and
  the read-only feed endpoint below. No POST endpoint exists.

What drives the UI instead — `src/muse/`:

1. **Load order (FAST bridge):** the fresh feed file straight from
   GitHub first
   (`https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json`,
   cache-busting timestamp query, `cache: 'no-store'`), accepted only
   if its `"source"` is `"live"`; then `GET /api/muse-state` (live only);
   then `GET /muse-data.json` (the bundled file, copied into `dist/` at
   build time, labelled from its own source). If none is available,
   the feed is unavailable. Polling every 10s only re-reads
   the feed. There is no write path to Muse by design. Note: the
   view-only Muse data banner component is **hidden by owner request**
   (kept in `src/muse/MuseViewOnlyBanner.tsx` for easy restore), so
   feed status is shown through the Muse team and its tasks, not
   through a banner. See "Fast bridge" below — Coolify deploy is no
   longer on the critical path for feed freshness.
2. **Seed file (initial snapshot, superseded):** `public/muse-data.json`
   started as an explicitly-marked `"source": "seed"` sample. It has
   since been replaced by a **live** feed (see next point): as of the
   2026-10-26 feed snapshot, `source` is `"live"`, with 5 workspaces,
   7 agents (1 main agent + 6 subagents), 8 tasks (7 done, 1 pending),
   and 9 events. Counts change as new events are published — the live
   site, not this paragraph, is the current count.
3. **Live bridge (built, git-based) + fast feed:** see "Live bridge"
   and "Fast bridge" below. A Muse agent publishes milestone events by
   updating `public/muse-data.json` with
   `scripts/publish-muse-event.py`, committing that one file, and
   pushing to `main`. The dashboard now reads that fresh file directly
   from GitHub raw (10s polling), so it shows `"source": "live"`
   without waiting for a Coolify deploy — no POST endpoint, no shared
   secret. Coolify deploy still matters for code changes, not for feed
   data; `GET /api/muse-state` remains as a fallback.

### Feed JSON schema (version 1)

```json
{
  "version": 1,
  "source": "live",
  "sourceLabel": "LIVE — real Muse event feed.",
  "generatedAt": "2026-10-26T16:07:08Z",
  "note": "View-only snapshot. No agent is started, commanded, or approved from this dashboard.",
  "workspaces": [{ "id": "ade", "name": "ADE", "description": "..." }],
  "agents": [{
    "id": "sonia", "name": "S.O.N.I.A", "role": "coordinator",
    "kind": "main-agent", "workspaceId": "the-delegation",
    "status": "idle", "currentTask": null, "lastReport": "..."
  }],
  "tasks": [{
    "id": "legacy-stats-restored", "title": "...", "workspaceId": "legacy-cms",
    "agentId": "legacy-admin", "status": "done",
    "report": "...", "filesChanged": ["..."]
  }],
  "events": [{
    "id": "evt-legacy-stats", "timestamp": "2026-10-26T18:12:00+05:00",
    "type": "done", "workspaceId": "legacy-cms", "agentId": "legacy-admin",
    "taskId": "legacy-stats-restored", "report": "...", "filesChanged": ["..."]
  }]
}
```

- Agent status: `idle | running | done | blocked | pending`.
- Task status: `pending | running | done | blocked`.
- Event type: `started | milestone | file_changed | commit | done | blocked`.
- Timestamps are ISO 8601 strings. `filesChanged` lists file names only,
  never file contents or secrets.

### Dynamic Environment v1 (VIEW-ONLY — real Muse agents change the 3D office)

Roadmap Step 1. The 3D office is **not** modified by a simulation
agent and **not** by a command from the dashboard. A real Muse agent
places or removes a prop by publishing an `env_changed` feed event
(Muse → feed → dashboard), and the scene re-syncs props on every
feed poll. With no props in the feed, the scene is exactly the stock
office + characters.

- **Schema (`src/muse/museTypes.ts`, feed field `environmentProps`):**
  each prop has `id`, `workspaceId`, `agentId` (the Muse agent that
  placed it), `type`, optional `label` (metadata only, not rendered
  as 3D text), `position: {x, y, z}`, optional `rotationY` (degrees),
  and `status: "active" | "removed"`. A `removed` entry is kept so a
  reload does not resurrect the prop. An absent `environmentProps`
  list means "unknown" (old feed) and does not delete placed props;
  an explicitly empty list means "no props".
- **Closed prop types (primitives only):** `desk | chair | plant |
  screen | board | lamp`. Props are built from Three.js primitives
  in `src/simulation/world/MuseEnvironment.ts` — no new GLB files,
  no downloaded models, no AI-generated imagery. Bounds: x/z in
  `[-8, 8]`, y in `[0, 3]`.
- **Publisher:** `scripts/publish-muse-event.py --type env_changed`
  with `--env-prop-id`, `--env-prop-type`, `--env-prop-label`,
  `--env-x/--env-y/--env-z`, `--env-rotation-y`, `--env-status`.
  The workspace and agent must already exist in the feed, and
  positions must stay within bounds (refused otherwise, nothing
  written). See SETUP.md for the full example.
- **Limits:** WebGPU only — the scene is confirmed working on the
  owner's Windows Chrome; headless browsers without WebGPU still
  show a blank panel, which is a browser limitation, not a scene
  bug. Props are primitives/simple builds only in v1.

### Advanced Embodied AI v1 (VIEW-ONLY — real feed status drives 3D characters)

Roadmap Step 2. Upstream "Advanced Embodied AI" is agent reasoning
driving physical 3D actions via an LLM simulation. This fork has no
LLM simulation and no dashboard commands, so the adaptation is
narrower and honest: **the real Muse feed state visibly drives its
3D character's behaviour**. No reasoning text is invented, no agent
"thoughts" are shown, no LLM is called, and nothing is sent back to
Muse. A character's pose/location is a visualisation of its reported
status, like Team Flow is a visualisation of the same feed.

- **Mapping (derived in `src/muse/museEmbodied.ts`, applied in
  `src/simulation/SceneManager.ts` on every 10s feed poll and once
  right after scene init):**

  | Feed state (per agent, first match wins) | Character does |
  |---|---|
  | Any task `blocked`, or agent status `blocked` | Walks to the boardroom, then `listen` (waiting/attentive) pose |
  | Any task `running`, or agent status `running` | Walks to a `sit_work` desk, `sit_work` pose |
  | Everything else (idle / pending / done, no tasks) | Returns to its spawn POI, `idle` pose |

- **Only existing animations/POIs:** `sit_work` desks, boardroom
  area, spawn POIs, `idle`/`listen` poses, existing NavMesh paths.
  No new GLBs, no new animation files, no AI-generated assets.
  The blocked pose is `listen`, not a fake "thinking" bubble.
- **No re-walk churn:** a state is applied only when it changes
  since the last application; re-applying the same state on a poll
  does nothing. The mapping applies only while the Muse team is
  the active team, and only after characters load — a poll that
  arrives earlier retries on the next poll instead of recording
  a state that was never applied.
- **What already existed (not duplicated):** the core-store watcher
  in SceneManager already reacted to core task *changes*
  (in_progress -> desk, on_hold -> boardroom, justDone -> spawn),
  and the driver stays passive while an agent has an
  in_progress/on_hold/scheduled core task. That watcher is left
  untouched; this feed path adds the agent's own feed status
  (never synced to the core store before), the state already true
  at load / on team re-selection, and poll re-application. Both
  paths converge on the same destinations/poses.
- **Limits:** WebGPU only (owner's Windows Chrome confirmed);
  character behaviour cannot be verified headlessly — a blank
  headless panel is a browser limitation, not a scene bug.
  With the current live feed (all agents idle, one pending task),
  every character should show idle/spawn behaviour; a running or
  blocked change appears within ~10s of its feed push (plus the
  walk to the desk/boardroom), not instantly.

### Enhanced Animations v1 (VIEW-ONLY — smoother existing clips, no new assets)

Roadmap Step 3. Upstream "Enhanced Animations" is richer, more
fluid, context-aware animation from a simulation. This fork has no
simulation, so the adaptation is narrower: **the existing baked
clips now transition smoothly and vary by agent, when driven by
the real Muse feed**. No new clip, GLB, facial expression or
speech bubble was added, and no emotion is invented — a blocked
agent still just waits in `listen`, a working agent still just
sits in `sit_work`; only HOW they move between poses changed.

- **Audit (what was there):** 12 baked clips in `character.glb`
  (`Idle, Walk, Talk, Listen, Sit, Sit_Idle, Sit_Work, LookAround,
  Happy, Sad, Pick, Wave`), baked per-bone-frame into a GPU buffer
  with exactly ONE clip index per character instance. Switching
  clips wrote a new index + start time, so every pose change
  snapped instantly to frame 0 of the new clip. There was no
  blend field at all.
- **GPU crossfade (0.35s, smoothstep-eased):** the per-instance
  buffer grew from 8 to 12 floats (`src/simulation/behavior/
  AgentStateBuffer.ts`): a third vec4 stores the outgoing clip
  (index, start time, loop flag, blend duration) and the old
  unused slot stores the blend start time. The vertex shader
  (`src/simulation/entities/CharacterManager.ts`) now samples
  both clips and mixes their bone matrices, easing from the old
  pose to the new one over 0.35s. Replaying the SAME clip never
  blends. When no blend is active the shader runs the old
  single-clip path exactly.
- **Context variation, existing clips only:** looping idle-family
  clips (`Idle`, `Sit_Idle`, `Sit_Work`, `Listen`) start with a
  deterministic per-agent phase offset (`(index + 1) * 0.73s`
  modulo clip duration), so idle, seated-working and waiting
  agents no longer pose in perfect sync. Walk and one-shot clips
  are deliberately unoffset (walk must start with movement,
  one-shots must start at frame 0). No new idle ticker was added:
  idle agents already vary via the existing autonomous driver
  (`look_around` / `wave` / `happy`), and a second ticker would
  fight both that driver and the Embodied AI re-application.
- **Untouched:** the Embodied AI mapping (blocked > working >
  idle), Dynamic Environment prop sync, header branding, MANAGE
  TEAMS removal, LOGS/Kanban hiding, Project Info and token
  pricing all behave exactly as before; only the pose
  transitions between the same states changed.
- **To see it (owner's Chrome only):** after deploy, publish a
  real milestone that flips an agent to `running`, then to done.
  Watch that character: walk -> sit-down -> seated work, and
  later work -> walk -> spawn idle, should now ease between
  poses instead of snapping, and two idle agents standing side
  by side should no longer mirror each other frame-for-frame.
  Smoothness cannot be verified headlessly — a blank headless
  panel is a browser (WebGPU) limitation, not a scene bug.

### Muse hierarchy: main agent + subagents (VIEW-ONLY)

Agents in the feed are Muse's real hierarchy, not generic Delegation
teams, and every task is linked to the agent that did it:

- **Main agent (exactly one):** `S.O.N.I.A`, `kind: "main-agent"`,
  `role: "coordinator"`. She is GLOBAL: she coordinates every workspace
  even though her home `workspaceId` is `the-delegation`. She is never
  duplicated per workspace, because agent ids must stay unique.
- **Subagents (role names only, never fake person names):**
  `ADE Builder` (ade), `Legacy Admin` (legacy-cms),
  `Trevora Builder` (trevora), `ZentaCode Builder` (zentacode),
  `Delegation Builder` + `Delegation Adapter Builder` (the-delegation),
  each with `kind: "subagent"` and exactly one `workspaceId`.
  Trevora/ZentaCode subagents currently have no task in the feed — that
  is honest, not a gap to fill with invented work. No agent is ever
  claimed as `running` in this feed unless a real event just reported
  it running; the current feed uses only `idle` / `done` / `pending`.
- **Tasks:** every task carries `workspaceId` AND `agentId`.
  Coordination tasks done directly by the parent agent link to `sonia`
  (e.g. banner hide); build tasks link to their builder subagent
  (e.g. live bridge and fast bridge to `delegation-builder`, view-only
  adapter to `delegation-adapter-builder`, Legacy work to
  `legacy-admin`). A task must never be published with an `agentId`
  that is not in the feed, or with a workspace that does not match
  where the work happened — the publisher script does not enforce
  this, so the publisher must check it by hand.
- **How the UI shows it (`src/muse/museSync.ts`):** on every feed load,
  the feed is converted to one Delegation team with id `muse`
  (lead agent = S.O.N.I.A, subagents = all subagents, workspace shown
  in each subagent's description) and saved as a custom system, and
  every feed task becomes a core task with id `muse:<taskId>` and
  `assignedAgentId` = that agent's numeric index in the Muse team.
  That is what drives Team Flow (the Muse hierarchy) and the
  Inspector (select a Muse agent to see its tasks). Tasks are
  still synced into the core store, but the Kanban board that
  displayed them was hidden by owner order (see below). The active team is
  switched to `muse` only when the stored selection is still the
  factory default; a user who explicitly picks another team is never
  snapped back by polling, and tasks the user created in the editor
  (non-`muse:` ids) are never touched by the sync. Muse events are
  NOT copied into the simulation ActionLog — that log stays the
  simulation's audit trail. Future bridge events should set
  `agentId` to the subagent that did the work (or `sonia` only for
  main-agent coordination) and `kind`/`workspaceId` accordingly.

### Live bridge (git-based, VIEW-ONLY)

There is deliberately **no POST endpoint and no shared secret** on the
deployed server. The old dashboard's token endpoint would have created a
chicken-and-egg problem (a token generated in Coolify that Muse never
saw). Instead, the bridge is git: the feed file itself is the channel,
and pushing to `main` is the authentication, because only the repo owner
can push.

**How a future Muse agent publishes an event:**

```bash
# From the repo root, after cloning/pulling main:
python3 scripts/publish-muse-event.py \
  --type milestone --workspace ade --agent sonia \
  --task muse-event-bridge --task-status done \
  --report "Short milestone report" \
  --files "path/to/file1,path/to/file2"

# Then commit ONLY that file, and push:
git add public/muse-data.json
git commit -m "Muse event: <short title>"
git push origin main
```

Examples:

```bash
# Agent starts work
python3 scripts/publish-muse-event.py --type started \
  --workspace trevora --agent "Trevora Builder" --agent-status running \
  --task "Homepage rebuild" --task-title "Homepage rebuild" \
  --task-status running --report "Homepage rebuild started"

# Work finishes
python3 scripts/publish-muse-event.py --type done \
  --workspace trevora --agent "Trevora Builder" --agent-status done \
  --task "Homepage rebuild" --task-status done \
  --report "Homepage rebuild deployed and live-verified" \
  --files "src/pages/Home.tsx"

# Work is blocked
python3 scripts/publish-muse-event.py --type blocked \
  --workspace ade --agent sonia --task muse-event-bridge \
  --task-status blocked --report "Blocked: waiting on owner decision"
```

**What to publish:** milestone events only — agent started, milestone
reached, file changed, commit pushed, task done, task blocked. One event
per real milestone, not every keystroke, not every tool call.

**What NOT to publish:** passwords, API keys, tokens, session values,
private chat content, full file contents, or anything that looks like a
secret. The script refuses secret-like arguments (a `key=`/`token=`/
`password=` assignment, or a long token-like string) and writes nothing
in that case. Only metadata: ids, names, statuses, file paths, short
reports. Events are capped at the latest 200.

**Latency, honestly (old path):** before the fast bridge, this was NOT
second-by-second live. The dashboard polled every 30s, but a new event
only appeared after the publisher's commit was pushed AND Coolify
built/deployed it — typically 1–2 minutes for this app. Until that
deploy landed, the dashboard kept showing the previous feed. Never
describe that path as real-time or instant.

### Fast bridge (GitHub raw first, VIEW-ONLY)

The publisher workflow above is unchanged (script + commit + push to
`main`). What changed is what the dashboard reads, in
`src/muse/museStore.ts` (polling every 10s, started in `src/App.tsx`):

1. **First:** `https://raw.githubusercontent.com/SohaibKhaliq/the-delegation/main/public/muse-data.json`
   with a cache-busting `?t=<timestamp>` query and fetch
   `cache: 'no-store'`. Accepted **only** if it is a valid v1 feed
   whose `"source"` is `"live"`. A seed file from GitHub is never
   shown as live — it falls through instead.
2. **Then:** `GET /api/muse-state` (deployed server feed, live only).
3. **Then:** `GET /muse-data.json` (bundled file, labelled from its own
   source — seed unless its `source` is `"live"`).
4. **Otherwise:** "Feed unavailable". A feed is treated as LIVE only
   when its accepted source is `"live"`; seed is never mislabelled
   as live. (The banner that used to display this is hidden — see
   above — so LIVE vs seed is visible in the Muse team/tasks, not
   in a banner.)

**Expected latency, honestly:** push takes ~10s, polling is 10s, so a
new event should typically appear in **~20–30s**. That is a target,
not a guarantee: `raw.githubusercontent.com` may cache a file for a
short time despite the cache-busting query and `no-store`, so an
occasional event may take longer, and a failed GitHub fetch simply
falls back to `/api/muse-state` / the bundled file. Coolify deploy is
no longer on the critical path for feed freshness — it still matters
for code changes, not for feed data.

**No WebSocket on `main` yet — branch exists, not live:** `main` has
no POST endpoint, no shared secret, and no WebSocket. A WebSocket
version is built on the separate branch `muse-realtime`
(`POST /api/muse-events` with Bearer `MUSE_EVENT_TOKEN`, `/ws`
broadcast, fallback to 10s polling), but it is **not merged and not
deployed** as of this README update. Until it is merged and a token
is set in Coolify, no token is needed or accepted, and the git-based
fast bridge above is the live path. See the WebSocket section of
[SETUP.md](SETUP.md) for the merge + token steps. No Gemini was
reintroduced: no `@google/genai`, no `GeminiProvider`, no key, no
commands from the dashboard.

**Why the design is safe:** the dashboard has no write path at all
(no POST, no commands), so viewing it can never start, approve, or
change Muse work. Control stays in Muse chat. The feed is public
sample/live metadata only — if a future event ever needed to stay
private, it must not be published to this repo at all.

### What is still Gemini-adjacent (dormant, no calls)

The dormant model/pricing config files (`src/core/llm/constants.ts`,
`pricing.ts`, `types.ts`) and the design-mode team editor's per-agent model
picker / pricing modal still mention Gemini model names, but they make no
API call: the only code path that instantiated a provider (`AgentBrain`)
no longer does, and the provider file is deleted. Removing those config
screens entirely is a larger UI refactor and is intentionally left for a
later cleanup pass, not hidden. Likewise `uiStore.llmConfig` still holds an
empty default config for type compatibility; nothing reads its `apiKey`.

## Getting Started (this fork)

Live site (no install needed to view): <https://agents.zentacode.com/>
— deployed from `main` via Coolify webhook on every push.

Local run:

1. **Install dependencies:**

```bash
npm ci
```

2. **Run the development server:**

```bash
npm run dev
```

3. **Open the app:** Navigate to the local URL shown in your terminal
   (usually `http://localhost:3000/` — root, not `/the-delegation`;
   the upstream `/the-delegation/` base was changed to `/` for this
   root-domain deployment).

Production-style local run: `npm run build`, then `node server.js`
(serves `dist/` on `PORT`, default 3000; `GET /health` →
`{"status": "ok"}`).

## Features — upstream only (HISTORY, not the current fork)

> The sections below describe what **upstream** The Delegation
> advertised. They are kept here as history of where this fork came
> from. In **this fork** the Gemini simulation, multimodal generation,
> per-agent LLM assignment, cost/token tracking of LLM calls, and
> PR-style approvals do **not** run — Gemini was removed (see
> "Muse-data adapter" above), the dashboard is view-only, and the
> 3D scene does not currently render on the live site. Do not read
> the list below as current fork behaviour.

### Agentic AI System (upstream v0.2.0)

- **Team Editor (React Flow):** Create your own [multi-agent design patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) using an interactive node-based interface.
- **6 Predefined Teams:** Industry-specific templates (Creative Agency, Film Studio, PR Agency, etc.) to get you started.
- **Multimodal Outputs:** Generate professional assets including text, image (Nano Banana), music (Lyria 3), and video (Veo 3.1) directly from your agent teams.
- **Per-Agent LLM:** Assign different [Gemini Models](https://ai.google.dev/gemini-api/docs/models) to specific roles (e.g., Flash for speed, Pro for reasoning).
- **Cost & Token Tracking:** Real-time estimation of usage costs and token consumption for transparency.
- **PR-style Workflows:** Learn about Pull Request and Review workflows where agents with `human-in-the-loop` properties require your approval to proceed.
- **Guardrails:** Controlled generation with the `Auto-approve output` option, ensuring quality before final asset production.
- **Technical Logs:** Improved visibility into raw LLM traces, tool calls, and structured agent responses.

### Embodied Simulation (upstream — not currently working in this fork)

- **Hybrid GPU/CPU Architecture (upstream):** A high-performance **3D simulation** built with **Three.js WebGPU** where autonomous LLM-powered characters collaborate in a shared physical workspace. In this fork the scene code is still present, but the live central panel renders blank — see "What this fork is" above.
- **Intelligent Pathfinding:** NPCs utilize a NavMesh to navigate the office, finding and claiming specific "Points of Interest" (desks, seats, computers) based on their current task. Pathfinding is powered by [three-pathfinding](https://github.com/donmccurdy/three-pathfinding).
- **Dynamic State Machine:** Characters transition naturally between walking, sitting, working, and talking, with sync'ed 3D speech bubbles and expressions.

### Interactive UI (upstream, as adapted by this fork)

- **Team Flow Visualizer:** Node-based view of the Muse agent hierarchy
  (S.O.N.I.A → subagents) when the Muse team is active — this part
  is live in this fork.
- **Simulated PR Reviews (upstream only):** Interactive modals for
  reviewing agent proposals. The Inspector "REVIEW REQUESTED" brief
  card was removed from this fork; the Kanban task-review modal for
  simulation teams was deliberately left, but it is not a Muse
  approval flow.
- **Real-time 3D Overlay (upstream only):** Status indicators projected
  from 3D space — not working in this fork while the 3D scene is blank.
- **Agent Inspector (adapted):** Select a Muse agent to view its
  workspace and linked tasks — not LLM "thoughts", which do not exist
  in this view-only fork.
- **Kanban & Action Logs:** the Kanban board was hidden by owner
  order (code deletion in `src/App.tsx`; `KanbanPanel.tsx` remains
  on disk unmounted, task data untouched, tasks remain visible via
  Team Flow, Project Info, and Inspector); the simulation ActionLog
  is not fed by Muse events (see hierarchy section above), and the
  LOGS panel itself was removed from the main view (see "Project
  Info, Token Usage, and LOGS" above).

## Tech Stack Deep Dive

- **Engine:** [Three.js](https://threejs.org/) (WebGPU & TSL) for advanced rendering and compute.
- **UI:** [React](https://react.dev/) & [React Flow](https://reactflow.dev/) for node-based team visualization.
- **AI (upstream):** [Gemini API](https://deepmind.google/technologies/gemini/) was the core LLM provider upstream, with prompting guides for images (Nano Banana), video (Veo 3.1), and music (Lyria 3). **This fork has no LLM provider:** `GeminiProvider` was deleted and `@google/genai` was dropped. Dormant model/pricing config files still name Gemini models (see "What is still Gemini-adjacent" above) but make no API call.
- **State:** [Zustand](https://github.com/pmndrs/zustand) for a unified, reactive store across the 3D world and React UI.
- **3D Assets:** Custom models and animations rigged in [Blender](https://blender.org), using an instanced animation system.

## Roadmap — upstream (HISTORY, not the fork plan)

The fork's next step is not this list — it is merging the
`muse-realtime` branch and setting its token (see
[SETUP.md](SETUP.md)), plus the dormant-Gemini UI cleanup and the
3D-scene rendering investigation. The list below is upstream's
roadmap, kept for history:

- **World Building**
    - [ ] **Office/3D Space Editor:** Drag-and-drop workspace layout and POI customization.
    - [ ] **Dynamic Environment:** Real-time prop generation and environment modification by agents.
- **Advanced Interactions**
    - [ ] **Advanced Embodied AI:** Deeper integration between agent reasoning and physical 3D world actions.
    - [ ] **Enhanced Animations:** Richer character expressions and more fluid, context-aware animations.
    - [ ] **Human-Agent Spatial Interaction:** Direct collaboration and richer multi-party interactions in the 3D office.
    - [ ] **Inter-Agent Knowledge Sharing:** Long-term memory for agent teams across projects.
- **Refinement**
    - [ ] **Architecture Decoupling:** Further separation of core logic from the simulation environment.
    - [ ] **UX/UI Overhaul (upstream):** Unified CSS styling based on "The Delegation" brand identity. This fork's header branding is S.O.N.I.A / Muse Agents instead.

## Developer Note (upstream history)

Upstream release (**v0.2.0**) was developed entirely using
**Google Antigravity** as the primary IDE and powered by
**Gemini 3 Flash**. This fork's header version label is
**`v0.2.0-muse`** (upstream `package.json` version plus a `-muse`
suffix in the header only).

## History (upstream)

Upstream The Delegation was described as: "A no-code 3D playground
to explore, design, and interact with Agentic AI systems", designed
for "AI enthusiasts, educators, and creative developers looking to
understand multi-agent collaboration in a living 3D office without
writing a single line of code." That was the original product at
<https://github.com/arturitu/the-delegation>. This fork keeps its
code (MIT) and 3D models (CC BY-NC 4.0) under the attribution in
[CREDITS.md](CREDITS.md), but replaces its Gemini simulation with
the view-only Muse adapter described at the top of this README.

## License & IP

This project follows a dual-licensing model:

- **Source Code (MIT):** All logic, shaders, and UI code are free to use, modify, and distribute.
- **3D Models & Assets (CC BY-NC 4.0):** The custom 3D office and character models are Copyright © 2026 **Arturo Paracuellos ([unboring.net](https://unboring.net))**. They are free for personal and educational use but _cannot_ be used for commercial purposes without permission.

Fork attribution: header branding is the owner's (S.O.N.I.A /
Muse Agents, `@sohaibkhaliq`, fork
`SohaibKhaliq/the-delegation`); upstream code/models attribution
is in [CREDITS.md](CREDITS.md) and `public/models/README.txt`.
Upstream was developed by Arturo Paracuellos ([unboring.net](https://unboring.net)).
