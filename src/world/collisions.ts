import { PLAYER_RADIUS, STORE } from "../data/rooms";

/** Axis-aligned solid box on the floor plan (metres). */
export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const box = (x: number, z: number, w: number, d: number): Box => ({ minX: x, maxX: x + w, minZ: z, maxZ: z + d });

/** Box centred on (cx, cz). */
export const boxC = (cx: number, cz: number, w: number, d: number): Box => box(cx - w / 2, cz - d / 2, w, d);

/**
 * WorldCollisions: keeps a circle (the avatar) out of walls and furniture by pushing it out of
 * every box it overlaps. Cheap enough to run every frame for a small store.
 */
export default class WorldCollisions {
  readonly boxes: Box[] = [];

  add(b: Box): void {
    this.boxes.push(b);
  }

  /** Moves (x, z) out of any overlapping box. Returns the corrected position. */
  resolve(x: number, z: number, r = PLAYER_RADIUS): { x: number; z: number } {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.boxes) {
        const nx = Math.max(b.minX, Math.min(x, b.maxX));
        const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
        const dx = x - nx;
        const dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // centre inside the box: push out along the shortest axis
          const left = x - b.minX + r;
          const right = b.maxX - x + r;
          const top = z - b.minZ + r;
          const bottom = b.maxZ - z + r;
          const m = Math.min(left, right, top, bottom);
          if (m === left) x = b.minX - r;
          else if (m === right) x = b.maxX + r;
          else if (m === top) z = b.minZ - r;
          else z = b.maxZ + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    x = Math.max(r, Math.min(STORE.w - r, x));
    z = Math.max(r, Math.min(STORE.d - r, z));
    return { x, z };
  }

  /** True if a circle at (x, z) touches nothing (used to validate saves and spawns). */
  isFree(x: number, z: number, r = PLAYER_RADIUS): boolean {
    if (x < r || z < r || x > STORE.w - r || z > STORE.d - r) return false;
    return !this.boxes.some((b) => {
      const nx = Math.max(b.minX, Math.min(x, b.maxX));
      const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
      return (x - nx) ** 2 + (z - nz) ** 2 < r * r;
    });
  }
}
