import Phaser from "phaser";
import { drawStore } from "../art/storeArt";
import { drawPerson, CASHIER, CUSTOMER_LOOKS } from "../art/people";
import { PAL } from "../art/palette";
import Person from "../entities/Person";
import { COUNTER_SPOT, DOOR, QUEUE_SPOTS, WORLD } from "../data/store";
import { RENDER_SCALE } from "../game/display";

/**
 * Starter scene: draws the mini mart with the cashier at the counter and customers walking
 * in and out. Gameplay (shelves, scanning, bagging, change) comes next.
 */
export default class StoreScene extends Phaser.Scene {
  private customers: Person[] = [];

  constructor() {
    super("StoreScene");
  }

  create(): void {
    drawStore(this);

    // cashier behind the counter
    const shadow = this.add.graphics();
    shadow.fillStyle(PAL.shadow, 0.2);
    shadow.fillEllipse(0, 1, 26, 9);
    const cashier = this.add.graphics();
    drawPerson(cashier, CASHIER, "down", "happy");
    this.add.container(COUNTER_SPOT.x, COUNTER_SPOT.y, [shadow, cashier]).setDepth(COUNTER_SPOT.y + 12);

    const cam = this.cameras.main;
    cam.setZoom(RENDER_SCALE);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);

    this.spawnCustomer();
    this.time.addEvent({ delay: 6000, loop: true, callback: () => this.spawnCustomer() });
  }

  /** Shows the whole store, centred, at the largest size that fits the screen. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    const zoom = Math.min(this.scale.width / WORLD.width, this.scale.height / WORLD.height);
    cam.setZoom(zoom);
    cam.centerOn(WORLD.width / 2, WORLD.height / 2);
  }

  /** A customer walks in, waits at the counter for a moment, then leaves. */
  private spawnCustomer(): void {
    if (this.customers.length >= 2) return;
    const look = CUSTOMER_LOOKS[Math.floor(Math.random() * CUSTOMER_LOOKS.length)];
    const c = new Person(this, look, { ...DOOR });
    this.customers.push(c);
    c.walkTo([QUEUE_SPOTS[0]], () => {
      c.face("up");
      c.setMood("happy");
      this.time.delayedCall(2500, () =>
        c.walkTo([{ x: DOOR.x + 30, y: QUEUE_SPOTS[0].y }, { x: DOOR.x + 30, y: DOOR.y + 40 }], () => {
          c.destroy();
          this.customers = this.customers.filter((x) => x !== c);
        })
      );
    });
  }

  update(_t: number, dt: number): void {
    for (const c of this.customers) c.update(dt);
  }
}
