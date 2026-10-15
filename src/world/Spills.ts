import * as THREE from "three";
import { SPILL_SPOTS } from "../game/StoreDay";
import { at, mat } from "./kit";

// Floor spills for the morning mop task: a glossy puddle with a small yellow wet-floor cone next
// to it, at fixed spots in the aisles. Only the active ones are visible.

function puddleGeometry(seed: number): THREE.BufferGeometry {
  // an irregular blob: a circle with wobbly radius
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 0.42 + Math.sin(a * 3 + seed) * 0.08 + Math.sin(a * 5 + seed * 2) * 0.05;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.8));
  }
  return new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
}

export default class Spills {
  private items: THREE.Group[] = [];

  constructor(parent: THREE.Object3D) {
    SPILL_SPOTS.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const puddle = new THREE.Mesh(puddleGeometry(i + 1), new THREE.MeshLambertMaterial({ color: 0x8fd3f5, transparent: true, opacity: 0.7, depthWrite: false }));
      puddle.position.y = 0.012;
      g.add(puddle);
      const shine = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
      shine.position.set(-0.12, 0.014, -0.08);
      shine.scale.set(1.6, 1, 0.6);
      g.add(shine);
      // small wet-floor cone
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 4), mat(0xf9c833));
      g.add(at(cone, 0.55, 0.21, 0.2));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.085, 0.06, 4), mat(0x23262d));
      g.add(at(band, 0.55, 0.2, 0.2));
      g.visible = false;
      parent.add(at(g, x, 0, z));
      this.items.push(g);
    });
  }

  /** Show only the given spill indices. */
  show(active: number[]): void {
    this.items.forEach((g, i) => (g.visible = active.includes(i)));
  }
}
