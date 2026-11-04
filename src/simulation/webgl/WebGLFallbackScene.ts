// WebGL fallback scene (VIEW-ONLY, v1) — the phone path.
//
// Purpose: the main simulation is WebGPU-only (three/webgpu, GPU
// compute instancing). On browsers where WebGPU is unavailable
// or its init fails/times out — most phones today — that scene
// can never draw, so agents never appear in 3D. This class is a
// separate, deliberately simpler scene using the standard
// three WebGLRenderer + GLTFLoader. It loads the SAME existing
// model files (public/models/office.glb, public/models/character.glb)
// — it does not copy, modify, or re-license them; attribution
// stays in CREDITS.md — and places one character per real Muse
// feed agent at its derived spawn/desk/boardroom position, playing
// a baked animation clip via THREE.AnimationMixer with a simple
// fade. It reads the feed store only (subscribe + getState);
// it never writes the feed, never starts an agent, never calls
// an LLM, and never queues a command.
//
// Honest v1 limits (do not claim otherwise):
//   - No NavMesh walking: characters are placed directly, they
//     do not walk to desks or gather around a clicked agent.
//   - No GPU crossfade blending: clips crossfade with a plain
//     AnimationMixer fade (0.3s), no per-agent idle phase offsets.
//   - No Dynamic Environment props, no spatial click panel, no
//     chat visuals: clicking a character does nothing in v1.
//     Team Flow / Project Info / Inspector panels are untouched
//     and remain the source for agent detail.
//   - Characters share the same model; a small coloured disc
//     under each character (palette by feed order) is the only
//     per-agent distinction in v1.
// Touch: OrbitControls with one-finger rotate, two-finger
// dolly/pan, so the office can be orbited on a phone.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { useMuseStore } from '../../muse/museStore';
import type { MuseFeed } from '../../muse/museTypes';
import { deriveWebGLPlacements, WEBGL_AGENT_PALETTE, type WebGLPlacement } from './webglFallbackTypes';

interface PlacedCharacter {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  clip: string;
  position: { x: number; y: number; z: number };
}

export class WebGLFallbackScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private resizeObserver: ResizeObserver;
  private unsubscribe: (() => void) | null = null;
  private characters = new Map<string, PlacedCharacter>();
  private characterTemplate: THREE.Group | null = null;
  private characterClips: THREE.AnimationClip[] = [];
  private officeLoaded = false;
  private disposed = false;
  private ready = false;

  constructor(
    container: HTMLElement,
    private onReady: () => void,
    private onFailed: (reason: string) => void,
  ) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight, false);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.zIndex = '10';
    this.renderer.domElement.setAttribute('data-webgl-fallback', 'true');
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f5f4);
    this.camera = new THREE.PerspectiveCamera(
      45,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      500,
    );
    this.camera.position.set(9, 8, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.5, 0);
    this.controls.minDistance = 3;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    // Touch: one finger rotates, two fingers dolly/pan (defaults).
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    const hemi = new THREE.HemisphereLight(0xffffff, 0x9ca3af, 1.2);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(10, 20, 10);
    this.scene.add(dir);

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.renderer.setAnimationLoop(() => this.animate());
    void this.load();
    // Read-only feed subscription: re-place characters when the
    // 10s poll (or WebSocket) delivers a new feed. Statuses that
    // did not change keep their character and clip untouched.
    this.unsubscribe = useMuseStore.subscribe((state) => {
      if (!this.disposed) this.syncFeed(state.feed);
    });
  }

  public isReady(): boolean {
    return this.ready;
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private async load(): Promise<void> {
    try {
      const draco = new DRACOLoader();
      draco.setDecoderPath('/vendor/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      // Both GLBs require Draco (KHR_draco_mesh_compression); the
      // decoder files are the ones already shipped in public/.
      const [office, character] = await Promise.all([
        loader.loadAsync('/models/office.glb'),
        loader.loadAsync('/models/character.glb'),
      ]);
      if (this.disposed) return;
      office.scene.traverse((obj) => {
        // The navMesh is pathfinding data, not visible geometry.
        if (obj.name === 'navMesh') obj.visible = false;
      });
      this.scene.add(office.scene);
      this.officeLoaded = true;
      this.characterTemplate = character.scene as THREE.Group;
      this.characterClips = character.animations || [];
      this.syncFeed(useMuseStore.getState().feed);
      this.ready = true;
      this.onReady();
    } catch (err) {
      console.error('[WebGLFallbackScene] Failed to load models:', err);
      this.onFailed(err instanceof Error ? err.message : 'model load failed');
    }
  }

  private clipFor(name: string): THREE.AnimationClip | undefined {
    return this.characterClips.find((c) => c.name === name);
  }

  private placeCharacter(placement: WebGLPlacement, index: number): void {
    if (!this.characterTemplate) return;
    const group = SkeletonUtils.clone(this.characterTemplate) as THREE.Group;
    group.position.set(placement.position.x, placement.position.y, placement.position.z);
    // Face the office centre (y kept flat so characters stay upright).
    group.lookAt(0, placement.position.y, 0);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.38, 24),
      new THREE.MeshBasicMaterial({ color: WEBGL_AGENT_PALETTE[index % WEBGL_AGENT_PALETTE.length] }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.02;
    group.add(disc);
    this.scene.add(group);
    const mixer = new THREE.AnimationMixer(group);
    const clip = this.clipFor(placement.clip);
    if (clip) {
      const action = mixer.clipAction(clip);
      action.fadeIn(0.3);
      action.play();
    }
    this.characters.set(placement.agentId, {
      group,
      mixer,
      clip: placement.clip,
      position: placement.position,
    });
  }

  public syncFeed(feed: MuseFeed): void {
    if (!this.officeLoaded || !this.characterTemplate || this.disposed) return;
    const placements = deriveWebGLPlacements(feed);
    const wanted = new Set(placements.map((p) => p.agentId));
    for (const [agentId, placed] of Array.from(this.characters.entries())) {
      if (!wanted.has(agentId)) {
        this.scene.remove(placed.group);
        placed.mixer.stopAllAction();
        this.characters.delete(agentId);
      }
    }
    placements.forEach((placement, index) => {
      const existing = this.characters.get(placement.agentId);
      if (!existing) {
        this.placeCharacter(placement, index);
        return;
      }
      const moved =
        existing.position.x !== placement.position.x ||
        existing.position.y !== placement.position.y ||
        existing.position.z !== placement.position.z;
      if (moved) {
        existing.group.position.set(placement.position.x, placement.position.y, placement.position.z);
        existing.group.lookAt(0, placement.position.y, 0);
        existing.position = placement.position;
      }
      if (existing.clip !== placement.clip) {
        const next = this.clipFor(placement.clip);
        if (next) {
          existing.mixer.stopAllAction();
          const action = existing.mixer.clipAction(next);
          action.fadeIn(0.3);
          action.play();
          existing.clip = placement.clip;
        }
      }
    });
  }

  private animate(): void {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), 0.05);
    for (const placed of this.characters.values()) placed.mixer.update(delta);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.resizeObserver.disconnect();
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    for (const placed of this.characters.values()) placed.mixer.stopAllAction();
    this.characters.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
