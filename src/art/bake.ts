import Phaser from "phaser";
import { RENDER_SCALE } from "../game/display";

// Vector Graphics are re-drawn by Phaser every frame, which gets expensive with thousands of
// shapes (floors, furniture...). Everything static is therefore drawn ONCE into a texture at
// screen resolution and shown as a plain Image. Identical drawings share one texture.

type G = Phaser.GameObjects.Graphics;
export type Draw = (g: G) => void;

interface BakedMeta {
  minX: number;
  minY: number;
  scale: number;
}

const PAD = 3; // room for outlines / anti-aliasing beyond the measured shapes
const baked = new Map<string, BakedMeta>();

/** Runs a drawing function on a throwaway Graphics and records the area it covers. */
function measure(scene: Phaser.Scene, draw: Draw) {
  const g = scene.make.graphics({}, false);
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    b.minX = Math.min(b.minX, x);
    b.minY = Math.min(b.minY, y);
    b.maxX = Math.max(b.maxX, x);
    b.maxY = Math.max(b.maxY, y);
  };
  const rect = (x: number, y: number, w: number, h: number) => {
    add(x, y);
    add(x + w, y + h);
  };
  const circle = (x: number, y: number, r: number) => rect(x - r, y - r, r * 2, r * 2);
  const centred = (x: number, y: number, w: number, h: number) => rect(x - w / 2, y - h / 2, w, h);

  const spy: Record<string, (...a: number[]) => void> = {
    fillRect: rect,
    strokeRect: rect,
    fillRoundedRect: rect,
    strokeRoundedRect: rect,
    fillCircle: circle,
    strokeCircle: circle,
    slice: circle,
    arc: circle,
    fillEllipse: centred,
    strokeEllipse: centred,
    fillTriangle: (x0, y0, x1, y1, x2, y2) => {
      add(x0, y0);
      add(x1, y1);
      add(x2, y2);
    },
    lineBetween: (x0, y0, x1, y1) => {
      add(x0, y0);
      add(x1, y1);
    },
  };
  const target = g as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const [name, track] of Object.entries(spy)) {
    const original = target[name].bind(g);
    target[name] = (...args: unknown[]) => {
      track(...(args as number[]));
      return original(...args);
    };
  }
  const fillPoints = target.fillPoints.bind(g);
  target.fillPoints = (points: unknown, ...rest: unknown[]) => {
    for (const p of points as { x: number; y: number }[]) add(p.x, p.y);
    return fillPoints(points, ...rest);
  };

  draw(g);
  g.destroy();
  return b;
}

/**
 * Draws `draw` once into a texture called `key` (reused if it already exists) and returns an
 * Image placed so that the drawing's local (0, 0) lands on (x, y).
 * `scale` is the texture resolution multiplier (defaults to the screen render scale).
 */
export function addBaked(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  draw: Draw,
  scale = RENDER_SCALE
): Phaser.GameObjects.Image {
  let meta = baked.get(key);
  if (!meta || !scene.textures.exists(key)) {
    const b = measure(scene, draw);
    if (!Number.isFinite(b.minX)) b.minX = b.minY = b.maxX = b.maxY = 0;
    const minX = Math.floor(b.minX - PAD);
    const minY = Math.floor(b.minY - PAD);
    const w = Math.ceil(b.maxX + PAD) - minX;
    const h = Math.ceil(b.maxY + PAD) - minY;

    const g = scene.make.graphics({}, false);
    g.setScale(scale);
    // Shift the drawing into the texture; re-applied if the drawer starts with g.clear().
    const clear = g.clear.bind(g);
    g.clear = () => clear().translateCanvas(-minX, -minY);
    g.clear();
    draw(g);
    g.generateTexture(key, Math.ceil(w * scale), Math.ceil(h * scale));
    g.destroy();

    meta = { minX, minY, scale };
    baked.set(key, meta);
  }
  return scene.add
    .image(x + meta.minX, y + meta.minY, key)
    .setOrigin(0, 0)
    .setScale(1 / meta.scale);
}
