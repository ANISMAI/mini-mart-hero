import Phaser from "phaser";
import { PAL, groundShadow, outline, rr, shade, seeded } from "./palette";
import { addBaked } from "./bake";
import { COUNTER, DOOR, SHELVES, WALL, WORLD } from "../data/store";
import { PRODUCTS, SHELF_INFO } from "../data/products";
import { FONT_FAMILY, RENDER_SCALE } from "../game/display";

// Static store art, drawn once into textures (see bake.ts).

const FACE = 34; // painted face of the back wall

export function drawStore(scene: Phaser.Scene): void {
  const { width: W, height: H } = WORLD;

  // floor: checkered tiles
  addBaked(scene, "floor", 0, 0, (g) => {
    g.fillStyle(0xf2ece2, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(0xe5dccd, 1);
    for (let y = 0; y < H; y += 30) for (let x = (y / 30) % 2 ? 30 : 0; x < W; x += 60) g.fillRect(x, y, 30, 30);
    // entrance mat
    rr(g, DOOR.x - 46, H - 64, 92, 40, 6, 0x3a4252, PAL.ink);
    g.lineStyle(2, 0x6b7586, 1);
    for (let x = DOOR.x - 36; x <= DOOR.x + 36; x += 12) g.lineBetween(x, H - 58, x, H - 30);
  }).setDepth(-100);

  // walls
  addBaked(scene, "walls", 0, 0, (g) => {
    g.fillStyle(0xfbf7f0, 1);
    g.fillRect(0, WALL, W, FACE);
    g.fillStyle(0x2fb38a, 1);
    g.fillRect(0, WALL + FACE - 16, W, 3);
    g.fillStyle(shade(0x2fb38a, 0.3), 1);
    g.fillRect(0, WALL + FACE - 13, W, 9);
    g.fillStyle(outline(0x2fb38a), 1);
    g.fillRect(0, WALL + FACE - 4, W, 4);
    g.fillStyle(0xd3dae3, 1);
    g.fillRect(0, 0, W, WALL);
    g.fillRect(0, 0, WALL, H);
    g.fillRect(W - WALL, 0, WALL, H);
    g.fillRect(0, H - WALL, 160, WALL);
    g.fillRect(260, H - WALL, W - 260, WALL);
    g.lineStyle(1.5, 0x8794a8, 1);
    g.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);
  }).setDepth(WALL + FACE);

  // shop sign on the back wall
  const sign = scene.add
    .text(W / 2, WALL + 15, "🛒  MINI MART", {
      fontFamily: FONT_FAMILY,
      fontSize: "13px",
      fontStyle: "900",
      color: "#ffffff",
      resolution: RENDER_SCALE * 1.5,
    })
    .setOrigin(0.5)
    .setDepth(5001);
  addBaked(scene, "sign", 0, 0, (g) => {
    rr(g, W / 2 - sign.width / 2 - 14, WALL + 3, sign.width + 28, 24, 12, 0x23364f, PAL.ink);
  }).setDepth(5000);

  // shelves with products
  for (const s of SHELVES) {
    const info = SHELF_INFO[s.id];
    const items = PRODUCTS.filter((p) => p.shelf === s.id);
    const { x, y, width: w, height: h } = s.rect;
    addBaked(scene, `shelf-${s.id}`, 0, 0, (g) => {
      groundShadow(g, x + w / 2, y + h + 2, w + 10, 12);
      rr(g, x, y - 34, w, h + 34, 5, PAL.steel, PAL.steelDark);
      rr(g, x + 4, y - 30, w - 8, h + 26, 3, 0xeef1f5);
      g.fillStyle(info.color, 1);
      g.fillRect(x, y - 34, w, 7); // category stripe
      for (const by of [y - 4, y + h - 8]) {
        g.fillStyle(PAL.steelDark, 1);
        g.fillRect(x + 4, by, w - 8, 3);
      }
    }).setDepth(y + h);
    // product icons on the shelf (two rows)
    items.forEach((p, i) => {
      for (let row = 0; row < 2; row++) {
        const ix = x + 16 + ((w - 32) * i) / Math.max(1, items.length - 1);
        scene.add
          .text(ix, row ? y + h - 18 : y - 15, p.icon, { fontSize: "16px", resolution: RENDER_SCALE * 1.5 })
          .setOrigin(0.5)
          .setDepth(y + h + 0.5);
      }
    });
    // category tag
    scene.add
      .text(x + w / 2, y + h + 9, `${info.icon} ${info.label}`, {
        fontFamily: FONT_FAMILY,
        fontSize: "10px",
        fontStyle: "900",
        color: "#ffffff",
        backgroundColor: "#23364f",
        padding: { x: 6, y: 2 },
        resolution: RENDER_SCALE * 1.5,
      })
      .setOrigin(0.5, 0)
      .setDepth(y + h + 1);
  }

  // counter with register and scanner
  const c = COUNTER;
  addBaked(scene, "counter", 0, 0, (g) => {
    groundShadow(g, c.x + c.width / 2, c.y + c.height + 2, c.width + 10, 14);
    rr(g, c.x, c.y - 12, c.width, c.height + 12, 6, 0xe8ecf1, PAL.steelDark);
    g.fillStyle(0x2fb38a, 1);
    g.fillRect(c.x + 2, c.y + c.height - 12, c.width - 4, 8);
    rr(g, c.x - 4, c.y - 22, c.width + 8, 20, 6, PAL.wood, PAL.woodDark);
    // conveyor
    rr(g, c.x + 10, c.y - 19, 120, 14, 4, 0x3a4252, PAL.ink);
    g.lineStyle(1, 0x6b7586, 1);
    for (let x = c.x + 18; x < c.x + 126; x += 10) g.lineBetween(x, c.y - 17, x, c.y - 7);
    // scanner + register
    rr(g, c.x + 150, c.y - 22, 30, 16, 4, 0x2b3240, PAL.ink);
    g.fillStyle(0xff5a6a, 0.9);
    g.fillRect(c.x + 154, c.y - 15, 22, 2);
    rr(g, c.x + 200, c.y - 52, 60, 34, 5, 0x3a4252, PAL.ink);
    rr(g, c.x + 206, c.y - 48, 48, 18, 3, 0x9ff0d6);
    rr(g, c.x + 196, c.y - 22, 68, 12, 4, 0xc9d2e3, 0xa7b6c9, 1.5);
  }).setDepth(c.y + c.height);

  // a few plants
  const rand = seeded(3);
  for (const [px, py] of [
    [36, 380],
    [384, 380],
    [36, 640],
    [384, 640],
  ]) {
    addBaked(scene, `plant-${px}-${py}`, px, py, (g) => {
      groundShadow(g, 0, -1, 28, 8);
      const leaves = [
        [-8, -28, 9],
        [8, -29, 9],
        [0, -38, 10],
        [0, -26, 8],
      ];
      for (const [lx, ly, r] of leaves) {
        g.fillStyle(PAL.leafDark, 1);
        g.fillCircle(lx, ly, r + rand() * 0.5);
        g.fillStyle(PAL.leaf, 1);
        g.fillCircle(lx - 1.5, ly - 2, r * 0.55);
      }
      rr(g, -10, -18, 20, 18, 4, 0xffffff, PAL.steelDark);
    }).setDepth(py);
  }
}
