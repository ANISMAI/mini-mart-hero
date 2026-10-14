import * as THREE from "three";
import { blob, mat, rbox } from "../world/kit";

// Cute rounded low-poly character built from primitives (no model files), with procedural
// Idle (breathing) and Walk (leg/arm swing + bob) animation. Faces +z by default.

export interface AvatarLook {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  apron?: number;
  cap?: number;
  hijab?: number;
}

export const CASHIER_LOOK: AvatarLook = { skin: 0xf5c9a3, hair: 0x3a2a24, shirt: 0xffffff, pants: 0x2a3f6e, apron: 0x2fb38a, cap: 0x2fb38a };

export const CUSTOMER_LOOKS: AvatarLook[] = [
  { skin: 0xf2c6a2, hair: 0x2a1f1b, shirt: 0x8f6ee0, pants: 0x2a3f6e, hijab: 0xf7c6da },
  { skin: 0xd9a37c, hair: 0x1f1f2b, shirt: 0xf5973f, pants: 0x4a5a7a },
  { skin: 0xa8734f, hair: 0x1a1414, shirt: 0xf9c833, pants: 0x2a3f6e },
];

export default class Avatar {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private t = 0;

  constructor(look: AvatarLook) {
    const capsule = (r: number, len: number, color: number) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat(color));
    const limb = (r: number, len: number, color: number, x: number, y: number) => {
      const pivot = new THREE.Object3D();
      const m = capsule(r, len, color);
      m.position.y = -len / 2 - r * 0.6;
      pivot.add(m);
      pivot.position.set(x, y, 0);
      return pivot;
    };

    this.legL = limb(0.09, 0.22, look.pants, -0.11, 0.42);
    this.legR = limb(0.09, 0.22, look.pants, 0.11, 0.42);
    for (const leg of [this.legL, this.legR]) {
      const shoe = rbox(0.17, 0.08, 0.24, 0x3d3550, 0.04);
      shoe.position.set(0, -0.44, 0.03);
      leg.add(shoe);
    }
    // torso
    const torso = capsule(0.24, 0.22, look.shirt);
    torso.position.y = 0.66;
    torso.scale.set(1, 1, 0.82);
    this.body.add(torso);
    if (look.apron) {
      const apron = rbox(0.34, 0.38, 0.06, look.apron, 0.04);
      apron.position.set(0, 0.42, 0.19);
      this.body.add(apron);
    }
    this.armL = limb(0.07, 0.24, look.shirt, -0.31, 0.82);
    this.armR = limb(0.07, 0.24, look.shirt, 0.31, 0.82);
    for (const arm of [this.armL, this.armR]) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat(look.skin));
      hand.position.y = -0.4;
      arm.add(hand);
    }

    // big friendly head
    const head = new THREE.Group();
    head.position.y = 1.18;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), mat(look.hijab ?? look.skin));
    head.add(skull);
    if (look.hijab) {
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.255, 16, 12), mat(look.skin));
      face.position.set(0, -0.01, 0.07);
      face.scale.set(0.95, 1, 0.9);
      head.add(face);
      const drape = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 14), mat(look.hijab));
      drape.position.y = -0.3;
      head.add(drape);
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.315, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(look.hair));
      hair.rotation.x = -0.25;
      head.add(hair);
      if (look.cap) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.325, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.38), mat(look.cap));
        cap.rotation.x = -0.2;
        head.add(cap);
        const brim = rbox(0.34, 0.03, 0.2, look.cap, 0.08);
        brim.position.set(0, 0.17, 0.27);
        head.add(brim);
      }
    }
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat(0x2a2333));
      eye.position.set(x, 0.02, 0.27);
      eye.scale.z = 0.5;
      head.add(eye);
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), mat(0xffffff));
      shine.position.set(x + 0.015, 0.04, 0.295);
      head.add(shine);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), mat(0xff9aa8, { transparent: true, opacity: 0.6 }));
      cheek.position.set(x * 1.65, -0.07, 0.262);
      cheek.rotation.y = x > 0 ? 0.45 : -0.45;
      head.add(cheek);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), mat(0x2a2333));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.08, 0.28);
    head.add(smile);
    this.body.add(head);

    this.body.add(this.legL, this.legR, this.armL, this.armR);
    this.root.add(this.body, blob(0.32));
  }

  /** speed: 0 = idle, 1 = full walk. */
  animate(dt: number, speed: number): void {
    this.t += dt * (speed > 0.05 ? 9 : 2);
    const swing = Math.sin(this.t) * 0.6 * speed;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.body.position.y = speed > 0.05 ? Math.abs(Math.sin(this.t)) * 0.05 * speed : Math.sin(this.t) * 0.008;
  }
}

