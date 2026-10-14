import * as THREE from "three";
import { STORE } from "../data/rooms";
import { at, cube, mat, rbox } from "./kit";

// The street around the shop, Malaysian shop-row style: the store sits in a row of shophouses,
// with a kaki lima (five-foot way) in front, a parking strip, a two-lane road with passing cars,
// a far pavement with trees and street lamps. Detail comes from painted canvas textures
// (asphalt grain, tiles, shophouse facades, number plates) on simple shapes, so it stays light.
// Purely decorative: no collisions, the player can't leave the shop.

const W = STORE.w;
const D = STORE.d;

// ---------- painted textures ----------

const rand = (() => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Speckled asphalt with a few patches and hairline cracks. */
const asphalt = (base: string) =>
  canvasTexture(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = base;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = 40 + rand() * 60;
        c.fillStyle = `rgba(${v},${v},${v + 6},${0.18 + rand() * 0.25})`;
        c.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
      }
      for (let i = 0; i < 3; i++) {
        c.fillStyle = "rgba(20,22,28,0.12)";
        c.beginPath();
        c.ellipse(rand() * w, rand() * h, 18 + rand() * 30, 10 + rand() * 16, rand() * 3, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = "rgba(25,27,32,0.35)";
      c.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        let x = rand() * w;
        let y = rand() * h;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 6; k++) c.lineTo((x += (rand() - 0.5) * 30), (y += (rand() - 0.5) * 30));
        c.stroke();
      }
    },
    true
  );

/** Square tiles with grout lines and slight colour variation. */
const tiles = (colors: string[], grout: string, n = 4) =>
  canvasTexture(
    256,
    256,
    (c, w) => {
      const s = w / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          c.fillStyle = colors[Math.floor(rand() * colors.length)];
          c.fillRect(i * s, j * s, s, s);
          c.fillStyle = "rgba(255,255,255,0.08)";
          c.fillRect(i * s + 4, j * s + 4, s - 8, 6);
        }
      c.strokeStyle = grout;
      c.lineWidth = 4;
      for (let i = 0; i <= n; i++) {
        c.beginPath();
        c.moveTo(i * s, 0);
        c.lineTo(i * s, w);
        c.moveTo(0, i * s);
        c.lineTo(w, i * s);
        c.stroke();
      }
    },
    true
  );

/** Interlocking pavement bricks (running bond). */
const bricks = canvasTexture(
  256,
  256,
  (c, w) => {
    const bw = 64;
    const bh = 32;
    for (let row = 0; row < w / bh; row++)
      for (let col = -1; col < w / bw + 1; col++) {
        const x = col * bw + (row % 2 ? bw / 2 : 0);
        const v = 175 + Math.floor(rand() * 30);
        c.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
        c.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      }
  },
  true
);

/** Grass with darker blades. */
const grassTex = canvasTexture(
  256,
  256,
  (c, w, h) => {
    c.fillStyle = "#9fd47e";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      c.fillStyle = rand() > 0.5 ? "rgba(96,168,72,0.5)" : "rgba(190,230,140,0.45)";
      const x = rand() * w;
      const y = rand() * h;
      c.fillRect(x, y, 1.5, 3 + rand() * 4);
    }
  },
  true
);

function texturedStrip(tex: THREE.Texture, x0: number, x1: number, z0: number, z1: number, y: number, tileSize: number, tint = 0xffffff): THREE.Mesh {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set((x1 - x0) / tileSize, (z1 - z0) / tileSize);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ map: t, color: tint }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  return m;
}

function signBoard(text: string, sub: string, bg: string, fg: string, w: number, h: number): THREE.Mesh {
  const tex = canvasTexture(512, Math.round((512 * h) / w), (c, cw, H) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, cw, H);
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(0, 0, cw, H * 0.45);
    c.lineWidth = 10;
    c.strokeStyle = "#ffffff";
    c.strokeRect(5, 5, cw - 10, H - 10);
    c.fillStyle = fg;
    c.textAlign = "center";
    c.textBaseline = "middle";
    let size = Math.round(H * (sub ? 0.42 : 0.55));
    do c.font = `900 ${size--}px Nunito, "Segoe UI", "Segoe UI Emoji", sans-serif`;
    while (c.measureText(text).width > cw - 42 && size > 10);
    c.fillText(text, cw / 2, sub ? H * 0.4 : H / 2);
    if (sub) {
      c.font = `800 ${Math.round(H * 0.2)}px Nunito, "Segoe UI", sans-serif`;
      c.fillText(sub, cw / 2, H * 0.78);
    }
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
}

/**
 * Painted shophouse front (2 storeys): roller shutter and shop window downstairs, framed
 * windows with grilles, an AC compressor and pot plants upstairs.
 */
function facadeTexture(wall: string, trim: string, shutterOpen: number): THREE.CanvasTexture {
  return canvasTexture(512, 272, (c, w, h) => {
    c.fillStyle = wall;
    c.fillRect(0, 0, w, h);
    // subtle plaster streaks
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(0,0,0,${rand() * 0.03})`;
      c.fillRect(rand() * w, rand() * h, 2, 10 + rand() * 30);
    }
    const floor = h * 0.62; // ground-floor top (sign band sits above it, upstairs above that)
    // ground floor: shop opening with a half-raised roller shutter over a lit interior
    const ox = 22;
    const ow = w - 44;
    c.fillStyle = "#fff6dc";
    c.fillRect(ox, h * 0.66, ow, h - h * 0.66);
    // shelves inside
    for (let r = 0; r < 3; r++) {
      c.fillStyle = "#c9b28c";
      c.fillRect(ox + 10, h * 0.74 + r * 22, ow - 20, 4);
      for (let i = 0; i < 28; i++) {
        c.fillStyle = ["#e8333f", "#3b8ff0", "#f9c833", "#2fb38a", "#bb6bd9"][Math.floor(rand() * 5)];
        c.fillRect(ox + 14 + i * ((ow - 28) / 28), h * 0.74 + r * 22 - 12, 9, 12);
      }
    }
    const shutterBottom = h * 0.66 + (h - h * 0.66) * (1 - shutterOpen);
    c.fillStyle = "#b9c2cc";
    c.fillRect(ox, h * 0.66, ow, shutterBottom - h * 0.66);
    c.strokeStyle = "rgba(80,90,105,0.5)";
    c.lineWidth = 2;
    for (let y = h * 0.66 + 5; y < shutterBottom; y += 6) {
      c.beginPath();
      c.moveTo(ox, y);
      c.lineTo(ox + ow, y);
      c.stroke();
    }
    c.fillStyle = "#7d8ba0";
    c.fillRect(ox, shutterBottom - 4, ow, 4);
    // pillars either side
    c.fillStyle = trim;
    c.fillRect(0, floor, ox, h - floor);
    c.fillRect(w - ox, floor, ox, h - floor);
    // upstairs: three framed windows with grilles
    for (let i = 0; i < 3; i++) {
      const wx = 40 + i * 155;
      const wy = 22;
      const ww = 120;
      const wh = 80;
      c.fillStyle = trim;
      c.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
      c.fillStyle = "#9fcfe8";
      c.fillRect(wx, wy, ww, wh);
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.beginPath();
      c.moveTo(wx, wy + wh);
      c.lineTo(wx + 40, wy);
      c.lineTo(wx + 65, wy);
      c.lineTo(wx + 25, wy + wh);
      c.fill();
      c.strokeStyle = "rgba(60,64,72,0.6)";
      c.lineWidth = 2;
      for (let k = 1; k < 6; k++) {
        c.beginPath();
        c.moveTo(wx + (ww * k) / 6, wy);
        c.lineTo(wx + (ww * k) / 6, wy + wh);
        c.stroke();
      }
      c.fillStyle = "#e9e3d8";
      c.fillRect(wx - 10, wy + wh + 6, ww + 20, 6); // sill
    }
    // AC compressor and pot plants
    c.fillStyle = "#eef2f6";
    c.fillRect(372, 108, 54, 34);
    c.strokeStyle = "#9aa6b5";
    c.beginPath();
    c.arc(392, 125, 12, 0, Math.PI * 2);
    c.stroke();
    for (const px of [70, 230]) {
      c.fillStyle = "#c46a3c";
      c.fillRect(px, 118, 22, 18);
      c.fillStyle = "#4fb35a";
      c.beginPath();
      c.arc(px + 11, 112, 14, 0, Math.PI * 2);
      c.fill();
    }
  });
}

// ---------- props ----------

/** Malaysian-style number plate (black with white text). */
function plateMaterial(text: string): THREE.Material {
  const tex = canvasTexture(128, 40, (c, w, h) => {
    c.fillStyle = "#111318";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#d8dde6";
    c.lineWidth = 3;
    c.strokeRect(2, 2, w - 4, h - 4);
    c.fillStyle = "#ffffff";
    c.font = '900 24px "Segoe UI", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, w / 2, h / 2 + 1);
  });
  return new THREE.MeshBasicMaterial({ map: tex });
}

const PLATES = ["WXY 1234", "BKL 88", "JHB 2026", "PNG 515", "VAA 77", "MCA 909", "KDH 31"];
let plateIndex = 0;

/** Cute rounded car facing +x, with windows, door seams, rims, lights and plates. */
function car(color: number): THREE.Group {
  const g = new THREE.Group();
  const glass = 0x2e5a78;
  g.add(at(rbox(2.3, 0.5, 1.12, color, 0.2), 0, 0.26, 0)); // body
  g.add(at(rbox(1.3, 0.48, 1.0, color, 0.2), -0.12, 0.7, 0)); // cabin
  g.add(at(rbox(1.36, 0.34, 1.03, glass, 0.12), -0.12, 0.78, 0)); // window band
  g.add(at(cube(0.06, 0.34, 1.04, color), -0.12, 0.95, 0)); // B-pillar
  // glossy highlight on the windscreen
  g.add(at(cube(0.03, 0.06, 0.7, 0x9fd8f2), 0.55, 0.98, 0));
  // door seams and handles on both sides
  for (const z of [-0.565, 0.565]) {
    g.add(at(cube(0.02, 0.36, 0.01, 0x1c2230), -0.12, 0.5, z));
    for (const x of [0.15, -0.45]) g.add(at(cube(0.12, 0.03, 0.02, 0xd8dde6), x, 0.62, z));
  }
  // bumpers and lights
  for (const x of [1.13, -1.13]) g.add(at(cube(0.08, 0.14, 1.04, 0x4a4f58), x, 0.32, 0));
  for (const z of [-0.36, 0.36]) {
    g.add(at(cube(0.05, 0.1, 0.2, 0xfff3b0), 1.15, 0.52, z)); // headlights
    g.add(at(cube(0.05, 0.1, 0.18, 0xe8333f), -1.15, 0.52, z)); // tail lights
  }
  const plate = plateMaterial(PLATES[plateIndex++ % PLATES.length]);
  for (const [x, ry] of [[1.18, Math.PI / 2], [-1.18, -Math.PI / 2]] as const) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), plate);
    g.add(at(p, x, 0.33, 0, ry));
  }
  // side mirrors
  for (const z of [-0.56, 0.56]) g.add(at(cube(0.1, 0.07, 0.08, color), 0.38, 0.8, z + Math.sign(z) * 0.05));
  // wheels: tyre + rim + hub
  for (const x of [-0.72, 0.72])
    for (const z of [-0.54, 0.54]) {
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.18, 18).rotateX(Math.PI / 2), mat(0x23262d)), x, 0.24, z));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.19, 12).rotateX(Math.PI / 2), mat(0xc9d2dc)), x, 0.24, z));
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8).rotateX(Math.PI / 2), mat(0x7d8ba0)), x, 0.24, z));
    }
  return g;
}

/** Kapcai-style scooter facing +x. */
function motorbike(color: number): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.48, 0.5]) {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.09, 16).rotateX(Math.PI / 2), mat(0x23262d)), x, 0.24, 0));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateX(Math.PI / 2), mat(0xc9d2dc)), x, 0.24, 0));
  }
  g.add(at(rbox(0.75, 0.32, 0.3, color, 0.12), -0.12, 0.32, 0)); // rear body
  g.add(at(rbox(0.2, 0.62, 0.34, color, 0.08), 0.38, 0.28, 0)); // front shield
  g.add(at(rbox(0.55, 0.1, 0.26, 0x23262d, 0.05), -0.15, 0.66, 0)); // seat
  g.add(at(cube(0.05, 0.42, 0.05, 0x9aa6b5), 0.46, 0.85, 0)); // steering column
  g.add(at(cube(0.06, 0.06, 0.62, 0x23262d), 0.46, 1.06, 0)); // handlebar
  g.add(at(cube(0.06, 0.12, 0.18, 0xfff3b0), 0.52, 0.98, 0)); // headlamp
  g.add(at(cube(0.04, 0.06, 0.12, 0xe8333f), -0.5, 0.5, 0)); // tail light
  return g;
}

/** Stylised tree: tapered trunk and a cluster of faceted leaf balls in two greens. */
function tree(scale = 1): THREE.Group {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.8, 8), mat(0x8a5a33)), 0, 0.9, 0));
  const leaves: [number, number, number, number, number][] = [
    [0, 2.3, 0, 0.95, 0x4fb35a],
    [0.55, 2.55, 0.25, 0.7, 0x62c46c],
    [-0.5, 2.5, -0.2, 0.72, 0x45a352],
    [0.1, 2.95, -0.1, 0.62, 0x74d07a],
    [-0.15, 2.45, 0.55, 0.6, 0x58b863],
  ];
  for (const [x, y, z, r, col] of leaves) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
    g.add(at(m, x, y, z));
  }
  g.scale.setScalar(scale);
  return g;
}

/** Street lamp with a curved arm, facing +x. */
function streetLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 4.2, 10), mat(0x6b7686)), 0, 2.1, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 10), mat(0x6b7686)), 0, 0.15, 0));
  const arm = cube(1.0, 0.06, 0.08, 0x6b7686);
  arm.rotation.z = 0.3; // rises from the pole top towards the lamp head
  arm.position.set(0.45, 4.35, 0);
  g.add(arm);
  g.add(at(rbox(0.5, 0.12, 0.24, 0x4a4f58, 0.05), 0.95, 4.5, 0));
  g.add(at(cube(0.4, 0.03, 0.18, 0xfff6c8), 0.95, 4.49, 0));
  return g;
}

/** A neighbouring two-storey shophouse (front faces +z), painted facade + signboard. */
function shophouse(width: number, wall: string, trim: string, sign: string, signBg: string, shutterOpen: number): THREE.Group {
  const g = new THREE.Group();
  const height = 6.2;
  const body = cube(width, height, D, 0xf3ede2);
  body.material = mat(parseInt(wall.slice(1), 16));
  g.add(at(body, 0, height / 2, -D / 2));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({ map: facadeTexture(wall, trim, shutterOpen) }));
  g.add(at(front, 0, height / 2, 0.02));
  g.add(at(cube(width + 0.1, 0.3, 0.4, 0xffffff), 0, height + 0.15, 0)); // parapet
  g.add(at(signBoard(sign, "", signBg, "#ffffff", width - 1.2, 0.85), 0, 3.0, 0.08));
  return g;
}

// ---------- assembly ----------

export interface Exterior {
  group: THREE.Group;
  /** Facade pieces that fade like walls when they hide the player (same userData contract). */
  occluders: THREE.Object3D[];
  tick(dt: number): void;
}

export function buildExterior(): Exterior {
  const group = new THREE.Group();
  const add = (o: THREE.Object3D) => (group.add(o), o);
  const X0 = -60;
  const X1 = W + 60;

  // ground
  add(texturedStrip(grassTex, W / 2 - 110, W / 2 + 110, D / 2 - 110, D / 2 + 110, -0.03, 4));
  const road = asphalt("#4a4f58");
  add(texturedStrip(tiles(["#c98f6a", "#c48863", "#cf9774"], "#9c6a4c"), X0, X1, D, D + 3, 0.02, 1.2)); // kaki lima: terracotta tiles
  add(texturedStrip(tiles(["#c9c2b4"], "#9e978a", 1), X0, X1, D + 3, D + 3.2, 0.03, 0.2)); // kerb
  add(texturedStrip(road, X0, X1, D + 3.2, D + 9, -0.01, 4, 0xd8dce4)); // parking (lighter)
  add(texturedStrip(road, X0, X1, D + 9, D + 16, -0.01, 4)); // road
  add(texturedStrip(bricks, X0, X1, D + 16, D + 19, 0.01, 1.5)); // far pavement
  add(texturedStrip(road, X0, X1, -6, -0.2, -0.01, 4, 0xc0c4cc)); // back lane

  // markings: parking bays, lane dashes, yellow edge lines
  for (let x = -20; x <= W + 20; x += 2.6) add(at(cube(0.08, 0.01, 4.2, 0xf4f4f4), x, 0, D + 6));
  for (let x = X0; x < X1; x += 4) add(at(cube(2, 0.01, 0.15, 0xf2f2f2), x, 0, D + 12.5));
  for (const z of [D + 9.15, D + 15.85]) add(at(cube(X1 - X0, 0.01, 0.1, 0xf9c833), (X0 + X1) / 2, 0, z));
  // zebra crossing in front of the shop
  for (let i = 0; i < 7; i++) add(at(cube(0.45, 0.012, 6.4, 0xf4f4f4), 9 + i * 0.9, 0, D + 12.5));

  // shop facade: fascia sign above the shopfront, striped awning over the kaki lima
  const fascia = signBoard("🛒 MINI MARKET HERO", "Kedai Runcit · Buka Setiap Hari", "#2fb38a", "#ffffff", 9, 1.3);
  add(at(fascia, W / 2, 3.35, D + 0.13));
  const band = cube(W, 1.4, 0.2, 0xfff6e6); // facade band above the shopfront glass
  band.material = (band.material as THREE.Material).clone();
  add(at(band, W / 2, 3.3, D));
  const awningTex = canvasTexture(256, 64, (c) => {
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? "#ffffff" : "#2fb38a";
      c.fillRect(i * 16, 0, 16, 64);
    }
    // scalloped lower edge shading
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(0, 52, 256, 12);
  });
  awningTex.wrapS = THREE.RepeatWrapping;
  awningTex.repeat.set(6, 1);
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.3), new THREE.MeshLambertMaterial({ map: awningTex, side: THREE.DoubleSide }));
  awning.rotation.x = -Math.PI / 2 + 0.35;
  awning.position.set(W / 2, 2.82, D + 0.65);
  add(awning);
  // band, sign and awning fade together when the camera looks in from the street
  band.userData.fade = [band, fascia, awning];
  band.userData.box = { minX: 0, maxX: W, minZ: D - 0.1, maxZ: D + 1.3 };

  // kaki lima pillars with base and capital
  for (let x = -24; x <= W + 24; x += 6) {
    add(at(cube(0.35, 2.8, 0.35, 0xf3ede2), x, 1.5, D + 2.8));
    add(at(cube(0.45, 0.2, 0.45, 0xd9cfbf), x, 0.1, D + 2.8));
    add(at(cube(0.45, 0.15, 0.45, 0xd9cfbf), x, 2.95, D + 2.8));
  }

  // neighbouring shophouses on both sides
  const neighbours: [number, string, string, string, string, number][] = [
    [-6, "#f7d6a8", "#e9b77a", "KEDAI GUNTING ✂️", "#e07b39", 1],
    [-18, "#c9e6f5", "#9cc8e0", "KEDAI MAKAN 🍛", "#e8333f", 0.85],
    [W + 6, "#e3d4f5", "#c5b0e6", "FARMASI 💊", "#2e8f57", 1],
    [W + 18, "#fff1a8", "#e6d47a", "KEDAI HARDWARE 🔧", "#3b8ff0", 0.5],
  ];
  for (const [cx, wall, trim, sign, bg, open] of neighbours) add(at(shophouse(11.6, wall, trim, sign, bg, open), cx, 0, D));

  // parked cars and motorbikes in the bays
  const bays: [number, number][] = [[1.3, 0xe8333f], [6.5, 0x3b8ff0], [17.9, 0xf9c833], [-9.1, 0xffffff], [28.3, 0x2fb38a]];
  for (const [x, color] of bays) add(at(car(color), x, 0, D + 6, Math.PI / 2 + (x > 10 ? Math.PI : 0)));
  [10.2, 10.9, 13.2, 13.9].forEach((x, i) => add(at(motorbike([0xbb6bd9, 0x23262d, 0xe8333f, 0x3b8ff0][i]), x, 0, D + 5.2, Math.PI / 2)));

  // far pavement: trees and street lamps
  for (let x = -30; x <= W + 30; x += 7) add(at(tree(0.9 + ((x * 13) % 5) / 20), x, 0, D + 17.6, x));
  for (let x = -26.5; x <= W + 30; x += 14) add(at(streetLamp(), x, 0, D + 16.4, Math.PI / 2));
  // shop row across the road (same painted facades, shutters at different heights)
  const across = ["#f3d1c4", "#d6ecf7", "#e8f3d6", "#fbe7b5"];
  const acrossSigns = ["KEDAI RUNCIT AH SENG", "RESTORAN NASI KANDAR", "KEDAI TELEFON", "DOBI LAYAN DIRI", "KEDAI BUKU", "BENGKEL MOTOR"];
  const acrossBg = ["#e8333f", "#2e8f57", "#3b8ff0", "#7a55d6", "#e07b39", "#23364f"];
  for (let i = 0, x = -40; x <= W + 40; x += 9, i++) {
    const wall = across[i % 4];
    const house = shophouse(8.6, wall, "#ffffff", acrossSigns[i % acrossSigns.length], acrossBg[i % acrossBg.length], [1, 0.6, 0.3, 0.9][i % 4]);
    house.scale.z = 0.25; // shallow: only the front matters from here
    add(at(house, x, 0, D + 20.2, Math.PI));
  }

  // passing traffic: two cars looping along the road in opposite lanes
  const traffic = [
    { obj: car(0x7a55d6), z: D + 11, speed: 6, dir: 1 },
    { obj: car(0xf5973f), z: D + 14, speed: 5, dir: -1 },
  ];
  traffic.forEach((t, i) => {
    t.obj.position.set(i ? X1 - 20 : X0 + 20, 0, t.z);
    t.obj.rotation.y = t.dir > 0 ? 0 : Math.PI;
    add(t.obj);
  });

  return {
    group,
    occluders: [band],
    tick(dt: number) {
      for (const t of traffic) {
        t.obj.position.x += t.dir * t.speed * dt;
        if (t.dir > 0 && t.obj.position.x > X1 - 10) t.obj.position.x = X0 + 10;
        if (t.dir < 0 && t.obj.position.x < X0 + 10) t.obj.position.x = X1 - 10;
      }
    },
  };
}
