// VIEW-ONLY banner for real Muse data.
//
// This is a display panel only. It contains no input, no button that starts
// an agent, approves output, or sends a command, and no API key field.
// Agent control stays in Muse chat; this dashboard only shows what Muse
// reports through the feed (see src/muse/museStore.ts).
import React from 'react';
import { useMuseStore } from './museStore';

const STATUS_COLOR: Record<string, string> = {
  idle: '#71717a',
  running: '#16a34a',
  done: '#52525b',
  blocked: '#dc2626',
  pending: '#d97706',
};

const MuseViewOnlyBanner: React.FC = () => {
  const { feed, source, lastUpdated } = useMuseStore();

  const sourceText =
    source === 'live'
      ? 'LIVE Muse feed'
      : source === 'seed'
        ? 'SEED / SAMPLE DATA — not live yet'
        : 'Feed unavailable';

  const done = feed.tasks.filter((t) => t.status === 'done').length;
  const running = feed.tasks.filter((t) => t.status === 'running').length;
  const pending = feed.tasks.filter((t) => t.status === 'pending').length;
  const blocked = feed.tasks.filter((t) => t.status === 'blocked').length;

  return (
    <div className="shrink-0 border-b border-zinc-100 bg-amber-50 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[11px] font-black uppercase tracking-wider text-zinc-800">
          View-only — real Muse data
        </span>
        <span className="text-[11px] font-bold text-zinc-600">{sourceText}</span>
        <span className="text-[11px] text-zinc-500">
          {feed.workspaces.length} workspaces · {feed.agents.length} agents ·{' '}
          {feed.tasks.length} tasks ({done} done · {running} running · {pending} pending ·{' '}
          {blocked} blocked)
        </span>
        {lastUpdated && (
          <span className="text-[11px] text-zinc-400">Updated {lastUpdated}</span>
        )}
      </div>
      {feed.sourceLabel && (
        <p className="mt-1 text-[11px] text-zinc-500">{feed.sourceLabel}</p>
      )}
      {feed.workspaces.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-4">
          {feed.workspaces.map((ws) => {
            const agents = feed.agents.filter((a) => a.workspaceId === ws.id);
            return (
              <div key={ws.id} className="text-[11px] text-zinc-600">
                <span className="font-bold text-zinc-800">{ws.name}</span>
                <span className="text-zinc-500"> — {agents.length} agent(s)</span>
                {agents.map((a) => (
                  <span key={a.id} className="ml-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: STATUS_COLOR[a.status] || '#71717a' }}
                    />{' '}
                    {a.name} ({a.status}
                    {a.currentTask ? ` · ${a.currentTask}` : ''})
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {feed.events.length > 0 && (
        <p className="mt-2 text-[11px] text-zinc-500">
          Latest: {feed.events[feed.events.length - 1]?.report || '—'}
        </p>
      )}
      <p className="mt-1 text-[11px] text-zinc-400">
        No Gemini, no key, no commands from here. Agents are controlled from Muse chat only.
      </p>
    </div>
  );
};

export default MuseViewOnlyBanner;
