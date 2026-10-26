
import * as THREE from 'three/webgpu';

// 3D visibility + init timeout: Engine.init() now distinguishes a
// TIMEOUT from a plain failure. Three.js WebGPURenderer.init() awaits
// navigator.gpu.requestAdapter() with NO timeout anywhere in its
// backend init, so in a browser where the adapter request never
// settles (observed headless behaviour: silent grey panel, no error),
// the old await would hang forever and SceneManager.failInit() was
// never reached. Racing init against a timeout makes that hang
// visible instead of silent.
export type EngineInitResult = 'ok' | 'failed' | 'timeout';

// 15 seconds: a healthy WebGPU init (adapter request + device
// creation) on a capable browser finishes in seconds, so this cannot
// false-fire on the owner's Windows Chrome; a headless check that
// waited 30s with no error will now see the error at ~15s instead.
export const RENDERER_INIT_TIMEOUT_MS = 15000;

export class Engine {
  public renderer: THREE.WebGPURenderer;
  public timer: THREE.Timer;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGPURenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);

    // Ensure the canvas is sized by CSS so physical resizing is fluid
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';

    // Use default shadow map (PCF) as VSM support in WebGPU/NodeMaterial can be sensitive
    this.renderer.shadowMap.enabled = true;

    container.appendChild(this.renderer.domElement);
    this.timer = new THREE.Timer();
  }

  // 3D visibility + init gating: init() REPORTS 'ok' / 'failed' /
  // 'timeout' instead of only logging to the console. Callers must
  // gate the animation loop on the return value, so a failed WebGPU
  // init can never leave a silently blank canvas running a loop that
  // draws nothing. 'timeout' means renderer.init() never settled
  // within RENDERER_INIT_TIMEOUT_MS (hanging adapter request). The
  // underlying init promise is consumed by then/catch here, so a
  // late settlement after a timeout cannot become an unhandled
  // rejection; it is simply ignored because no loop is started.
  public async init(): Promise<EngineInitResult> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<EngineInitResult>((resolve) => {
      timeoutId = setTimeout(() => resolve('timeout'), RENDERER_INIT_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        this.renderer.init().then(
          (): EngineInitResult => 'ok',
          (e): EngineInitResult => {
            console.error('WebGPU initialization failed:', e);
            return 'failed';
          },
        ),
        timeout,
      ]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  public onResize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
  }

  public render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer.render(scene, camera);
  }

  public dispose() {
    this.renderer.dispose();
  }
}
