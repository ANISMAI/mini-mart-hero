import Phaser from "phaser";
import { PAL, shade } from "./palette";

// Chibi people drawn with vector Graphics (dark outlines, flat colours).
// (0, 0) is between the feet; everything is drawn upwards.

type G = Phaser.GameObjects.Graphics;
export type Facing = "down" | "up" | "side";

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  /** Hijab colour (covers hair and neck). */
  hijab?: number;
  /** Apron over the shirt (the cashier). */
  apron?: number;
  cap?: number;
}

const INK = PAL.ink;
const LINE = 1.8;

function part(g: G, x: number, y: number, w: number, h: number, r: number, fill: number): void {
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(LINE, INK, 1);
  g.strokeRoundedRect(x, y, w, h, r);
}

function circle(g: G, x: number, y: number, r: number, fill: number): void {
  g.fillStyle(fill, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(LINE, INK, 1);
  g.strokeCircle(x, y, r);
}

function eye(g: G, x: number, y: number): void {
  g.fillStyle(INK, 1);
  g.fillEllipse(x, y, 4.2, 5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x + 0.8, y - 1.1, 1);
}

export function drawPerson(g: G, look: Look, facing: Facing, mood: "happy" | "neutral" | "upset" = "happy"): void {
  g.clear();
  // legs + shoes
  const legX = facing === "side" ? [-5, 1] : [-8, 1];
  for (const x of legX) part(g, x, -11, 7, 10, 2, look.pants);
  for (const x of legX) part(g, x - 1, -3, 9, 4, 2, INK);

  // body + arms
  if (facing !== "side") {
    part(g, -15, -26, 6, 13, 3, look.shirt);
    part(g, 9, -26, 6, 13, 3, look.shirt);
    circle(g, -12, -12, 2.6, look.skin);
    circle(g, 12, -12, 2.6, look.skin);
  }
  part(g, facing === "side" ? -9 : -11, -29, facing === "side" ? 18 : 22, 20, 7, look.shirt);
  if (look.apron && facing !== "up") {
    part(g, facing === "side" ? -3 : -8, -24, facing === "side" ? 11 : 16, 16, 4, look.apron);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(facing === "side" ? 0 : -3, -20, 6, 2);
  }
  if (facing === "side") {
    part(g, -1, -25, 7, 13, 3, shade(look.shirt, -0.05));
    circle(g, 2.5, -11, 2.6, look.skin);
  }

  // head
  const hy = -40;
  if (look.hijab) {
    circle(g, 0, hy + 1, 14.5, look.hijab);
    g.fillStyle(look.hijab, 1);
    g.fillTriangle(-12, hy + 8, 12, hy + 8, 0, hy + 18);
    if (facing !== "up") {
      g.fillStyle(look.skin, 1);
      g.fillEllipse(facing === "side" ? 4 : 0, hy + 3, facing === "side" ? 14 : 19, 18);
    }
  } else {
    circle(g, 0, hy, 12.5, look.skin);
    g.fillStyle(look.hair, 1);
    if (facing === "up") {
      g.fillCircle(0, hy - 1, 13.5);
    } else {
      g.slice(0, hy - 1, 13.5, Math.PI * 1.02, Math.PI * 1.98, false);
      g.fillPath();
      if (facing === "side") g.fillEllipse(-8, hy, 10, 14);
    }
    if (look.cap) {
      g.fillStyle(look.cap, 1);
      g.slice(0, hy - 4, 13, Math.PI, 0, false);
      g.fillPath();
      g.fillRoundedRect(facing === "side" ? 4 : -8, hy - 6, 16, 4, 2);
    }
  }

  if (facing === "up") return;
  if (facing === "side") {
    eye(g, 6, hy + 2);
  } else {
    eye(g, -4.5, hy + 2);
    eye(g, 4.5, hy + 2);
  }
  // mouth
  g.lineStyle(1.4, INK, 1);
  g.beginPath();
  const mx = facing === "side" ? 6 : 0;
  if (mood === "happy") g.arc(mx, hy + 6, 2.4, 0.25, Math.PI - 0.25, false);
  else if (mood === "upset") g.arc(mx, hy + 9, 2.4, Math.PI + 0.25, -0.25, false);
  else {
    g.moveTo(mx - 2, hy + 7);
    g.lineTo(mx + 2, hy + 7);
  }
  g.strokePath();
  g.fillStyle(0xff8a9a, 0.5);
  if (facing === "side") g.fillEllipse(8, hy + 6, 5, 3);
  else {
    g.fillEllipse(-8, hy + 6, 5, 3);
    g.fillEllipse(8, hy + 6, 5, 3);
  }
}

export const CASHIER: Look = { skin: 0xf5c9a3, hair: 0x3a2a24, shirt: 0xffffff, pants: 0x2a3f6e, apron: 0x2fb38a, cap: 0x2fb38a };

/** A few customer looks; one is picked per customer. */
export const CUSTOMER_LOOKS: Look[] = [
  { skin: 0xf2c6a2, hair: 0x2a1f1b, shirt: 0x8f6ee0, pants: 0x2a3f6e, hijab: 0xf7c6da },
  { skin: 0xd9a37c, hair: 0x1f1f2b, shirt: 0xf5973f, pants: 0x4a5a7a },
  { skin: 0xfad7b8, hair: 0x2b2b3a, shirt: 0x3b8ff0, pants: 0x3a4252 },
  { skin: 0xa8734f, hair: 0x1a1414, shirt: 0xf9c833, pants: 0x2a3f6e },
  { skin: 0xf2c6a2, hair: 0x2a1f1b, shirt: 0x2fb38a, pants: 0x5a3f6e, hijab: 0xbfe6d6 },
  { skin: 0xe8b48f, hair: 0x8a8a8a, shirt: 0xec5470, pants: 0x3a4252 },
];
