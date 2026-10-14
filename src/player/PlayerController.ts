import * as THREE from "three";
import Avatar, { CASHIER_LOOK } from "./Avatar";
import type ThirdPersonCamera from "./ThirdPersonCamera";
import type WorldCollisions from "../world/collisions";

const SPEED = 3.2; // m/s
const TURN = 12; // how fast the avatar turns towards its movement direction

/**
 * Moves the avatar from joystick / keyboard input, relative to the camera, with collisions.
 * Input is ignored while `locked` (a modal / task overlay is open).
 */
export default class PlayerController {
  readonly avatar = new Avatar(CASHIER_LOOK);
  readonly position = new THREE.Vector3();
  /** Facing angle (radians, 0 = towards the back of the store / -z). */
  facing = 0;
  locked = false;
  private joy = new THREE.Vector2();
  private keys = new Set<string>();
  private collisions: WorldCollisions;

  constructor(collisions: WorldCollisions) {
    this.collisions = collisions;
    window.addEventListener("keydown", (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  setJoystick(x: number, y: number): void {
    this.joy.set(x, y);
  }

  place(x: number, z: number, facing: number): void {
    const p = this.collisions.resolve(x, z);
    this.position.set(p.x, 0, p.z);
    this.facing = facing;
    this.sync();
  }

  private input(): THREE.Vector2 {
    if (this.locked) return new THREE.Vector2();
    const v = this.joy.clone();
    if (v.lengthSq() < 0.0001) {
      const k = this.keys;
      if (k.has("a") || k.has("arrowleft")) v.x -= 1;
      if (k.has("d") || k.has("arrowright")) v.x += 1;
      if (k.has("w") || k.has("arrowup")) v.y -= 1;
      if (k.has("s") || k.has("arrowdown")) v.y += 1;
    }
    if (v.length() > 1) v.normalize();
    return v;
  }

  update(dt: number, cam: ThirdPersonCamera): void {
    const inp = this.input();
    const speed = inp.length();
    if (speed > 0.01) {
      const f = cam.forward();
      const r = cam.right();
      const dx = (r.x * inp.x - f.x * inp.y) * SPEED * dt;
      const dz = (r.y * inp.x - f.y * inp.y) * SPEED * dt;
      const p = this.collisions.resolve(this.position.x + dx, this.position.z + dz);
      this.position.x = p.x;
      this.position.z = p.z;
      // turn smoothly to face the movement direction (model faces +z at rotation 0)
      const target = Math.atan2(dx, dz);
      let diff = target - (this.facing + Math.PI);
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, TURN * dt);
    }
    this.avatar.animate(dt, speed);
    this.sync();
  }

  private sync(): void {
    this.avatar.root.position.copy(this.position);
    // facing 0 means looking towards -z; the model looks towards +z, hence + PI
    this.avatar.root.rotation.y = this.facing + Math.PI;
  }
}
