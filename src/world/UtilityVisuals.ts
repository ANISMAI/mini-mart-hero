import * as THREE from "three";
import { AC_CONTROLLER, AC_UNITS, CABINET, ZONES, type Facing, type WallSpot, type ZoneId } from "../data/utilities";
import type UtilityService from "../game/Utilities";
import { STORE } from "../data/rooms";
import { at, cube } from "./kit";

// 3D side of the utilities. Lighting is cheap on purpose: no extra dynamic lights. Each zone
// has glowing tube fixtures (one instanced mesh) and a dark see-through "shade" laid over the
// zone just above the walls; switching a zone off swaps the fixture material and fades the
// shade in. The game additionally dims the global light while the player stands in a dark zone.

const FACE: Record<Facing, number> = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };
const SHADE_OPACITY = 0.5;

interface ZoneVisual {
  fixtures: THREE.InstancedMesh;
  shade: THREE.Mesh;
  toggle: THREE.Mesh;
  led: THREE.Mesh;
}

export default class UtilityVisuals {
  private zones = new Map<ZoneId, ZoneVisual>();
  private lampOn = new THREE.MeshBasicMaterial({ color: 0xfffbea });
  private lampOff = new THREE.MeshLambertMaterial({ color: 0x8d96a3 });
  private ledOn = new THREE.MeshBasicMaterial({ color: 0x39e07a });
  private ledOff = new THREE.MeshBasicMaterial({ color: 0x6b7280 });
  private acLeds: THREE.Mesh[] = [];
  private airflow: THREE.Mesh[] = [];
  private airMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private panelCanvas = document.createElement("canvas");
  private panelTex: THREE.CanvasTexture;
  private cabinetLed: THREE.Mesh;
  private cabinetLedMat = new THREE.MeshBasicMaterial({ color: 0x39e07a });
  private time = 0;
  /** Zone whose shade is hidden because the player stands in it (the game dims globally instead). */
  playerZone: ZoneId | null = null;
  private svc: UtilityService;

  constructor(group: THREE.Group, svc: UtilityService) {
    this.svc = svc;
    for (const z of ZONES) {
      // tube fixtures, level with the wall tops (as high as the shop goes)
      const geo = new THREE.BoxGeometry(1.1, 0.07, 0.16);
      const fixtures = new THREE.InstancedMesh(geo, this.lampOn, z.fixtures.length);
      z.fixtures.forEach(([x, zz], i) => fixtures.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, STORE.wallH, zz)));
      group.add(fixtures);
      // shade over the zone, just above the wall tops
      const parts = z.rects.map((r) =>
        new THREE.PlaneGeometry(r.w, r.d).rotateX(-Math.PI / 2).translate(r.x + r.w / 2, STORE.wallH + 0.09, r.z + r.d / 2)
      );
      const shadeGeo = parts.length > 1 ? mergePlanes(parts) : parts[0];
      const shade = new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ color: 0x0b1020, transparent: true, opacity: 0, depthWrite: false }));
      shade.renderOrder = 5;
      shade.visible = false;
      group.add(shade);
      // wall switch: plate, rocker, indicator light
      const sw = new THREE.Group();
      sw.add(at(cube(0.13, 0.19, 0.02, 0xffffff), 0, 0, 0));
      const toggle = cube(0.05, 0.08, 0.03, 0xdfe5ec);
      toggle.position.z = 0.02;
      sw.add(toggle);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), this.ledOn);
      led.position.set(0, 0.07, 0.015);
      sw.add(led);
      group.add(place(sw, z.switchAt));
      this.zones.set(z.id, { fixtures, shade, toggle, led });
    }

    // air-conditioners
    for (const a of AC_UNITS) {
      const g = new THREE.Group();
      g.add(at(cube(0.95, 0.3, 0.22, 0xf7f9fc), 0, 0, 0.11));
      g.add(at(cube(0.85, 0.04, 0.02, 0x9aa6b5), 0, -0.1, 0.225)); // louvre
      g.add(at(cube(0.95, 0.02, 0.2, 0xdfe5ec), 0, 0.15, 0.11));
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), this.ledOn);
      led.position.set(0.36, 0.04, 0.225);
      g.add(led);
      this.acLeds.push(led);
      // airflow: three soft streaks that drift down while running
      for (let i = 0; i < 3; i++) {
        const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.05), this.airMat);
        streak.position.set(0, -0.2, 0.3);
        streak.rotation.x = -0.6;
        streak.userData.phase = i / 3;
        g.add(streak);
        this.airflow.push(streak);
      }
      group.add(at(g, a.x, a.y, a.z, FACE[a.face]));
    }

    // AC controller with a small screen
    this.panelCanvas.width = 128;
    this.panelCanvas.height = 96;
    this.panelTex = new THREE.CanvasTexture(this.panelCanvas);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    const ctrl = new THREE.Group();
    ctrl.add(at(cube(0.2, 0.26, 0.03, 0xf7f9fc), 0, 0, 0));
    ctrl.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.12), new THREE.MeshBasicMaterial({ map: this.panelTex })), 0, 0.04, 0.016));
    for (const x of [-0.05, 0, 0.05]) ctrl.add(at(cube(0.035, 0.025, 0.01, 0x9aa6b5), x, -0.08, 0.02));
    group.add(place(ctrl, AC_CONTROLLER));

    // closed distribution cabinet (no wiring shown)
    const cab = new THREE.Group();
    cab.add(at(cube(0.9, 1.4, 0.3, 0xc9d2dc), 0, 0.95, 0));
    cab.add(at(cube(0.84, 1.32, 0.02, 0xdfe5ec), 0, 0.95, 0.16)); // door
    cab.add(at(cube(0.04, 0.18, 0.03, 0x7d8ba0), 0.33, 0.95, 0.18)); // handle
    cab.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.26), warningMaterial()), -0.1, 1.25, 0.175));
    cab.add(at(cube(0.9, 0.25, 0.3, 0x9aa6b5), 0, 0.12, 0)); // plinth
    this.cabinetLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), this.cabinetLedMat);
    this.cabinetLed.position.set(0.25, 1.5, 0.18);
    cab.add(this.cabinetLed);
    group.add(at(cab, CABINET.x, 0, CABINET.z, FACE[CABINET.face]));

    svc.subscribe(() => this.apply());
    this.apply();
  }

  /** Visual state follows the service (called on every change). */
  apply(): void {
    for (const [id, v] of this.zones) {
      const lit = this.svc.lit(id);
      v.fixtures.material = lit ? this.lampOn : this.lampOff;
      const on = this.svc.zones.get(id)!.lightsOn;
      v.toggle.rotation.x = on ? -0.35 : 0.35;
      v.led.material = on ? this.ledOn : this.ledOff;
    }
    for (const led of this.acLeds) led.material = this.svc.acRunning ? this.ledOn : this.ledOff;
    // controller screen
    const c = this.panelCanvas.getContext("2d")!;
    const a = this.svc.aircon;
    c.fillStyle = this.svc.acRunning ? "#103a5c" : "#2a2f38";
    c.fillRect(0, 0, 128, 96);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = this.svc.acRunning ? "#9fe8ff" : "#7b8594";
    c.font = '900 40px Nunito, "Segoe UI", sans-serif';
    c.fillText(`${a.targetTemperature}°`, 64, 42);
    c.font = '800 18px Nunito, "Segoe UI", sans-serif';
    c.fillText(!a.powered ? "TIADA KUASA" : a.isOn ? "ON" : "OFF", 64, 78);
    this.panelTex.needsUpdate = true;
  }

  /** Per-frame: shade fades, AC airflow drift, cabinet indicator blink. */
  tick(dt: number): void {
    this.time += dt;
    for (const [id, v] of this.zones) {
      const m = v.shade.material as THREE.MeshBasicMaterial;
      const goal = this.svc.lit(id) || id === this.playerZone ? 0 : SHADE_OPACITY;
      m.opacity += (goal - m.opacity) * Math.min(1, dt * 6);
      v.shade.visible = m.opacity > 0.01;
    }
    const running = this.svc.acRunning;
    this.airMat.opacity += ((running ? 0.35 : 0) - this.airMat.opacity) * Math.min(1, dt * 3);
    if (running)
      for (const s of this.airflow) {
        const t = (this.time * 0.5 + s.userData.phase) % 1;
        s.position.y = -0.18 - t * 0.5;
        s.position.z = 0.28 + t * 0.35;
        s.scale.x = 0.8 + t * 0.5;
      }
    const state = this.svc.event.state;
    const blink = Math.sin(this.time * 8) > 0;
    const color =
      state === "warning" ? (blink ? 0xffb020 : 0x5a4210) : state === "outage" ? (blink ? 0xff3b3b : 0x5a1515) : state === "technician" ? (blink ? 0x3b9bff : 0x173b5e) : 0x39e07a;
    this.cabinetLedMat.color.setHex(color);
  }
}

function place(o: THREE.Object3D, s: WallSpot): THREE.Object3D {
  return at(o, s.x, s.y, s.z, FACE[s.face]);
}

function mergePlanes(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...(g.attributes.position.array as Float32Array));
    for (const i of g.index!.array as Uint16Array) idx.push(base + i);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

function warningMaterial(): THREE.Material {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 112;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#f9c833";
  c.beginPath();
  c.moveTo(64, 6);
  c.lineTo(122, 106);
  c.lineTo(6, 106);
  c.closePath();
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = "#23262d";
  c.stroke();
  c.fillStyle = "#23262d";
  c.font = '900 56px "Segoe UI Emoji", sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("⚡", 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tex, transparent: true });
}
