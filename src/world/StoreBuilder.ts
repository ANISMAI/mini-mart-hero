import * as THREE from "three";
import WorldCollisions, { box, boxC, type Box } from "./collisions";
import { at, blob, cube, label, mat, rbox } from "./kit";
import { DOORS, ENTRANCE_GAP, ROOMS, STORE, type RoomId } from "../data/rooms";
import { SECTIONS, unlockedIn, type CatalogItem, type Category } from "../data/catalog";
import { fillShelf, type ShelfRun } from "./ProductModels";

// Builds the whole store: floors, walls with doorways, shelves with products, counter, back
// rooms, restroom and surau. Everything is simple rounded low-poly geometry and flat colours,
// so it's light on mobile GPUs. Replace pieces with glTF models later without changing
// collisions or the room registry (see README).

export type TaskKind = "cashier" | "organizer" | "info";

export interface Interactable {
  id: string;
  /** Short label on the Interact button. */
  label: string;
  icon: string;
  x: number;
  z: number;
  radius: number;
  kind: TaskKind;
  /** Organizer: the catalog section or "storage"; info: the message. */
  shelf?: Category | "storage";
  title?: string;
  text?: string;
  room: RoomId;
}

/** A door leaf that swings open when the player is near (restroom, surau). */
export interface SwingDoor {
  pivot: THREE.Object3D;
  x: number;
  z: number;
  open: number;
  /** Angle when fully open. */
  openAngle: number;
  /** How close (m) someone must be for it to open; default 2. */
  range?: number;
}

export interface BuiltStore {
  group: THREE.Group;
  collisions: WorldCollisions;
  /** Meshes the camera must not clip through (walls). */
  occluders: THREE.Object3D[];
  interactables: Interactable[];
  doors: SwingDoor[];
}

const C = {
  floor: 0xf2ece2,
  floorAlt: 0xe6ddcf,
  wall: 0xfbf6ee,
  wallTop: 0xd3dae3,
  trim: 0x2fb38a,
  wood: 0xd9a86c,
  woodDark: 0xa8763c,
  steel: 0xcfd6df,
  steelDark: 0x7d8ba0,
  white: 0xffffff,
  ink: 0x3d3550,
  lavender: 0xbba8e5,
  green: 0x2e8f57,
};

/** `level`: the player's career level; shelves only show products unlocked at that level. */
export function buildStore(level = 1): BuiltStore {
  const group = new THREE.Group();
  const collisions = new WorldCollisions();
  const occluders: THREE.Object3D[] = [];
  const interactables: Interactable[] = [];
  const doors: SwingDoor[] = [];
  const add = (o: THREE.Object3D) => (group.add(o), o);
  const solid = (b: Box) => collisions.add(b);

  // ---------- floors ----------
  const tiles = makeTileTexture();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(STORE.w, STORE.d), new THREE.MeshLambertMaterial({ map: tiles }));
  tiles.repeat.set(STORE.w / 2, STORE.d / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(STORE.w / 2, 0, STORE.d / 2);
  add(floor);
  // tinted floors for enclosed rooms
  for (const r of ROOMS.filter((r) => r.enclosed)) {
    const color = r.id === "surau" ? 0x6fae86 : r.id === "restroom" ? 0xe3eef5 : new THREE.Color(r.color).lerp(new THREE.Color(0xffffff), 0.45).getHex();
    const f = new THREE.Mesh(new THREE.PlaneGeometry(r.bounds.w, r.bounds.d), mat(color));
    f.rotation.x = -Math.PI / 2;
    f.position.set(r.bounds.x + r.bounds.w / 2, 0.005, r.bounds.z + r.bounds.d / 2);
    add(f);
  }

  // ---------- walls ----------
  const wallMat = mat(C.wall);
  const wallH = STORE.wallH;
  const t = STORE.wall;
  /** Wall segment along x ("h") or z ("v") from a to b at constant c, with door gaps. */
  const wall = (axis: "h" | "v", c: number, a: number, b: number, gaps: { from: number; to: number }[] = [], h = wallH) => {
    const cuts = gaps.filter((g) => g.to > a && g.from < b).sort((p, q) => p.from - q.from);
    let start = a;
    for (const g of [...cuts, { from: b, to: b }]) {
      const end = Math.min(g.from, b);
      if (end - start > 0.01) {
        const len = end - start;
        // own materials per wall piece so a wall can fade out when it hides the player
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(axis === "h" ? len : t, h, axis === "h" ? t : len), wallMat.clone());
        const mid = (start + end) / 2;
        mesh.position.set(axis === "h" ? mid : c, h / 2, axis === "h" ? c : mid);
        add(mesh);
        occluders.push(mesh);
        // coloured skirting and top trim
        const skirt = cube(axis === "h" ? len : t + 0.02, 0.18, axis === "h" ? t + 0.02 : len, C.trim);
        skirt.material = (skirt.material as THREE.Material).clone();
        skirt.position.set(mesh.position.x, 0.09, mesh.position.z);
        add(skirt);
        const cap = cube(axis === "h" ? len : t + 0.03, 0.06, axis === "h" ? t + 0.03 : len, C.wallTop);
        cap.position.set(mesh.position.x, h + 0.03, mesh.position.z);
        cap.material = (cap.material as THREE.Material).clone();
        add(cap);
        mesh.userData.fade = [mesh, skirt, cap];
        const b = axis === "h" ? box(start, c - t / 2, len, t) : box(c - t / 2, start, t, len);
        mesh.userData.box = b;
        solid(b);
      }
      start = Math.max(start, g.to);
    }
    // door frames
    for (const g of cuts) {
      // posts and lintel fade too, so a doorway never blocks the view of the player
      const fading = (m: THREE.Mesh) => {
        m.material = (m.material as THREE.Material).clone();
        m.userData.fade = [m];
        const half = 0.15;
        m.userData.box = { minX: m.position.x - half, maxX: m.position.x + half, minZ: m.position.z - half, maxZ: m.position.z + half };
        occluders.push(m);
        add(m);
      };
      for (const p of [g.from, g.to]) {
        const post = cube(axis === "h" ? 0.12 : t + 0.08, wallH, axis === "h" ? t + 0.08 : 0.12, C.trim);
        post.position.set(axis === "h" ? p : c, wallH / 2, axis === "h" ? c : p);
        fading(post);
      }
      const lintel = cube(axis === "h" ? g.to - g.from : t + 0.08, 0.4, axis === "h" ? t + 0.08 : g.to - g.from, C.wall);
      lintel.position.set(axis === "h" ? (g.from + g.to) / 2 : c, wallH - 0.2, axis === "h" ? c : (g.from + g.to) / 2);
      fading(lintel);
      lintel.userData.box = axis === "h" ? box(g.from, c - 0.15, g.to - g.from, 0.3) : box(c - 0.15, g.from, 0.3, g.to - g.from);
    }
  };
  const gapsOn = (axis: "h" | "v", c: number) => DOORS.filter((d) => d.axis === axis && Math.abs(d.at - c) < 0.01);

  // outer walls (front wall is lower so the camera sees in from the entrance side)
  wall("h", 0, 0, STORE.w);
  wall("v", 0, 0, STORE.d);
  wall("v", STORE.w, 0, STORE.d);
  wall("h", STORE.d, 0, STORE.w, [ENTRANCE_GAP], 1.2);
  // back rooms
  wall("h", 7, 0, STORE.w, gapsOn("h", 7));
  wall("v", 8, 0, 7);
  wall("v", 16, 0, 7);
  // right wing: surau + restroom
  wall("v", 18, 10, 23, gapsOn("v", 18));
  wall("h", 10, 18, STORE.w);
  wall("h", 17, 18, STORE.w);
  wall("h", 23, 18, STORE.w);
  // chiller room behind the drink coolers (staff top up the coolers from the back)
  wall("h", 10, 0, 2, gapsOn("h", 10));
  wall("h", 19, 0, 2);
  wall("v", 2, 10, 11);
  wall("v", 2, 18, 19);
  add(at(label("❄️ BILIK SEJUK", { width: 1.5, height: 0.34, bg: "#1f8fd6" }), 1, 2.4, 9.8, Math.PI));

  // ---------- entrance ----------
  for (const side of [-1, 1]) {
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.06), mat(0xbfe6fb, { transparent: true, opacity: 0.45 }));
    glass.position.set(12 + side * 2.9, 1.1, STORE.d - 0.1);
    add(glass);
  }
  const mat1 = rbox(3, 0.03, 1.4, 0x3a4252, 0.1);
  add(at(mat1, 12, 0, 28.9));
  // shop name + welcome over the entrance (inside)
  // shop name + welcome on the back corridor wall, between the Storage and Office doors
  add(at(label("🛒  MINI MARKET HERO", { width: 3.4, height: 0.56, bg: "#2fb38a" }), 8.25, 2.0, 7.13));
  add(at(label("Selamat Datang · Welcome", { width: 2.6, height: 0.34, bg: "#23364f" }), 8.25, 1.5, 7.13));

  // direction signposts
  signpost(group, 14.4, 9.2, [
    { text: "📦 Storage", dir: "W" },
    { text: "📋 Office", dir: "N" },
    { text: "☕ Staff Room", dir: "E" },
    { text: "🕌 Surau · 🚻 Tandas", dir: "E" },
  ]);
  solid(boxC(14.4, 9.2, 0.25, 0.25));
  signpost(group, 16.6, 24.6, [
    { text: "🕌 Surau", dir: "N" },
    { text: "🚻 Tandas", dir: "N" },
    { text: "🧾 Cashier", dir: "W" },
    { text: "🚪 Exit", dir: "S" },
  ]);
  solid(boxC(16.6, 24.6, 0.25, 0.25));

  // ---------- aisles ----------
  const shelfLen = 7;
  const shelfZ = 11.5;
  // the purple shelf holds two sections, one per face; the others carry one section on both faces
  const aisles: { x: number; west: Category; east: Category; accent: number; room: RoomId }[] = [
    { x: 6.2, west: "personal", east: "household", accent: 0x9b6ad6, room: "household" },
    { x: 10.75, west: "grocery", east: "grocery", accent: SECTIONS.grocery.color, room: "grocery" },
    { x: 15.2, west: "snacks", east: "snacks", accent: SECTIONS.snacks.color, room: "snacks" },
  ];
  const organizerAt = (section: Category, x: number, z: number, room: RoomId) =>
    interactables.push({
      id: `shelf-${section}`,
      label: `Semak ${SECTIONS[section].label.toLowerCase()}`,
      icon: SECTIONS[section].icon,
      x,
      z,
      radius: 1.2,
      kind: "organizer",
      shelf: section,
      room,
    });
  for (const a of aisles) {
    buildShelf(group, a.x, shelfZ, shelfLen, unlockedIn(a.west, level), unlockedIn(a.east, level), a.accent);
    solid(box(a.x - 0.5, shelfZ, 1, shelfLen));
    organizerAt(a.east, a.x + 0.9, shelfZ + shelfLen - 0.6, a.room);
    if (a.west !== a.east) organizerAt(a.west, a.x - 0.9, shelfZ + shelfLen - 0.6, a.room);
  }
  // drinks & dairy coolers against the left wall, glass doors facing the aisle
  buildCoolers(group, doors, 2.05, 11, 3, unlockedIn("fridge", level));
  organizerAt("fridge", 3.9, 17.4, "drinks");
  // chiller room: drink crates along the wall, top-up point behind the coolers
  for (const [z, n] of [[11.4, 3], [12.6, 2], [16.4, 3], [17.6, 2]] as const) {
    for (let i = 0; i < n; i++) add(at(rbox(0.5, 0.3, 0.45, i % 2 ? 0x3b8ff0 : 0xe8333f, 0.04), 0.4, i * 0.31, z));
    solid(boxC(0.4, z, 0.5, 0.45));
  }
  interactables.push({
    id: "chiller-topup",
    label: "Top up minuman",
    icon: "❄️",
    x: 1.3,
    z: 14.5,
    radius: 1.6,
    kind: "organizer",
    shelf: "fridge",
    room: "chiller",
  });
  solid(box(2.05, 11, 1, 7));

  // ---------- cashier counter ----------
  const counter = new THREE.Group();
  counter.add(at(rbox(6, 0.95, 0.8, 0xe8ecf1, 0.08), 0, 0, 0));
  counter.add(at(rbox(6.1, 0.06, 0.9, C.wood, 0.05), 0, 0.95, 0));
  counter.add(at(cube(6, 0.14, 0.82, C.trim), 0, 0.2, 0));
  counter.add(at(rbox(2.6, 0.06, 0.5, 0x3a4252, 0.04), 0.8, 1.0, 0)); // conveyor
  for (let i = 0; i < 9; i++) counter.add(at(cube(0.02, 0.01, 0.48, 0x6b7586), -0.4 + i * 0.3, 1.065, 0));
  counter.add(at(rbox(0.35, 0.12, 0.35, 0x2b3240, 0.05), -1.1, 1.0, 0)); // scanner
  counter.add(at(cube(0.22, 0.01, 0.03, 0xff4f5e), -1.1, 1.125, 0));
  const register = new THREE.Group();
  register.add(at(rbox(0.6, 0.28, 0.5, 0x3a4252, 0.06), 0, 0, 0));
  const screen = cube(0.5, 0.32, 0.04, 0x9ff0d6);
  screen.rotation.x = -0.25;
  register.add(at(screen, 0, 0.5, 0.1));
  register.add(at(cube(0.08, 0.2, 0.08, 0x3a4252), 0, 0.3, 0.15));
  counter.add(at(register, -2.2, 1.0, 0, Math.PI));
  for (let i = 0; i < 2; i++) counter.add(at(rbox(0.32, 0.38, 0.22, i ? 0xf9c833 : 0xbba8e5, 0.04), 2.5 + i * 0.36, 1.0, 0)); // shopping bags
  add(at(counter, 5, 0, 22));
  solid(boxC(5, 22, 6.1, 0.9));
  interactables.push({
    id: "cashier",
    label: "Use the till",
    icon: "🧾",
    x: 3,
    z: 21.3,
    radius: 1.3,
    kind: "cashier",
    room: "cashier",
  });
  // queue floor markers
  for (let i = 0; i < 3; i++) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: 0xf2a51e }));
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(5, 0.015, 24.8 + i * 1.4);
    add(marker);
    const foot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: 0xf2a51e }));
    foot.rotation.x = -Math.PI / 2;
    foot.position.set(5, 0.016, 24.8 + i * 1.4);
    add(foot);
  }

  // ---------- storage ----------
  for (let i = 0; i < 3; i++) {
    const rack = buildRack(i === 1 ? 0x5fa8e8 : 0xe8a25a);
    add(at(rack, 1.6 + i * 2.4, 0, 0.75));
    solid(boxC(1.6 + i * 2.4, 0.75, 2, 0.9));
  }
  for (const [x, z, s] of [
    [6.8, 4, 0.7],
    [6.8, 4.75, 0.6],
    [1.2, 4.6, 0.7],
  ]) {
    add(at(rbox(s, s * 0.8, s, 0xd9a86c, 0.04), x, 0, z));
    solid(boxC(x, z, s, s));
  }
  add(at(rbox(0.55, 0.45, 0.55, 0xd9a86c, 0.04), 6.8, 0.56, 4)); // stacked box
  add(at(label("📦 STORAGE", { width: 1.7, height: 0.38, bg: "#e5a417" }), 4.5, 2.4, 7.2));
  interactables.push({
    id: "storage",
    label: "Check stock",
    icon: "📦",
    x: 4.5,
    z: 2.3,
    radius: 1.4,
    kind: "organizer",
    shelf: "storage",
    room: "storage",
  });

  // ---------- manager office ----------
  add(at(rbox(2.4, 0.75, 1, C.wood, 0.06), 12, 0, 2.3));
  solid(boxC(12, 2.3, 2.4, 1));
  add(at(rbox(0.7, 0.3, 0.5, 0x3a4252, 0.05), 11.6, 0.75, 2.2)); // laptop base
  const lap = cube(0.66, 0.42, 0.03, 0x3a4252);
  lap.rotation.x = -0.25;
  add(at(lap, 11.6, 1.05, 1.98));
  add(at(cube(0.6, 0.36, 0.01, 0x9ff0d6), 11.6, 1.05, 2.0));
  add(at(rbox(0.55, 0.5, 0.55, 0x3b8ff0, 0.12), 12, 0, 1.3)); // chair
  add(at(cube(1.6, 1, 0.05, 0xd9a86c), 12, 1.6, 0.13)); // noticeboard
  for (let i = 0; i < 5; i++) add(at(cube(0.26, 0.2, 0.02, [0xf9c833, 0xec5470, 0x5fa8e8, 0x7cc456, 0xffffff][i]), 11.4 + (i % 3) * 0.55, 1.75 - Math.floor(i / 3) * 0.36, 0.17));
  addPlant(group, 15.3, 0.8);
  add(at(label("📋 OFFICE", { width: 1.6, height: 0.38, bg: "#7a55d6" }), 12, 2.4, 7.2));
  interactables.push({
    id: "office",
    label: "Manager desk",
    icon: "📋",
    x: 12,
    z: 3.3,
    radius: 1.3,
    kind: "info",
    title: "Manager Office",
    text: "Daily missions, shift goals and career ranks will appear here in a later phase.",
    room: "office",
  });

  // ---------- staff rest area ----------
  const sofa = new THREE.Group();
  sofa.add(at(rbox(2.4, 0.42, 0.9, 0x8f6ee0, 0.15), 0, 0, 0));
  sofa.add(at(rbox(2.4, 0.5, 0.25, 0x7a5ad0, 0.12), 0, 0.4, -0.33));
  sofa.add(at(rbox(0.25, 0.3, 0.9, 0x7a5ad0, 0.1), -1.2, 0.4, 0));
  sofa.add(at(rbox(0.25, 0.3, 0.9, 0x7a5ad0, 0.1), 1.2, 0.4, 0));
  add(at(sofa, 20.5, 0, 1));
  solid(boxC(20.5, 1, 2.7, 1));
  add(at(rbox(1.2, 0.4, 0.7, C.wood, 0.08), 20.5, 0, 2.6));
  solid(boxC(20.5, 2.6, 1.2, 0.7));
  add(at(rbox(0.2, 0.18, 0.2, 0xffffff, 0.05), 20.3, 0.4, 2.6)); // mug
  add(at(rbox(0.8, 1.6, 0.6, 0xf4f7fb, 0.08), 23.3, 0, 4.5)); // fridge
  solid(boxC(23.3, 4.5, 0.8, 0.6));
  addPlant(group, 17, 0.8);
  add(at(label("☕ STAFF ROOM", { width: 1.9, height: 0.38, bg: "#e07b39" }), 17.2, 2.4, 7.2));
  interactables.push({
    id: "rest",
    label: "Take a seat",
    icon: "☕",
    x: 20.5,
    z: 3.6,
    radius: 1.4,
    kind: "info",
    title: "Staff Rest Area",
    text: "A cosy spot to recharge between customers. Breaks and energy will come in a later phase.",
    room: "rest",
  });

  // ---------- surau ----------
  // modest prayer mats (no text or symbols), shoe rack by the door, calm green walls inside
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Group();
    m.add(at(rbox(0.75, 0.025, 1.25, 0x2e8f57, 0.06), 0, 0, 0));
    m.add(at(rbox(0.6, 0.03, 1.1, 0x23744a, 0.05), 0, 0, 0));
    const arch = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16, 0, Math.PI), mat(0xf2c94c));
    arch.rotation.x = -Math.PI / 2;
    arch.position.set(0, 0.034, -0.38);
    m.add(arch);
    add(at(m, 20.6 + i * 1.05, 0, 13.5, 0));
  }
  const rack = new THREE.Group();
  rack.add(at(rbox(1.0, 0.5, 0.35, C.wood, 0.04), 0, 0, 0));
  for (let i = 0; i < 3; i++) rack.add(at(rbox(0.22, 0.08, 0.14, [0x3a4252, 0xec5470, 0xffffff][i], 0.03), -0.3 + i * 0.3, 0.5, 0));
  add(at(rack, 18.8, 0, 11.2, Math.PI / 2));
  solid(boxC(18.8, 11.2, 0.4, 1.0));
  const prayerRack = new THREE.Group();
  prayerRack.add(at(rbox(1.4, 0.9, 0.4, C.wood, 0.05), 0, 0, 0));
  for (let i = 0; i < 4; i++) prayerRack.add(at(rbox(0.28, 0.16, 0.3, [0xffffff, 0xf3eefb, 0x2e8f57, 0x8f6ee0][i], 0.04), -0.48 + i * 0.32, 0.9, 0));
  add(at(prayerRack, 21.6, 0, 10.4));
  solid(boxC(21.6, 10.4, 1.4, 0.4));
  add(at(label("🕌 SURAU", { width: 1.6, height: 0.38, bg: "#2e8f57" }), 17.8, 2.4, 13.5, -Math.PI / 2));
  doors.push(swingDoor(group, "v", 18, 12.6, 14.4, 0x2e8f57));
  interactables.push({
    id: "surau",
    label: "Surau",
    icon: "🕌",
    x: 17.2,
    z: 13.5,
    radius: 1.2,
    kind: "info",
    title: "Surau",
    text: "A clean, quiet room for prayer. Please remove your shoes at the rack inside the door. Open to everyone, any time.",
    room: "surau",
  });

  // ---------- restroom ----------
  const stall = new THREE.Group();
  stall.add(at(rbox(0.05, 2, 1.6, 0xdcd5ec, 0.02), -0.8, 0, 0));
  stall.add(at(rbox(1.6, 2, 0.05, 0xdcd5ec, 0.02), 0, 0, -0.8));
  add(at(stall, 23.2, 0, 18.2));
  const bowl = new THREE.Group();
  bowl.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 16), mat(0xffffff)), 0, 0.21, 0));
  bowl.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 16), mat(0xbba8e5)), 0, 0.43, 0));
  bowl.children[1].rotation.x = Math.PI / 2;
  bowl.add(at(rbox(0.42, 0.42, 0.18, 0xffffff, 0.04), 0, 0.3, -0.32)); // cistern
  add(at(bowl, 23.3, 0, 18.4));
  solid(boxC(23.3, 18.3, 0.6, 0.8));
  add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), mat(0xffffff)), 23.85, 0.85, 18.9)); // tissue roll
  // sink + mirror
  add(at(rbox(0.9, 0.85, 0.45, 0xf4f7fb, 0.08), 21, 0, 22.7));
  solid(boxC(21, 22.7, 0.9, 0.5));
  add(at(cube(0.7, 0.5, 0.03, 0xd9ecf7), 21, 1.5, 22.88));
  add(at(cube(0.06, 0.18, 0.06, 0xa7b6c9), 21, 0.95, 22.75));
  add(at(label("🚻 TANDAS", { width: 1.6, height: 0.38, bg: "#2a9fd6" }), 17.8, 2.4, 19.8, -Math.PI / 2));
  add(at(label("♿ Accessible", { width: 1.1, height: 0.3, bg: "#2a9fd6" }), 17.88, 1.7, 21.3, -Math.PI / 2));
  doors.push(swingDoor(group, "v", 18, 18.9, 20.7, 0x2a9fd6));
  interactables.push({
    id: "restroom",
    label: "Restroom",
    icon: "🚻",
    x: 17.2,
    z: 19.8,
    radius: 1.2,
    kind: "info",
    title: "Restroom (Tandas)",
    text: "Clean, accessible restroom with a sink and mirror. Walk in through the door any time.",
    room: "restroom",
  });

  // ---------- decor ----------
  addPlant(group, 0.8, 29);
  addPlant(group, 23.2, 29);
  addPlant(group, 17.2, 8.5);
  add(at(rbox(1.6, 0.4, 0.5, C.wood, 0.1), 21, 0, 27)); // bench near the entrance
  solid(boxC(21, 27, 1.6, 0.5));

  return { group, collisions, occluders, interactables, doors };
}

// ---------- pieces ----------

type Dir = "N" | "S" | "E" | "W";

/** Arrow-shaped sign board texture; `left` draws the arrow pointing left (for the back face). */
function arrowTexture(text: string, left: boolean): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext("2d")!;
  const tip = 70;
  const path = () => {
    c.beginPath();
    if (left) {
      c.moveTo(tip, 8);
      c.lineTo(504, 8);
      c.lineTo(504, 120);
      c.lineTo(tip, 120);
      c.lineTo(8, 64);
    } else {
      c.moveTo(8, 8);
      c.lineTo(512 - tip, 8);
      c.lineTo(504, 64);
      c.lineTo(512 - tip, 120);
      c.lineTo(8, 120);
    }
    c.closePath();
  };
  path();
  c.fillStyle = "#1f7a4a";
  c.fill();
  c.lineWidth = 8;
  c.strokeStyle = "#ffffff";
  c.stroke();
  c.fillStyle = "#ffffff";
  c.font = '900 52px Nunito, "Segoe UI", system-ui, sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, left ? 290 : 222, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Green signpost: a pole with arrow boards pointing to rooms; readable from both sides. */
function signpost(group: THREE.Group, x: number, z: number, boards: { text: string; dir: Dir }[]): void {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.9, 12), mat(0xc9d2dc)), 0, 1.45, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.08, 16), mat(0x9aa6b5)), 0, 0.04, 0));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0xc9d2dc)), 0, 2.92, 0));
  const yaw: Record<Dir, number> = { E: 0, N: Math.PI / 2, W: Math.PI, S: -Math.PI / 2 };
  boards.forEach((b, i) => {
    const holder = new THREE.Object3D();
    holder.rotation.y = yaw[b.dir];
    holder.position.y = 2.6 - i * 0.4;
    const geo = new THREE.PlaneGeometry(1.5, 0.375);
    const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: arrowTexture(b.text, false), transparent: true }));
    front.position.set(0.82, 0, 0.012);
    const back = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: arrowTexture(b.text, true), transparent: true }));
    back.position.set(0.82, 0, -0.012);
    back.rotation.y = Math.PI;
    holder.add(front, back);
    g.add(holder);
  });
  group.add(at(g, x, 0, z));
}

function makeTileTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#f2ece2";
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = "#e6ddcf";
  c.fillRect(0, 0, 64, 64);
  c.fillRect(64, 64, 64, 64);
  c.strokeStyle = "#d8ccba";
  c.lineWidth = 2;
  c.strokeRect(0, 0, 128, 128);
  c.beginPath();
  c.moveTo(64, 0);
  c.lineTo(64, 128);
  c.moveTo(0, 64);
  c.lineTo(128, 64);
  c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Double-sided gondola shelf running along z; each face is filled from the catalog. */
function buildShelf(group: THREE.Group, cx: number, z0: number, len: number, west: CatalogItem[], east: CatalogItem[], accent: number): void {
  const g = new THREE.Group();
  g.add(at(rbox(1, 0.12, len, 0xb9c2cf, 0.03), 0, 0, len / 2));
  g.add(at(cube(0.08, 1.7, len, 0xe9edf2), 0, 0.97, len / 2)); // centre panel
  const levels = [0.14, 0.62, 1.1];
  for (const y of levels) g.add(at(cube(0.98, 0.05, len, 0xcfd6df), 0, y, len / 2));
  g.add(at(cube(1, 0.12, len, accent), 0, 1.86, len / 2)); // coloured header
  for (const end of [0, len]) g.add(at(cube(1, 1.9, 0.06, 0xb9c2cf), 0, 0.95, end));
  for (const y of levels) for (const x of [-0.5, 0.5]) g.add(at(cube(0.02, 0.05, len, accent), x, y, len / 2)); // price strips

  const runs = (face: 1 | -1): ShelfRun[] =>
    levels.map((y, i) => ({ y: y + 0.025, z0: 0.12, z1: len - 0.12, xFront: face * 0.47, xBack: face * 0.06, face, maxH: i === levels.length - 1 ? 0.62 : 0.42 }));
  if (west === east) fillShelf(g, west, [...runs(-1), ...runs(1)]);
  else {
    fillShelf(g, west, runs(-1));
    fillShelf(g, east, runs(1));
  }
  group.add(at(g, cx, 0, z0));
}

/** Upright glass-door drink coolers along the left wall (x 0.1–1.1), facing east; doors open when someone is near. */
function buildCoolers(parent: THREE.Group, doors: SwingDoor[], x0: number, z0: number, units: number, items: CatalogItem[]): void {
  // authored with the back at x = 0.1; shifted as a whole to x0
  const group = new THREE.Group();
  group.position.x = x0 - 0.1;
  parent.add(group);
  const unitW = 2.3;
  const gap = 0.05;
  const black = 0x23262d;
  const runs: ShelfRun[] = [];
  const glass = mat(0xcfefff, { transparent: true, opacity: 0.28 });
  for (let u = 0; u < units; u++) {
    const za = z0 + u * (unitW + gap);
    const zc = za + unitW / 2;
    const g = new THREE.Group();
    // glass back: staff restock from the chiller room behind
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, unitW - 0.1), glass), 0.12, 1.17, zc));
    for (const y of [0.29, 2.04]) g.add(at(cube(0.06, 0.08, unitW, black), 0.12, y, zc));
    g.add(at(cube(0.94, 0.32, unitW, 0xeaf6ff), 0.6, 2.19, zc)); // lit header
    g.add(at(cube(0.94, 0.28, unitW, black), 0.6, 0.14, zc)); // base
    for (let k = 0; k < 7; k++) g.add(at(cube(0.02, 0.04, unitW - 0.3, 0x50555f), 1.08, 0.06 + k * 0.03, zc)); // grille
    for (const z of [za + 0.04, za + unitW - 0.04]) g.add(at(cube(0.94, 2.35, 0.08, black), 0.6, 1.175, z)); // sides
    for (const y of [0.3, 0.72, 1.14, 1.56]) g.add(at(cube(0.75, 0.025, unitW - 0.12, 0xd6e4f0), 0.62, y, zc));
    const sign = label("❄ DRINKS & DAIRY", { width: 1.6, height: 0.24, bg: "#1f8fd6" });
    g.add(at(sign, 1.08, 2.19, zc, Math.PI / 2));
    group.add(g);
    for (const y of [0.3, 0.72, 1.14, 1.56]) runs.push({ y: y + 0.0125, z0: za + 0.1, z1: za + unitW - 0.1, xFront: 1.0, xBack: 0.2, face: 1, maxH: 0.39 });
    // two doors per unit, hinged at the outer edges, swinging out into the aisle
    for (const side of [0, 1]) {
      const w = unitW / 2 - 0.08;
      const hingeZ = side ? za + unitW - 0.06 : za + 0.06;
      const dir = side ? -1 : 1; // door extends towards +z (left door) or -z (right door)
      const pivot = new THREE.Object3D();
      pivot.position.set(1.1, 0, hingeZ);
      const door = new THREE.Group();
      door.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.78, w - 0.12), glass), 0, 1.16, (dir * w) / 2));
      for (const y of [0.29, 2.03]) door.add(at(cube(0.05, 0.07, w, black), 0, y, (dir * w) / 2));
      for (const z of [0.03, w - 0.03]) door.add(at(cube(0.05, 1.8, 0.07, black), 0, 1.16, dir * z));
      door.add(at(cube(0.06, 0.7, 0.04, 0xb9c2cc), 0.06, 1.16, dir * (w - 0.12))); // handle
      pivot.add(door);
      group.add(pivot);
      doors.push({ pivot, x: x0 + 1.5, z: hingeZ + (dir * w) / 2, open: 0, openAngle: dir * 0.42 * Math.PI, range: 1.4 });
    }
  }
  fillShelf(group, items, runs);
}

function buildRack(boxColor: number): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.95, 0.95]) for (const z of [-0.4, 0.4]) g.add(at(cube(0.05, 2, 0.05, 0x7d8ba0), x, 1, z));
  for (const y of [0.1, 0.8, 1.5]) {
    g.add(at(cube(2, 0.04, 0.85, 0xb9c2cf), 0, y, 0));
    for (let i = 0; i < 4; i++) g.add(at(rbox(0.4, 0.38, 0.5, i % 2 ? 0xd9a86c : boxColor, 0.03), -0.7 + i * 0.47, y + 0.02, 0));
  }
  return g;
}

function addPlant(group: THREE.Group, x: number, z: number): void {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.4, 12), mat(0xffffff)), 0, 0.2, 0));
  for (const [px, py, pz, r] of [
    [0, 0.75, 0, 0.32],
    [0.18, 0.6, 0.1, 0.24],
    [-0.17, 0.62, -0.08, 0.24],
  ])
    g.add(at(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(0x52b848)), px, py, pz));
  g.add(at(blob(0.3), 0, 0, 0));
  group.add(at(g, x, 0, z));
}

function swingDoor(group: THREE.Group, axis: "h" | "v", c: number, from: number, to: number, color: number): SwingDoor {
  const len = to - from;
  const pivot = new THREE.Object3D();
  const leaf = rbox(axis === "v" ? 0.06 : len - 0.08, 2.15, axis === "v" ? len - 0.08 : 0.06, color, 0.02);
  leaf.position.set(0, 0, axis === "v" ? len / 2 : 0);
  if (axis === "h") leaf.position.x = len / 2;
  const handle = cube(0.06, 0.06, 0.16, 0xffffff);
  handle.position.set(axis === "v" ? -0.06 : len - 0.25, 1.05, axis === "v" ? len - 0.2 : 0.06);
  pivot.add(leaf, handle);
  pivot.position.set(axis === "v" ? c : from, 0, axis === "v" ? from : c);
  group.add(pivot);
  return { pivot, x: axis === "v" ? c : (from + to) / 2, z: axis === "v" ? (from + to) / 2 : c, open: 0, openAngle: Math.PI * 0.55 }; // swings into the room (+x)
}
