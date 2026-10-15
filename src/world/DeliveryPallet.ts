import * as THREE from "three";
import { at, rbox } from "./kit";

// The supplier's cartons on a wooden pallet inside the storage room, by the door. Shown while
// today's delivery waits to be received.

export const PALLET_AT = { x: 2.4, z: 5.3 };

export function buildPallet(parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(1.1, 0.12, 0.85, 0xb88a55, 0.02), 0, 0, 0));
  const cartons: [number, number, number, number][] = [
    [-0.27, 0.12, -0.2, 0.5],
    [0.27, 0.12, -0.2, 0.5],
    [-0.27, 0.12, 0.2, 0.5],
    [0.27, 0.12, 0.2, 0.5],
    [-0.1, 0.52, 0, 0.46],
    [0.3, 0.52, 0.12, 0.4],
  ];
  for (const [x, y, z, s] of cartons) {
    g.add(at(rbox(s, s * 0.8, s * 0.8, 0xd9a86c, 0.03), x, y, z));
    // packing tape across the top
    g.add(at(rbox(s * 0.16, 0.012, s * 0.82, 0xc98f4e, 0.004), x, y + s * 0.8, z));
  }
  g.visible = false;
  parent.add(at(g, PALLET_AT.x, 0, PALLET_AT.z));
  return g;
}
