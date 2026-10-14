import * as THREE from "three";
import { box, type Box } from "./collisions";
import { wallClock } from "./Decor";
import { at, cube, mat, rbox } from "./kit";

// The surau (x 18–24, z 10–17, door on the west wall). The qibla is the north wall (z = 10),
// which the prayer mats face. Two parts: the prayer hall (carpet with saf lines, mats, mihrab
// niche, Quran shelf with rehal, telekung rail, prayer-times board, clock, shoe rack) and an
// ablution corner at the south end behind a half wall, reached straight from the door.
// Calm and respectful: no scores, timers or quiz elements.

function canvasPlane(w: number, h: number, px: number, draw: (c: CanvasRenderingContext2D, cw: number, ch: number) => void): THREE.Mesh {
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = Math.round((px * h) / w);
  draw(cv.getContext("2d")!, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t, transparent: true }));
}

/** Green carpet with gold saf (row) lines running across the room. */
function carpet(w: number, d: number): THREE.Mesh {
  const m = canvasPlane(w, d, 256, (c, cw, ch) => {
    c.fillStyle = "#2e7d52";
    c.fillRect(0, 0, cw, ch);
    c.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 0; y < ch; y += 6) c.fillRect(0, y, cw, 2);
    c.fillStyle = "#e3c26b";
    const rows = 4;
    for (let r = 1; r <= rows; r++) c.fillRect(0, (r * ch) / (rows + 1) - 2, cw, 4);
    c.strokeStyle = "#e3c26b";
    c.lineWidth = 6;
    c.strokeRect(3, 3, cw - 6, ch - 6);
  });
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Mihrab niche panel: pointed arch with a geometric border (no text). */
function mihrab(): THREE.Mesh {
  return canvasPlane(1.5, 2.1, 256, (c, w, h) => {
    const arch = () => {
      c.beginPath();
      c.moveTo(20, h);
      c.lineTo(20, h * 0.42);
      c.quadraticCurveTo(20, h * 0.1, w / 2, 14);
      c.quadraticCurveTo(w - 20, h * 0.1, w - 20, h * 0.42);
      c.lineTo(w - 20, h);
      c.closePath();
    };
    arch();
    c.fillStyle = "#c9a14a";
    c.fill();
    c.save();
    c.translate(0, 0);
    c.scale(1, 1);
    c.beginPath();
    c.moveTo(38, h);
    c.lineTo(38, h * 0.45);
    c.quadraticCurveTo(38, h * 0.16, w / 2, 40);
    c.quadraticCurveTo(w - 38, h * 0.16, w - 38, h * 0.45);
    c.lineTo(w - 38, h);
    c.closePath();
    c.fillStyle = "#1f6b45";
    c.fill();
    c.clip();
    // eight-point star lattice
    c.strokeStyle = "rgba(227,194,107,0.55)";
    c.lineWidth = 2;
    for (let y = 30; y < h; y += 36)
      for (let x = 20; x < w; x += 36) {
        c.beginPath();
        for (let k = 0; k < 16; k++) {
          const r = k % 2 ? 7 : 15;
          const a = (k / 16) * Math.PI * 2;
          c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        c.closePath();
        c.stroke();
      }
    c.restore();
  });
}

function prayerTimes(): THREE.Mesh {
  return canvasPlane(0.8, 1.0, 256, (c, w, h) => {
    c.fillStyle = "#14402b";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#e3c26b";
    c.lineWidth = 8;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = "#e3c26b";
    c.textAlign = "center";
    c.font = '900 24px Nunito, "Segoe UI", sans-serif';
    c.fillText("WAKTU SOLAT", w / 2, 44);
    const times: [string, string][] = [["Subuh", "5:58"], ["Syuruk", "7:08"], ["Zohor", "1:15"], ["Asar", "4:28"], ["Maghrib", "7:16"], ["Isyak", "8:27"]];
    c.font = '800 21px Nunito, "Segoe UI", sans-serif';
    times.forEach(([n, t], i) => {
      const y = 92 + i * 38;
      c.fillStyle = "#ffffff";
      c.textAlign = "left";
      c.fillText(n, 28, y);
      c.fillStyle = "#9df0c4";
      c.textAlign = "right";
      c.font = '700 22px "Courier New", monospace';
      c.fillText(t, w - 28, y);
      c.font = '800 21px Nunito, "Segoe UI", sans-serif';
    });
  });
}

function sejadah(color: number, inner: number): THREE.Group {
  const m = new THREE.Group();
  m.add(at(rbox(0.75, 0.02, 1.25, color, 0.06), 0, 0.012, 0));
  m.add(at(rbox(0.6, 0.025, 1.1, inner, 0.05), 0, 0.012, 0));
  const arch = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16, 0, Math.PI), mat(0xf2c94c));
  arch.rotation.x = -Math.PI / 2;
  arch.position.set(0, 0.04, -0.38); // the arch end points to the qibla (-z)
  m.add(arch);
  return m;
}

export function buildSurau(group: THREE.Group, solid: (b: Box) => void): void {
  const add = (o: THREE.Object3D) => (group.add(o), o);

  // ---- prayer hall ----
  add(at(carpet(4.5, 4.6), 21.65, 0.01, 12.45));
  [
    [20.2, 0x2e8f57, 0x23744a],
    [21.1, 0x8f2e3b, 0x6e2230],
    [22.0, 0x2e5f8f, 0x23486e],
    [22.9, 0x6b4f2e, 0x523b22],
  ].forEach(([x, c, i]) => add(at(sejadah(c, i), x, 0, 11.6)));
  add(at(mihrab(), 21.55, 1.08, 10.115));
  wallClock(group, 23.2, 2.15, 10.13, "south");

  // Quran shelf with a rehal and a book, against the east wall
  const shelf = new THREE.Group();
  shelf.add(at(rbox(1.2, 0.8, 0.38, 0xa8763c, 0.04), 0, 0, 0));
  for (let i = 0; i < 6; i++) shelf.add(at(cube(0.08, 0.26, 0.2, [0x1f6b45, 0x8f2e3b, 0x1f4f8f][i % 3]), -0.4 + i * 0.1, 0.48, 0)); // books inside
  shelf.add(at(cube(1.1, 0.02, 0.3, 0x8a5a33), 0, 0.33, 0));
  const rehal = new THREE.Group();
  for (const s of [-1, 1]) {
    const leaf = cube(0.3, 0.02, 0.22, 0xc98a4b);
    leaf.rotation.x = s * 0.6;
    rehal.add(at(leaf, 0, 0.08, s * 0.07));
  }
  const book = cube(0.26, 0.04, 0.2, 0x1f6b45);
  rehal.add(at(book, 0, 0.17, 0));
  shelf.add(at(rehal, 0.3, 0.8, 0));
  add(at(shelf, 23.62, 0, 12.6, -Math.PI / 2));
  solid(box(23.4, 12.0, 0.5, 1.2));

  // telekung / sarung rail on the east wall
  add(at(cube(0.04, 0.04, 1.2, 0xc9d2dc), 23.82, 1.75, 14.3));
  [0xffffff, 0xf3eefb, 0xdff3ea, 0x7a55d6, 0x2e8f57].forEach((c, i) => {
    const cloth = rbox(0.06, 0.85, 0.2, c, 0.03);
    add(at(cloth, 23.78, 0.9, 13.8 + i * 0.24));
  });

  // prayer-times board and the shoe rack by the door
  const board = prayerTimes();
  add(at(board, 18.12, 1.55, 11.0, Math.PI / 2));
  const rack = new THREE.Group();
  rack.add(at(rbox(1.0, 0.5, 0.35, 0xa8763c, 0.04), 0, 0, 0));
  rack.add(at(cube(0.96, 0.02, 0.32, 0x8a5a33), 0, 0.25, 0));
  for (let i = 0; i < 4; i++) rack.add(at(rbox(0.2, 0.08, 0.12, [0x3a4252, 0xec5470, 0xffffff, 0x8a5a33][i], 0.03), -0.33 + i * 0.22, i % 2 ? 0.27 : 0.5, 0));
  add(at(rack, 18.8, 0, 11.2, Math.PI / 2));
  solid(box(18.6, 10.7, 0.4, 1.0));

  // ---- ablution corner (south end, behind a half wall) ----
  const z0 = 14.9; // half wall line; about 1 m of walkway between it and the bench
  // half wall with a gap by the door side
  add(at(cube(4.4, 1.05, 0.12, 0xe6f2ec), 21.8, 0.525, z0));
  add(at(cube(4.44, 0.06, 0.16, 0x2e8f57), 21.8, 1.08, z0));
  solid(box(19.6, z0 - 0.06, 4.4, 0.12));
  // tiled floor and backsplash
  const tiles = canvasPlane(5.8, 1.7, 256, (c, w, h) => {
    const s = 22;
    for (let x = 0; x < w; x += s)
      for (let y = 0; y < h; y += s) {
        c.fillStyle = (x + y) % (2 * s) ? "#d7e9ef" : "#c4dde6";
        c.fillRect(x, y, s, s);
      }
    c.strokeStyle = "#a9c4cf";
    for (let x = 0; x <= w; x += s) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y <= h; y += s) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  });
  tiles.rotation.x = -Math.PI / 2;
  add(at(tiles, 21, 0.012, (z0 + 16.9) / 2));
  const splash = canvasPlane(5.6, 1.5, 256, (c, w, h) => {
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#c5d9e2";
    c.lineWidth = 2;
    for (let x = 0; x <= w; x += 18) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    for (let y = 0; y <= h; y += 18) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  });
  add(at(splash, 21, 0.93, 16.885, Math.PI));
  // stainless trough with four taps, and a low bench to sit on
  add(at(rbox(4.6, 0.12, 0.34, 0xc9d2dc, 0.04), 21.2, 0.38, 16.7));
  add(at(cube(4.4, 0.02, 0.24, 0x8e9aa8), 21.2, 0.5, 16.7)); // channel
  for (const x of [19.6, 20.7, 21.8, 22.9]) {
    add(at(cube(0.05, 0.05, 0.16, 0xd8dde6), x, 0.95, 16.8)); // spout
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), mat(0x9aa6b5)), x, 1.03, 16.86)); // handle
  }
  solid(box(18.9, 16.5, 4.6, 0.45));
  add(at(rbox(4.2, 0.32, 0.3, 0xa8763c, 0.04), 21.3, 0, 16.15)); // bench facing the taps
  solid(box(19.2, 16.0, 4.2, 0.3));
  // little sticker on the half wall
  const note = canvasPlane(0.7, 0.24, 160, (c, w, h) => {
    c.fillStyle = "#2a9fd6";
    c.beginPath();
    c.roundRect(2, 2, w - 4, h - 4, 10);
    c.fill();
    c.fillStyle = "#ffffff";
    c.font = '900 22px Nunito, "Segoe UI", "Segoe UI Emoji", sans-serif';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Jimatkan air 💧", w / 2, h / 2 + 1);
  });
  add(at(note, 22.6, 0.75, z0 + 0.065, 0));
}
