import * as THREE from "three";
import { at, cube, mat } from "./kit";

// Shop dressing that makes the kedai runcit feel lived in: promo posters, shelf-end wobblers,
// a working wall clock, calendar, signs, CCTV and a door mat. Purely decorative (no
// collisions), all text is fictional.

/** Canvas poster on a plane. `lines`: [text, size px, colour][]; drawn centred top to bottom. */
function poster(
  w: number,
  h: number,
  bg: string,
  lines: [string, number, string][],
  opts: { border?: string; burst?: string; round?: boolean } = {}
): THREE.Mesh {
  const px = 256;
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = Math.round((px * h) / w);
  const c = cv.getContext("2d")!;
  if (opts.round) {
    c.beginPath();
    c.arc(px / 2, cv.height / 2, px / 2 - 4, 0, Math.PI * 2);
    c.fillStyle = bg;
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = opts.border ?? "#ffffff";
    c.stroke();
  } else {
    c.fillStyle = bg;
    c.fillRect(0, 0, px, cv.height);
    if (opts.burst) {
      // starburst behind the headline
      c.fillStyle = opts.burst;
      c.beginPath();
      const cx = px / 2;
      const cy = cv.height * 0.38;
      for (let i = 0; i < 32; i++) {
        const r = i % 2 ? px * 0.26 : px * 0.42;
        const a = (i / 32) * Math.PI * 2;
        c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
      }
      c.fill();
    }
    c.lineWidth = 10;
    c.strokeStyle = opts.border ?? "#ffffff";
    c.strokeRect(5, 5, px - 10, cv.height - 10);
  }
  c.textAlign = "center";
  c.textBaseline = "middle";
  const total = lines.reduce((a, l) => a + l[1] * 1.15, 0);
  let y = (cv.height - total) / 2;
  for (const [text, size, color] of lines) {
    let s = size;
    do c.font = `900 ${s--}px Nunito, "Segoe UI", "Segoe UI Emoji", system-ui, sans-serif`;
    while (c.measureText(text).width > px - 30 && s > 8);
    c.fillStyle = color;
    c.fillText(text, px / 2, y + size * 0.6);
    y += size * 1.15;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: !!opts.round }));
}

/** Wall facings: rotation that turns a plane's front (+z) towards the room. */
const FACE = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 } as const;

/** Wall clock that shows the real time. */
export function wallClock(group: THREE.Group, x: number, y: number, z: number, face: keyof typeof FACE): void {
  const clock = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 32).rotateX(Math.PI / 2), mat(0xe8333f));
  clock.add(rim);
  const face2 = poster(0.52, 0.52, "#ffffff", [["", 10, "#000"]], { round: true, border: "#ffffff" });
  // numbers
  const cv = (face2.material as THREE.MeshLambertMaterial).map!.image as HTMLCanvasElement;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#23364f";
  c.font = '900 30px Nunito, "Segoe UI", sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    c.fillText(String(i), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96);
  }
  (face2.material as THREE.MeshLambertMaterial).map!.needsUpdate = true;
  face2.position.z = 0.031;
  clock.add(face2);
  const hand = (len: number, wid: number, color: number) => {
    const pivot = new THREE.Object3D();
    const m = cube(wid, len, 0.01, color);
    m.position.y = len / 2 - 0.02;
    pivot.add(m);
    pivot.position.z = 0.04;
    clock.add(pivot);
    return pivot;
  };
  const hourHand = hand(0.14, 0.025, 0x23364f);
  const minHand = hand(0.21, 0.016, 0x23364f);
  const secHand = hand(0.22, 0.006, 0xe8333f);
  clock.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12).rotateX(Math.PI / 2), mat(0x23364f)), 0, 0, 0.05));
  const set = () => {
    const d = new Date();
    const s = d.getSeconds();
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    secHand.rotation.z = -(s / 60) * Math.PI * 2;
    minHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(h / 12) * Math.PI * 2;
  };
  set();
  window.setInterval(set, 1000);
  group.add(at(clock, x, y, z, FACE[face]));
}

/** Simple month calendar for the current month. */
function calendar(group: THREE.Group, x: number, y: number, z: number, face: keyof typeof FACE): void {
  const months = ["JANUARI", "FEBRUARI", "MAC", "APRIL", "MEI", "JUN", "JULAI", "OGOS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DISEMBER"];
  const now = new Date();
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 320;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, 256, 320);
  c.fillStyle = "#2fb38a";
  c.fillRect(0, 0, 256, 120);
  c.fillStyle = "#ffffff";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = '900 26px Nunito, "Segoe UI", sans-serif';
  c.fillText("KEDAI MINI MARKET HERO", 128, 40);
  c.font = '900 34px Nunito, "Segoe UI", sans-serif';
  c.fillText(`${months[now.getMonth()]} ${now.getFullYear()}`, 128, 88);
  const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  c.font = '800 17px Nunito, "Segoe UI", sans-serif';
  ["A", "I", "S", "R", "K", "J", "S"].forEach((d, i) => {
    c.fillStyle = i === 0 ? "#e8333f" : "#23364f";
    c.fillText(d, 22 + i * 35, 140);
  });
  for (let d = 1; d <= days; d++) {
    const cell = first + d - 1;
    const cx = 22 + (cell % 7) * 35;
    const cy = 172 + Math.floor(cell / 7) * 28;
    if (d === now.getDate()) {
      c.fillStyle = "#f9c833";
      c.beginPath();
      c.arc(cx, cy, 13, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = cell % 7 === 0 ? "#e8333f" : "#23364f";
    c.fillText(String(d), cx, cy);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.625), new THREE.MeshLambertMaterial({ map: tex }));
  group.add(at(m, x, y, z, FACE[face]));
}

function cctv(group: THREE.Group, x: number, y: number, z: number, yaw: number): void {
  const g = new THREE.Group();
  g.add(at(cube(0.08, 0.08, 0.08, 0xf4f7fb), 0, 0, 0));
  const body = new THREE.Group();
  body.add(at(cube(0.12, 0.1, 0.24, 0xf4f7fb), 0, -0.06, 0.12));
  body.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12).rotateX(Math.PI / 2), mat(0x23262d)), 0, -0.06, 0.25));
  body.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b3b })), 0.04, -0.02, 0.2));
  body.rotation.x = 0.45;
  g.add(body);
  group.add(at(g, x, y, z, yaw));
}

export function buildDecor(group: THREE.Group): void {
  // promo posters on the back corridor wall (between the doors)
  group.add(at(poster(1.0, 1.3, "#e8333f", [["HARGA", 46, "#ffffff"], ["RUNTUH!", 56, "#f9c833"], ["", 20, "#fff"], ["Jimat setiap hari", 22, "#ffffff"]], { burst: "#c41f2c" }), 2.4, 1.72, 7.11, FACE.south));
  group.add(at(poster(1.0, 1.3, "#f9c833", [["BELI 2", 52, "#e8333f"], ["PERCUMA 1", 44, "#23364f"], ["", 16, "#fff"], ["Snek terpilih", 24, "#23364f"]], { burst: "#ffe27a" }), 14.6, 1.72, 7.11, FACE.south));
  group.add(at(poster(1.2, 1.3, "#2fb38a", [["PROMOSI", 40, "#ffffff"], ["MINGGU INI", 32, "#ffffff"], ["🍜 Mi Segera", 30, "#fff4c2"], ["RM5.90", 52, "#f9c833"]]), 0.11, 1.72, 27.9, FACE.east));

  // signs: halal + calendar + clock behind the till, no smoking / thank you by the entrance
  wallClock(group, 0.13, 2.25, 25.2, "east");
  calendar(group, 0.11, 1.45, 25.2, "east");
  group.add(at(poster(0.5, 0.5, "#1f8a4c", [["HALAL", 42, "#ffffff"], ["حلال", 40, "#ffffff"]], { round: true }), 0.11, 1.55, 26.4, FACE.east));
  group.add(at(poster(0.55, 0.55, "#ffffff", [["🚭", 70, "#e8333f"], ["DILARANG", 24, "#e8333f"], ["MEROKOK", 24, "#e8333f"]], { round: true, border: "#e8333f" }), 23.89, 1.6, 25.0, FACE.west));
  group.add(at(poster(1.6, 0.9, "#7a55d6", [["TERIMA KASIH", 40, "#ffffff"], ["DATANG LAGI! 😊", 32, "#f9c833"]]), 23.89, 1.6, 27.3, FACE.west));
  group.add(at(poster(2.2, 0.42, "#23364f", [["Terima Kasih · Datang Lagi", 34, "#ffffff"]]), 12, 2.55, 29.75, FACE.north));

  // shelf-end wobblers facing the till side
  const ends: [number, string, string, string][] = [
    [6.2, "#e8333f", "JIMAT!", "#ffffff"],
    [10.75, "#f9c833", "MURAH!", "#e8333f"],
    [15.2, "#3b8ff0", "BARU!", "#ffffff"],
  ];
  for (const [x, bg, text, fg] of ends) group.add(at(poster(0.7, 0.5, bg, [[text, 64, fg]], { burst: "rgba(255,255,255,0.25)" }), x, 1.45, 18.54, FACE.south));

  // CCTV in the corners
  cctv(group, 0.2, 2.45, 29.7, Math.PI * 0.8);
  cctv(group, 17.8, 2.45, 23.3, -Math.PI * 0.75);
  cctv(group, 0.2, 2.45, 10.3, Math.PI * 0.25);

  // door mat
  const matTex = poster(2.6, 0.9, "#2f6b4f", [["SELAMAT DATANG", 44, "#f9e7b0"]], { border: "#f9e7b0" });
  matTex.rotation.x = -Math.PI / 2;
  matTex.position.set(12, 0.012, 28.9);
  group.add(matTex);
}

// ---------- dining corner ----------

/** Round café table with four colourful stools. */
export function diningTable(group: THREE.Group, x: number, z: number): void {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 24), mat(0xffffff)), 0, 0.74, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.03, 24), mat(0xf9c833)), 0, 0.71, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 10), mat(0x9aa6b5)), 0, 0.36, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.04, 18), mat(0x9aa6b5)), 0, 0.02, 0));
  [0xe8333f, 0x2fb38a, 0x3b8ff0, 0xbb6bd9].forEach((color, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const s = new THREE.Group();
    s.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 18), mat(color)), 0, 0.46, 0));
    s.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), mat(0x9aa6b5)), 0, 0.22, 0));
    s.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.03, 14), mat(0x9aa6b5)), 0, 0.015, 0));
    g.add(at(s, Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72));
  });
  // a drink and a snack left on the table
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 12), mat(0xc98a4b)), 0.12, 0.83, 0.05));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 0.5, 1.3), mat(0xf9c833)), -0.15, 0.8, -0.05));
  group.add(at(g, x, 0, z));
}

/** Small self-service counter with a microwave and a hot-water dispenser, back against a wall, facing `face`. */
export function snackCounter(group: THREE.Group, x: number, z: number, face: keyof typeof FACE): void {
  const g = new THREE.Group();
  g.add(at(cube(2, 0.9, 0.5, 0xe8ecf1), 0, 0.45, 0));
  g.add(at(cube(2.04, 0.05, 0.54, 0xd9a86c), 0, 0.92, 0));
  g.add(at(cube(2, 0.1, 0.02, 0x2fb38a), 0, 0.78, 0.26));
  // microwave
  g.add(at(cube(0.55, 0.32, 0.38, 0xf4f7fb), -0.5, 1.11, 0));
  g.add(at(cube(0.34, 0.22, 0.01, 0x23262d), -0.58, 1.11, 0.195));
  g.add(at(cube(0.1, 0.24, 0.01, 0x9aa6b5), -0.3, 1.11, 0.195));
  // hot water dispenser
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 16), mat(0xc9d2dc)), 0.45, 1.155, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), mat(0xe8333f)), 0.45, 1.39, 0));
  g.add(at(cube(0.06, 0.05, 0.08, 0x23262d), 0.45, 1.05, 0.18));
  // paper cups
  for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.1, 10), mat(0xffffff)), 0.8, 0.99 + i * 0.03, 0));
  // sign on the wall behind it
  g.add(at(poster(1.3, 0.34, "#e07b39", [["☕ Air Panas · Microwave", 30, "#ffffff"]]), 0, 1.75, -0.23));
  group.add(at(g, x, 0, z, FACE[face]));
}

/** Arcade cabinet with a glowing, animated attract screen. */
export function arcade(group: THREE.Group, x: number, z: number, yaw: number): void {
  const g = new THREE.Group();
  const side = 0x7a55d6;
  for (const sx of [-0.4, 0.4]) g.add(at(cube(0.06, 1.85, 0.75, side), sx, 0.925, 0));
  g.add(at(cube(0.74, 0.9, 0.7, 0x23262d), 0, 0.45, 0.02)); // lower body
  g.add(at(cube(0.74, 0.04, 0.02, 0xf9c833), 0, 0.3, 0.375)); // trim strip
  for (const cx of [-0.1, 0.1]) g.add(at(cube(0.08, 0.12, 0.02, 0xe8333f), cx, 0.5, 0.375)); // coin doors
  // control panel: joystick and three buttons
  const panel = cube(0.74, 0.06, 0.32, 0x3a3f4a);
  panel.rotation.x = 0.25;
  g.add(at(panel, 0, 0.98, 0.3));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), mat(0x23262d)), -0.18, 1.05, 0.3));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0xe8333f)), -0.18, 1.11, 0.3));
  [0xf9c833, 0x2fb38a, 0x3b8ff0].forEach((color, i) =>
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), mat(color)), 0.05 + i * 0.1, 1.02, 0.3))
  );
  // screen: a little animated attract loop
  const cv = document.createElement("canvas");
  cv.width = 160;
  cv.height = 128;
  const c = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  let frame = 0;
  const draw = () => {
    c.fillStyle = "#14123a";
    c.fillRect(0, 0, 160, 128);
    for (let i = 0; i < 24; i++) {
      c.fillStyle = (i + frame) % 5 ? "#5a58a8" : "#ffffff";
      c.fillRect((i * 37 + frame * 2) % 160, (i * 53) % 128, 2, 2);
    }
    c.fillStyle = "#f9c833";
    c.font = "900 20px monospace";
    c.textAlign = "center";
    c.fillText("SNEK HERO", 80, 30);
    const px = 30 + ((frame * 4) % 100);
    c.fillStyle = "#2fb38a";
    c.fillRect(px, 78, 12, 12);
    c.fillStyle = "#ffd7b0";
    c.fillRect(px + 2, 70, 8, 8);
    c.fillStyle = "#e8333f";
    c.fillRect(110, 40 + ((frame * 5) % 50), 10, 10);
    c.fillStyle = "#3b8ff0";
    c.fillRect(0, 92, 160, 6);
    if (frame % 2) {
      c.fillStyle = "#ffffff";
      c.font = "900 13px monospace";
      c.fillText("MASUKKAN SYILING", 80, 116);
    }
    tex.needsUpdate = true;
    frame++;
  };
  draw();
  window.setInterval(draw, 450);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
  screen.rotation.x = -0.2;
  g.add(at(screen, 0, 1.33, 0.2));
  g.add(at(cube(0.74, 0.62, 0.5, 0x23262d), 0, 1.33, -0.07)); // screen housing
  // lit marquee
  const marquee = poster(0.74, 0.22, "#e8333f", [["🕹️ ARCADE", 54, "#ffffff"]], { border: "#f9c833" });
  (marquee.material as THREE.MeshLambertMaterial).emissive = new THREE.Color(0x441010);
  g.add(at(marquee, 0, 1.75, 0.31));
  g.add(at(cube(0.86, 0.06, 0.78, side), 0, 1.88, 0));
  group.add(at(g, x, 0, z, yaw));
}

/** Plain wall poster for other modules. */
export function wallPoster(group: THREE.Group, text: [string, number, string][], bg: string, w: number, h: number, x: number, y: number, z: number, face: keyof typeof FACE): void {
  group.add(at(poster(w, h, bg, text), x, y, z, FACE[face]));
}
