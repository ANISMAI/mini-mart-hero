import * as THREE from "three";
import Avatar, { type AvatarLook } from "../player/Avatar";

/**
 * Non-quest customer placeholder: strolls along a fixed loop of open floor and pauses now and
 * then. No collisions or AI, so it can't destabilise exploration.
 */
export default class AmbientCustomer {
  readonly avatar: Avatar;
  private path: THREE.Vector2[];
  private i = 0;
  private wait = 0;
  private pos: THREE.Vector2;

  constructor(look: AvatarLook, path: [number, number][], startIndex = 0) {
    this.avatar = new Avatar(look);
    this.path = path.map(([x, z]) => new THREE.Vector2(x, z));
    this.i = startIndex % this.path.length;
    this.pos = this.path[this.i].clone();
    this.avatar.root.position.set(this.pos.x, 0, this.pos.y);
  }

  update(dt: number): void {
    if (this.wait > 0) {
      this.wait -= dt;
      this.avatar.animate(dt, 0);
      return;
    }
    const goal = this.path[(this.i + 1) % this.path.length];
    const d = goal.clone().sub(this.pos);
    const step = 1.3 * dt;
    if (d.length() <= step) {
      this.pos.copy(goal);
      this.i = (this.i + 1) % this.path.length;
      if (Math.random() < 0.5) this.wait = 1 + Math.random() * 2;
    } else {
      d.normalize();
      this.pos.addScaledVector(d, step);
      this.avatar.root.rotation.y = Math.atan2(d.x, d.y);
    }
    this.avatar.animate(dt, this.wait > 0 ? 0 : 0.7);
    this.avatar.root.position.set(this.pos.x, 0, this.pos.y);
  }
}
