import * as THREE from "three";
import Avatar, { CUSTOMER_LOOKS } from "../player/Avatar";
import type WorldCollisions from "./collisions";
import type { ProductSpot } from "./ProductModels";
import { at, rbox } from "./kit";

// Phase 2 customer: walks in carrying a shop basket, goes along the aisles to each product on
// their list, stops to take it (the basket fills up), then queues at the customer side of the
// till and finally walks out. Routes use the open lanes (the front cross aisle and the aisles
// between shelves) so they never cut through shelves; the customer is also pushed out of solids
// like the player, and if it stops making progress it "poofs" (a visible shrink/grow) to its
// next marker instead of teleporting unnoticed. A speech bubble shows what it is doing.

export const CUSTOMER_MARKERS = {
  entrance: new THREE.Vector2(12, 29.3),
  inside: new THREE.Vector2(12, 26.4),
  /** Lane in front of the shelf ends (between the shelves and the till). */
  frontLaneZ: 19.8,
  /** Lane east of the till that leads down to the customer side of the counter. */
  tillLane: new THREE.Vector2(9.2, 23.5),
  approach: new THREE.Vector2(7.6, 24.1),
  desk: new THREE.Vector2(5.4, 23.1),
};

/** Where a shopper stands to take a product (in the aisle, in front of it). */
export function standPoint(s: ProductSpot): THREE.Vector2 {
  return new THREE.Vector2(s.x + s.face * 0.75, s.z);
}

interface Step {
  to: THREE.Vector2;
  /** Pause here (seconds) facing `look`, then run `then`. */
  wait?: number;
  look?: number;
  then?: () => void;
}

type NpcState = "hidden" | "shopping" | "waiting" | "leaving";

function bubbleSprite(): { sprite: THREE.Sprite; set(text: string | null): void } {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(0.55, 0.55, 1);
  sprite.renderOrder = 10;
  let last: string | null = "";
  return {
    sprite,
    set(text) {
      if (text === last) return;
      last = text;
      sprite.visible = !!text;
      if (!text) return;
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = "#ffffff";
      c.strokeStyle = "#23364f";
      c.lineWidth = 6;
      c.beginPath();
      c.roundRect(8, 8, 112, 92, 26);
      c.moveTo(52, 98);
      c.lineTo(64, 122);
      c.lineTo(76, 98);
      c.fill();
      c.stroke();
      c.fillStyle = "#ffffff";
      c.fillRect(50, 92, 28, 10);
      c.font = '60px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, 64, 56);
      tex.needsUpdate = true;
    },
  };
}

/** Red shop basket carried at the side; `fill(n)` shows n goods inside. */
function basket(): { group: THREE.Group; fill(n: number): void } {
  const g = new THREE.Group();
  g.add(at(rbox(0.36, 0.2, 0.26, 0xe8333f, 0.04), 0, 0, 0));
  g.add(at(rbox(0.3, 0.02, 0.2, 0x9c1f2a, 0.01), 0, 0.17, 0)); // dark inside
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 14, Math.PI), new THREE.MeshLambertMaterial({ color: 0x9c1f2a }));
  handle.position.y = 0.2;
  g.add(handle);
  const goods: THREE.Mesh[] = [];
  const colors = [0xf9c833, 0x3b8ff0, 0x2fb38a, 0xbb6bd9, 0xf5973f];
  for (let i = 0; i < 5; i++) {
    const m = rbox(0.09, 0.12, 0.08, colors[i], 0.02);
    m.position.set(-0.11 + (i % 3) * 0.11, 0.14 + Math.floor(i / 3) * 0.03, -0.04 + (i % 2) * 0.08);
    m.visible = false;
    g.add(m);
    goods.push(m);
  }
  return { group: g, fill: (n) => goods.forEach((m, i) => (m.visible = i < n)) };
}

export default class CustomerNPC {
  readonly root = new THREE.Group();
  private avatar: Avatar | null = null;
  private pos = new THREE.Vector2();
  private steps: Step[] = [];
  private waitLeft = 0;
  private stuck = 0;
  private poof = 0; // >0 while shrinking/growing during a safe reposition
  private bubble = bubbleSprite();
  private basket = basket();
  private bob = 0;
  private collisions: WorldCollisions;
  state: NpcState = "hidden";
  /** Called once when the customer reaches the till. */
  onArrived: (() => void) | null = null;
  /** Called once when the customer has walked out. */
  onGone: (() => void) | null = null;

  constructor(collisions: WorldCollisions) {
    this.collisions = collisions;
    this.root.visible = false;
    this.bubble.sprite.position.y = 1.95;
    this.basket.group.position.set(0.36, 0.42, 0.05);
    this.root.add(this.bubble.sprite, this.basket.group);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  private dress(look: number): void {
    if (this.avatar) this.root.remove(this.avatar.root);
    this.avatar = new Avatar(CUSTOMER_LOOKS[look % CUSTOMER_LOOKS.length]);
    this.root.add(this.avatar.root);
  }

  /**
   * Walks in and shops: for each stop, along the front lane to its aisle, up to the product,
   * pause and take it (`onPick`), back to the lane; then to the till.
   */
  shop(look: number, stops: { spot: ProductSpot; onPick: () => void }[]): void {
    this.dress(look);
    this.basket.fill(0);
    this.basket.group.visible = true;
    this.pos.copy(CUSTOMER_MARKERS.entrance);
    const lane = CUSTOMER_MARKERS.frontLaneZ;
    const steps: Step[] = [{ to: CUSTOMER_MARKERS.inside.clone() }, { to: new THREE.Vector2(CUSTOMER_MARKERS.inside.x, lane) }];
    let picked = 0;
    for (const { spot, onPick } of stops) {
      const stand = standPoint(spot);
      steps.push({ to: new THREE.Vector2(stand.x, lane) });
      steps.push({
        to: stand,
        wait: 1.3,
        look: spot.face > 0 ? -Math.PI / 2 : Math.PI / 2, // face the shelf
        then: () => {
          this.basket.fill(++picked);
          onPick();
        },
      });
      steps.push({ to: new THREE.Vector2(stand.x, lane) });
    }
    steps.push(
      { to: new THREE.Vector2(CUSTOMER_MARKERS.tillLane.x, lane) },
      { to: CUSTOMER_MARKERS.tillLane.clone() },
      { to: CUSTOMER_MARKERS.approach.clone() },
      { to: CUSTOMER_MARKERS.desk.clone() }
    );
    this.steps = steps;
    this.state = "shopping";
    this.root.visible = true;
    this.sync(0);
  }

  /** On the way from the shelves to the till (last few markers). */
  get headingToTill(): boolean {
    return this.state === "shopping" && this.steps.length <= 3 && !this.steps.some((s) => s.wait);
  }

  /** Restored from a save: already waiting at the till with a full basket. */
  placeAtDesk(look: number, items: number): void {
    this.dress(look);
    this.basket.fill(items);
    this.basket.group.visible = true;
    this.pos.copy(CUSTOMER_MARKERS.desk);
    this.steps = [];
    this.state = "waiting";
    this.root.visible = true;
    this.sync(Math.PI);
  }

  /** The basket's goods went over the counter. */
  emptyBasket(): void {
    this.basket.fill(0);
  }

  leave(): void {
    if (this.state === "hidden") return;
    this.basket.group.visible = false; // leaves with the shop bag instead
    this.steps = [CUSTOMER_MARKERS.approach, CUSTOMER_MARKERS.tillLane, CUSTOMER_MARKERS.inside, CUSTOMER_MARKERS.entrance, new THREE.Vector2(12, 31)].map((v) => ({ to: v.clone() }));
    this.state = "leaving";
    this.setBubble("😊");
  }

  setBubble(text: string | null): void {
    this.bubble.set(text);
  }

  update(dt: number): void {
    if (this.state === "hidden" || !this.avatar) return;
    this.bob += dt;
    this.bubble.sprite.position.y = 1.95 + Math.sin(this.bob * 3) * 0.04;
    if (this.poof > 0) {
      // safe reposition: shrink, hop to the next marker, grow back
      this.poof -= dt;
      if (this.poof <= 0.3 && this.steps.length) this.pos.copy(this.steps[0].to);
      this.avatar.root.scale.setScalar(Math.max(0.05, Math.abs(this.poof / 0.6 - 0.5) * 2));
      if (this.poof <= 0) this.avatar.root.scale.setScalar(1);
      this.sync(this.root.rotation.y);
      return;
    }
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      this.avatar.animate(dt, 0);
      if (this.waitLeft <= 0) {
        const done = this.steps.shift();
        done?.then?.();
        this.afterStep();
      }
      return;
    }
    const step = this.steps[0];
    if (!step) {
      this.avatar.animate(dt, 0);
      return;
    }
    // close enough to the till counts as arrived (don't keep shuffling against the counter)
    if (this.state === "shopping" && this.steps.length === 1 && this.pos.distanceTo(CUSTOMER_MARKERS.desk) < 0.6) {
      this.pos.copy(CUSTOMER_MARKERS.desk);
      this.steps = [];
      this.afterStep();
      return;
    }
    const d = step.to.clone().sub(this.pos);
    const move = 1.4 * dt;
    let facing = this.root.rotation.y;
    if (d.length() <= move + 0.02) {
      this.pos.copy(step.to);
      this.stuck = 0;
      if (step.wait) {
        this.waitLeft = step.wait;
        if (step.look !== undefined) facing = step.look;
      } else {
        this.steps.shift();
        this.afterStep();
      }
    } else {
      d.normalize();
      const before = this.pos.clone();
      this.pos.addScaledVector(d, move);
      // the last exit point is outside the shop: only resolve collisions while inside
      if (this.pos.y < 29.6) {
        const free = this.collisions.resolve(this.pos.x, this.pos.y, 0.3);
        this.pos.set(free.x, free.z);
      }
      facing = Math.atan2(d.x, d.y);
      this.stuck = this.pos.distanceTo(before) < move * 0.3 ? this.stuck + dt : 0;
      if (this.stuck > 2) {
        this.stuck = 0;
        this.poof = 0.6;
      }
    }
    this.avatar.animate(dt, this.waitLeft > 0 ? 0 : 0.75);
    this.sync(facing);
  }

  private sync(facing: number): void {
    this.root.position.set(this.pos.x, 0, this.pos.y);
    this.root.rotation.y = facing;
  }

  private afterStep(): void {
    if (this.steps.length) return;
    if (this.state === "shopping") {
      this.state = "waiting";
      this.sync(Math.PI); // face the counter
      this.onArrived?.();
    } else if (this.state === "leaving") {
      this.state = "hidden";
      this.root.visible = false;
      this.onGone?.();
    }
  }
}
