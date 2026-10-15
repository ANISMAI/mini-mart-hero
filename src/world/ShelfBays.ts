import * as THREE from "three";
import { slotOf } from "../data/inventory";

// Shelf "bays": the part of a product's block that sits on one shelf board (or cooler shelf).
// A slot's capacity is shared between its bays in proportion to how many facings each board
// holds, so the player can restock a particular board and get told when that board is full.
// Visuals: each instanced product mesh shows, per bay, as many facings as that bay's units
// warrant (hidden ones get a zero-scale matrix, so no meshes are added or removed).

export interface Bay {
  key: string;
  /** Units this bay holds when full. */
  cap: number;
  /** World box around the bay's facings (for highlighting and drop tests). */
  box: THREE.Box3;
  face: 1 | -1;
  y: number;
}

interface MeshBays {
  mesh: THREE.InstancedMesh;
  /** Instance indices per bay key, front row first (the fill order). */
  groups: Map<string, number[]>;
  orig: THREE.Matrix4[];
}

export interface ProductBays {
  bays: Bay[];
  meshes: MeshBays[];
}

const keyOf = (face: number, y: number) => `${face > 0 ? "+" : "-"}${y.toFixed(2)}`;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Groups every managed product's instances into bays and works out each bay's capacity and box. */
export function indexBays(storeGroup: THREE.Object3D): Map<string, ProductBays> {
  storeGroup.updateMatrixWorld(true);
  const out = new Map<string, ProductBays>();
  const raw = new Map<string, { mesh: THREE.InstancedMesh; orig: THREE.Matrix4[] }[]>();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  storeGroup.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    const sku = o.userData.sku as string | undefined;
    if (!mesh.isInstancedMesh || !sku || !slotOf(sku)) return;
    const full = o.userData.full as number;
    // remember the authored matrices once (visuals overwrite hidden ones with zero scale)
    if (!o.userData.orig) {
      const orig: THREE.Matrix4[] = [];
      for (let i = 0; i < full; i++) {
        mesh.getMatrixAt(i, m);
        orig.push(m.clone());
      }
      o.userData.orig = orig;
    }
    raw.set(sku, [...(raw.get(sku) ?? []), { mesh, orig: o.userData.orig as THREE.Matrix4[] }]);
  });

  for (const [sku, meshes] of raw) {
    const slot = slotOf(sku)!;
    // bays come from the placeholder layout (always present, stable whether or not pictures load):
    // one per board AND per separate stretch of that board (e.g. two cooler units side by side)
    const ref = meshes.find((x) => x.mesh.userData.placeholder) ?? meshes[0];
    const boards = new Map<string, { face: 1 | -1; y: number; zs: number[] }>();
    for (const mat of ref.orig) {
      p.setFromMatrixPosition(mat);
      const face = (p.x >= 0 ? 1 : -1) as 1 | -1;
      const k = keyOf(face, p.y);
      const b = boards.get(k) ?? { face, y: p.y, zs: [] };
      b.zs.push(p.z);
      boards.set(k, b);
    }
    const defs: { key: string; face: 1 | -1; y: number; z0: number; z1: number; n: number }[] = [];
    for (const [bk, b] of [...boards.entries()].sort((x, y) => sortKeys(x[0], y[0]))) {
      const zs = [...new Set(b.zs.map((z) => +z.toFixed(4)))].sort((x, y) => x - y);
      // a "gap" is clearly wider than this product's normal spacing (big items sit further apart)
      const steps = zs.slice(1).map((z, i) => z - zs[i]).sort((x, y) => x - y);
      const typical = steps.length ? steps[Math.floor(steps.length / 2)] : 0;
      const gap = Math.max(0.22, typical * 1.6);
      let start = zs[0];
      let prev = zs[0];
      let part = 0;
      const flush = (end: number) => {
        const n = b.zs.filter((z) => z >= start - 1e-4 && z <= end + 1e-4).length;
        defs.push({ key: `${bk}:${part++}`, face: b.face, y: b.y, z0: start, z1: end, n });
      };
      for (const z of zs.slice(1)) {
        if (z - prev > gap) {
          flush(prev);
          start = z;
        }
        prev = z;
      }
      flush(prev);
    }
    // assign every mesh's instances (placeholder or picture layout) to the nearest bay on its board
    const meshBays: MeshBays[] = meshes.map(({ mesh, orig }) => {
      const groups = new Map<string, number[]>();
      orig.forEach((mat, i) => {
        p.setFromMatrixPosition(mat);
        const face = p.x >= 0 ? 1 : -1;
        let best: (typeof defs)[number] | null = null;
        let bestD = Infinity;
        for (const d of defs) {
          if (d.face !== face || Math.abs(d.y - p.y) > 1e-3) continue;
          const dz = p.z < d.z0 ? d.z0 - p.z : p.z > d.z1 ? p.z - d.z1 : 0;
          if (dz < bestD) {
            best = d;
            bestD = dz;
          }
        }
        if (best) groups.set(best.key, [...(groups.get(best.key) ?? []), i]);
      });
      return { mesh, groups, orig };
    });
    // largest-remainder share of the slot capacity across the bays
    const total = defs.reduce((a, d) => a + d.n, 0);
    const exact = defs.map((d) => (slot.capacity * d.n) / total);
    const caps = exact.map(Math.floor);
    let left = slot.capacity - caps.reduce((a, c) => a + c, 0);
    exact.map((r, i) => [r - Math.floor(r), i] as const).sort((a, c) => c[0] - a[0]).forEach(([, i]) => left-- > 0 && caps[i]++);
    const vis = meshBays.find((x) => x.mesh.visible) ?? meshBays[0];
    const bays: Bay[] = defs
      .map((d, i) => {
        const box = new THREE.Box3();
        for (const j of vis.groups.get(d.key) ?? []) box.expandByPoint(p.setFromMatrixPosition(vis.orig[j]).applyMatrix4(vis.mesh.matrixWorld));
        if (box.isEmpty()) {
          const r = meshBays.find((x) => x.mesh === ref.mesh)!;
          for (const j of r.groups.get(d.key) ?? []) box.expandByPoint(p.setFromMatrixPosition(r.orig[j]).applyMatrix4(r.mesh.matrixWorld));
        }
        box.min.add(new THREE.Vector3(-0.12, -0.02, -0.14));
        box.max.add(new THREE.Vector3(0.12, 0.34, 0.14));
        return { key: d.key, cap: caps[i], box, face: d.face, y: d.y };
      })
      .filter((b) => b.cap > 0 && !b.box.isEmpty());
    out.set(sku, { bays, meshes: meshBays });
  }
  return out;
}

/** Lowest board first (then left to right along it); the two faces of a shelf grouped. */
export function sortKeys(a: string, b: string): number {
  if (a[0] !== b[0]) return a[0] === "+" ? -1 : 1;
  const ya = parseFloat(a.slice(1));
  const yb = parseFloat(b.slice(1));
  if (Math.abs(ya - yb) > 1e-3) return ya - yb;
  return (parseInt(a.split(":")[1] ?? "0") || 0) - (parseInt(b.split(":")[1] ?? "0") || 0);
}

/**
 * Units per bay for a slot: the saved layout if it adds up, otherwise the quantity poured into
 * the lowest bays first.
 */
export function layoutFor(bays: Bay[], qty: number, saved?: Record<string, number>): Record<string, number> {
  if (saved) {
    const ok = bays.every((b) => (saved[b.key] ?? 0) <= b.cap) && bays.reduce((a, b) => a + (saved[b.key] ?? 0), 0) === qty;
    if (ok) return Object.fromEntries(bays.map((b) => [b.key, saved[b.key] ?? 0]));
  }
  const out: Record<string, number> = {};
  let left = qty;
  for (const b of bays) {
    out[b.key] = Math.min(b.cap, left);
    left -= out[b.key];
  }
  return out;
}

/** Shows, per bay, the facings matching its units (front row first); hides the rest. */
export function applyBayVisuals(entry: ProductBays, units: Record<string, number>): void {
  const caps = new Map(entry.bays.map((b) => [b.key, b.cap]));
  for (const { mesh, groups, orig } of entry.meshes) {
    for (const [key, idx] of groups) {
      const cap = caps.get(key) ?? 0;
      const u = units[key] ?? 0;
      const show = cap ? (u <= 0 ? 0 : Math.max(1, Math.round((idx.length * u) / cap))) : 0;
      idx.forEach((i, n) => mesh.setMatrixAt(i, n < show ? orig[i] : ZERO));
    }
    mesh.count = orig.length;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

