/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useCoreStore } from './integration/store/coreStore';
import { FinalOutputModal } from './interface/FinalOutputModal';
import Header from './interface/Header';
import InspectorPanel from './interface/InspectorPanel';
import { KanbanPanel } from './interface/KanbanPanel';
import { OutputReviewModal } from './interface/OutputReviewModal';
import SimulationView from './interface/SimulationView';
import { SceneContext } from './simulation/SceneContext';
import { SceneManager } from './simulation/SceneManager';
import { useMuseStore, startMusePolling } from './muse/museStore';


const App: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null);
  const { isKanbanOpen, setIsResizing, viewMode } = useCoreStore();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [kanbanHeight, setKanbanHeight] = useState(220);

  // VIEW-ONLY Muse feed: load on mount, refresh by polling the feed only.
  // This never sends a command to Muse; see src/muse/museStore.ts.
  useEffect(() => {
    void useMuseStore.getState().loadMuseData();
    return startMusePolling(10000);
  }, []);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, [setIsResizing]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, [setIsResizing]);

  const resize = useCallback((e: MouseEvent) => {
    if (useCoreStore.getState().isResizing) {
      const windowHeight = window.innerHeight;
      const newHeight = windowHeight - e.clientY;
      const minHeight = windowHeight * 0.2;
      const maxHeight = windowHeight * 0.5;
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setKanbanHeight(newHeight);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

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
              opens it. Team Flow, Kanban and Project Info are untouched. */}

          {/* Center: canvas + kanban drawer stacked */}
          <div className="relative flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-zinc-50">

            {/* Simulation Context - Persistently Mounted */}
            <div
              className="flex-1 flex flex-col min-w-0 min-h-0"
              style={{ visibility: viewMode === 'design' ? 'hidden' : 'visible' }}
            >
              <SimulationView canvasRef={canvasRef} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} />

              {/* Resize Bar */}
              {isKanbanOpen && !isFullscreen && (
                <div
                  className={`h-2 hover:h-2 bg-transparent hover:bg-zinc-200 border-t border-black/5 transition-colors cursor-row-resize z-30 flex items-center justify-center group shrink-0 ${useCoreStore.getState().isResizing ? 'bg-zinc-300' : ''}`}
                  onMouseDown={startResizing}
                >
                  <div className="w-12 h-1 bg-zinc-300 rounded-full group-hover:bg-zinc-400" />
                </div>
              )}

              {isKanbanOpen && !isFullscreen && <KanbanPanel height={kanbanHeight} />}
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

