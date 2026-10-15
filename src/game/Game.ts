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
import { CATALOG, getItem, SECTIONS } from "../data/catalog";
import InventoryService from "./Inventory";
import StockUI from "../ui/StockUI";
import RestockMode from "./RestockMode";
import { SLOTS, SOURCE_LABEL, SOURCE_OF, dateLabel, isPerishable, slotOf } from "../data/inventory";
import { setPictureReady } from "../world/ProductModels";
import StoreDay, { CLOSE, SPILL_SPOTS, type TaskId } from "./StoreDay";
import MorningUI from "../ui/MorningUI";
import Spills from "../world/Spills";
import DeliveryService, { ARRIVE } from "./Delivery";
import DeliveryUI from "../ui/DeliveryUI";
import MissionService, { missionLabel, type Mission } from "./Missions";
import { PALLET_AT, buildPallet } from "../world/DeliveryPallet";
import { applyBayVisuals, indexBays, layoutFor, type ProductBays } from "../world/ShelfBays";
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
  // Phase 3: real stock for the managed sections
  private inventory = new InventoryService();
  private stockUI!: StockUI;
  private restock: RestockMode;
  /** Shelf bays (part of a product's block per board) of every managed product. */
  private bays = new Map<string, ProductBays>();
  // opening routine: the day clock (07:00 -> open 10:00 -> close 22:00), tasks, spills
  private storeDay = new StoreDay();
  private morningUI!: MorningUI;
  private spills!: Spills;
  // the supplier's morning delivery (08:00) at the storage room
  private delivery = new DeliveryService();
  private deliveryUI!: DeliveryUI;
  private pallet!: THREE.Group;
  // three optional missions a day
  private missions = new MissionService();

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
    this.inventory.level = this.level;
    // product pictures replace placeholders as they load: re-index the shelf bays, redraw stock
    setPictureReady(() => {
      this.bays = indexBays(this.store.group);
      if (!this.restock?.active) this.applyStockVisuals();
    });
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
    this.bays = indexBays(this.store.group);
    this.restock = new RestockMode(this.cam.camera, this.scene, this.inventory, this.store.productSpots, uiRoot);
    this.restock.getBays = () => this.bays;
    this.restock.dev = this.dev;
    this.restock.onApplied = (units) => this.payMissions(this.missions.bump("restock", units));
    this.spills = new Spills(this.store.group);
    this.spills.show(this.storeDay.spills);
    this.pallet = buildPallet(this.store.group);
    this.restock.onPreview = (extra) => this.applyStockVisuals(extra);

    this.customers = [
      new AmbientCustomer(CUSTOMER_LOOKS[0], this.store.collisions, [
        [13, 20.5],
        [13, 8.4],
        [16.8, 8.4],
        [16.8, 20.5],
      ]),
      new AmbientCustomer(CUSTOMER_LOOKS[1], this.store.collisions, [
        [4.9, 20],
        [4.9, 10.6],
        [9.0, 10.6],
        [9.0, 20],
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
    // stock: screens, shelf visuals follow the inventory
    this.stockUI = new StockUI(this.overlays, this.inventory);
    this.hud.onStockPill = () => this.explainLowStock();
    this.hud.onExpiryPill = () => this.explainExpired();
    this.hud.onDatePill = () => this.openMorning();
    // the day clock: owns the date (expiry follows it), opens and closes the shop
    this.morningUI = new MorningUI(this.overlays, this.storeDay);
    this.deliveryUI = new DeliveryUI(this.overlays);
    if (this.inventory.day > this.storeDay.day) this.storeDay.day = this.inventory.day; // older saves
    this.inventory.setDay(this.storeDay.day);
    this.ensureDelivery();
    this.missions.ensure(this.storeDay.day);
    this.storeDay.subscribe(() => {
      this.spills.show(this.storeDay.spills);
      this.pallet.visible = this.deliveryWaiting();
      this.updateClockPill();
    });
    this.storeDay.onEvent = (e) => {
      if (e === "open") this.hud.showToast("🏪 Kedai dibuka! Pelanggan mula datang.", 3500);
      if (e === "close") {
        this.hud.showToast("🌙 Kedai tutup. Jumpa esok!", 3000);
        this.payMissions(this.missions.endOfDay());
      }
      if (e === "delivery" && this.deliveryWaiting()) this.hud.showToast("🚚 Lori penghantaran dah sampai! Kotak di Stor, tepi pintu.", 4000);
      if (e === "newDay") {
        this.inventory.setDay(this.storeDay.day);
        this.ensureDelivery();
        this.missions.ensure(this.storeDay.day);
        window.setTimeout(() => this.openMorning(), 600);
      }
    };
    this.updateClockPill();
    // morning of a fresh visit: show the checklist once the scene has settled
    if (this.storeDay.morning) window.setTimeout(() => this.openMorning(), 1200);
    this.inventory.subscribe(() => {
      if (!this.restock.active) this.applyStockVisuals();
      this.refreshLowStock();
      this.player.avatar.setCarrying(this.inventory.basketCount() > 0); // carry the carton while it holds stock
    });
    this.applyStockVisuals();
    this.refreshLowStock();
    this.player.avatar.setCarrying(this.inventory.basketCount() > 0);
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
    window.addEventListener("mmh-wipe", () => (this.wiped = true));

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

  private wiped = false;

  private save(): void {
    if (this.wiped) return; // "start over" in progress
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
        const o = this.orders.order;
        if (o && o.state === "complete") {
          // the confirmed sale leaves the shelves (once per order), then the customer goes
          const { low, expired } = this.inventory.sell(o.id, o.lines);
          this.payMissions([
            ...this.missions.bump("serve"),
            ...(o.earnedScore >= 90 ? this.missions.bump("stars") : []),
            ...this.missions.bump("coins", this.orders.coinsFor(o)),
          ]);

          if (low.length) {
            const s = low[0];
            const item = getItem(s.productId)!;
            const where = SOURCE_LABEL[SOURCE_OF[s.category]];
            this.hud.showToast(`📦 Stok ${item.name} rendah (${this.inventory.shelf[s.slotId]}/${s.capacity}). Ambil stok di ${where.icon} ${where.name}.`, 4500);
          }
          this.npc.leave();
          if (expired.length) this.complain(expired);
        }
      });
    }
    else if (it.kind === "stock") {
      this.stockUI.backStock(it.source!, done);
      this.finishTask("stock");
    } else if (it.kind === "mop" && it.spill !== undefined) {
      const i = it.spill;
      this.morningUI.mop(() => {
        this.storeDay.cleanSpill(i);
        if (!this.storeDay.spills.length) this.finishTask("mop");
      }, done);
    } else if (it.kind === "delivery") {
      const d = this.delivery;
      this.deliveryUI.open(
        d.lines,
        (r) => {
          if (!d.markReceived()) return "Penghantaran hari ni dah diterima.";
          this.inventory.receive(d.lines.map((l) => ({ productId: l.productId, units: l.actual })));
          this.pallet.visible = false;
          this.finishTask("delivery");
          // reporting the short carton gets the supplier's credit back
          const credit = r.allRight && r.reportedShort ? r.reportedShort * 2 : 0;
          if (credit) this.orders.addCoins(credit);
          if (credit) return `✅ Betul! Kotak kurang dilaporkan. Pembekal kreditkan +${credit} 🪙.`;
          return r.allRight ? "✅ Semua cukup. Stok masuk stor." : "Stok masuk stor ikut kiraan sebenar.";
        },
        done
      );
    } else if (it.kind === "bill") this.morningUI.bill(this.utils, () => this.finishTask("bill"), done);
    else if (it.kind === "restock") {
      // the restock mode has its own full-screen UI: hide the normal HUD meanwhile
      // (the avatar steps out of the shot too, so it never blocks the shelf)
      this.hud.root.style.visibility = "hidden";
      this.player.avatar.root.visible = false;
      const cat = it.shelf as Exclude<typeof it.shelf, "storage" | undefined>;
      this.restock.open(
        cat,
        () => {
          this.hud.root.style.visibility = "";
          this.player.avatar.root.visible = true;
          done();
          // morning task: done once a shelf with perishables was checked and nothing anywhere is out of date
          if (SLOTS.some((s) => s.category === cat && isPerishable(s.productId))) {
            const left = this.staleSlots();
            if (!left.length) this.finishTask("expiry");
            else if (!left.some((s) => s.category === cat)) {
              const where = [...new Set(left.map((s) => (s.category === "fridge" ? "peti sejuk" : SECTIONS[s.category].label)))].join(" & ");
              this.hud.showToast(`👍 Rak ni dah bersih. Masih ada barang luput di ${where}.`, 3500);
            }
          }
        },
        it.source === "chiller" // coolers: refilled from the back, in the chiller room
      );
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

  /** Shelf facings follow real stock: an emptier slot shows fewer products (no new meshes). */
  /** Shelf facings follow real stock, per board: `layouts` (units per bay) overrides for previews. */
  private applyStockVisuals(layouts: Record<string, Record<string, number>> = {}): void {
    for (const [sku, entry] of this.bays) {
      const slot = slotOf(sku);
      if (!slot) continue;
      const lay = layouts[slot.slotId] ?? layoutFor(entry.bays, this.inventory.shelf[slot.slotId] ?? 0, this.inventory.layout[slot.slotId]);
      applyBayVisuals(entry, lay, this.inventory.expiredCount(slot.slotId));
    }
  }

  /**
   * Low-stock hints (never a forced mission): a HUD pill with the count, and map markers on each
   * shelf that has low slots plus the back-stock room when its stock isn't in the basket yet.
   */
  private refreshLowStock(): void {
    const low = this.inventory.lowSlots();
    this.hud.setStockAlert(low.length ? `📦 Stok rendah: ${low.length}` : null);
    const marks: { x: number; z: number; text: string }[] = [];
    const cats = [...new Set(low.map((s) => s.category))];
    for (const cat of cats) {
      const n = low.filter((s) => s.category === cat).length;
      const shelf = this.store.interactables.find((i) => i.kind === "restock" && i.shelf === cat);
      if (shelf) marks.push({ x: shelf.x, z: shelf.z, text: `${SECTIONS[cat].icon} ${n}` });
      const carried = low.some((s) => s.category === cat && (this.inventory.basket[s.productId] ?? 0) > 0);
      const room = this.store.interactables.find((i) => i.kind === "stock" && i.source === SOURCE_OF[cat]);
      if (!carried && room && !marks.some((m) => m.x === room.x && m.z === room.z)) marks.push({ x: room.x, z: room.z, text: `${SOURCE_LABEL[SOURCE_OF[cat]].icon} Ambil` });
    }
    // expired perishables: a pill and a pin at the shelf where they sit (checked in restock mode)
    let expiredTotal = 0;
    for (const spot of this.store.interactables.filter((i) => i.kind === "restock")) {
      const n = SLOTS.filter((s) => s.category === spot.shelf && this.inventory.unlocked(s.productId)).reduce((a, s) => a + this.inventory.expiredCount(s.slotId), 0);
      expiredTotal += n;
      if (n) marks.push({ x: spot.x, z: spot.z + 0.6, text: `📅 ${n} luput` });
    }
    this.hud.setExpiryAlert(expiredTotal ? `🗑️ Luput: ${expiredTotal}` : null);
    this.miniMap.markers = marks;
    this.fullMap.setMarkers(marks);
  }

  /** Morning checklist; "Pergi" walks the player to the task. */
  private openMorning(): void {
    if (this.taskMode) return;
    this.enterTaskMode();
    this.morningUI.checklist(
      (task) => this.goToTask(task),
      () => this.exitTaskMode(),
      this.dev,
      () =>
        // dev: the front packs of every displayed perishable go out of date
        SLOTS.filter((s) => isPerishable(s.productId) && this.inventory.unlocked(s.productId) && this.store.productSpots.has(s.productId)).reduce((a, s) => a + this.inventory.devExpire(s.slotId, 2), 0),
      this.missions.list
    );
  }

  /** Pay finished missions' coins, with a toast each. */
  private payMissions(done: Mission[]): void {
    done.forEach((m, i) => {
      this.orders.addCoins(m.reward);
      window.setTimeout(() => this.hud.showToast(`🎯 Misi siap: ${missionLabel(m)} · +${m.reward} 🪙`, 3500), 1200 + i * 3600);
    });
  }

  private goToTask(task: TaskId): void {
    const find = (kind: string, pred: (i: Interactable) => boolean = () => true) => this.store.interactables.find((i) => i.kind === kind && pred(i));
    if (task === "mop") {
      const i = this.storeDay.spills[0];
      if (i !== undefined) this.travelToSpot(SPILL_SPOTS[i][0], SPILL_SPOTS[i][1] + 1.0, 0);
    } else if (task === "expiry") {
      const fridgeExpired = this.staleSlots().some((s) => s.category === "fridge");
      const spot = find("restock", (i) => i.shelf === (fridgeExpired ? "fridge" : "grocery"));
      if (spot) this.travelToSpot(spot.x, spot.z, spot.shelf === "fridge" ? -Math.PI / 2 : Math.PI / 2);
    } else if (task === "delivery") {
      this.travelToSpot(PALLET_AT.x, PALLET_AT.z + 1.1, 0);
    } else if (task === "bill") {
      const spot = find("bill");
      if (spot) this.travelToSpot(spot.x, spot.z, Math.PI / 2);
    } else {
      const spot = find("stock", (i) => i.source === "storage");
      if (spot) this.travelToSpot(spot.x, spot.z, 0);
    }
  }

  /** Mark a morning task done and pay its small reward (once per day). */
  private finishTask(task: TaskId): void {
    if (this.storeDay.done[task]) return;
    const coins = this.storeDay.complete(task);
    if (coins) this.orders.addCoins(coins);
    const label = task === "mop" ? "Lantai bersih" : task === "bill" ? "Bil elektrik disemak" : task === "stock" ? "Stok disemak" : task === "delivery" ? "Penghantaran diterima" : "Barang luput dibuang";
    this.hud.showToast(`✅ ${label}${coins ? ` · +${coins} 🪙` : ""}`, 2500);
  }

  /** "📅 15 Okt · 7:30 pg 🔒" (closed before 10:00). */
  private updateClockPill(): void {
    const d = this.storeDay;
    this.hud.setDate(`📅 ${dateLabel(d.day)} · ${d.timeLabel()} ${d.open ? "🟢" : "🔒"}`);
  }

  /** Today's delivery for the products on display (made once per day). */
  private ensureDelivery(): void {
    this.delivery.ensure(this.storeDay.day, this.inventory.storage, (id) => this.inventory.unlocked(id) && this.store.productSpots.has(id));
    // nothing to deliver today: the task needs no work (and pays nothing)
    if (!this.delivery.lines.length && !this.storeDay.done.delivery) this.storeDay.complete("delivery");
    this.pallet.visible = this.deliveryWaiting();
  }

  /** The lorry has come (08:00) and the cartons are still waiting. */
  private deliveryWaiting(): boolean {
    return this.storeDay.minute >= ARRIVE && this.delivery.day === this.storeDay.day && !this.delivery.received && this.delivery.lines.length > 0;
  }

  private deliveryInteractables(): Interactable[] {
    if (!this.deliveryWaiting()) return [];
    return [{ id: "delivery", label: "Terima penghantaran", icon: "🚚", x: PALLET_AT.x, z: PALLET_AT.z + 0.5, radius: 1.1, kind: "delivery", room: "storage" }];
  }

  /** Spills on the floor are interact points (mop) while they're there. */
  private spillInteractables(): Interactable[] {
    return this.storeDay.spills.map((i) => ({ id: `spill-${i}`, label: "Mop lantai", icon: "🧹", x: SPILL_SPOTS[i][0], z: SPILL_SPOTS[i][1], radius: 1.2, kind: "mop" as const, spill: i, room: "entrance" as const }));
  }

  /** Fade-teleport to a point (facing given), like Go Here on the map. */
  private travelToSpot(x: number, z: number, facing: number): void {
    this.fade.classList.add("show");
    window.setTimeout(() => {
      this.player.place(x, z, facing);
      this.cam.yaw = facing;
      this.cam.snap(this.player.position);
      this.save();
      this.fade.classList.remove("show");
    }, 220);
  }

  /** Tap on the expiry pill: what is out of date and where to check it. */
  private explainExpired(): void {
    const items = this.staleSlots().map((s) => `${getItem(s.productId)!.name} (${this.inventory.expiredCount(s.slotId)})`);
    if (!items.length) return;
    this.hud.showToast(`🗑️ Luput: ${items.join(", ")}. Buka rak (peti sejuk dari Bilik Sejuk / Barang Dapur), tekan barang yang pudar dan seret ke 🗑️.`, 5500);
  }

  /** Shelf slots (on display at this level) that still hold expired units. */
  private staleSlots() {
    return SLOTS.filter((s) => this.inventory.unlocked(s.productId) && this.store.productSpots.has(s.productId) && this.inventory.expiredCount(s.slotId) > 0);
  }

  /** A customer bought something out of date: they come back to complain; refund costs coins. */
  private complain(expired: { productId: string; units: number }[]): void {
    const units = expired.reduce((a, e) => a + e.units, 0);
    const name = getItem(expired[0].productId)!.name;
    window.setTimeout(() => {
      this.npc.setBubble("😠");
      const lost = this.orders.penalty(units * 5);
      this.missions.complaint();
      this.hud.showToast(`😠 Pelanggan komplen: "${name} ni dah luput!" Duit dipulangkan${lost ? ` · −${lost} 🪙` : ""}. Semak rak setiap pagi ya.`, 5500);
    }, 1500);
  }

  /** Tap on the pill: which products are low and where to fetch them. */
  private explainLowStock(): void {
    const low = this.inventory.lowSlots();
    if (!low.length) return;
    const names = low.slice(0, 3).map((s) => `${getItem(s.productId)!.name} ${this.inventory.shelf[s.slotId] ?? 0}/${s.capacity}`);
    const more = low.length > 3 ? ` +${low.length - 3} lagi` : "";
    const rooms = [...new Set(low.map((s) => SOURCE_LABEL[SOURCE_OF[s.category]]))].map((r) => `${r.icon} ${r.name}`).join(" / ");
    this.hud.showToast(`📦 ${names.join(", ")}${more}. Ambil stok di ${rooms} (lihat penanda di peta).`, 5000);
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
    if (!this.taskMode) this.storeDay.tick(dt);
    if (this.orders.state === "idle" && this.npc.state === "hidden" && this.storeDay.open && this.storeDay.minute < CLOSE - 30) {
      this.nextCustomerIn -= dt;
      if (this.nextCustomerIn <= 0) {
        this.nextCustomerIn = 8;
        // customers only pick what is actually on the shelf
        const available = CATALOG.filter((p) => p.unlockLevel <= this.level && this.store.productSpots.has(p.id) && this.inventory.sellable(p.id) >= 1);
        if (this.orders.spawn(available, 3, (id) => this.inventory.sellable(id))) {
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
    // restocking drives the camera up to the shelf; otherwise the follow camera
    if (this.restock.active) this.restock.update(dt);
    else this.cam.update(this.player.position, dt);

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
    for (const it of [...this.store.interactables, ...this.spillInteractables(), ...this.deliveryInteractables()]) {
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
    if (this.taskMode && !this.overlays.isOpen && !this.fullMap.isOpen && !this.restock.active) {
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
