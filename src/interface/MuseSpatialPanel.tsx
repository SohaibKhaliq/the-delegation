// Spatial Interaction v1 (VIEW-ONLY): the read-only feed panel shown
// in the Inspector when a Muse agent is selected in 3D (or in Team
// Flow). It displays ONLY what the feed already reports: workspace,
// role, status, current task + its status, last milestone report,
// and teammates in the same workspace. It never shows private chat,
// secrets, or simulated conversation, and it has no buttons that
// send anything anywhere — clicking an agent only changes what the
// viewer is looking at. It renders nothing for non-Muse teams, for
// the user character, or when no agent is selected.
import React from 'react';
import { useMuseStore, deriveSpatialSelection, MUSE_TEAM_ID } from '../muse';
import { useTeamStore } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';

const MuseSpatialPanel: React.FC = () => {
  const feed = useMuseStore((s) => s.feed);
  const selectedNpcIndex = useUiStore((s) => s.selectedNpcIndex);
  const selectedAgentSetId = useTeamStore((s) => s.selectedAgentSetId);
  if (selectedAgentSetId !== MUSE_TEAM_ID) return null;
  const selection = deriveSpatialSelection(feed, selectedNpcIndex);
  if (!selection) return null;
  const { agent, workspaceName, currentTask, lastReport, peers } = selection;
  const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return (
    <div className="px-4 py-3 bg-zinc-50/50">
      <div className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
        Muse work — view-only
      </div>
      <div className="mt-2 space-y-1 text-[12px] leading-snug text-zinc-700">
        <div>
          <span className="font-bold text-zinc-900">Workspace: </span>
          {workspaceName}
        </div>
        <div>
          <span className="font-bold text-zinc-900">Role: </span>
          {agent.role} · Status: {cap(agent.status)}
        </div>
        <div>
          <span className="font-bold text-zinc-900">Current task: </span>
          {currentTask ? `${currentTask.title} (${cap(currentTask.status)})` : 'None in this feed'}
        </div>
        {lastReport && (
          <div>
            <span className="font-bold text-zinc-900">Last report: </span>
            {lastReport}
          </div>
        )}
        <div>
          <span className="font-bold text-zinc-900">Same workspace: </span>
          {peers.length > 0
            ? peers.map((p) => `${p.name} (${cap(p.status)})`).join(', ')
            : 'No other agent in this workspace'}
        </div>
      </div>
      <div className="mt-2 text-[10px] leading-snug text-zinc-400">
        Read-only: clicking an agent in 3D only selects it for viewing.
        Idle teammates in this workspace walk to nearby area POIs when
        you click this agent. Nothing here sends anything to Muse.
      </div>
    </div>
  );
};

export default MuseSpatialPanel;
