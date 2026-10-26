import { Info, RefreshCcw } from 'lucide-react';
import React, { useState } from 'react';

import { useCoreStore } from '../integration/store/coreStore';
import { useSceneManager } from '../simulation/SceneContext';
import { useMuseStore } from '../muse/museStore';
import {
  MUSE_SPARK_MODEL,
  MUSE_SPARK_INPUT_PER_1M,
  MUSE_SPARK_OUTPUT_PER_1M,
  MUSE_SPARK_CACHED_INPUT_PER_1M,
  museTokenCost,
  sumEventTokens,
} from '../muse/musePricing';
import { USER_COLOR } from '../theme/brand';
import ResetModal from './ResetModal';

export function formatTokens(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toString();
}

// ACTIVE PROJECT definition (documented in README/SETUP):
// A workspace is active when it has at least one agent AND
// (at least one non-done task OR at least one event in the feed).
// Names only are shown — no brief text, no inactive/empty workspaces.
// The main agent (S.O.N.I.A) is a global coordinator whose home workspace
// is 'the-delegation', so that workspace counts its own agents; other
// workspaces count their subagents.
function activeProjectNames(feed: {
  workspaces: Array<{ id: string; name: string }>;
  agents: Array<{ workspaceId: string }>;
  tasks: Array<{ workspaceId: string; status: string }>;
  events: Array<{ workspaceId: string }>;
}): string[] {
  return feed.workspaces
    .filter((w) => {
      const hasAgent = feed.agents.some((a) => a.workspaceId === w.id);
      const hasNonDoneTask = feed.tasks.some(
        (t) => t.workspaceId === w.id && t.status !== 'done',
      );
      const hasEvent = feed.events.some((e) => e.workspaceId === w.id);
      return hasAgent && (hasNonDoneTask || hasEvent);
    })
    .map((w) => w.name);
}

const ProjectView: React.FC = () => {
  const { phase, actionLog, resetProject } = useCoreStore();
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const scene = useSceneManager();

  // Token panel subscribes to the Muse store, so it re-computes on
  // EVERY feed poll (10s) and on any WebSocket feed update (after the
  // muse-realtime branch is merged). Regular updates mean: every time
  // Muse publishes token counts with a milestone event, the totals move
  // on the next poll. There is no fake auto-counter, no text-length
  // estimation, and no live Muse token API — if no counts were
  // published, the totals honestly stay at 0.
  const feed = useMuseStore((s) => s.feed);
  const feedSource = useMuseStore((s) => s.source);
  const activeProjects = activeProjectNames(feed);
  const eventTotals = sumEventTokens(feed.events);
  const hasEventTokens =
    eventTotals.inputTokens > 0 ||
    eventTotals.outputTokens > 0 ||
    eventTotals.cachedInputTokens > 0;
  const totals =
    hasEventTokens || !feed.tokenUsage ? eventTotals : feed.tokenUsage;
  const totalTokens =
    totals.inputTokens + totals.outputTokens + totals.cachedInputTokens;
  const totalCost = museTokenCost(totals);
  const countsPublished = totalTokens > 0;

  const hasLogs = actionLog.length > 0;

  const handleResetConfirm = () => {
    // 1. Reset the 3D scene (teleport agents, clear chat)
    scene?.resetScene();
    // 3. Clear project state
    resetProject();
    setIsResetModalOpen(false);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 bg-white/50">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-black text-darkDelegation leading-tight">Project Info</h2>
          <div className="flex items-center gap-2">
            <div
              className="px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors border border-transparent"
              style={{
                backgroundColor: phase === 'working' ? USER_COLOR : (phase === 'done' ? '#22c55e' : '#f4f4f5'),
                color: phase === 'idle' ? '#a1a1aa' : 'white',
                borderColor: phase === 'idle' ? '#e4e4e7' : 'transparent'
              }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${phase === 'working' ? 'bg-white animate-pulse' : 'bg-white opacity-40'}`} />
              {phase === 'idle' ? 'Ready to Start' : phase}
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-zinc-100 w-full mb-6" />

      {/* Reset Project Button */}
      {hasLogs && (
        <div className="mb-8 w-full">
          <button
            onClick={() => setIsResetModalOpen(true)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-4 rounded-2xl transition-all active:scale-[0.98] group ${phase === 'done'
                ? 'bg-darkDelegation hover:bg-black text-white shadow-xl shadow-darkDelegation/10'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600'
              }`}
          >
            <RefreshCcw size={14} strokeWidth={3} className="transition-transform group-hover:rotate-180 duration-500" />
            <span className="text-[10px] font-black uppercase tracking-widest">Start New Project</span>
          </button>
        </div>
      )}

      {/* Active Projects — names only, from the Muse feed.
          Replaces the old USER BRIEF section (owner order): no brief
          text is shown here, and inactive/empty workspaces are omitted. */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Active Projects</p>
          <div className="h-px flex-1 bg-zinc-100" />
        </div>
        {activeProjects.length > 0 ? (
          <ul className="space-y-2">
            {activeProjects.map((name) => (
              <li
                key={name}
                className="text-xs font-bold text-zinc-700 bg-white/40 px-4 py-3 rounded-xl border border-zinc-100/50"
              >
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-400 italic">No active projects yet.</p>
        )}
      </div>

      {/* Token Usage — Meta Muse Spark 1.3, Standard tier, from the feed.
          No Gemini pricing, no simulated totals, no invented counts. */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Token Usage</p>
            <div className="h-px flex-1 bg-zinc-100" />
          </div>
          <span className="flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg ml-4">
            <span className="text-[10px] font-black uppercase tracking-tight text-emerald-600">
              Total Est. ${totalCost.toFixed(3)}
            </span>
            <Info size={11} className="text-emerald-500" />
          </span>
        </div>

        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100 mb-4">
          <div className="flex flex-col gap-1 mb-6">
            <span className="text-4xl font-mono font-black text-darkDelegation tracking-tighter">
              {formatTokens(totalTokens)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-bold font-mono">
            <span className="text-zinc-700">{formatTokens(totals.inputTokens)} <span className="text-zinc-400 font-medium">input</span></span>
            <span className="text-zinc-300">+</span>
            <span className="text-zinc-700">{formatTokens(totals.outputTokens)} <span className="text-zinc-400 font-medium">output</span></span>
            <span className="text-zinc-300">+</span>
            <span className="text-zinc-700">{formatTokens(totals.cachedInputTokens)} <span className="text-zinc-400 font-medium">cached input</span></span>
          </div>
        </div>

        <p className="text-[10px] font-medium text-zinc-500 leading-relaxed mb-2">
          {MUSE_SPARK_MODEL} — Meta Model API, Standard tier: ${MUSE_SPARK_INPUT_PER_1M.toFixed(2)}/1M input, $
          {MUSE_SPARK_OUTPUT_PER_1M.toFixed(2)}/1M output, ${MUSE_SPARK_CACHED_INPUT_PER_1M.toFixed(2)}/1M cached input.
        </p>
        {!countsPublished && (
          <p className="text-[10px] font-medium text-zinc-400 leading-relaxed">
            Token counts come from all Muse chats via the token observer (see README/SETUP) and are not yet
            published, so totals stay at 0 until the observer runs. Input is per-turn context tokens as recorded
            in muse.db; the cached breakdown is unknown, so cached is shown as 0. The price is an estimate at
            Muse Spark 1.3 Standard rates, not a bill. Counts refresh automatically on every feed poll
            {feedSource === 'live' ? ' (live feed)' : ''}.
          </p>
        )}
        {countsPublished && (
          <p className="text-[10px] font-medium text-zinc-400 leading-relaxed">
            Totals are the cumulative counts from all Muse chats via the token observer, refreshed on every
            feed poll. Input is per-turn context tokens as recorded in muse.db; the cached breakdown is
            unknown, so cached is shown as 0. The price is an estimate at Muse Spark 1.3 Standard rates,
            not a bill.
          </p>
        )}
      </div>

      <ResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleResetConfirm}
      />
    </div>
  );
};

export default ProjectView;
