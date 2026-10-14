import * as THREE from "three";
import { box, type Box } from "./collisions";
import { wallClock } from "./Decor";
import { at, cube, mat, rbox } from "./kit";

// Staff rest room (x 16–24, z 0–7, door on the south wall at x 16.3–18.1): a lounge (sofa,
// rug, coffee table, bean bag, wall TV), a pantry along the east wall (counter with sink,
// microwave, kettle, coffee and tea jars, wall cabinets, fridge), a small dining table, staff
// lockers and a notice board with the shift roster.

function canvasPlane(w: number, h: number, px: number, draw: (c: CanvasRenderingContext2D, cw: number, ch: number) => void, basic = false): THREE.Mesh {
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = Math.round((px * h) / w);
  draw(cv.getContext("2d")!, cv.width, cv.height);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const m = basic ? new THREE.MeshBasicMaterial({ map: t }) : new THREE.MeshLambertMaterial({ map: t });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

/** Wall TV with a little animated cartoon (cheap: redrawn twice a second). */
function wallTv(group: THREE.Group, x: number, y: number, z: number): void {
  const g = new THREE.Group();
  g.add(at(cube(1.3, 0.78, 0.06, 0x23262d), 0, 0, 0));
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 144;
  const c = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  let f = 0;
  const draw = () => {
    const sky = c.createLinearGradient(0, 0, 0, 144);
    sky.addColorStop(0, "#7cc8f5");
    sky.addColorStop(1, "#d8f0ff");
    c.fillStyle = sky;
    c.fillRect(0, 0, 256, 144);
    c.fillStyle = "#ffffff";
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 100 + f * 6) % 300) - 30;
      c.beginPath();
      c.arc(cx, 30 + i * 12, 14, 0, Math.PI * 2);
      c.arc(cx + 16, 26 + i * 12, 18, 0, Math.PI * 2);
      c.arc(cx + 34, 30 + i * 12, 13, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#62c46c";
    c.fillRect(0, 104, 256, 40);
    // a bouncing cat
    const bx = 60 + ((f * 9) % 140);
    const by = 96 - Math.abs(Math.sin(f * 0.9)) * 22;
    c.fillStyle = "#f5973f";
    c.beginPath();
    c.arc(bx, by, 13, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(bx - 11, by - 7);
    c.lineTo(bx - 6, by - 20);
    c.lineTo(bx - 1, by - 10);
    c.moveTo(bx + 11, by - 7);
    c.lineTo(bx + 6, by - 20);
    c.lineTo(bx + 1, by - 10);
    c.fill();
    c.fillStyle = "#23262d";
    c.fillRect(bx - 6, by - 3, 3, 3);
    c.fillRect(bx + 3, by - 3, 3, 3);
    c.fillStyle = "rgba(0,0,0,0.55)";
    c.fillRect(0, 124, 256, 20);
    c.fillStyle = "#ffffff";
    c.font = '800 13px Nunito, "Segoe UI", sans-serif';
    c.fillText("TV KEDAI · Kartun Petang", 8, 138);
    tex.needsUpdate = true;
    f++;
  };
  draw();
  window.setInterval(draw, 500);
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.68), new THREE.MeshBasicMaterial({ map: tex })), 0, 0, 0.032));
  group.add(at(g, x, y, z, Math.PI));
}

function noticeBoard(): THREE.Mesh {
  return canvasPlane(1.2, 0.8, 300, (c, w, h) => {
    c.fillStyle = "#c98f5a";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#e0b07e";
    c.fillRect(10, 10, w - 20, h - 20);
    const paper = (x: number, y: number, pw: number, ph: number, bg: string, lines: string[], rot: number) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.fillStyle = bg;
      c.fillRect(0, 0, pw, ph);
      c.fillStyle = "#23364f";
      c.font = '800 12px Nunito, "Segoe UI", sans-serif';
      lines.forEach((l, i) => c.fillText(l, 8, 18 + i * 15));
      c.fillStyle = "#e8333f";
      c.beginPath();
      c.arc(pw / 2, 4, 4, 0, Math.PI * 2);
      c.fill();
      c.restore();
    };
    paper(18, 18, 140, 120, "#ffffff", ["JADUAL SYIF", "Isn  Pagi  8-4", "Sel  Pagi  8-4", "Rab  Petang 2-10", "Kha  Petang 2-10", "Jum  Cuti 🌴"], -0.03);
    paper(170, 22, 110, 70, "#fff4a8", ["MEMO", "Mesyuarat staf", "Jumaat 10 pg"], 0.05);
    paper(176, 104, 100, 76, "#d6f5e3", ["Jangan lupa", "cuci mug", "sendiri ya! ☕"], -0.04);
  });
}

export function buildStaffRoom(group: THREE.Group, solid: (b: Box) => void): void {
  const add = (o: THREE.Object3D) => (group.add(o), o);

  // ---- lounge: rug, sofa with cushions, coffee table, bean bag, TV ----
  const rug = canvasPlane(3.2, 2.2, 256, (c, w, h) => {
    c.fillStyle = "#f2c9a0";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#e07b39";
    c.lineWidth = 10;
    c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = "rgba(224,123,57,0.25)";
    for (let i = 0; i < 6; i++) c.fillRect(30 + i * 34, 40, 14, h - 80);
  });
  rug.rotation.x = -Math.PI / 2;
  add(at(rug, 20.5, 0.012, 2.4));
  const sofa = new THREE.Group();
  sofa.add(at(rbox(2.4, 0.42, 0.9, 0x8f6ee0, 0.15), 0, 0, 0));
  sofa.add(at(rbox(2.4, 0.5, 0.25, 0x7a5ad0, 0.12), 0, 0.4, -0.33));
  sofa.add(at(rbox(0.25, 0.3, 0.9, 0x7a5ad0, 0.1), -1.2, 0.4, 0));
  sofa.add(at(rbox(0.25, 0.3, 0.9, 0x7a5ad0, 0.1), 1.2, 0.4, 0));
  for (const [x, c] of [[-0.75, 0xf9c833], [0.75, 0x2fb38a]] as const) {
    const cushion = rbox(0.42, 0.38, 0.14, c, 0.08);
    cushion.rotation.x = -0.25;
    sofa.add(at(cushion, x, 0.45, -0.18));
  }
  add(at(sofa, 20.5, 0, 1));
  solid(box(19.15, 0.5, 2.7, 1));
  add(at(rbox(1.2, 0.4, 0.7, 0xd9a86c, 0.08), 20.5, 0, 2.6)); // coffee table
  solid(box(19.9, 2.25, 1.2, 0.7));
  for (const [x, c] of [[20.2, 0xffffff], [20.45, 0xe8333f]] as const) {
    add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 12), mat(c)), x, 0.45, 2.55)); // mugs
  }
  const mag = cube(0.3, 0.015, 0.22, 0x3b8ff0);
  mag.rotation.y = 0.3;
  add(at(mag, 20.85, 0.41, 2.7));
  const beanbag = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat(0x3b8ff0));
  beanbag.scale.set(1, 0.65, 1);
  add(at(beanbag, 18.4, 0.27, 1.4));
  solid(box(18.0, 1.0, 0.8, 0.8));
  wallTv(group, 20.5, 1.55, 6.87);
  add(at(rbox(1.4, 0.45, 0.4, 0x6b4f2e, 0.04), 20.5, 0, 6.65)); // TV cabinet
  solid(box(19.8, 6.45, 1.4, 0.45));

  // ---- pantry along the east wall ----
  const counter = new THREE.Group();
  counter.add(at(rbox(3.0, 0.88, 0.6, 0xf4f7fb, 0.04), 0, 0, 0));
  counter.add(at(cube(3.04, 0.05, 0.64, 0x8a8f98), 0, 0.9, 0)); // worktop
  for (let i = 0; i < 4; i++) counter.add(at(cube(0.04, 0.6, 0.01, 0xc9d2dc), -1.13 + i * 0.75, 0.42, 0.305)); // cabinet seams
  counter.add(at(cube(0.5, 0.02, 0.36, 0xc9d2dc), -0.8, 0.93, 0)); // sink
  counter.add(at(cube(0.04, 0.22, 0.04, 0xc9d2dc), -0.8, 1.03, -0.22)); // tap
  counter.add(at(cube(0.04, 0.03, 0.16, 0xc9d2dc), -0.8, 1.14, -0.16));
  counter.add(at(rbox(0.5, 0.3, 0.36, 0xeef2f6, 0.04), 0.25, 0.92, -0.05)); // microwave
  counter.add(at(cube(0.3, 0.2, 0.01, 0x23262d), 0.2, 1.07, 0.135));
  counter.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.22, 14), mat(0xe8333f)), 0.85, 1.03, 0)); // kettle
  counter.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 14), mat(0x23262d)), 0.85, 0.93, 0));
  for (const [x, c] of [[1.15, 0x6b3e26], [1.32, 0x2e8f57]] as const) {
    counter.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), mat(0xe6f6ff, { transparent: true, opacity: 0.5 })), x, 1.0, -0.1));
    counter.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 12), mat(c)), x, 0.97, -0.1)); // coffee / tea inside
  }
  // wall cabinets above
  counter.add(at(rbox(3.0, 0.6, 0.35, 0xe6d3b5, 0.03), 0, 1.6, -0.12));
  for (let i = 0; i < 4; i++) counter.add(at(cube(0.03, 0.12, 0.02, 0x9aa6b5), -1.1 + i * 0.75, 1.75, 0.065));
  add(at(counter, 23.6, 0, 3.6, -Math.PI / 2));
  solid(box(23.3, 2.1, 0.6, 3.0));
  // fridge with magnets
  const fridge = new THREE.Group();
  fridge.add(at(rbox(0.8, 1.7, 0.65, 0xf4f7fb, 0.08), 0, 0, 0));
  fridge.add(at(cube(0.78, 0.02, 0.01, 0xc9d2dc), 0, 1.15, 0.33));
  fridge.add(at(cube(0.04, 0.35, 0.04, 0x9aa6b5), -0.3, 1.35, 0.35));
  fridge.add(at(cube(0.04, 0.45, 0.04, 0x9aa6b5), -0.3, 0.75, 0.35));
  [0xe8333f, 0xf9c833, 0x3b8ff0, 0x2fb38a].forEach((c, i) => fridge.add(at(cube(0.08, 0.08, 0.02, c), 0.05 + (i % 2) * 0.16, 1.35 + Math.floor(i / 2) * 0.14, 0.34)));
  add(at(fridge, 23.55, 0, 5.75, -Math.PI / 2));
  solid(box(23.2, 5.4, 0.7, 0.8));

  // ---- small dining table with two chairs ----
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), mat(0xffffff)), 17.7, 0.74, 4.4));
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), mat(0x9aa6b5)), 17.7, 0.36, 4.4));
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 14), mat(0x9aa6b5)), 17.7, 0.015, 4.4));
  for (const dz of [-0.62, 0.62]) {
    const chair = new THREE.Group();
    chair.add(at(rbox(0.42, 0.06, 0.42, 0x2fb38a, 0.03), 0, 0.44, 0));
    chair.add(at(rbox(0.42, 0.45, 0.06, 0x2fb38a, 0.03), 0, 0.47, -0.2));
    for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) chair.add(at(cube(0.03, 0.44, 0.03, 0x9aa6b5), lx, 0.22, lz));
    add(at(chair, 17.7, 0, 4.4 + dz, dz > 0 ? Math.PI : 0));
  }
  solid(box(17.25, 3.95, 0.9, 0.9));
  // nasi bungkus and teh tarik
  const parcel = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xc98a4b));
  parcel.scale.set(1.2, 0.5, 1);
  add(at(parcel, 17.6, 0.8, 4.3));
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.13, 12), mat(0xd9a86c)), 17.9, 0.83, 4.5));

  // ---- staff lockers on the west wall ----
  const lockers = new THREE.Group();
  const lockerColors = [0x3b8ff0, 0x2fb38a, 0xf9c833, 0xe8333f];
  lockerColors.forEach((c, i) => {
    lockers.add(at(rbox(0.5, 1.8, 0.45, c, 0.03), -0.78 + i * 0.52, 0, 0));
    for (let k = 0; k < 3; k++) lockers.add(at(cube(0.3, 0.02, 0.01, 0x23262d), -0.78 + i * 0.52, 1.55 - k * 0.05, 0.23)); // vents
    lockers.add(at(cube(0.04, 0.12, 0.03, 0xd8dde6), -0.6 + i * 0.52, 0.95, 0.24)); // handle
    lockers.add(at(cube(0.2, 0.08, 0.01, 0xffffff), -0.78 + i * 0.52, 1.3, 0.23)); // name tag
  });
  add(at(lockers, 16.35, 0, 1.6, Math.PI / 2));
  solid(box(16.1, 0.5, 0.5, 2.2));

  // ---- notice board, clock, plant ----
  add(at(noticeBoard(), 16.12, 1.5, 4.3, Math.PI / 2));
  wallClock(group, 20.5, 2.2, 0.13, "south");
}
