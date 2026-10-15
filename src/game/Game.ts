import * as THREE from "three";
import { buildStore, type BuiltStore, type Interactable } from "../world/StoreBuilder";
import AmbientCustomer from "../world/AmbientCustomer";
import PlayerController from "../player/PlayerController";
import ThirdPersonCamera from "../player/ThirdPersonCamera";
import { CUSTOMER_LOOKS } from "../player/Avatar";
import HUD, { updateUiScale } from "../ui/HUD";
import MiniMap from "../ui/MiniMap";
import FullMap from "../ui/FullMap";
import Overlays from "../ui/Overlays";
import { loadSave, writeSave, type SaveData } from "./LocalSave";
import { getRoom, roomAt, type RoomId } from "../data/rooms";
import UtilityService from "./Utilities";
import UtilityVisuals from "../world/UtilityVisuals";
import { getZone, zoneAt } from "../data/utilities";
import { buildExterior, type Exterior } from "../world/Exterior";
import OrderService from "./OrderService";
import Checkout from "../ui/Checkout";
import CustomerNPC from "../world/CustomerNPC";
import { CATALOG, getItem } from "../data/catalog";
import { t } from "../data/strings";

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
  /** Seconds spent locked in task mode with no panel open (watchdog). */
  private orphanTask = 0;
  private pixelRatio: number;
  private qualityClock = 0;
  private slowChecks = 0;
  private fastChecks = 0;
  private utils = new UtilityService();
  private utilVisuals: UtilityVisuals;
  private exterior: Exterior;
  // Phase 2: one customer transaction at a time
  private orders = new OrderService();
  private checkout!: Checkout;
  private npc: CustomerNPC;
  private nextCustomerIn = 4;
  /** Scene lights and their full intensities (dimmed while the player's zone is dark). */
  private lights: { light: THREE.Light; full: number }[] = [];
  private dim = 1;
  private refreshTimer = 0;
  private audio: AudioContext | null = null;
  private readonly dev = new URLSearchParams(location.search).has("dev");

  constructor(container: HTMLElement, uiRoot: HTMLElement) {
    // renderer: capped pixel ratio, no real-time shadows, simple lights (cheap on low-end Android)
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xcfe8f5);
    // bright, even shop lighting: sky/ground fill, soft ambient so walls facing away from the
    // sun don't go grey, a warm key light and a cooler fill from the opposite side
    const hemi = new THREE.HemisphereLight(0xffffff, 0xf3e6d3, 1.8);
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(hemi, ambient);
    const fill = new THREE.DirectionalLight(0xeaf4ff, 0.55);
    fill.position.set(-10, 12, -8);
    this.scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.1);
    sun.position.set(8, 14, 10);
    this.scene.add(sun);
    this.lights = [hemi, ambient, fill, sun].map((light) => ({ light, full: light.intensity }));

    // career level decides which catalog products are on the shelves; ?lv=8 previews another level
    const lv = Number(new URLSearchParams(location.search).get("lv"));
    this.careerLevel = loadSave()?.level ?? 1;
    this.level = Number.isInteger(lv) && lv >= 1 && lv <= 99 ? lv : this.careerLevel;
    this.store = buildStore(this.level);
    this.scene.add(this.store.group);
    this.utilVisuals = new UtilityVisuals(this.store.group, this.utils);
    // the street outside; its facade fades like the walls
    this.exterior = buildExterior();
    this.scene.add(this.exterior.group);
    this.store.occluders.push(...this.exterior.occluders);
    this.npc = new CustomerNPC(this.store.collisions);
    this.scene.add(this.npc.root);
    this.scene.fog = new THREE.Fog(0xcfe8f5, 35, 78); // fades out before the camera far plane (80)

    this.player = new PlayerController(this.store.collisions);
    this.scene.add(this.player.avatar.root);
    this.cam = new ThirdPersonCamera(1, this.store.occluders);

    this.customers = [
      new AmbientCustomer(CUSTOMER_LOOKS[0], this.store.collisions, [
        [13, 20.5],
        [13, 8.4],
        [16.8, 8.4],
        [16.8, 20.5],
      ]),
      new AmbientCustomer(CUSTOMER_LOOKS[1], this.store.collisions, [
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
    // utilities: notices as toasts, live panels and the HUD status pill follow the service
    this.utils.onNotice = (text) => this.hud.showToast(text, 3600);
    this.utils.subscribe(() => {
      this.overlays.refresh();
      this.updateAlert();
    });
    this.updateAlert();
    // orders: till screens, HUD objective and the customer's bubble follow the service
    this.checkout = new Checkout(this.overlays, this.orders);
    this.checkout.beep = () => this.beep();
    this.orders.subscribe(() => this.refreshOrderUI());
    this.npc.onArrived = () => {
      this.orders.arrivedAtTill();
      this.refreshOrderUI();
    };
    this.npc.onGone = () => {
      this.orders.clear();
      this.nextCustomerIn = 8;
      this.refreshOrderUI();
    };
    const o = this.orders.order;
    if (o && o.state !== "complete") this.npc.placeAtDesk(o.look, this.orders.unitCount()); // restored mid-order
    if (this.dev) this.nextCustomerIn = 1;
    this.refreshOrderUI();
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
    if (it.kind === "cashier" && !["waiting", "scanning", "paying", "handoff"].includes(this.orders.state)) {
      const s = this.orders.state;
      this.hud.showToast(s === "shopping" ? (this.npc.headingToTill ? t("coming_to_till") : t("still_shopping")) : t("no_customer"), 2600);
      return;
    }
    if (it.kind === "switch" && it.zone) {
      // wall switch: instant, no panel
      const on = this.utils.toggleZone(it.zone);
      this.click();
      const powered = this.utils.zones.get(it.zone)!.powered;
      this.hud.showToast(`💡 ${getZone(it.zone).label}: ${on ? "ON" : "OFF"}${on && !powered ? " (tiada bekalan)" : ""}`);
      return;
    }
    this.enterTaskMode();
    const done = () => this.exitTaskMode();
    try {
      this.openTask(it, done);
    } catch (err) {
      // never leave the player frozen: give control back and say what went wrong
      console.error(err);
      this.overlays.close();
      done();
      this.hud.showToast(`⚠️ Ralat: ${(err as Error).message}`, 5000);
    }
  }

  /** Opens the panel for an interact point (control returns through `done`). */
  private openTask(it: Interactable, done: () => void): void {
    if (it.kind === "cashier") {
      // scan -> pay; exact change finishes the order (the result shows in the till panel)
      this.orders.startCheckout();
      this.checkout.till(() => {
        done();
        if (this.orders.state === "complete") this.npc.leave();
      });
    }
    else if (it.kind === "organizer") this.overlays.organizer(it.shelf!, this.level, done);
    else if (it.kind === "aircon") this.overlays.aircon(this.utils, done);
    else if (it.kind === "lights") this.overlays.lights(this.utils, done);
    else if (it.kind === "electrical") this.overlays.electrical(this.utils, this.dev, done);
    else this.overlays.info(it.title ?? it.label, it.icon, it.text ?? "", done);
  }

  /** HUD pill while the power event is active. */
  private updateAlert(): void {
    const s = this.utils.event.state;
    this.hud.setAlert(s === "warning" ? "⚠️ Elektrik" : s === "outage" ? "⚡ Gangguan" : s === "technician" ? "🔧 Pembaikan" : null);
  }

  /** Phase 2 HUD objective and the customer's bubble. */
  private refreshOrderUI(): void {
    const s = this.orders.state;
    const tillStates = ["scanning", "paying", "handoff"];
    let title: string | null = null;
    if (s === "shopping") title = t("objective_shopping_plain");
    else if (s === "waiting") title = t("objective_till");
    else if (tillStates.includes(s)) title = t("objective_at_till");
    // just the status line: what the customer buys shows up at the till when scanning
    this.hud.setObjective(title ? { title } : null);
    if (this.npc.state !== "leaving")
      this.npc.setBubble(s === "shopping" ? "🛒" : s === "waiting" ? "🧾" : tillStates.includes(s) ? "💵" : null);
    if (tillStates.includes(s)) this.npc.emptyBasket(); // goods are on the counter now
    this.hud.setCoins(this.orders.stats.coins);
  }

  /** Scanner / till beep. */
  private beep(): void {
    try {
      this.audio ??= new AudioContext();
      const t0 = this.audio.currentTime;
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = "square";
      osc.frequency.value = 1250;
      gain.gain.setValueAtTime(0.05, t0);
      gain.gain.setValueAtTime(0, t0 + 0.09);
      osc.connect(gain).connect(this.audio.destination);
      osc.start(t0);
      osc.stop(t0 + 0.1);
    } catch {
      // no audio available
    }
  }

  /** Short switch click (Web Audio, no asset). */
  private click(): void {
    try {
      this.audio ??= new AudioContext();
      const t = this.audio.currentTime;
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.frequency.value = 1800;
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain).connect(this.audio.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch {
      // no audio available
    }
  }

  // ---------- loop ----------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    updateUiScale();
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
    // Phase 2: the next customer walks in a little while after the last one left
    this.npc.update(dt);
    // safety net: a customer standing at the till is never left marked as still shopping
    if (this.npc.state === "waiting" && this.orders.state === "shopping") this.orders.arrivedAtTill();
    if (this.orders.state === "idle" && this.npc.state === "hidden") {
      this.nextCustomerIn -= dt;
      if (this.nextCustomerIn <= 0) {
        this.nextCustomerIn = 8;
        const available = CATALOG.filter((p) => p.unlockLevel <= this.level && this.store.productSpots.has(p.id));
        if (this.orders.spawn(available, 3)) {
          const stops = this.orders.order!.lines.map((l) => ({
            spot: this.store.productSpots.get(l.productId)!,
            onPick: () => {
              for (let i = 0; i < l.quantity; i++) this.orders.customerPicked(l.productId);
              this.hud.showToast(t("customer_picked", { name: getItem(l.productId)!.name }));
            },
          }));
          this.npc.shop(this.orders.order!.look, stops);
          this.refreshOrderUI();
        }
      }
    }
    this.exterior.tick(dt);
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

    // entrance: automatic sliding doors open for the player or a customer nearby
    const e = this.store.entrance;
    const walkers = [p, ...this.customers.map((c) => c.avatar.root.position), ...(this.npc.state !== "hidden" ? [this.npc.position] : [])];
    const someoneNear = walkers.some((q) => Math.hypot(q.x - e.x, q.z - e.z) < 2.8);
    e.open += ((someoneNear ? 1 : 0) - e.open) * Math.min(1, dt * 4);
    for (const l of e.leaves) l.leaf.position.x = l.closedX + l.dir * e.open * e.travel;

    // room label when entering a new zone
    const r = roomAt(p.x, p.z);
    this.store.mirror.visible = r?.id === "restroom"; // live mirror only while inside
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

    // utilities: event timers, visuals, and a dimmer world while standing in a dark zone
    this.utils.update();
    const zone = zoneAt(p.x, p.z);
    this.utilVisuals.playerZone = zone;
    this.utilVisuals.tick(dt);
    const dimGoal = zone && !this.utils.lit(zone) ? 0.42 : 1;
    this.dim += (dimGoal - this.dim) * Math.min(1, dt * 5);
    for (const l of this.lights) l.light.intensity = l.full * this.dim;
    this.refreshTimer += dt;
    if (this.refreshTimer > 0.5) {
      this.refreshTimer = 0;
      if (this.utils.event.state === "technician") this.overlays.refresh(); // countdown
    }

    this.miniMap.draw(p.x, p.z, this.player.facing, this.room);
    this.renderer.render(this.scene, this.cam.camera);

    // watchdog: locked controls with no panel or map open means a panel failed; unlock
    if (this.taskMode && !this.overlays.isOpen && !this.fullMap.isOpen) {
      this.orphanTask += dt;
      if (this.orphanTask > 0.4) {
        this.orphanTask = 0;
        this.exitTaskMode();
      }
    } else this.orphanTask = 0;

    this.saveTimer += dt;
    if (this.saveTimer > 2) {
      this.saveTimer = 0;
      this.save();
    }
    this.adaptQuality(dt);
  }

  /** Adaptive quality: drop the pixel ratio if the frame rate stays low. */
  /**
   * Adaptive sharpness: ignore the loading seconds, step the resolution down only when the
   * frame rate stays poor, never below 1.5x on high-density screens (1x there looks blurry), and
   * step back up once it runs smoothly again.
   */
  private adaptQuality(dt: number): void {
    this.qualityClock += dt;
    if (this.qualityClock < 5) return;
    this.fpsTime += dt;
    this.fpsFrames++;
    if (this.fpsTime < 3) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    const dpr = window.devicePixelRatio || 1;
    const max = Math.min(2, dpr);
    const min = dpr >= 2 ? 1.5 : 1;
    this.slowChecks = fps < 30 ? this.slowChecks + 1 : 0;
    this.fastChecks = fps > 52 ? this.fastChecks + 1 : 0;
    let next = this.pixelRatio;
    if (this.slowChecks >= 2) next = Math.max(min, this.pixelRatio - 0.25);
    else if (this.fastChecks >= 3) next = Math.min(max, this.pixelRatio + 0.25);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this.renderer.setPixelRatio(next);
      this.slowChecks = this.fastChecks = 0;
    }
  }
}
