// MuseEnvironment — Dynamic Environment v1 (VIEW-ONLY).
//
// Props in the 3D office are placed by REAL Muse agents through feed
// events only (Muse -> public/muse-data.json -> this scene). No
// simulation agent generates props on its own, no dashboard command
// places a prop, and no LLM is called here. The scene subscribes to
// the Muse feed store (see SceneManager) and re-syncs on every feed
// poll, exactly like token totals re-compute on every poll.
//
// Props are built from Three.js primitives only (boxes, cylinders,
// spheres) with MeshStandardNodeMaterial, matching the office's
// WebGPU material path. No new GLB files, no downloaded models, no
// AI-generated imagery. `label` is metadata only in v1 — it is stored
// on the group but NOT rendered as 3D text (no font loading in v1).
//
// Bounds (metres, office floor): x/z in [-8, 8], y in [0, 3]. The
// publisher enforces these; this class clamps defensively as well.
// An `undefined` props list means "unknown" (old feed without the key)
// and must NOT delete already-placed props. An explicitly empty list
// means "no props": all prop groups are removed and the scene is
// exactly the stock office + characters.
import * as THREE from 'three/webgpu';
import type { MuseEnvProp } from '../../muse/museTypes';

export const MUSE_ENV_BOUNDS = { x: 8, y: 3, z: 8 } as const;

function mat(color: number): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 1, metalness: 0.1 });
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(
  rTop: number,
  rBottom: number,
  h: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, 16), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function sphere(r: number, color: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Build one prop group, centred on its position (origin on the floor). */
function buildProp(prop: MuseEnvProp): THREE.Group {
  const group = new THREE.Group();
  switch (prop.type) {
    case 'desk':
      group.add(box(1.4, 0.08, 0.8, 0x6b4f2e, 0, 0.74, 0));
      for (const [lx, lz] of [[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]] as const) {
        group.add(box(0.06, 0.72, 0.06, 0x4a3520, lx, 0.36, lz));
      }
      break;
    case 'chair':
      group.add(box(0.5, 0.06, 0.5, 0x374151, 0, 0.45, 0));
      group.add(box(0.5, 0.55, 0.06, 0x374151, 0, 0.75, -0.22));
      for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) {
        group.add(box(0.05, 0.45, 0.05, 0x1f2937, lx, 0.22, lz));
      }
      break;
    case 'plant':
      group.add(cylinder(0.22, 0.17, 0.35, 0xb5651d, 0, 0.17, 0));
      group.add(sphere(0.35, 0x2e7d32, 0, 0.68, 0));
      group.add(sphere(0.22, 0x388e3c, 0.18, 0.9, 0.1));
      break;
    case 'screen':
      group.add(box(0.9, 0.55, 0.04, 0x111827, 0, 1.0, 0));
      group.add(box(0.08, 0.5, 0.08, 0x1f2937, 0, 0.55, 0));
      group.add(box(0.4, 0.04, 0.25, 0x1f2937, 0, 0.3, 0));
      break;
    case 'board':
      group.add(box(1.5, 1.0, 0.04, 0x1f2937, 0, 1.1, -0.01));
      group.add(box(1.4, 0.9, 0.04, 0xf5f5f5, 0, 1.1, 0.02));
      break;
    case 'lamp':
      group.add(cylinder(0.04, 0.04, 1.5, 0x6b7280, 0, 0.75, 0));
      group.add(cylinder(0.2, 0.2, 0.04, 0x6b7280, 0, 0.02, 0));
      group.add(sphere(0.18, 0xfde68a, 0, 1.58, 0));
      break;
    default:
      // Unknown type: render nothing rather than guessing a shape.
      break;
  }
  return group;
}

export class MuseEnvironment {
  private groups = new Map<string, THREE.Group>();

  constructor(private scene: THREE.Scene) {}

  /** Idempotent sync: create/update active props, remove the rest. */
  sync(props: MuseEnvProp[] | undefined): void {
    if (props === undefined) return; // Unknown (old feed) — keep what is placed.
    const active = props.filter((p) => p.status === 'active');
    const wanted = new Set(active.map((p) => p.id));
    for (const [id, group] of Array.from(this.groups)) {
      if (!wanted.has(id)) {
        this.scene.remove(group);
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.geometry.dispose();
            const material = mesh.material as THREE.Material;
            if (Array.isArray(material)) material.forEach((m) => m.dispose());
            else material.dispose();
          }
        });
        this.groups.delete(id);
      }
    }
    for (const prop of active) {
      const x = THREE.MathUtils.clamp(prop.position.x, -MUSE_ENV_BOUNDS.x, MUSE_ENV_BOUNDS.x);
      const y = THREE.MathUtils.clamp(prop.position.y, 0, MUSE_ENV_BOUNDS.y);
      const z = THREE.MathUtils.clamp(prop.position.z, -MUSE_ENV_BOUNDS.z, MUSE_ENV_BOUNDS.z);
      const rotationY = THREE.MathUtils.degToRad(prop.rotationY ?? 0);
      let group = this.groups.get(prop.id);
      if (!group) {
        group = buildProp(prop);
        group.userData.musePropId = prop.id;
        group.userData.musePropLabel = prop.label ?? '';
        this.scene.add(group);
        this.groups.set(prop.id, group);
      }
      group.position.set(x, y, z);
      group.rotation.set(0, rotationY, 0);
    }
  }

  /** For tests/debugging only: ids currently rendered. */
  renderedIds(): string[] {
    return Array.from(this.groups.keys());
  }
}
