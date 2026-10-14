import * as THREE from "three";
import { box, type Box } from "./collisions";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { at, cube, mat, rbox } from "./kit";

// The restroom (x 18–24, z 17–23, door on the west wall), furnished like a Malaysian public
// toilet: three cubicles (sitting, squat with pail + gayung + hose, accessible with grab bars),
// a two-basin sink counter with a long mirror, soap, hand dryer, tissue dispenser, bin, a
// wet-floor sign and tiled floor and walls.

const X0 = 18;
const X1 = 24;
const Z0 = 17;
const Z1 = 23;
const PARTITION = 0xb9e3e8;

function tileTexture(a: string, b: string, grout: string, n: number): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  const s = 128 / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      c.fillStyle = (i + j) % 2 ? a : b;
      c.fillRect(i * s, j * s, s, s);
    }
  c.strokeStyle = grout;
  c.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    c.beginPath();
    c.moveTo(i * s, 0);
    c.lineTo(i * s, 128);
    c.moveTo(0, i * s);
    c.lineTo(128, i * s);
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Tiled panel on a wall's inner face (single-sided, so it is invisible from outside the room). */
function wallTiles(tex: THREE.Texture, w: number, h: number): THREE.Mesh {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(w / 0.6, h / 0.6);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t }));
}

function sittingToilet(grabBars: boolean): THREE.Group {
  const g = new THREE.Group(); // back to the wall at +x, the bowl points -x towards the door
  g.add(at(rbox(0.2, 0.48, 0.4, 0xffffff, 0.05), 0.12, 0.35, 0)); // cistern on the wall
  g.add(at(cube(0.1, 0.03, 0.06, 0xc9d2dc), 0.12, 0.84, 0.1)); // flush button
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.4, 18), mat(0xffffff));
  pan.scale.set(1.25, 1, 1);
  g.add(at(pan, -0.2, 0.2, 0));
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 18).rotateX(Math.PI / 2), mat(0xf4f7fb));
  seat.scale.set(1.25, 1, 1);
  g.add(at(seat, -0.2, 0.42, 0));
  const lid = rbox(0.42, 0.04, 0.36, 0xf4f7fb, 0.02);
  lid.rotation.z = -1.35; // raised against the cistern
  g.add(at(lid, 0.02, 0.45, 0));
  if (grabBars)
    for (const z of [-0.45, 0.45]) {
      g.add(at(cube(0.7, 0.04, 0.04, 0xc9d2dc), -0.2, 0.75, z));
      g.add(at(cube(0.04, 0.04, 0.08, 0xc9d2dc), -0.55, 0.75, z - Math.sign(z) * 0.04));
    }
  return g;
}

function squatToilet(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(0.9, 0.06, 0.55, 0xffffff, 0.06), -0.3, 0, 0)); // pan
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.16, 18), mat(0x9aa6b5));
  hole.scale.set(1.6, 1, 1);
  hole.rotation.x = -Math.PI / 2;
  g.add(at(hole, -0.25, 0.065, 0));
  for (const z of [-0.2, 0.2]) g.add(at(rbox(0.26, 0.03, 0.1, 0xe3e8ee, 0.01), -0.6, 0.06, z)); // foot rests
  // pail with gayung, hose sprayer on the wall
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 16), mat(0x3b8ff0)), 0.05, 0.16, 0.55));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16), mat(0x9fd8f2)), 0.05, 0.3, 0.55)); // water
  const scoop = new THREE.Group();
  scoop.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.1, 12), mat(0xf9c833)), 0, 0, 0));
  scoop.add(at(cube(0.03, 0.03, 0.2, 0xf9c833), 0, 0.03, 0.12));
  g.add(at(scoop, 0.02, 0.36, 0.5));
  g.add(at(cube(0.05, 0.08, 0.05, 0xc9d2dc), 0.13, 0.75, -0.45)); // tap
  g.add(at(cube(0.08, 0.16, 0.05, 0x2fb38a), 0.12, 0.6, -0.45)); // hose sprayer on its hook
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 16), mat(0x2fb38a));
  hose.rotation.y = Math.PI / 2;
  g.add(at(hose, 0.12, 0.45, -0.33));
  return g;
}

/** Cubicle along the east wall between z a..b: two side partitions, front panels, open door. */
function cubicle(group: THREE.Group, solid: (b: Box) => void, a: number, b: number, sign: string): void {
  const front = 22.2;
  const h = 2.0;
  const lift = 0.12;
  const door0 = a + 0.45;
  const door1 = b - 0.35;
  // front panels either side of the doorway
  group.add(at(cube(0.05, h, door0 - a, PARTITION), front, lift + h / 2, (a + door0) / 2));
  group.add(at(cube(0.05, h, b - door1, PARTITION), front, lift + h / 2, (door1 + b) / 2));
  group.add(at(cube(0.06, 0.1, b - a, 0x9cc9cf), front, lift + h, (a + b) / 2)); // header rail
  solid(box(front - 0.05, a, 0.1, door0 - a));
  solid(box(front - 0.05, door1, 0.1, b - door1));
  // door leaf swung open into the cubicle, with a sign and lock
  const pivot = new THREE.Object3D();
  pivot.position.set(front, 0, door1);
  const leaf = new THREE.Group();
  leaf.add(at(cube(0.04, h - 0.1, door1 - door0, PARTITION), 0, lift + (h - 0.1) / 2, -(door1 - door0) / 2));
  leaf.add(at(cube(0.06, 0.06, 0.04, 0x9aa6b5), -0.03, 1.05, -(door1 - door0) + 0.08));
  pivot.add(leaf);
  pivot.rotation.y = -1.2; // swung in towards the toilet
  group.add(pivot);
  const plate = signPlane(sign);
  group.add(at(plate, front - 0.03, 1.55, (a + door0) / 2, -Math.PI / 2));
  // toilet paper holder on the side partition
  group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.11, 12).rotateX(Math.PI / 2), mat(0xffffff)), 23.2, 0.75, a + 0.08));
}

function signPlane(text: string): THREE.Mesh {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#2a9fd6";
  c.beginPath();
  c.roundRect(4, 4, 120, 120, 18);
  c.fill();
  c.fillStyle = "#ffffff";
  c.font = '64px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, 64, 68);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshLambertMaterial({ map: t, transparent: true }));
}

function wetFloorSign(): THREE.Group {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 192;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#f9c833";
  c.fillRect(0, 0, 128, 192);
  c.fillStyle = "#23262d";
  c.font = '900 22px Nunito, "Segoe UI", sans-serif';
  c.textAlign = "center";
  c.fillText("AWAS!", 64, 34);
  c.font = '64px "Segoe UI Emoji", sans-serif';
  c.fillText("⚠️", 64, 108);
  c.font = '900 18px Nunito, "Segoe UI", sans-serif';
  c.fillText("LANTAI", 64, 150);
  c.fillText("BASAH", 64, 172);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.6), face);
    p.rotation.x = s * 0.25;
    p.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(at(p, 0, 0.29, s * 0.075));
  }
  return g;
}

/** Returns the live mirror: the game shows it only while the player is in the restroom. */
export function buildRestroom(group: THREE.Group, solid: (b: Box) => void): THREE.Object3D {
  // tiled floor and walls
  const floorTex = tileTexture("#e8f4fa", "#cfe6f2", "#b4cddb", 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 - 0.2, Z1 - Z0 - 0.2), new THREE.MeshLambertMaterial({ map: floorTex }));
  floorTex.repeat.set((X1 - X0) / 0.8, (Z1 - Z0) / 0.8);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((X0 + X1) / 2, 0.008, (Z0 + Z1) / 2);
  group.add(floor);
  const wallTex = tileTexture("#ffffff", "#e3f1f6", "#c5d9e2", 4);
  const th = 1.6;
  group.add(at(wallTiles(wallTex, X1 - X0 - 0.2, th), (X0 + X1) / 2, th / 2 + 0.18, Z0 + 0.115, 0)); // north wall, faces +z
  group.add(at(wallTiles(wallTex, X1 - X0 - 0.2, th), (X0 + X1) / 2, th / 2 + 0.18, Z1 - 0.115, Math.PI)); // south
  group.add(at(wallTiles(wallTex, Z1 - Z0 - 0.2, th), X1 - 0.115, th / 2 + 0.18, (Z0 + Z1) / 2, -Math.PI / 2)); // east
  group.add(at(wallTiles(wallTex, 1.8, th), X0 + 0.115, th / 2 + 0.18, 18.0, Math.PI / 2)); // west, left of the door
  group.add(at(wallTiles(wallTex, 2.2, th), X0 + 0.115, th / 2 + 0.18, 21.8, Math.PI / 2)); // west, right of the door

  // three cubicles along the east wall
  cubicle(group, solid, 17.1, 19.0, "🚽");
  cubicle(group, solid, 19.0, 20.9, "🚾");
  cubicle(group, solid, 20.9, 22.9, "♿");
  for (const z of [19.0, 20.9]) {
    group.add(at(cube(1.8, 2.0, 0.05, PARTITION), 23.1, 0.12 + 1.0, z));
    solid(box(22.2, z - 0.05, 1.8, 0.1));
  }
  group.add(at(sittingToilet(false), 23.7, 0, 18.05));
  group.add(at(squatToilet(), 23.75, 0, 19.95));
  group.add(at(sittingToilet(true), 23.7, 0, 21.9));
  solid(box(23.1, 17.6, 0.9, 0.9));
  solid(box(23.0, 19.6, 0.95, 0.75));
  solid(box(23.1, 21.45, 0.9, 0.9));

  // sink counter with two basins, long mirror, soap
  group.add(at(rbox(2.6, 0.82, 0.55, 0xf4f7fb, 0.05), 19.8, 0, 17.4));
  group.add(at(cube(2.62, 0.05, 0.58, 0x9aa6b5), 19.8, 0.82, 17.4));
  for (const x of [19.2, 20.4]) {
    const basin = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), mat(0xdfe8ee));
    basin.scale.set(1.3, 1, 1);
    basin.rotation.x = -Math.PI / 2;
    group.add(at(basin, x, 0.875, 17.42));
    group.add(at(cube(0.04, 0.16, 0.04, 0xc9d2dc), x, 0.95, 17.2)); // tap
    group.add(at(cube(0.04, 0.03, 0.14, 0xc9d2dc), x, 1.02, 17.26)); // spout
    group.add(at(rbox(0.07, 0.14, 0.07, 0xbb6bd9, 0.02), x + 0.35, 0.87, 17.2)); // soap pump
  }
  solid(box(18.5, 17.1, 2.6, 0.6));
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.8), new THREE.MeshLambertMaterial({ color: 0xcfe9f5 }));
  group.add(at(mirror, 19.8, 1.6, 17.125));
  // live reflection on top of the plain mirror (low-res render target to stay cheap on phones)
  const live = new Reflector(new THREE.PlaneGeometry(2.4, 0.8), { textureWidth: 384, textureHeight: 128, color: 0xc4dce8, clipBias: 0.003 });
  live.visible = false;
  group.add(at(live, 19.8, 1.6, 17.128));
  for (const [x, w] of [[19.1, 0.12], [19.3, 0.05], [20.6, 0.1]] as const) {
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    shine.rotation.z = -0.4;
    group.add(at(shine, x, 1.6, 17.13));
  }
  group.add(at(cube(2.5, 0.06, 0.05, 0x9aa6b5), 19.8, 2.03, 17.13)); // mirror frame top

  // hand dryer and tissue dispenser on the south wall, bin below
  group.add(at(rbox(0.3, 0.32, 0.18, 0xeef2f6, 0.05), 19.4, 1.05, 22.8));
  group.add(at(cube(0.18, 0.03, 0.06, 0x3a4252), 19.4, 1.06, 22.68)); // dryer nozzle
  group.add(at(rbox(0.32, 0.36, 0.12, 0xffffff, 0.04), 20.4, 1.1, 22.82));
  group.add(at(cube(0.14, 0.02, 0.02, 0x9aa6b5), 20.4, 1.15, 22.75)); // tissue slot
  group.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.42, 14), mat(0x7d8ba0)), 20.95, 0.21, 22.65));
  solid(box(20.75, 22.45, 0.4, 0.45));
  // exhaust fan grille high on the east wall
  group.add(at(cube(0.03, 0.4, 0.4, 0xdfe5ec), 23.88, 2.25, 20.0));
  for (let i = 0; i < 4; i++) group.add(at(cube(0.035, 0.03, 0.34, 0x9aa6b5), 23.87, 2.1 + i * 0.1, 20.0));

  // wet floor sign near the cubicles
  group.add(at(wetFloorSign(), 21.4, 0, 20.4, 0.5));
  return live;
}
