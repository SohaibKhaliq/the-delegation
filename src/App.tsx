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
import { useMuseStore, startMusePolling } from './muse';


// Whole-init watchdog (attempt 2): 25s after SceneManager
// construction, if the scene has neither succeeded nor already
// shown a stage error, show the fatal in-panel message. 25s is
// deliberate: the renderer timeout is 15s and a healthy WebGPU init
// + office/character load finishes in seconds on the owner's
// Windows Chrome, so this cannot false-fire there — and a headless
// check that waits 30s will see the message at ~25s instead of
// silence. The timer is a plain setTimeout in App: it does NOT
// await any SceneManager promise, so a never-settling await in
// init() (office/character loadAsync, see SceneManager) cannot
// block it the way it blocked every earlier, await-based error
// path. It is cleared on successful init (via the SceneManager
// onInitialized callback) and on unmount/dispose.
export const SCENE_INIT_WATCHDOG_MS = 25000;

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
    let watchdogId: ReturnType<typeof setTimeout> | undefined;
    const clearWatchdog = () => {
      if (watchdogId !== undefined) {
        clearTimeout(watchdogId);
        watchdogId = undefined;
      }
    };
    // Single builder for the fatal in-panel message, shared by the
    // constructor catch and the watchdog so both show identical
    // styling/text (stage 'scene').
    const showSceneUnavailable = (container: HTMLElement) => {
      if (container.querySelector('[data-scene-init-message="fatal"]')) return;
      const el = document.createElement('div');
      el.setAttribute('data-scene-init-message', 'fatal');
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.padding = '24px';
      el.style.textAlign = 'center';
      el.style.fontSize = '14px';
      el.style.lineHeight = '1.5';
      el.style.color = '#3f3f46';
      el.style.background = 'rgba(250, 250, 250, 0.95)';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '20';
      el.textContent =
        '3D unavailable: scene — WebGPU required. Open this site in a WebGPU-capable browser (for example current Chrome on Windows) to see the 3D office.';
      container.appendChild(el);
    };
    if (canvasRef.current && !managerRef.current) {
      // 3D visibility: the SceneManager constructor runs substantial
      // code BEFORE init() is reached (WebGPURenderer construction,
      // Stage, AgentSimulation). Any throw there bypassed all of the
      // init gating, because there was no try/catch here — the panel
      // stayed silently grey and no overlay was ever created. Guard
      // construction with the same visible in-panel message so a
      // constructor failure also fails visibly, not silently.
      try {
        const manager = new SceneManager(canvasRef.current, clearWatchdog);
        managerRef.current = manager;
        setSceneManager(manager);
        // Whole-init watchdog (attempt 2): independent of every
        // await inside SceneManager.init(). Belt-and-braces guards
        // at fire time, in order: (1) success flag — never fires
        // on the owner's Chrome, even if the onInitialized clear
        // were somehow missed; (2) an existing stage error
        // (renderer/office/setup) — that overlay is already
        // visible, do not duplicate it; (3) an existing fatal
        // overlay in the container, for the same reason. Only if
        // none of those is true — i.e. init is still hanging
        // somewhere with no error path — show 'scene'.
        watchdogId = setTimeout(() => {
          if (manager.isInitialized()) return;
          if (manager.getInitError()) return;
          const container = canvasRef.current;
          if (!container) return;
          console.error(
            '[App] 3D scene init watchdog: no success and no stage error after ' +
              `${SCENE_INIT_WATCHDOG_MS}ms — init is hanging (renderer, office load, character load, or setup), showing visible error.`,
          );
          showSceneUnavailable(container);
        }, SCENE_INIT_WATCHDOG_MS);
      } catch (err) {
        console.error('[App] 3D scene failed to construct:', err);
        showSceneUnavailable(canvasRef.current);
      }
    }

    return () => {
      clearWatchdog();
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

