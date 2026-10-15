import * as THREE from "three";
import { blob } from "../world/kit";

// Cute chibi character built from smooth primitives (no model files): cel (toon) shading with a
// dark outline, a bean-shaped body, sleeves and forearms, rounded shoes, layered hair with a
// fringe, a face with big shiny eyes that blink, and a staff apron with the shop logo.
// Procedural Idle (breathing, blinking) and Walk (leg/arm swing, bob, sway). Faces +z.

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

// ---------- toon materials (shared) ----------

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
const toons = new Map<number, THREE.MeshToonMaterial>();
const toon = (color: number) => {
  let m = toons.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradient });
    toons.set(color, m);
  }
  return m;
};
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a2333, side: THREE.BackSide });
const basic = (color: number) => new THREE.MeshBasicMaterial({ color });

/** Mesh with a thin inverted-hull outline. */
function part(geo: THREE.BufferGeometry, color: number, outline = 0.018): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  if (outline > 0) {
    const o = new THREE.Mesh(geo, outlineMat);
    geo.computeBoundingSphere();
    const r = geo.boundingSphere!.radius || 1;
    o.scale.setScalar(1 + outline / r);
    m.add(o);
  }
  return m;
}

const sphere = (r: number, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 18);

/** Bean-shaped torso (lathe profile: rounded belly, narrower shoulders). */
function torsoGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const profile: [number, number][] = [
    [0.0, -0.2],
    [0.17, -0.19],
    [0.23, -0.12],
    [0.245, 0.0],
    [0.235, 0.1],
    [0.2, 0.17],
    [0.12, 0.215],
    [0.0, 0.225],
  ];
  for (const [x, y] of profile) pts.push(new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 24);
}

function logoTexture(color: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const c = cv.getContext("2d")!;
  c.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  c.fillRect(0, 0, 64, 64);
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.arc(32, 30, 18, 0, Math.PI * 2);
  c.fill();
  c.font = '28px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("🛒", 32, 32);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default class Avatar {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private legL: THREE.Object3D;
  private legR: THREE.Object3D;
  private armL: THREE.Object3D;
  private armR: THREE.Object3D;
  private eyes: THREE.Object3D[] = [];
  private t = 0;
  private blinkIn = 2 + Math.random() * 3;
  private carton: THREE.Group;
  private carrying = false;

  /** Show / hide the carton held in both hands (arms stay forward while carrying). */
  setCarrying(on: boolean): void {
    this.carrying = on;
    this.carton.visible = on;
  }
  private blink = 0;

  constructor(look: AvatarLook) {
    // ---- legs: trousers, rounded shoes with a sole ----
    const leg = (x: number) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(x, 0.44, 0);
      const thigh = part(capsule(0.085, 0.2), look.pants);
      thigh.position.y = -0.17;
      pivot.add(thigh);
      const shoe = part(sphere(0.1, 18, 12), 0x3d3550, 0.012);
      shoe.scale.set(0.95, 0.6, 1.35);
      shoe.position.set(0, -0.37, 0.04);
      pivot.add(shoe);
      const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 18), toon(0xf4f7fb));
      sole.scale.set(0.95, 1, 1.35);
      sole.position.set(0, -0.415, 0.04);
      pivot.add(sole);
      return pivot;
    };
    this.legL = leg(-0.105);
    this.legR = leg(0.105);

    // ---- torso, waistband, collar ----
    const torso = part(torsoGeometry(), look.shirt);
    torso.position.y = 0.66;
    torso.scale.set(1, 1, 0.85);
    this.body.add(torso);
    const waist = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.035, 8, 24).rotateX(Math.PI / 2), toon(look.pants));
    waist.scale.set(1, 1, 0.85);
    waist.position.y = 0.48;
    this.body.add(waist);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 14), toon(look.skin));
    neck.position.y = 0.9;
    this.body.add(neck);
    if (!look.hijab) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 20).rotateX(Math.PI / 2), toon(look.shirt === 0xffffff ? 0xeef2f6 : look.shirt));
      collar.position.y = 0.87;
      this.body.add(collar);
    }

    // ---- staff apron: bib with logo, neck strap, pocket ----
    if (look.apron) {
      const apron = new THREE.Group();
      // own material: DoubleSide must not leak into the shared toon material of the same colour
      const bibMat = new THREE.MeshToonMaterial({ color: look.apron, gradientMap: gradient, side: THREE.DoubleSide });
      const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.42, 20, 1, true, -0.85, 1.7), bibMat);
      bib.scale.set(1, 1, 0.9);
      bib.position.y = 0.6;
      apron.add(bib);
      const logo = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshToonMaterial({ map: logoTexture(look.apron), gradientMap: gradient }));
      logo.position.set(0, 0.72, 0.232);
      apron.add(logo);
      const pocket = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), toon(0x23946f));
      pocket.position.set(0, 0.5, 0.228);
      apron.add(pocket);
      for (const x of [-0.08, 0.08]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), toon(look.apron));
        strap.position.set(x, 0.86, 0.13);
        strap.rotation.x = -0.5;
        apron.add(strap);
      }
      this.body.add(apron);
    }

    // ---- arms: short sleeve, skin forearm, round hand ----
    const arm = (x: number) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(x, 0.82, 0);
      const shoulder = part(sphere(0.085, 16, 12), look.shirt, 0.012);
      pivot.add(shoulder);
      const sleeve = part(capsule(0.075, 0.08), look.shirt, 0.012);
      sleeve.position.y = -0.09;
      pivot.add(sleeve);
      const forearm = part(capsule(0.055, 0.14), look.hijab ? look.shirt : look.skin, 0.01);
      forearm.position.y = -0.25;
      pivot.add(forearm);
      const hand = part(sphere(0.07, 16, 12), look.skin, 0.01);
      hand.position.y = -0.38;
      pivot.add(hand);
      pivot.rotation.z = x < 0 ? -0.08 : 0.08; // arms hang slightly out
      return pivot;
    };
    this.armL = arm(-0.29);
    this.armR = arm(0.29);

    // ---- head ----
    const head = this.head;
    head.position.y = 1.17;
    const skull = part(sphere(0.3, 28, 22), look.hijab ?? look.skin, 0.02);
    head.add(skull);
    if (look.hijab) {
      const face = new THREE.Mesh(sphere(0.255, 24, 18), toon(look.skin));
      face.position.set(0, -0.015, 0.08);
      face.scale.set(0.92, 0.98, 0.85);
      head.add(face);
      // soft drape over the shoulders
      const drape = part(new THREE.SphereGeometry(0.34, 24, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4), look.hijab, 0.015);
      drape.position.y = -0.1;
      drape.scale.set(1, 1.1, 0.95);
      head.add(drape);
    } else {
      for (const x of [-0.29, 0.29]) {
        const ear = new THREE.Mesh(sphere(0.055, 12, 10), toon(look.skin));
        ear.position.set(x, -0.01, 0);
        ear.scale.set(0.5, 1, 0.8);
        head.add(ear);
      }
      // hair: back volume, crown and a fringe of soft clumps
      const crown = part(new THREE.SphereGeometry(0.318, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), look.hair, 0.015);
      crown.rotation.x = -0.22;
      head.add(crown);
      for (let i = -2; i <= 2; i++) {
        const clump = new THREE.Mesh(sphere(0.085, 12, 10), toon(look.hair));
        clump.position.set(i * 0.09, 0.16 - Math.abs(i) * 0.02, 0.22 - Math.abs(i) * 0.04);
        clump.scale.set(1.1, 0.75, 0.8);
        head.add(clump);
      }
      if (look.cap) {
        const cap = part(new THREE.SphereGeometry(0.328, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.36), look.cap, 0.015);
        cap.rotation.x = -0.18;
        head.add(cap);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI), toon(look.cap));
        brim.scale.set(1.1, 1, 0.95);
        brim.position.set(0, 0.17, 0.2);
        brim.rotation.x = 0.12;
        head.add(brim);
        const button = new THREE.Mesh(sphere(0.03, 10, 8), toon(look.cap));
        button.position.set(0, 0.31, -0.04);
        head.add(button);
      }
    }
    // face: eyes with two highlights (blink by scaling), brows, nose, cheeks, smile
    for (const x of [-0.1, 0.1]) {
      const eye = new THREE.Group();
      const pupil = new THREE.Mesh(sphere(0.05, 16, 12), basic(0x2a2333));
      pupil.scale.set(0.85, 1.1, 0.45);
      eye.add(pupil);
      const shine = new THREE.Mesh(sphere(0.016, 8, 6), basic(0xffffff));
      shine.position.set(0.016, 0.022, 0.02);
      eye.add(shine);
      const shine2 = new THREE.Mesh(sphere(0.008, 6, 6), basic(0xffffff));
      shine2.position.set(-0.014, -0.018, 0.02);
      eye.add(shine2);
      eye.position.set(x, 0.0, 0.272);
      eye.rotation.y = x * 0.9;
      head.add(eye);
      this.eyes.push(eye);
      const brow = new THREE.Mesh(capsule(0.012, 0.045).rotateZ(Math.PI / 2), basic(look.hijab ? 0x3a2a24 : look.hair));
      brow.position.set(x, 0.085, 0.27);
      brow.rotation.set(0, x * 0.9, x > 0 ? -0.12 : 0.12);
      head.add(brow);
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.042, 14), new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.55 }));
      cheek.position.set(x * 1.6, -0.07, 0.262);
      cheek.rotation.y = x > 0 ? 0.5 : -0.5;
      head.add(cheek);
    }
    const nose = new THREE.Mesh(sphere(0.022, 10, 8), toon(look.skin));
    nose.position.set(0, -0.035, 0.298);
    head.add(nose);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14, Math.PI), basic(0x2a2333));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.085, 0.284);
    head.add(smile);
    this.body.add(head);

    this.body.add(this.legL, this.legR, this.armL, this.armR);
    // carton carried in front of the chest while restocking (hidden until there is stock to carry)
    this.carton = new THREE.Group();
    const cardboard = 0xc99a5f;
    const box = part(new THREE.BoxGeometry(0.46, 0.32, 0.34), cardboard, 0.012);
    box.position.y = 0.16;
    this.carton.add(box);
    for (const s of [-1, 1]) {
      const flap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.16), toon(0xb8884f));
      flap.position.set(0, 0.325, s * 0.12);
      flap.rotation.x = s * 0.55;
      this.carton.add(flap);
    }
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.345), toon(0xe9d3a6));
    tape.position.y = 0.2;
    this.carton.add(tape);
    // a few goods peeking out of the top
    [0xf9c833, 0xe8333f, 0x3b8ff0].forEach((c, i) => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), toon(c));
      g.position.set(-0.12 + i * 0.12, 0.33, -0.02 + (i % 2) * 0.05);
      this.carton.add(g);
    });
    this.carton.position.set(0, 0.56, 0.3);
    this.carton.visible = false;
    this.body.add(this.carton);
    this.root.add(this.body, blob(0.32));
  }

  /** speed: 0 = idle, 1 = full walk. */
  animate(dt: number, speed: number): void {
    const walking = speed > 0.05;
    this.t += dt * (walking ? 9 : 2);
    const swing = Math.sin(this.t) * 0.6 * speed;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (this.carrying) {
      // both hands under the carton, a little bob while walking
      const bob = walking ? Math.sin(this.t * 2) * 0.04 : 0;
      this.armL.rotation.x = this.armR.rotation.x = -1.15 + bob;
      this.armL.rotation.z = 0.25;
      this.armR.rotation.z = -0.25;
    } else {
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
      this.armL.rotation.z = -0.08;
      this.armR.rotation.z = 0.08;
    }
    this.body.position.y = walking ? Math.abs(Math.sin(this.t)) * 0.05 * speed : Math.sin(this.t) * 0.008;
    this.body.rotation.z = walking ? Math.sin(this.t) * 0.04 * speed : 0;
    this.head.rotation.z = walking ? -Math.sin(this.t) * 0.03 * speed : Math.sin(this.t * 0.5) * 0.02;
    // blink now and then
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.14;
      this.blinkIn = 2.5 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    const open = this.blink > 0 ? 0.12 : 1;
    for (const e of this.eyes) e.scale.y = open;
  }
}
