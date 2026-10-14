import * as THREE from "three";
import Avatar, { type AvatarLook } from "../player/Avatar";
import type WorldCollisions from "./collisions";

/**
 * Non-quest customer placeholder: strolls along a fixed loop of open floor and pauses now and
 * then. It is pushed out of shelves and walls like the player, so it can never walk through
 * them even if the layout changes; if it gets stuck it skips to the next waypoint.
 */
export default class AmbientCustomer {
  readonly avatar: Avatar;
  private path: THREE.Vector2[];
  private i = 0;
  private wait = 0;
  private pos: THREE.Vector2;
  private collisions: WorldCollisions;
  private stuck = 0;

  constructor(look: AvatarLook, collisions: WorldCollisions, path: [number, number][], startIndex = 0) {
    this.collisions = collisions;
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
      const before = this.pos.clone();
      this.pos.addScaledVector(d, step);
      const free = this.collisions.resolve(this.pos.x, this.pos.y, 0.3);
      this.pos.set(free.x, free.z);
      this.avatar.root.rotation.y = Math.atan2(d.x, d.y);
      // blocked (barely moving): after a moment, head for the following waypoint instead
      this.stuck = this.pos.distanceTo(before) < step * 0.3 ? this.stuck + dt : 0;
      if (this.stuck > 1.5) {
        this.i = (this.i + 1) % this.path.length;
        this.stuck = 0;
      }
    }
    this.avatar.animate(dt, this.wait > 0 ? 0 : 0.7);
    this.avatar.root.position.set(this.pos.x, 0, this.pos.y);
  }
}
