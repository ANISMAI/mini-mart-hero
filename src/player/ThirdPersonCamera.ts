import * as THREE from "three";
import { STORE } from "../data/rooms";

/**
 * Third-person camera: orbits behind and above the avatar. Yaw / pitch come from swipes on the
 * right side of the screen (or mouse drag), zoom from pinch / wheel. Smooth follow, zoom
 * limits, and occlusion handling: if a wall is between the avatar and the camera, the camera
 * moves in front of it instead of clipping through.
 */
export default class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0; // 0 = camera south of the avatar, looking towards the back of the store
  pitch = 0.62;
  distance = 6;
  private target = new THREE.Vector3();
  private current = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private occluders: THREE.Object3D[];
  static readonly MIN_DIST = 3;
  static readonly MAX_DIST = 15;

  constructor(aspect: number, occluders: THREE.Object3D[]) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 80);
    this.occluders = occluders;
  }

  rotate(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch = Math.min(1.25, Math.max(0.2, this.pitch + dPitch));
  }

  zoom(delta: number): void {
    this.distance = Math.min(ThirdPersonCamera.MAX_DIST, Math.max(ThirdPersonCamera.MIN_DIST, this.distance + delta));
  }

  /** Movement directions on the floor, relative to where the camera looks. */
  forward(): THREE.Vector2 {
    return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }
  right(): THREE.Vector2 {
    return new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw));
  }

  /** Jump straight to the follow position (after a teleport or on load). */
  snap(player: THREE.Vector3): void {
    this.update(player, 1, true);
  }

  /** Walls currently between the camera and the avatar (the game fades these out). */
  readonly blocking = new Set<THREE.Object3D>();

  update(player: THREE.Vector3, dt: number, instant = false): void {
    this.target.set(player.x, player.y + 1.1, player.z);
    const want = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    const desired = this.target.clone().addScaledVector(want, this.distance);
    // keep the camera inside the store: near a side wall it slides along the inside instead of
    // ending up outside, where the wall would hide everything
    const m = 0.45;
    desired.x = Math.min(STORE.w - m, Math.max(m, desired.x));
    desired.z = Math.min(STORE.d + 3, Math.max(m, desired.z)); // the low front wall can be looked over
    if (instant) this.current.copy(desired);
    else this.current.lerp(desired, 1 - Math.pow(0.0008, dt));
    this.camera.position.copy(this.current);
    this.camera.lookAt(this.target);

    // occlusion: instead of pushing the camera into tight spots, report every wall in the way
    // (checked to the avatar's head and feet) so it can be faded out
    this.blocking.clear();
    for (const h of [1.25, 0.3]) {
      const aim = new THREE.Vector3(player.x, player.y + h, player.z);
      const dir = aim.clone().sub(this.current);
      const len = dir.length();
      this.ray.set(this.current, dir.normalize());
      this.ray.far = len - 0.3;
      for (const hit of this.ray.intersectObjects(this.occluders, false)) this.blocking.add(hit.object);
    }
  }
}
