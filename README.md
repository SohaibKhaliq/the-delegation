<p align="center">
  <img src="public/images/the-delegation.svg" width="256" alt="The Delegation Logo">
</p>

<p align="center">
  <a href="https://arturitu.github.io/the-delegation/"><b>Launch The Delegation · Full Experience *</b></a>
</p>

> [!IMPORTANT]
> **This fork is VIEW-ONLY and does not use Gemini.** There is no API key to
> enter, no simulation to run, and no command channel back to Muse. The
> dashboard displays real Muse agent data through the Muse-data adapter
> below. Agents are controlled from Muse chat only.
<div align="center">
  <img src="public/images/the-delegation-UI.jpg" width="100%" alt="The Delegation Hero">
</div>

<br/>

## What is The Delegation?

# A no-code 3D playground to explore, design, and interact with Agentic AI systems

This project is designed for **AI enthusiasts, educators, and creative developers** looking to understand multi-agent collaboration in a living 3D office without writing a single line of code.

## Branding (owner's header)

The visible header branding is the owner's: logo text "S.O.N.I.A /
Muse Agents", version label `v0.2.0-muse` (upstream `package.json`
version plus a `-muse` suffix applied in the header only, so the
lockfile stays in sync), handle `@sohaibkhaliq`, GitHub link to
`SohaibKhaliq/the-delegation`, and tab title "S.O.N.I.A — Muse
Agents". The "MANAGE TEAMS" button and all functionality are
unchanged. Upstream code/model attribution is NOT removed with the
header handle — see `CREDITS.md` and `public/models/README.txt`
(MIT code; 3D models CC BY-NC 4.0, Arturo Paracuellos).

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
   build time, labelled from its own source). If none is available, the
   banner shows "Feed unavailable". Polling every 10s only re-reads
   the feed. There is no write path to Muse by design. See
   "Fast bridge" below — Coolify deploy is no longer on the critical
   path for feed freshness.
2. **Seed file:** `public/muse-data.json` is explicitly marked
   `"source": "seed"` with a `sourceLabel` saying it is sample data, not a
   live feed. Its workspaces/agents/tasks are shaped from real known work
   (ADE, Legacy CMS, Trevora, ZentaCode; S.O.N.I.A coordinator + builders)
   but must not be presented as live activity until a live bridge replaces it.
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
  "source": "seed",
  "sourceLabel": "SEED / SAMPLE DATA — not a live Muse feed yet.",
  "generatedAt": "2026-10-26T19:19:00+05:00",
  "note": "View-only snapshot. No agent is started, commanded, or approved from this dashboard.",
  "workspaces": [{ "id": "ade", "name": "ADE", "description": "..." }],
  "agents": [{
    "id": "sonia", "name": "S.O.N.I.A", "role": "coordinator",
    "workspaceId": "ade", "status": "idle",
    "currentTask": null, "lastReport": "..."
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
  That is what drives Team Flow (the Muse hierarchy), Kanban (Muse
  tasks in Scheduled / On Hold / In Progress / Done columns) and the
  Inspector (select a Muse agent to see its tasks). The active team is
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
4. **Otherwise:** "Feed unavailable". The banner shows LIVE only when
   the accepted feed's source is `"live"`; seed is never mislabelled
   as live.

**Expected latency, honestly:** push takes ~10s, polling is 10s, so a
new event should typically appear in **~20–30s**. That is a target,
not a guarantee: `raw.githubusercontent.com` may cache a file for a
short time despite the cache-busting query and `no-store`, so an
occasional event may take longer, and a failed GitHub fetch simply
falls back to `/api/muse-state` / the bundled file. Coolify deploy is
no longer on the critical path for feed freshness — it still matters
for code changes, not for feed data.

**Still no WebSocket, still no token:** this step does not add a POST
endpoint, a shared secret, or a WebSocket. A true sub-second push
would need a server write endpoint plus a token both Coolify and Muse
hold without sharing it in chat — that is a further step, deliberately
not in this task. No Gemini was reintroduced: no `@google/genai`, no
`GeminiProvider`, no key, no commands from the dashboard.

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

## Getting Started

1. **Install dependencies:**

```bash
npm install
```

2. **Run the development server:**

```bash
npm run dev
```

3. **Open the app:** Navigate to the local URL shown in your terminal (usually `http://localhost:3000/the-delegation`).

## Features

### Agentic AI System (v0.2.0)

- **Team Editor (React Flow):** Create your own [multi-agent design patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) using an interactive node-based interface.
- **6 Predefined Teams:** Industry-specific templates (Creative Agency, Film Studio, PR Agency, etc.) to get you started.
- **Multimodal Outputs:** Generate professional assets including text, image (Nano Banana), music (Lyria 3), and video (Veo 3.1) directly from your agent teams.
- **Per-Agent LLM:** Assign different [Gemini Models](https://ai.google.dev/gemini-api/docs/models) to specific roles (e.g., Flash for speed, Pro for reasoning).
- **Cost & Token Tracking:** Real-time estimation of usage costs and token consumption for transparency.
- **PR-style Workflows:** Learn about Pull Request and Review workflows where agents with `human-in-the-loop` properties require your approval to proceed.
- **Guardrails:** Controlled generation with the `Auto-approve output` option, ensuring quality before final asset production.
- **Technical Logs:** Improved visibility into raw LLM traces, tool calls, and structured agent responses.

### Embodied Simulation

- **Hybrid GPU/CPU Architecture:** A high-performance **3D simulation** built with **Three.js WebGPU** where autonomous LLM-powered characters collaborate in a shared physical workspace.
- **Intelligent Pathfinding:** NPCs utilize a NavMesh to navigate the office, finding and claiming specific "Points of Interest" (desks, seats, computers) based on their current task. Pathfinding is powered by [three-pathfinding](https://github.com/donmccurdy/three-pathfinding).
- **Dynamic State Machine:** Characters transition naturally between walking, sitting, working, and talking, with sync'ed 3D speech bubbles and expressions.

### Interactive UI

- **Team Flow Visualizer:** Real-time node-based view of your agent hierarchy and task flows.
- **Simulated PR Reviews:** Interactive modals for reviewing agent proposals, providing feedback, and merging tasks.
- **Real-time 3D Overlay:** Status indicators and interaction menus projected from 3D space into a polished UI.
- **Agent Inspector:** Select any agent to view their "thoughts", mission, and history.
- **Kanban & Action Logs:** Complete transparency into the agency's progress and tool-level interactions.

## Tech Stack Deep Dive

- **Engine:** [Three.js](https://threejs.org/) (WebGPU & TSL) for advanced rendering and compute.
- **UI:** [React](https://react.dev/) & [React Flow](https://reactflow.dev/) for node-based team visualization.
- **AI:** [Gemini API](https://deepmind.google/technologies/gemini/) is the core LLM provider. We follow official prompting best practices for:
    - **Images:** [Nano Banana Prompt Guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana)
    - **Video:** [Veo 3.1 Prompt Guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1)
    - **Music:** [Lyria 3 Prompt Guide](https://deepmind.google/models/lyria/prompt-guide/)
- **State:** [Zustand](https://github.com/pmndrs/zustand) for a unified, reactive store across the 3D world and React UI.
- **3D Assets:** Custom models and animations rigged in [Blender](https://blender.org), using an instanced animation system.

## Roadmap

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
    - [ ] **UX/UI Overhaul:** Unified CSS styling based on "The Delegation" brand identity.

## Developer Note

This release (**v0.2.0**) was developed entirely using **Google Antigravity** as the primary IDE and powered by **Gemini 3 Flash**.

## License & IP

This project follows a dual-licensing model:

- **Source Code (MIT):** All logic, shaders, and UI code are free to use, modify, and distribute.
- **3D Models & Assets (CC BY-NC 4.0):** The custom 3D office and character models are Copyright © 2026 **Arturo Paracuellos ([unboring.net](https://unboring.net))**. They are free for personal and educational use but _cannot_ be used for commercial purposes without permission.

Developed with ❤️ by [Arturo Paracuellos](https://unboring.net)
