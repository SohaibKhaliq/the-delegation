import * as THREE from 'three/webgpu';
import { getAgentSet, getAllAgents, AgenticSystem } from '../data/agents';
import { CharacterController } from './CharacterController';
import { Engine } from './core/Engine';
import { Stage } from './core/Stage';
import { DriverManager } from './drivers/DriverManager';
import { CharacterManager } from './entities/CharacterManager';
import { InputManager } from './input/InputManager';
import { NavMeshManager } from './pathfinding/NavMeshManager';
import { PoiManager } from './world/PoiManager';
import { WorldManager } from './world/WorldManager';
import { MuseEnvironment } from './world/MuseEnvironment';
import { useMuseStore, deriveMuseEmbodiedStates, type MuseEmbodiedState, deriveSpatialSelection, gatherablePeers, MUSE_TEAM_ID, type MuseFeed } from '../muse';

import { AgentSimulation } from './core/AgentSimulation';
import { useCoreStore } from '../integration/store/coreStore';
import { getActiveAgentSet, useTeamStore } from '../integration/store/teamStore';
import { useUiStore } from '../integration/store/uiStore';
import { AgentBehavior, ChatMessage } from '../types';
import { BUBBLE_Y_OFFSET } from './constants';

/**
 * SceneManager — Visual Integration Layer.
 * 
 * DESIGN PRINCIPLE: Visual Reflex of Logic.
 * 1. Subscribes to the Store to Decouple logic from 3D.
 * 2. Visual actions are fire-and-forget.
 * 3. Smart POI assignment ensures NPCs find desks even with diverse GLB names.
 */
export class SceneManager {
  private engine: Engine;
  private stage: Stage;
  private characterManager: CharacterManager;
  private controller: CharacterController | null = null;
  private navMesh: NavMeshManager;
  private poiManager: PoiManager;
  private worldManager: WorldManager;
  // Dynamic Environment v1 (VIEW-ONLY): props placed by real Muse
  // agents through feed events only. Synced from the Muse feed store
  // on every feed poll; never driven by a simulation agent or by a
  // dashboard command. Empty/undefined prop lists leave the stock
  // office + characters untouched (see MuseEnvironment.sync).
  private museEnvironment: MuseEnvironment;
  // Advanced Embodied AI v1 (VIEW-ONLY): last feed-derived embodied
  // state applied per character index. Only changes act — re-applying
  // the same state on every 10s poll must never re-walk a character
  // that is already working/blocked/idle. An entry is recorded ONLY
  // after a successful application (controller present), so a poll
  // that arrives before characters load retries on the next poll.
  private lastMuseEmbodied = new Map<number, MuseEmbodiedState>();
  // Spatial Interaction v1 (VIEW-ONLY): character index of the last
  // 3D selection that already triggered a gathering, so clicking the
  // same agent again does not re-walk peers that already gathered.
  // Cleared on deselection, so a fresh click after deselecting
  // gathers again. This is view state only — it never changes the
  // feed, never queues a command, and never overrides embodied
  // working/blocked placement (see applyMuseSpatialGathering).
  private lastSpatialSelection: number | null = null;
  private driverManager: DriverManager | null = null;
  private simulation: AgentSimulation | null = null;

  private lastAgentSetId: string | null = null;
  private selectedIndex: number | null = null;
  private coreHandler: ((npcIndex: number, text: string) => Promise<string | null>) | null = null;

  private unsubs: (() => void)[] = [];
  private isDisposed = false;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;

  // 3D visibility + init gating: the failing stage of the last init
  // attempt, or null on success. A failed init must never leave a
  // silent grey panel: fatal stages show a message inside the 3D
  // panel itself (see showInitMessage), and setAnimationLoop is only
  // reached on a successful init.
  private initError: string | null = null;
  private initErrorElement: HTMLElement | null = null;

  // Whole-init watchdog support (attempt 2): set ONLY when the
  // animation loop is actually started, i.e. init() has fully
  // succeeded (office, with or without characters). A hanging stage
  // (office/character loadAsync that never settles) never reaches
  // this flag, so App.tsx's independent timer can tell a hang from
  // a success without awaiting any scene promise itself.
  private initSucceeded = false;

  public getInitError(): string | null {
    return this.initError;
  }

  public isInitialized(): boolean {
    return this.initSucceeded;
  }

  private showInitMessage(message: string, fatal: boolean): void {
    if (this.initErrorElement) this.initErrorElement.remove();
    const el = document.createElement('div');
    el.setAttribute('data-scene-init-message', fatal ? 'fatal' : 'warning');
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.padding = '24px';
    el.style.textAlign = 'center';
    el.style.fontSize = '14px';
    el.style.lineHeight = '1.5';
    el.style.color = fatal ? '#3f3f46' : '#71717a';
    el.style.background = fatal ? 'rgba(250, 250, 250, 0.95)' : 'transparent';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '20';
    el.textContent = message;
    this.container.appendChild(el);
    this.initErrorElement = el;
  }

  private failInit(stage: string, detail: string): void {
    this.initError = stage;
    console.error(`[SceneManager] 3D init failed at stage "${stage}": ${detail}`);
    this.showInitMessage(
      `3D unavailable: ${stage} — WebGPU required. Open this site in a WebGPU-capable browser (for example current Chrome on Windows) to see the 3D office.`,
      true,
    );
  }

  private warnCharactersUnavailable(): void {
    console.warn('[SceneManager] Character load failed; running office-only scene.');
    this.showInitMessage(
      '3D characters unavailable — the office is still shown, but agents may not appear. Reload the page to retry.',
      false,
    );
  }

  // onInitialized is called the moment init succeeds, so App.tsx
  // can clear its whole-init watchdog timer on success. It is
  // stored BEFORE this.init() runs (constructor order matters):
  // init() is fire-and-forget and async, but registering the
  // callback first means even a fast success cannot miss it.
  constructor(container: HTMLElement, private onInitialized?: () => void) {
    this.container = container;
    this.engine = new Engine(container);
    this.stage = new Stage(this.engine.renderer.domElement);
    this.characterManager = new CharacterManager(this.stage.scene);
    this.navMesh = new NavMeshManager();
    this.poiManager = new PoiManager();
    this.characterManager.setPoiManager(this.poiManager);
    this.worldManager = new WorldManager(this.stage.scene, this.navMesh, this.poiManager);
    this.museEnvironment = new MuseEnvironment(this.stage.scene);
    this.museEnvironment.sync(useMuseStore.getState().feed.environmentProps);
    // Re-sync props on every feed poll (the store's set() fires on
    // each load, including the 10s polling refresh). This subscription
    // is torn down in dispose() via this.unsubs.
    this.unsubs.push(
      useMuseStore.subscribe((state) => {
        this.museEnvironment.sync(state.feed.environmentProps);
        this.applyMuseEmbodiedState(state.feed);
      }),
    );

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    const activeSet = getActiveAgentSet();
    this.simulation = new AgentSimulation(activeSet);
    this.setCoreHandler((idx, text) => this.simulation!.handleUserMessage(idx, text));
    
    this.init();
    this.startWatchingCoreStore();
  }

  private startWatchingCoreStore() {
    this.unsubs.push(
      useCoreStore.subscribe((state, prevState) => {
        const agentIndices = Array.from(new Set(state.tasks.flatMap(t => [t.assignedAgentId].filter(id => id !== undefined && id !== 0))));

        agentIndices.forEach(id => {
          const myTasks = state.tasks.filter(t => t.assignedAgentId === id);
          const hasChange = myTasks.some(t => {
            const pt = prevState.tasks.find(old => old.id === t.id);
            return !pt || pt.status !== t.status;
          });
          
          if (!hasChange) return;

          const onHold = myTasks.find(t => t.status === 'on_hold');
          const inProgress = myTasks.find(t => t.status === 'in_progress');
          const justDone = myTasks.some(t => t.status === 'done' && !prevState.tasks.find(pt => pt.id === t.id && pt.status === 'done'));

          if (onHold) {
            this.moveNpcToBoardroom(id);
          } else if (inProgress) {
            this.setNpcWorking(id, true);
          } else if (justDone) {
            this.setNpcWorking(id, false);
            this.moveNpcToSpawn(id);
          }
        });
      })
    );
  }

  private async init() {
    try {
      // Stage 1 — WebGPU availability. Without navigator.gpu the
      // renderer can never draw; fail visibly instead of a grey panel.
      if (typeof navigator !== 'undefined' && !('gpu' in navigator)) {
        this.failInit('webgpu', 'navigator.gpu is not available in this browser');
        return;
      }

      // Stage 2 — renderer init. Engine.init() reports 'ok' /
      // 'failed' / 'timeout', and a failed or timed-out init gates
      // everything below: no animation loop is started on a
      // never-drawn canvas. The timeout case is the headless one:
      // the adapter request never settles, so without the timeout
      // this await hung forever and failInit() was never reached,
      // leaving the silent grey panel e930c73 was meant to fix.
      const rendererResult = await this.engine.init();
      if (this.isDisposed) return;
      if (rendererResult !== 'ok') {
        this.failInit(
          'renderer',
          rendererResult === 'timeout'
            ? 'WebGPU renderer init timed out after 15s (adapter request never settled)'
            : 'WebGPU renderer init failed',
        );
        return;
      }

      // Stage 3 — office load. Fatal: without the office there is
      // nothing to draw. WorldManager.load() logs and rethrows, so
      // this catch is where the visible error is shown.
      try {
        await this.worldManager.load();
      } catch (err) {
        console.error('[SceneManager] Office load failed:', err);
        this.failInit('office', 'office model failed to load');
        return;
      }
      if (this.isDisposed) return;

      // Stage 4 — character load. INDEPENDENT and non-fatal: a
      // character failure must not kill the office. CharacterManager
      // already catches its own errors; here we only check the
      // result. On failure, controller/driver setup is skipped (the
      // controller requires a loaded agent-state buffer) and the
      // animation loop below still renders the office on its own —
      // animate() already guards every controller access.
      await this.characterManager.load();
      const charactersOk = this.characterManager.isLoaded;
      if (!charactersOk) this.warnCharactersUnavailable();
      if (this.isDisposed) return;

      if (charactersOk) {
        const state = useUiStore.getState();
        this.characterManager.setInstanceCount(state.instanceCount);
        this.controller = new CharacterController(this.characterManager, this.navMesh, this.poiManager);
        this.driverManager = new DriverManager(this.controller);

        const activeSet = getActiveAgentSet();
        const playerIndex = activeSet.user.index;
        this.driverManager.registerPlayer(playerIndex);

        getAllAgents(activeSet).forEach((agent) => {
          if (agent.index !== playerIndex) this.driverManager!.registerNpc(agent.index, agent);
        });

        new InputManager(
          this.engine.renderer.domElement, this.stage.camera,
          () => this.controller!.getCPUPositions(), () => this.controller!.getCount(),
          (idx) => { if (useUiStore.getState().isChatting) useUiStore.getState().setChatting(false); this.selectedIndex = idx !== activeSet.user.index ? idx : null; useUiStore.getState().setSelectedNpc(this.selectedIndex); this.applyMuseSpatialGathering(this.selectedIndex); },
          (x, z) => this.driverManager?.getPlayerDriver().onFloorClick(x, z),
          (idx, pos) => useUiStore.getState().setHoveredNpc(idx, pos),
          () => this.poiManager.getAllPois(),
          (id, label, pos) => useUiStore.getState().setHoveredPoi(id, label, pos),
          (id) => this.driverManager?.getPlayerDriver().onPoiClick(id),
          this.worldManager.getOffice() ?? undefined, (p) => this.navMesh.isPointOnNavMesh(p)
        );
      }

      // Reached only on a successful init (office, with or without
      // characters). This is the single place the loop is started,
      // and the single place the success flag is set: any stage
      // that hangs (renderer, office load, character load, setup)
      // never reaches here, so the App watchdog can detect it.
      this.initSucceeded = true;
      this.onInitialized?.();
      // Advanced Embodied AI v1: apply the feed state that is
      // already true at load (a change-only core watcher would
      // never fire for it); later polls re-apply via the
      // museStore subscription in the constructor.
      this.applyMuseEmbodiedState(useMuseStore.getState().feed);
      this.engine.renderer.setAnimationLoop(this.animate.bind(this));

    this.unsubs.push(useUiStore.subscribe((s, prev) => {
      if (s.instanceCount !== prev.instanceCount) this.controller?.setInstanceCount(s.instanceCount);
      const team = useTeamStore.getState();
      if (team.selectedAgentSetId !== this.lastAgentSetId) {
        this.lastAgentSetId = team.selectedAgentSetId;
        const set = getAgentSet(team.selectedAgentSetId, team.customSystems);
        this.reinitializeSimulation(set);
        this.worldManager.updateThemeColor(set.color);
        if (this.controller) {
          this.controller.setColors();
          this.controller.warpAllToSpawn(set.user.index, getAllAgents(set).map(a => a.index));
        }
      }
      if ((s.isChatting !== prev.isChatting || s.isThinking !== prev.isThinking || s.isTyping !== prev.isTyping) && this.controller) {
        const set = getActiveAgentSet();
        if (s.isChatting && !prev.isChatting && s.selectedNpcIndex !== null) {
           this._startChatVisuals(s.selectedNpcIndex);
        }
        
        if (s.isChatting && s.selectedNpcIndex !== null) {
          const npc = s.selectedNpcIndex, user = set.user.index;
          if (this.controller.getState(npc) !== 'walk') this.controller.play(npc, s.isThinking ? 'talk' : 'listen');
          this.controller.setSpeaking(npc, s.isThinking);
          if (this.controller.getState(user) !== 'walk') this.controller.play(user, s.isTyping ? 'talk' : 'listen');
          this.controller.setSpeaking(user, s.isTyping);
        } else if (!s.isChatting && prev.isChatting) {
          // Cleanup Chat Visuals
          const npc = prev.selectedNpcIndex;
          const user = set.user.index;
          if (npc !== null) {
            this.driverManager?.getNpcDriver(npc)?.setChatting(false);
            this.controller.setSpeaking(npc, false);
            this.controller.play(npc, 'idle');
            this.controller.poiManager.releaseAll(npc);
          }
          this.controller.setSpeaking(user, false);
          this.controller.play(user, 'idle');
          this.selectedIndex = null;
        }
      }

      // Monitor individual agent status changes for autonomous animations
      if (s.agentStatuses !== prev.agentStatuses && this.controller) {
        Object.keys(s.agentStatuses).forEach(key => {
          const idx = parseInt(key);
          const status = s.agentStatuses[idx];
          const prevStatus = prev.agentStatuses[idx];
          if (status !== prevStatus) {
             if (status === 'talking') this.setNpcTalking(idx, true);
             else if (prevStatus === 'talking') this.setNpcTalking(idx, false);
          }
        });
      }
    }));
    } catch (err) {
      // Catch-all for the setup stages above: an unexpected error
      // during controller/driver setup must also fail visibly and
      // must not leave a loop running on a half-built scene.
      console.error('[SceneManager] 3D init failed at stage "setup":', err);
      this.failInit('setup', 'unexpected error during scene setup');
    }
  }

  private _startChatVisuals(npcIndex: number): void {
    if (!this.controller) return;
    const pos = this.controller.getCPUPositions(); if (!pos) return;
    const set = getActiveAgentSet();
    const npc = new THREE.Vector3(pos[npcIndex * 4], 0, pos[npcIndex * 4 + 2]);
    const player = new THREE.Vector3(pos[set.user.index * 4], 0, pos[set.user.index * 4 + 2]);
    let dir = new THREE.Vector3().subVectors(player, npc).normalize();
    if (dir.length() < 0.01) dir.set(1, 0, 0);
    const target = npc.clone().addScaledVector(dir, 1.2);

    this.selectedIndex = npcIndex;
    this.driverManager?.getNpcDriver(npcIndex)?.setChatting(true);
    this.controller.cancelMovement(npcIndex);
    this.controller.play(npcIndex, 'listen');
    this.controller.getAgentStateBuffer()?.setWaypoint(npcIndex, dir.x, dir.z);
    this.driverManager?.getPlayerDriver()?.walkTo(target, 'listen', () => {
      const p = this.controller!.getCPUPositions()!;
      const fx = p[npcIndex * 4] - p[set.user.index * 4], fz = p[npcIndex * 4 + 2] - p[set.user.index * 4 + 2];
      this.controller!.getAgentStateBuffer()?.setWaypoint(set.user.index, fx, fz);
      this.controller!.getAgentStateBuffer()?.setWaypoint(npcIndex, -fx, -fz);
      this._triggerNpcGreeting(npcIndex);
    });
  }

  public startChat(npcIndex: number): void {
    useUiStore.getState().setChatting(true);
  }


  public async sendMessage(text: string): Promise<void> {
    const { selectedNpcIndex, isThinking } = useUiStore.getState();
    if (selectedNpcIndex === null || isThinking) return;
    useCoreStore.setState((s) => ({
      agentHistories: { ...s.agentHistories, [selectedNpcIndex!]: [...(s.agentHistories[selectedNpcIndex!] || []), { role: 'user', content: text }] }
    }));
    useUiStore.setState({ isThinking: true, isTyping: false });
    try {
      if (this.coreHandler) await this.coreHandler(selectedNpcIndex!, text);
      useUiStore.setState({ isThinking: false });
    } catch (err) {
      console.error('[SceneManager] sendMessage error:', err);
      useUiStore.setState({ isThinking: false });
    }
  }

  private reinitializeSimulation(activeSet: AgenticSystem) {
    if (this.simulation) this.simulation.dispose();
    this.simulation = new AgentSimulation(activeSet);
    this.setCoreHandler((idx, text) => this.simulation!.handleUserMessage(idx, text));
    if (this.driverManager) {
      const playerIndex = activeSet.user.index;
      this.driverManager.dispose();
      this.driverManager.registerPlayer(playerIndex);
      getAllAgents(activeSet).forEach((a) => {
        if (a.index !== playerIndex) this.driverManager!.registerNpc(a.index, a);
      });
    }
  }
  public setCoreHandler(handler: ((npcIndex: number, text: string) => Promise<string | null>) | null): void {
    this.coreHandler = handler;
  }

  public getLeadBrain() {
    if (!this.simulation) return null;
    const set = getActiveAgentSet();
    const lead = this.simulation.getAgent(set.leadAgent.index);
    return lead?.brain || null;
  }

  /** 
   * SMART DESK ASSIGNMENT
   * Attempts to find a work POI. If work-${index} is missing, it picks 
   * a desk from the 'sit_work' group based on the agent's unique index.
   */
  /**
   * Advanced Embodied AI v1 (VIEW-ONLY): apply the feed-derived
   * embodied state for every Muse agent, on every feed poll.
   *
   * Guards, in order: disposed -> skip; no controller yet (office
   * only / characters not loaded) -> skip WITHOUT recording, so a
   * later poll retries; active team is not the Muse team -> skip
   * WITHOUT recording, so switching back to Muse re-applies on the
   * next poll instead of moving another team's characters; state
   * unchanged since last application -> skip (no re-walk).
   *
   * Mapping (existing animations/POIs only):
   *   working -> setNpcWorking: walk to a sit_work desk, sit_work pose.
   *   blocked -> boardroom, then 'listen' (waiting/attentive) pose
   *     on arrival — distinct from idle, and NOT a fake "thinking"
   *     bubble or any LLM text.
   *   idle    -> moveNpcToSpawn: return to spawn, idle pose; the
   *     autonomous driver may then wander as normal idle behaviour.
   * The driver stays passive while an agent has an in_progress /
   * on_hold / scheduled core task, so working/blocked agents are
   * not wandered away; idle agents with only done/no tasks are
   * left to the driver's normal idle behaviour after returning
   * to spawn. No LLM call, no dashboard command, no new assets.
   */
  public applyMuseEmbodiedState(feed: MuseFeed): void {
    if (this.isDisposed || !this.controller) return;
    if (useTeamStore.getState().selectedAgentSetId !== MUSE_TEAM_ID) return;
    const desired = deriveMuseEmbodiedStates(feed);
    desired.forEach((state, index) => {
      if (this.lastMuseEmbodied.get(index) === state) return;
      if (state === 'working') {
        this.setNpcWorking(index, true);
      } else if (state === 'blocked') {
        this.moveNpcToBoardroomWaiting(index);
      } else {
        this.moveNpcToSpawn(index);
      }
      this.lastMuseEmbodied.set(index, state);
    });
  }

  /**
   * Spatial Interaction v1 (VIEW-ONLY, selection-triggered gathering).
   *
   * When the viewer clicks a Muse agent in 3D, idle subagent peers
   * that share the selected agent's workspace walk to the nearest
   * free 'idle'-arrival POIs (area/spawn POIs) around the selected
   * agent, so teammates visibly gather near their shared work area.
   * This is a LOCAL VIEW action only: it changes no feed state,
   * sends nothing to Muse, and queues no command.
   *
   * Precedence, in order: disposed/no controller/non-Muse team ->
   * skip; deselection or user character -> clear the last-selection
   * marker and skip; same agent clicked again -> skip (no re-walk
   * churn); working/blocked peers -> NEVER moved (embodied
   * placement wins, and the next embodied state change on poll
   * re-applies it); main-agent peers -> never moved (the
   * coordinator is not gathered around a subagent). Idle peers
   * walk with the existing crossfade walk -> idle clips; if no
   * free POI or no path exists for a peer, that peer is simply
   * left where it is. Gathering is transient by design: the idle
   * driver may wander a gathered peer away later, and the next
   * embodied state change for that peer wins — re-click the agent
   * to gather again.
   */
  public applyMuseSpatialGathering(selectedIndex: number | null): void {
    if (selectedIndex === null || selectedIndex === 0) {
      this.lastSpatialSelection = null;
      return;
    }
    if (this.isDisposed || !this.controller) return;
    if (useTeamStore.getState().selectedAgentSetId !== MUSE_TEAM_ID) return;
    if (this.lastSpatialSelection === selectedIndex) return;
    const feed = useMuseStore.getState().feed;
    const selection = deriveSpatialSelection(feed, selectedIndex);
    if (!selection) return;
    this.lastSpatialSelection = selectedIndex;
    const embodied = deriveMuseEmbodiedStates(feed);
    const selectedPos = this.controller.getCPUPosition(selectedIndex);
    if (!selectedPos) return;
    for (const peer of gatherablePeers(selection)) {
      if (embodied.get(peer.index) !== 'idle') continue;
      const poi = this.poiManager.getNearestFreePoi('idle', selectedPos);
      if (!poi) continue;
      this.controller.walkToPoi(peer.index, poi.id);
    }
  }

  /** Blocked state: boardroom + 'listen' (waiting) pose on arrival. */
  public moveNpcToBoardroomWaiting(index: number): void {
    if (!this.controller) return;
    const poi = this.poiManager.getPoi('area-boardroom') || this.poiManager.getPoi('boardroom');
    if (poi) {
      const walked = this.controller.walkToPoi(index, poi.id, (i) => {
        if (this.controller && this.controller.getState(i) !== 'walk') this.controller.play(i, 'listen');
      });
      if (!walked && this.controller.getState(index) !== 'walk') this.controller.play(index, 'listen');
    } else if (this.controller.getState(index) !== 'walk') {
      this.controller.play(index, 'listen');
    }
  }

  public setNpcWorking(index: number, working: boolean): void {
    if (!this.controller) return;
    if (working) {
      const id = `sit_work-${index}`;
      let poi = this.poiManager.getPoi(id);
      if (!poi) {
         // Smart fallback: assign a desk based on order (agent index is 1-based)
         const desks = this.poiManager.getPoisByPrefix('sit_work');
         if (desks.length > 0) poi = desks[(index - 1) % desks.length];
      }
      if (poi) this.controller.walkToPoi(index, poi.id);
    }
  }
  
  public setNpcTalking(index: number, talking: boolean): void {
    if (!this.controller) return;
    if (talking) {
      if (this.controller.getState(index) !== 'walk') this.controller.play(index, 'talk');
      this.controller.setSpeaking(index, true);
    } else {
      this.controller.setSpeaking(index, false);
      const task = useCoreStore.getState().tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      this.controller.play(index, task ? 'listen' : 'idle');
    }
  }

  public moveNpcToBoardroom(index: number): void {
    if (!this.controller) return;
    const poi = this.poiManager.getPoi('area-boardroom') || this.poiManager.getPoi('boardroom');
    if (poi) {
      this.controller.walkToPoi(index, poi.id, () => {
        const core = useCoreStore.getState();
        const t = core.tasks.find(t => t.status === 'on_hold' && t.assignedAgentId === index);
      });
    }
  }

  public moveNpcToSpawn(index: number, onArrival?: () => void): void {
    if (!this.controller) return;
    const poi = this.poiManager.getPoi(`spawn-${index}`);
    if (poi) this.controller.moveTo(index, poi.position, 'idle', onArrival, undefined, poi.quaternion);
    else if (onArrival) onArrival();
  }

  private async _triggerNpcGreeting(idx: number): Promise<void> {
    const set = getActiveAgentSet();
    const agent = getAllAgents(set).find(a => a.index === idx);
    if (!agent) return;
    useUiStore.setState({ isThinking: true });
    const msg: ChatMessage = { role: 'assistant', text: `Hello. I am ${agent.name}. How can I assist you?`, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    useUiStore.setState({ chatMessages: [msg], isThinking: false });
  }

  private onResize() { 
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.stage.onResize(w, h);
    if (!useCoreStore.getState().isResizing) this.engine.onResize(w, h);
  }

  private animate() {
    this.engine.timer.update(); const delta = this.engine.timer.getDelta();
    this.stage.update(); this.controller?.update(delta, this.engine.renderer);
    this.controller?.syncFromGPU(this.engine.renderer).then((pos) => {
      if (!pos || !this.controller) return;
      this.controller.updatePaths(pos); this.driverManager?.update(pos, delta);
      this.updateTransparency(pos, delta);
    });
    const player = getActiveAgentSet().user.index;
    this.stage.setFollowTarget(this.controller?.getCPUPosition(this.selectedIndex ?? player) ?? null);
    const { selectedNpcIndex, setSelectedPosition, selectedPosition } = useUiStore.getState();
    const npcScreenPositions: Record<number, { x: number; y: number }> = {};
    const rect = this.container.getBoundingClientRect();
    if (this.controller) {
      for (let i = 0; i < this.controller.getCount(); i++) {
        const p = this.controller.getCPUPosition(i);
        if (p) {
          const s = p.clone(); s.y += BUBBLE_Y_OFFSET; s.project(this.stage.camera);
          npcScreenPositions[i] = { x: (s.x * 0.5 + 0.5) * rect.width, y: (s.y * -0.5 + 0.5) * rect.height };
        }
      }
      useUiStore.setState({ npcScreenPositions });
    }
    if (selectedNpcIndex !== null && npcScreenPositions[selectedNpcIndex]) {
      const p = npcScreenPositions[selectedNpcIndex];
      if (Math.abs(p.x - (selectedPosition?.x ?? 0)) > 0.5 || Math.abs(p.y - (selectedPosition?.y ?? 0)) > 0.5) setSelectedPosition(p);
    } else if (selectedPosition !== null) setSelectedPosition(null);
    this.stage.setChatMode(useUiStore.getState().isChatting, this.controller?.getAgentState(player) === AgentBehavior.GOTO);
    this.engine.render(this.stage.scene, this.stage.camera);
  }

  private updateTransparency(pos: Float32Array, delta: number) {
    if (!this.controller) return;
    const count = this.controller.getCount(), buffer = this.controller.getAgentStateBuffer();
    if (!buffer) return;
    for (let i = 0; i < count; i++) {
      let overlap = false;
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        if ((pos[i * 4] - pos[j * 4]) ** 2 + (pos[i * 4 + 2] - pos[j * 4 + 2]) ** 2 < 0.36) { overlap = true; break; }
      }
      const cur = buffer.getAlpha(i), tar = overlap ? 0.4 : 1.0;
      if (Math.abs(cur - tar) > 0.01) buffer.setAlpha(i, THREE.MathUtils.lerp(cur, tar, Math.min(delta * 2.0, 1.0)));
    }
  }

  public resetScene() {
    if (!this.controller) return;
    useUiStore.getState().setChatting(false);
    const set = getActiveAgentSet();
    getAllAgents(set).forEach((a) => this.controller?.setSpeaking(a.index, false));
    this.controller.warpAllToSpawn(set.user.index, getAllAgents(set).map(a => a.index));
    this.stage.setFollowTarget(null);
    this.stage.setChatMode(false, false);
  }

  public dispose() { this.isDisposed = true; this.resizeObserver.disconnect(); this.unsubs.forEach(u => u()); this.initErrorElement?.remove(); this.initErrorElement = null; this.driverManager?.dispose(); this.engine.dispose(); }
}
