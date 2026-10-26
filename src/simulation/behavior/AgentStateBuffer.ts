import { storage } from 'three/tsl';
import * as THREE from 'three/webgpu';
import { AgentBehavior } from '../../types';

/**
 * CPU/GPU buffer that stores per-instance physics mode and animation state.
 *
 * Each instance maps to three vec4s (12 floats total) per instance.
 *
 * Buffer 0 (vec4):
 *   .x = waypoint X  (used when mode == GOTO)
 *   .y = animation   (animation index to play)
 *   .z = waypoint Z  (used when mode == GOTO)
 *   .w = mode        (0 = IDLE, 1 = GOTO, 2 = SEATED)
 *
 * Buffer 1 (vec4):
 *   .x = startTime   (global time when animation started)
 *   .y = loopMode    (1.0 = loop, 0.0 = clamp)
 *   .z = alpha       (1.0 = opaque, <1.0 = transparent)
 *   .w = blendStart  (global time the current crossfade started; see below)
 *
 * Buffer 2 (vec4) — Enhanced Animations v1 (crossfade):
 *   .x = prevAnim       (animation index the current clip is blending FROM)
 *   .y = prevStartTime  (global time the previous clip started)
 *   .z = prevLoopMode   (1.0 = loop, 0.0 = clamp, for the previous clip)
 *   .w = blendDuration  (seconds; 0 = no blend, use the current clip only)
 *
 * Crossfade rule: when setAnimation() switches to a DIFFERENT clip, it
 * stores the outgoing clip in Buffer 2 and stamps blendStart/blendDuration.
 * The vertex shader then samples both clips and mixes their bone matrices
 * with a smoothstep-eased weight over blendDuration (default 0.35s).
 * Replaying the SAME clip never blends — it just restarts that clip.
 * This is what makes walk->sit, idle->working, working->spawn and every
 * other pose change look like a transition instead of a snap, using
 * only the already-baked clips. No new animation files, no new GLBs.
 *
 * CPU writes metadata, GPU shader reads them.
 */
export class AgentStateBuffer {
  /** Default crossfade duration in seconds (Enhanced Animations v1). */
  public static readonly BLEND_SECONDS = 0.35;

  /** Raw Float32Array (12 floats per instance). */
  public readonly array: Float32Array;

  /** GPU buffer attribute. */
  public readonly attribute: THREE.StorageInstancedBufferAttribute;

  /** TSL storage node. */
  public readonly storageNode: any;

  constructor(private readonly count: number) {
    this.array = new Float32Array(count * 12);
    // Initialize alpha to 1.0 (opaque)
    for (let i = 0; i < count; i++) {
      this.array[i * 12 + 6] = 1.0;
    }
    this.attribute = new THREE.StorageInstancedBufferAttribute(this.array, 12);
    this.storageNode = storage(this.attribute, 'vec4', count * 3);
  }

  // ── Mode/State ───────────────────────────────────────────────

  public getState(index: number): number {
    return this.array[index * 12 + 3];
  }

  public setState(index: number, state: number): void {
    this.array[index * 12 + 3] = state;
    this.attribute.needsUpdate = true;
  }

  // ── Animation ────────────────────────────────────────────────

  public getAnimation(index: number): number {
    return this.array[index * 12 + 1];
  }

  public setAnimation(index: number, animIndex: number, loop: boolean = true, startTime: number = 0): void {
    const base = index * 12;
    // Only blend when the clip actually changes. Same-clip replays
    // (e.g. play('idle') while already idle) restart the clip with
    // no blend, so they never smear the pose for no reason.
    if (this.array[base + 1] !== animIndex) {
      this.array[base + 8] = this.array[base + 1]; // prevAnim
      this.array[base + 9] = this.array[base + 4]; // prevStartTime
      this.array[base + 10] = this.array[base + 5]; // prevLoopMode
      this.array[base + 11] = AgentStateBuffer.BLEND_SECONDS;
      this.array[base + 7] = startTime; // blendStart
    } else {
      this.array[base + 11] = 0; // no blend
    }
    this.array[base + 1] = animIndex;
    this.array[base + 4] = startTime;
    this.array[base + 5] = loop ? 1.0 : 0.0;
    this.attribute.needsUpdate = true;
  }

  // ── Transparency ─────────────────────────────────────────────

  public setAlpha(index: number, alpha: number): void {
    this.array[index * 12 + 6] = alpha;
    this.attribute.needsUpdate = true;
  }

  public getAlpha(index: number): number {
    return this.array[index * 12 + 6];
  }

  // ── Waypoint / Orientation ──────────────────────────────────

  public setWaypoint(index: number, x: number, z: number): void {
    this.array[index * 12 + 0] = x;
    this.array[index * 12 + 2] = z;
    this.attribute.needsUpdate = true;
  }

  /** Used when mode is IDLE to force a specific facing direction. */
  public setFacing(index: number, x: number, z: number): void {
    this.array[index * 12 + 0] = x;
    this.array[index * 12 + 2] = z;
    this.attribute.needsUpdate = true;
  }

  public getWaypoint(index: number): { x: number; z: number } {
    return {
      x: this.array[index * 12 + 0],
      z: this.array[index * 12 + 2],
    };
  }

  // ── Bulk helpers ─────────────────────────────────────────────

  /** Set all NPC states (skips index 0 = player). */
  public resetAllNPCsToState(state: AgentBehavior, startIndex = 1): void {
    for (let i = startIndex; i < this.count; i++) {
      this.array[i * 12 + 3] = state;
    }
    this.attribute.needsUpdate = true;
  }
}
