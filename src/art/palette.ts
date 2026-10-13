import Phaser from "phaser";

// Clinic palette shared by all placeholder art: bright, saturated accents on clean whites,
// with dark outlines for a crisp cartoon look. Swap these to re-theme the clinic.
export const PAL = {
  ink: 0x26344a,
  cream: 0xffffff,
  creamLine: 0xaab5c3,
  wood: 0xe4b97f,
  woodDark: 0xa8763c,
  woodDeep: 0xcf9a5a,
  mint: 0x2fb38a,
  mintDark: 0x1b8565,
  peach: 0xf5973f,
  peachDark: 0xc4661a,
  pink: 0xec5470,
  pinkDark: 0xb42f4a,
  sky: 0x3b8ff0,
  skyDark: 0x1f5fbf,
  lavender: 0x8f6ee0,
  lavenderDark: 0x5f42b5,
  yellow: 0xf9c833,
  yellowDark: 0xcf9810,
  leaf: 0x52b848,
  leafDark: 0x2c8a34,
  skin: 0xffd3b0,
  skinLine: 0xb97a55,
  grass: 0x93cf6f,
  grassDot: 0x7fbd5b,
  shadow: 0x1d2738,
  steel: 0xcfd6df,
  steelDark: 0x7d8ba0,
};

/** Outline colour for a fill/stroke colour: same hue pushed most of the way to ink. */
export function outline(color: number): number {
  const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const t = 0.62;
  const r = mix((color >> 16) & 0xff, (PAL.ink >> 16) & 0xff, t);
  const g = mix((color >> 8) & 0xff, (PAL.ink >> 8) & 0xff, t);
  const b = mix(color & 0xff, PAL.ink & 0xff, t);
  return (r << 16) | (g << 8) | b;
}

/** Lighten (amount > 0) or darken (amount < 0) a 0xRRGGBB colour. amount in -1..1. */
export function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const f = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

type G = Phaser.GameObjects.Graphics;

/** Filled rounded rect with optional outline (darkened toward ink for a cartoon edge). */
export function rr(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: number,
  stroke?: number,
  strokeWidth = 2
): void {
  const radius = Math.min(r, w / 2, h / 2);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
  if (stroke !== undefined) {
    g.lineStyle(strokeWidth, outline(stroke), 1);
    g.strokeRoundedRect(x, y, w, h, radius);
  }
}

/** Soft ground shadow ellipse centred at (x, y). */
export function groundShadow(g: G, x: number, y: number, w: number, h = 10, alpha = 0.2): void {
  g.fillStyle(PAL.shadow, alpha);
  g.fillEllipse(x, y, w, h);
}

/** Five-pointed star centred at (cx, cy). */
export function star(g: G, cx: number, cy: number, outer: number, color: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outer : outer * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad));
  }
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
}

/** Tiny deterministic PRNG so decorative scatter is identical on every load. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
