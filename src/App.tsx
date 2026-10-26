/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useCoreStore } from './integration/store/coreStore';
import { FinalOutputModal } from './interface/FinalOutputModal';
import Header from './interface/Header';
import InspectorPanel from './interface/InspectorPanel';
import { OutputReviewModal } from './interface/OutputReviewModal';
import SimulationView from './interface/SimulationView';
import { SceneContext } from './simulation/SceneContext';
import { SceneManager } from './simulation/SceneManager';
import { useMuseStore, startMusePolling } from './muse/museStore';


const App: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null);
  const { viewMode } = useCoreStore();

  const [isFullscreen, setIsFullscreen] = useState(false);

  // VIEW-ONLY Muse feed: load on mount, refresh by polling the feed only.
  // This never sends a command to Muse; see src/muse/museStore.ts.
  useEffect(() => {
    void useMuseStore.getState().loadMuseData();
    return startMusePolling(10000);
  }, []);

  useEffect(() => {
    if (canvasRef.current && !managerRef.current) {
      const manager = new SceneManager(canvasRef.current);
      managerRef.current = manager;
      setSceneManager(manager);
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
        managerRef.current = null;
        setSceneManager(null);
      }
    };
  }, []);

  return (
    <SceneContext.Provider value={sceneManager}>
      <div className="w-screen h-screen bg-white overflow-hidden flex flex-col">
        {/* Top: Header */}
        {!isFullscreen && <Header />}

        {/* View-only Muse data banner hidden per owner request (component kept in src/muse/MuseViewOnlyBanner.tsx for easy restore) */}

        <div className="flex-1 flex flex-row min-h-0 min-w-0 overflow-hidden">
          {/* LOGS panel removed by owner order (code deletion, not CSS hiding):
              the ACTIVITY / TECHNICAL tabs and "AWAITING ACTIONS..." empty
              state no longer render. ActionLogPanel.tsx remains on disk
              but is no longer mounted anywhere; its only setLogOpen callers
              were internal to that panel itself, so no other entry point
              opens it. Team Flow and Project Info are untouched (Kanban
              was removed separately, see below). */}

          {/* Center: canvas (Kanban drawer removed — see below) */}
          <div className="relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-zinc-50">

            {/* Simulation Context - Persistently Mounted */}
            <div
              className="flex-1 flex flex-col min-w-0 min-h-0"
              style={{ visibility: viewMode === 'design' ? 'hidden' : 'visible' }}
            >
              <SimulationView canvasRef={canvasRef} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} />

              {/* KANBAN board removed by owner order (code deletion, not
                  CSS hiding): the SCHEDULED / ON HOLD / IN PROGRESS /
                  DONE columns no longer render, and their drawer
                  resize bar is gone with them. KanbanPanel.tsx remains
                  on disk but is no longer mounted anywhere, and no
                  other entry point (tab, button, menu) opened it —
                  it was always mounted from here. Task DATA is
                  untouched: museSync still syncs every feed task
                  into the core store, and tasks remain visible via
                  Team Flow (Muse hierarchy), Project Info (active
                  projects), and the Inspector (agent-linked tasks). */}
            </div>
          </div>

          {/* Right: Inspector sidebar */}
          {!isFullscreen && viewMode !== 'design' && <InspectorPanel />}
        </div>

        {/* Design Mode / team editor overlay REMOVED by owner order:
            with the MANAGE TEAMS button gone, the team editor must not
            be reachable — including from a persisted old viewMode in
            localStorage. VisualConfigurator.tsx remains on disk but
            is no longer mounted anywhere. */}

        {/* Final output — fixed viewport overlay */}
        <FinalOutputModal />
        <OutputReviewModal />
      </div>
    </SceneContext.Provider>
  );
};

export default App;

