import Phaser from "phaser";
import { drawPerson, type Facing, type Look } from "../art/people";
import { PAL } from "../art/palette";
import type { Point } from "../data/store";

/**
 * A walking chibi person (customer). Moves along waypoints with a little bob; not physical.
 */
export default class Person {
  readonly container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Graphics;
  private look: Look;
  private facing: Facing = "up";
  private flip = false;
  private path: Point[] = [];
  private onArrive: (() => void) | null = null;
  private t = 0;
  private mood: "happy" | "neutral" | "upset" = "neutral";
  speed = 70;

  constructor(scene: Phaser.Scene, look: Look, at: Point) {
    this.look = look;
    const shadow = scene.add.graphics();
    shadow.fillStyle(PAL.shadow, 0.2);
    shadow.fillEllipse(0, 1, 26, 9);
    this.body = scene.add.graphics();
    this.container = scene.add.container(at.x, at.y, [shadow, this.body]);
    this.redraw();
  }

  get x(): number {
    return this.container.x;
  }
  get y(): number {
    return this.container.y;
  }
  get walking(): boolean {
    return this.path.length > 0;
  }

  setMood(m: "happy" | "neutral" | "upset"): void {
    this.mood = m;
    this.redraw();
  }

  face(f: Facing, flip = false): void {
    this.facing = f;
    this.flip = flip;
    this.redraw();
  }

  walkTo(points: Point[], onArrive?: () => void): void {
    this.path = [...points];
    this.onArrive = onArrive ?? null;
  }

  private redraw(): void {
    drawPerson(this.body, this.look, this.facing, this.mood);
    this.body.setScale(this.flip ? -1 : 1, 1);
  }

  update(dt: number): void {
    const c = this.container;
    if (this.path.length) {
      const goal = this.path[0];
      const dx = goal.x - c.x;
      const dy = goal.y - c.y;
      const d = Math.hypot(dx, dy);
      const step = (this.speed * dt) / 1000;
      const f: Facing = Math.abs(dx) > Math.abs(dy) ? "side" : dy < 0 ? "up" : "down";
      if (f !== this.facing || (f === "side" && (dx < 0) !== this.flip)) this.face(f, f === "side" && dx < 0);
      if (d <= step) {
        c.setPosition(goal.x, goal.y);
        this.path.shift();
        if (!this.path.length) {
          this.body.y = 0;
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        c.setPosition(c.x + (dx / d) * step, c.y + (dy / d) * step);
        this.t += dt;
        this.body.y = -Math.abs(Math.sin(this.t / 110)) * 2.5;
      }
    }
    c.setDepth(c.y + 12);
  }

  destroy(): void {
    this.container.destroy();
  }
}
