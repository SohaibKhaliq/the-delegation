
import * as THREE from 'three/webgpu';

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

  // 3D visibility + init gating: init() now REPORTS success/failure
  // instead of only logging to the console. Callers must gate the
  // animation loop on the return value, so a failed WebGPU init can
  // never leave a silently blank canvas running a loop that draws
  // nothing. Returns true only when the WebGPU renderer initialized.
  public async init(): Promise<boolean> {
    try {
      await this.renderer.init();
      return true;
    } catch (e) {
      console.error("WebGPU initialization failed:", e);
      return false;
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
