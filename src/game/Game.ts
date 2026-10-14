import * as THREE from "three";
import { buildStore, type BuiltStore, type Interactable } from "../world/StoreBuilder";
import AmbientCustomer from "../world/AmbientCustomer";
import PlayerController from "../player/PlayerController";
import ThirdPersonCamera from "../player/ThirdPersonCamera";
import { CUSTOMER_LOOKS } from "../player/Avatar";
import HUD from "../ui/HUD";
import MiniMap from "../ui/MiniMap";
import FullMap from "../ui/FullMap";
import Overlays from "../ui/Overlays";
import { loadSave, writeSave, type SaveData } from "./LocalSave";
import { getRoom, roomAt, type RoomId } from "../data/rooms";

/**
 * StoreScene + game loop. The render loop (Three.js) and the DOM task overlays are separate;
 * switching between them goes through enterTaskMode() / exitTaskMode().
 */
/** Does the floor segment (ax,az)→(bx,bz) pass within `pad` of the box? (slab test) */
function segmentHitsBox(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
  pad: number
): boolean {
  const minX = b.minX - pad;
  const maxX = b.maxX + pad;
  const minZ = b.minZ - pad;
  const maxZ = b.maxZ + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, d, lo, hi] of [
    [ax, dx, minX, maxX],
    [az, dz, minZ, maxZ],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
    } else {
      let ta = (lo - p) / d;
      let tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return false;
    }
  }
  // ignore pieces right at the avatar (it isn't hidden by a wall it stands beside, behind it)
  return t1 > 0 && t0 < 0.97;
}

export default class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private store: BuiltStore;
  private player: PlayerController;
  private cam: ThirdPersonCamera;
  private hud: HUD;
  private miniMap: MiniMap;
  private fullMap: FullMap;
  private overlays: Overlays;
  private fade: HTMLDivElement;
  private customers: AmbientCustomer[] = [];
  private clock = new THREE.Clock();
  private taskMode = false;
  private level: number;
  private careerLevel: number;
  private savedCam: { yaw: number; pitch: number; distance: number } | null = null;
  private room: RoomId | null = null;
  private visited = new Set<RoomId>();
  private near: Interactable | null = null;
  private saveTimer = 0;
  private fpsTime = 0;
  private fpsFrames = 0;
  private pixelRatio: number;

  constructor(container: HTMLElement, uiRoot: HTMLElement) {
    // renderer: capped pixel ratio, no real-time shadows, simple lights (cheap on low-end Android)
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.pixelRatio < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xcfe8f5);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd6c8b4, 1.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 14, 10);
    this.scene.add(sun);

    // career level decides which catalog products are on the shelves; ?lv=8 previews another level
    const lv = Number(new URLSearchParams(location.search).get("lv"));
    this.careerLevel = loadSave()?.level ?? 1;
    this.level = Number.isInteger(lv) && lv >= 1 && lv <= 99 ? lv : this.careerLevel;
    this.store = buildStore(this.level);
    this.scene.add(this.store.group);

    this.player = new PlayerController(this.store.collisions);
    this.scene.add(this.player.avatar.root);
    this.cam = new ThirdPersonCamera(1, this.store.occluders);

    this.customers = [
      new AmbientCustomer(CUSTOMER_LOOKS[0], [
        [13, 20.5],
        [13, 8.4],
        [16.8, 8.4],
        [16.8, 20.5],
      ]),
      new AmbientCustomer(CUSTOMER_LOOKS[1], [
        [3.8, 20],
        [3.8, 10.6],
        [8.5, 10.6],
        [8.5, 20],
      ], 2),
    ];
    for (const c of this.customers) this.scene.add(c.avatar.root);

    this.hud = new HUD(uiRoot, this.renderer.domElement, {
      onJoystick: (x, y) => this.player.setJoystick(x, y),
      onLook: (dx, dy) => this.cam.rotate(-dx * 0.008, dy * 0.006),
      onZoom: (d) => this.cam.zoom(d),
      onInteract: () => this.interact(),
      onMap: () => this.openMap(),
      onPause: () => this.openPause(),
    });
    this.miniMap = new MiniMap(this.hud.miniMapMount);
    this.fullMap = new FullMap(uiRoot, (id) => this.travelToRoom(id), () => this.exitTaskMode());
    this.overlays = new Overlays(uiRoot);
    this.hud.setLevel(this.level);
    this.fade = document.createElement("div");
    this.fade.className = "fade show";
    uiRoot.appendChild(this.fade);

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "e" || k === " ") this.interact();
      if (k === "m") this.openMap();
    });
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("beforeunload", () => this.save());

    this.restore();
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
    window.setTimeout(() => this.fade.classList.remove("show"), 150); // entry fade-in
  }

  // ---------- save / restore ----------

  private restore(): void {
    const s = loadSave();
    const entrance = getRoom("entrance").spawn;
    if (s && this.store.collisions.isFree(s.x, s.z)) {
      this.player.place(s.x, s.z, s.facing);
      Object.assign(this.cam, s.cam);
      s.visited.forEach((r) => this.visited.add(r));
    } else {
      // no save, or a broken one: start safely at the entrance
      this.player.place(entrance.x, entrance.z, entrance.yaw);
      this.cam.yaw = entrance.yaw;
    }
    this.cam.zoom(0); // clamp
    this.cam.snap(this.player.position);
  }

  private save(): void {
    const data: SaveData = {
      version: 1,
      x: this.player.position.x,
      z: this.player.position.z,
      facing: this.player.facing,
      cam: this.savedCam ?? { yaw: this.cam.yaw, pitch: this.cam.pitch, distance: this.cam.distance },
      visited: [...this.visited],
      level: this.careerLevel, // a ?lv= preview is never saved
      prefs: { reducedMotion: false },
    };
    writeSave(data);
  }

  // ---------- hybrid mode ----------

  /** 3D → 2D: freezes walking/look input and remembers the camera exactly. */
  enterTaskMode(): void {
    if (this.taskMode) return;
    this.taskMode = true;
    this.player.locked = true;
    this.hud.setEnabled(false);
    this.savedCam = { yaw: this.cam.yaw, pitch: this.cam.pitch, distance: this.cam.distance };
  }

  /** 2D → 3D: restores the camera as it was and gives control back. */
  exitTaskMode(): void {
    if (!this.taskMode) return;
    if (this.savedCam) Object.assign(this.cam, this.savedCam);
    this.savedCam = null;
    this.taskMode = false;
    this.player.locked = false;
    this.hud.setEnabled(true);
  }

  /** Safe-point fast travel (with a short fade). Later phases can swap in auto-walk here. */
  travelToRoom(id: RoomId): void {
    const s = getRoom(id).spawn;
    this.fade.classList.add("show");
    window.setTimeout(() => {
      this.player.place(s.x, s.z, s.yaw);
      this.cam.yaw = s.yaw;
      this.cam.snap(this.player.position);
      this.save();
      this.fade.classList.remove("show");
    }, 220);
  }

  private openMap(): void {
    if (this.taskMode) return;
    this.enterTaskMode();
    this.fullMap.open(this.room, this.player.position.x, this.player.position.z);
  }

  private openPause(): void {
    if (this.taskMode) return;
    this.enterTaskMode();
    this.overlays.pause(
      () => {
        this.savedCam = null; // keep the new entrance-facing camera
        const s = getRoom("entrance").spawn;
        this.player.place(s.x, s.z, s.yaw);
        this.cam.yaw = s.yaw;
        this.cam.snap(this.player.position);
      },
      () => this.exitTaskMode()
    );
  }

  private interact(): void {
    if (this.taskMode || !this.near) return;
    const it = this.near;
    this.enterTaskMode();
    const done = () => this.exitTaskMode();
    if (it.kind === "cashier") this.overlays.cashier(done);
    else if (it.kind === "organizer") this.overlays.organizer(it.shelf!, this.level, done);
    else this.overlays.info(it.title ?? it.label, it.icon, it.text ?? "", done);
  }

  // ---------- loop ----------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cam.camera.aspect = w / h;
    // portrait phones: a slightly wider view so aisles fit
    this.cam.camera.fov = w < h ? 62 : 50;
    this.cam.camera.updateProjectionMatrix();
  }

  private tick(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.taskMode) this.player.update(dt, this.cam);
    else this.player.avatar.animate(dt, 0);
    for (const c of this.customers) c.update(dt);
    this.cam.update(this.player.position, dt);

    const p = this.player.position;
    // walls hiding the avatar fade to see-through, then back when clear: any wall piece near the
    // floor line from the camera to the avatar (not just exact ray hits, which slip through doorways)
    const cx = this.cam.camera.position.x;
    const cz = this.cam.camera.position.z;
    for (const wall of this.store.occluders) {
      const pieces = wall.userData.fade as THREE.Mesh[] | undefined;
      const b = wall.userData.box as { minX: number; maxX: number; minZ: number; maxZ: number } | undefined;
      if (!pieces || !b) continue;
      // also any wall right in front of the camera: that close, it fills the whole view
      const nearCam = Math.hypot(cx - Math.max(b.minX, Math.min(cx, b.maxX)), cz - Math.max(b.minZ, Math.min(cz, b.maxZ))) < 1.5;
      const hides = this.cam.blocking.has(wall) || nearCam || segmentHitsBox(cx, cz, p.x, p.z, b, 1.4);
      const goal = hides ? 0.15 : 1;
      const m0 = pieces[0].material as THREE.Material;
      if (Math.abs(m0.opacity - goal) < 0.01 && (goal < 1 || !m0.transparent)) continue;
      const o = m0.opacity + (goal - m0.opacity) * Math.min(1, dt * 10);
      for (const piece of pieces) {
        const m = piece.material as THREE.Material;
        m.opacity = Math.abs(o - goal) < 0.01 ? goal : o;
        m.transparent = m.opacity < 0.999;
        m.depthWrite = !m.transparent;
      }
    }
    // doors swing open when someone is near
    for (const d of this.store.doors) {
      const near = Math.hypot(p.x - d.x, p.z - d.z) < (d.range ?? 2);
      d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 6);
      d.pivot.rotation.y = d.open * d.openAngle;
    }

    // room label when entering a new zone
    const r = roomAt(p.x, p.z);
    if (r && r.id !== this.room) {
      this.room = r.id;
      this.visited.add(r.id);
      this.hud.showToast(`${r.icon}  ${r.name}`);
    }

    // nearest interactable in range
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.store.interactables) {
      const d = Math.hypot(p.x - it.x, p.z - it.z);
      if (d < it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    this.near = best;
    this.hud.setInteract(this.taskMode ? null : best);

    this.miniMap.draw(p.x, p.z, this.player.facing, this.room);
    this.renderer.render(this.scene, this.cam.camera);

    this.saveTimer += dt;
    if (this.saveTimer > 2) {
      this.saveTimer = 0;
      this.save();
    }
    this.adaptQuality(dt);
  }

  /** Adaptive quality: drop the pixel ratio if the frame rate stays low. */
  private adaptQuality(dt: number): void {
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < 3) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    if (fps < 40 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.5);
      this.renderer.setPixelRatio(this.pixelRatio);
    }
  }
}
