// Muse adapter surface — Architecture Decoupling (single boundary).
//
// Everything outside src/muse/ (simulation, interface, App) MUST reach
// real Muse feed data ONLY through this barrel. Do not import deep
// paths (museStore, museSync, museSpatial, ...) from outside src/muse/,
// do not import the feed JSON (public/muse-data.json) from anywhere in
// src/, and do not import publisher scripts (scripts/*.py) from src/.
//
// What lives where:
//   src/muse/            — feed loading (museStore, 10s polling), feed
//                          types (museTypes), the feed -> core-team
//                          adapter (museSync — the ONLY module that
//                          writes Muse data into the upstream core
//                          stores), and pure derivations over a feed
//                          (museEmbodied, museSpatial, musePricing).
//                          No simulation, rendering, or UI code lives
//                          here; derivations take a feed and return
//                          plain data, never scene objects.
//   src/simulation/    — 3D scene, characters, NavMesh, POIs. It reads
//                          feed-derived data via this barrel and
//                          applies it to characters/props. It never
//                          parses feed JSON itself.
//   src/interface/     — panels and header. They read feed-derived
//                          data via this barrel (store hooks and
//                          derivations) and render it read-only.
//   scripts/           — feed PUBLISHERS (git bridge, token observer).
//                          They run outside the browser bundle and
//                          are the only writers of public/muse-data.json.
//   server.js          — read-only GET /api/muse-state on main (plus
//                          the WebSocket ingest POST after the
//                          muse-realtime merge). It never renders UI.
//
// Shared by design (documented, not forced apart): museSync imports
// the upstream core stores (integration/store/coreStore, teamStore)
// and upstream team types (data/agents) — that import IS the adapter.
// Moving it would not clarify anything; the boundary is that no
// other src/muse/ module touches core stores, and no outside module
// touches the feed except through this barrel.

export { useMuseStore, startMusePolling } from './museStore';
export {
  MUSE_TEAM_ID,
  museAgentIndexMap,
  buildMuseSystem,
  syncMuseToCore,
} from './museSync';
export {
  deriveMuseEmbodiedStates,
  type MuseEmbodiedState,
} from './museEmbodied';
export {
  deriveSpatialSelection,
  currentTaskForAgent,
  gatherablePeers,
  type MuseSpatialPeer,
  type MuseSpatialSelection,
} from './museSpatial';
export {
  MUSE_SPARK_MODEL,
  MUSE_SPARK_TIER,
  MUSE_SPARK_INPUT_PER_1M,
  MUSE_SPARK_OUTPUT_PER_1M,
  MUSE_SPARK_CACHED_INPUT_PER_1M,
  museTokenCost,
  sumEventTokens,
} from './musePricing';
export type {
  MuseFeed,
  MuseFeedSource,
  MuseWorkspace,
  MuseAgent,
  MuseAgentKind,
  MuseAgentStatus,
  MuseTask,
  MuseTaskStatus,
  MuseEvent,
  MuseEventType,
  MuseTokenUsage,
  MuseEnvProp,
  MuseEnvPropType,
} from './museTypes';
