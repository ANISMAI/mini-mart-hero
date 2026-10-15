import * as THREE from "three";
import { el } from "../ui/dom";
import { getItem, imageUrl, SECTIONS, type CatalogItem, type Category } from "../data/catalog";
import { SOURCE_LABEL, SOURCE_OF, slotsOn, type ShelfSlot } from "../data/inventory";
import type InventoryService from "./Inventory";
import type { RestockError, RestockMove } from "./Inventory";
import type { ProductSpot } from "../world/ProductModels";
import { layoutFor, type Bay, type ProductBays } from "../world/ShelfBays";

// Phase 3 hands-on restock, in the real 3D store (Supermarket-Simulator style): the camera moves
// up to the actual shelf face, every slot gets an outline and a small label, and the carton of
// stock the player carries sits at the bottom of the screen. Drag a product out of the carton
// onto the shelf: its own slot glows green, and on release the unit appears on the 3D shelf.
// Wrong / locked / full slots send it back with a short note. Swipe to slide along the shelf,
// +/- to move closer. Undo, Cancel (no change) and Confirm (applies everything at once).
// No timers, scores or hints.

/** One bay (the part of a product's block on one shelf board) with its outline. */
interface SlotView {
  slot: ShelfSlot;
  bay: Bay;
  box: THREE.Box3;
  /** Soft translucent glow shown on bays that can take the product being dragged. */
  outline: THREE.Mesh;
  /** One label per slot, shown on its lowest bay. */
  label: THREE.Sprite;
  unlocked: boolean;
  /** Which face of the shelf the slot is on (+1 / -1 along x) and that face's front x. */
  face: 1 | -1;
  faceX: number;
  setLabel: (name: string, qty: number, cap: number, state: "normal" | "low" | "full" | "locked") => void;
}

const ERR: Record<RestockError, (name: string) => string> = {
  locked: (n) => `🔒 ${n} belum dibuka pada level ini.`,
  wrongSlot: (n) => `Bukan slot untuk ${n}. Cari bahagian yang bercahaya hijau.`,
  noStock: (n) => `Tiada lagi ${n} dalam kotak. Ambil di stor dulu.`,
  full: (n) => `Slot ${n} dah penuh.`,
  unknown: () => "Lepaskan atas rak ya.",
};

function productIcon(item: CatalogItem): HTMLElement {
  const box = el("span", "st-icon", item.icon);
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.onload = () => box.replaceChildren(img);
  img.src = imageUrl(item);
  return box;
}

function labelSprite(): { sprite: THREE.Sprite; set(name: string, qty: number, cap: number, state: "normal" | "low" | "full" | "locked"): void } {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const c = cv.getContext("2d")!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(0.62, 0.155, 1);
  sprite.renderOrder = 20;
  return {
    sprite,
    set(name, qty, cap, state) {
      c.clearRect(0, 0, 256, 64);
      c.fillStyle = state === "locked" ? "#9aa6b5" : state === "low" ? "#ffb38a" : state === "full" ? "#9df0c4" : "#ffd84d";
      c.beginPath();
      c.roundRect(2, 2, 252, 60, 14);
      c.fill();
      c.fillStyle = "#23364f";
      c.textBaseline = "middle";
      c.font = '900 22px Nunito, "Segoe UI", sans-serif';
      let shown = state === "locked" ? `🔒 ${name}` : name;
      while (c.measureText(shown).width > 160 && shown.length > 4) shown = shown.slice(0, -2) + "…";
      c.fillText(shown, 12, 33);
      c.textAlign = "right";
      c.font = '900 24px Nunito, "Segoe UI", sans-serif';
      c.fillText(state === "locked" ? "" : `${qty}/${cap}`, 244, 33);
      c.textAlign = "left";
      tex.needsUpdate = true;
    },
  };
}

export default class RestockMode {
  active = false;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;
  private inv: InventoryService;
  private spots: Map<string, ProductSpot>;
  private uiRoot: HTMLElement;
  /** Shelf preview with pending units: units per bay per slot (the game redraws facings). */
  onPreview: (layouts: Record<string, Record<string, number>>) => void = () => {};
  /** Bays of every managed product (indexed by the game from the built shelves). */
  getBays: () => Map<string, ProductBays> = () => new Map();

  private views: SlotView[] = [];
  private group = new THREE.Group();
  private root: HTMLElement | null = null;
  private pending: RestockMove[] = [];
  private selected: string | null = null;
  private dragging: string | null = null;
  private category: Category = "fridge";
  private onClose: () => void = () => {};
  // camera rig
  private face: 1 | -1 = 1;
  private shelfX = 0;
  private z = 0;
  private zMin = 0;
  private zMax = 0;
  private dist = 2.3;
  private camGoal = new THREE.Vector3();
  private lookGoal = new THREE.Vector3();
  private look = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private fromBack = false;
  private pulse = 0;
  private msg: HTMLElement | null = null;
  private carton: HTMLElement | null = null;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene, inv: InventoryService, spots: Map<string, ProductSpot>, uiRoot: HTMLElement) {
    this.camera = camera;
    this.scene = scene;
    this.inv = inv;
    this.spots = spots;
    this.uiRoot = uiRoot;
    this.scene.add(this.group);
  }

  // ---------- open / close ----------

  /** `fromBack`: refill from behind (coolers seen from the chiller room through their glass backs). */
  open(category: Category, onClose: () => void, fromBack = false): void {
    this.fromBack = fromBack;
    this.dist = fromBack ? 2.2 : 2.3;
    this.category = category;
    this.onClose = onClose;
    this.pending = [];
    this.selected = null;
    this.buildSlots();
    if (!this.views.length) return onClose();
    // frame the shelf face from the aisle, starting at the first slot that needs stock
    const first = this.views.find((v) => v.unlocked && this.bayUnits(v) < v.bay.cap) ?? this.views[0];
    this.look.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()));
    this.showFace(first.face, (first.box.min.z + first.box.max.z) / 2);
    this.active = true;
    this.buildUI();
    this.refresh();
  }

  /** Frame one face of the shelf; slots on the other face are hidden until the player turns round. */
  private showFace(face: 1 | -1, z?: number): void {
    const on = this.views.filter((v) => v.face === face);
    if (!on.length) return;
    this.face = face;
    this.shelfX = on[0].faceX;
    if (this.fromBack) {
      // look at the back of the products from the other side
      this.face = (-face) as 1 | -1;
      const xs = on.map((v) => (face > 0 ? v.box.min.x : v.box.max.x));
      this.shelfX = face > 0 ? Math.min(...xs) - 0.05 : Math.max(...xs) + 0.05;
      for (const v of on) v.label.position.x = this.shelfX + this.face * 0.06;
    }
    const zs = on.flatMap((v) => [v.box.min.z, v.box.max.z]);
    this.zMin = Math.min(...zs) + 0.4;
    this.zMax = Math.max(Math.max(...zs) - 0.4, this.zMin);
    this.z = THREE.MathUtils.clamp(z ?? (this.zMin + this.zMax) / 2, this.zMin, this.zMax);
    for (const v of this.views) v.label.visible = v.face === face && v.label.userData.owner === v;
  }

  private get twoFaced(): boolean {
    return new Set(this.views.map((v) => v.face)).size > 1;
  }

  private close(apply: boolean): void {
    if (!this.active) return;
    if (apply && this.pending.length && !this.inv.restock(this.pending, this.layouts(true))) {
      this.say("Stok berubah, sila cuba lagi.", true);
      return;
    }
    this.active = false;
    this.pending = [];
    this.onPreview({});
    for (const v of this.views) {
      this.group.remove(v.outline, v.label);
      v.outline.geometry.dispose();
      if (v.label.userData.owner === v) {
        (v.label.material as THREE.SpriteMaterial).map?.dispose();
        (v.label.material as THREE.Material).dispose();
      }
    }
    this.views = [];
    this.root?.remove();
    this.root = null;
    this.onClose();
  }

  /** Per-frame camera glide (the game skips its follow camera while restocking). */
  update(dt: number): void {
    if (!this.active) return;
    this.camGoal.set(this.shelfX + this.face * this.dist, 1.3, this.z);
    this.lookGoal.set(this.shelfX, 0.95, this.z);
    const k = 1 - Math.pow(0.002, dt);
    this.camera.position.lerp(this.camGoal, k);
    this.look.lerp(this.lookGoal, k);
    this.camera.lookAt(this.look);
    // the green highlight follows what is being dragged or selected
    const want = this.dragging ?? this.selected;
    // only while dragging / selected: a gentle pulsing glow on the bays that can take the product
    this.pulse += dt;
    const glow = 0.12 + Math.sin(this.pulse * 4) * 0.05;
    const shown = this.fromBack ? -this.face : this.face;
    for (const v of this.views) {
      const room = !!want && v.unlocked && v.slot.productId === want && this.bayUnits(v) < v.bay.cap;
      v.outline.visible = room && v.face === shown;
      (v.outline.material as THREE.MeshBasicMaterial).opacity = glow;
    }
  }

  // ---------- slots ----------

  /** One outline per bay (board) of each product, one label per product on its lowest bay. */
  private buildSlots(): void {
    this.views = [];
    const bays = this.getBays();
    for (const slot of slotsOn(this.category)) {
      const spot = this.spots.get(slot.productId);
      const entry = bays.get(slot.productId);
      if (!spot || !entry || !entry.bays.length) continue;
      const lab = labelSprite();
      let owner: SlotView | null = null;
      for (const bay of entry.bays) {
        const box = bay.box;
        const outline = new THREE.Mesh(
          new THREE.BoxGeometry(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z),
          new THREE.MeshBasicMaterial({ color: 0x5dffa0, transparent: true, opacity: 0, depthWrite: false })
        );
        outline.renderOrder = 19;
        outline.visible = false;
        box.getCenter(outline.position);
        // the front edge of this bay's face
        const faceX = bay.face > 0 ? box.max.x - 0.12 : box.min.x + 0.12;
        const view: SlotView = { slot, bay, box, outline, label: lab.sprite, unlocked: this.inv.unlocked(slot.productId), face: bay.face, faceX, setLabel: lab.set };
        if (!owner) {
          owner = view;
          lab.sprite.userData.owner = view;
          lab.sprite.position.set(faceX + bay.face * 0.08, box.min.y - 0.02, (box.min.z + box.max.z) / 2);
          this.group.add(lab.sprite);
        }
        this.group.add(outline);
        this.views.push(view);
      }
    }
  }

  /** Current units per bay for a slot (saved layout or poured from the bottom), plus pending. */
  private layoutOf(slot: ShelfSlot): Record<string, number> {
    const entry = this.getBays().get(slot.productId);
    if (!entry) return {};
    const lay = layoutFor(entry.bays, this.inv.shelf[slot.slotId] ?? 0, this.inv.layout[slot.slotId]);
    for (const m of this.pending) if (m.slotId === slot.slotId && m.bay) lay[m.bay] = (lay[m.bay] ?? 0) + m.units;
    return lay;
  }

  private bayUnits(v: SlotView): number {
    return this.layoutOf(v.slot)[v.bay.key] ?? 0;
  }

  /** Layouts for the preview (or, with `touchedOnly`, just the slots this session changed). */
  private layouts(touchedOnly = false): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    const touched = new Set(this.pending.map((m) => m.slotId));
    for (const slot of slotsOn(this.category)) if (!touchedOnly || touched.has(slot.slotId)) out[slot.slotId] = this.layoutOf(slot);
    return out;
  }

  private qty(slotId: string): number {
    return (this.inv.shelf[slotId] ?? 0) + this.pending.filter((m) => m.slotId === slotId).reduce((a, m) => a + m.units, 0);
  }

  private refresh(): void {
    for (const v of this.views) {
      if (v.label.userData.owner !== v) continue;
      const q = this.qty(v.slot.slotId);
      const item = getItem(v.slot.productId)!;
      v.setLabel(item.name, q, v.slot.capacity, !v.unlocked ? "locked" : q >= v.slot.capacity ? "full" : q <= 3 ? "low" : "normal");
    }
    this.onPreview(this.layouts());
    this.drawCarton();
  }

  /**
   * The slot under a screen point (null if none). Forgiving: if the point is anywhere inside the
   * dragged product's own slot, that slot wins even where neighbouring outlines overlap.
   */
  private slotAt(clientX: number, clientY: number, prefer?: string): SlotView | null {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    let best: SlotView | null = null;
    let bestD = Infinity;
    const hit = new THREE.Vector3();
    const shown = this.fromBack ? -this.face : this.face;
    for (const v of this.views) {
      if (v.face !== shown) continue;
      if (this.ray.ray.intersectBox(v.box, hit)) {
        if (prefer && v.slot.productId === prefer && v.unlocked) return v;
        const d = hit.distanceTo(this.ray.ray.origin);
        if (d < bestD) {
          best = v;
          bestD = d;
        }
      }
    }
    return best;
  }

  private place(view: SlotView | null, productId: string, x: number, y: number): boolean {
    const name = getItem(productId)!.name;
    if (!view) {
      this.say(ERR.unknown(name), true);
      return false;
    }
    const err = this.inv.check(view.slot.slotId, productId, this.pending);
    if (err) {
      this.say(ERR[err](name), true);
      return false;
    }
    // each board (bay) has its own room: when this one is full, try another part of the slot
    if (this.bayUnits(view) >= view.bay.cap) {
      this.say("Bahagian ini dah penuh. Letak di bahagian lain ya.", true);
      return false;
    }
    this.pending.push({ slotId: view.slot.slotId, productId, units: 1, bay: view.bay.key });
    this.say(`👍 ${name} masuk rak`);
    this.float("+1", x, y);
    this.refresh();
    return true;
  }

  // ---------- UI ----------

  private buildUI(): void {
    const sec = SECTIONS[this.category];
    const root = el("div", "rs-root");
    // swipe on the empty screen to slide along the shelf; tap places the selected product
    const touch = el("div", "rs-touch");
    let sx = 0;
    let sz = 0;
    let moved = false;
    let pid = -1;
    touch.addEventListener("pointerdown", (e) => {
      pid = e.pointerId;
      sx = e.clientX;
      sz = this.z;
      moved = false;
      touch.setPointerCapture(pid);
    });
    touch.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 6) moved = true;
      // the shelf follows the finger (screen right is -z when looking at a +x face)
      const metresPerPx = (this.dist * 1.1) / Math.max(320, innerWidth);
      this.z = THREE.MathUtils.clamp(sz + dx * metresPerPx * this.face, this.zMin, this.zMax);
    });
    touch.addEventListener("pointerup", (e) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      if (!moved && this.selected) this.place(this.slotAt(e.clientX, e.clientY, this.selected), this.selected, e.clientX, e.clientY);
    });
    touch.addEventListener("wheel", (e) => this.zoom(e.deltaY > 0 ? 0.2 : -0.2), { passive: true });

    const top = el("div", "rs-top");
    top.append(el("div", "rs-title", `${sec.icon} Isi Stok · ${sec.label}`));
    const zoomBar = el("div", "rs-zoom");
    const zin = el("button", "btn round", "+");
    zin.setAttribute("aria-label", "Dekat");
    zin.addEventListener("click", () => this.zoom(-0.3));
    const zout = el("button", "btn round", "−");
    zout.setAttribute("aria-label", "Jauh");
    zout.addEventListener("click", () => this.zoom(0.3));
    zoomBar.append(zout, zin);
    if (this.twoFaced && !this.fromBack) {
      const turn = el("button", "btn rs-turn", "🔄 Muka lain");
      turn.addEventListener("click", () => {
        this.showFace(this.face === 1 ? -1 : 1);
        this.say("Ini muka sebelah lagi rak ni.");
      });
      zoomBar.prepend(turn);
    }
    top.appendChild(zoomBar);

    this.msg = el("div", "rs-msg");
    this.carton = el("div", "rs-carton");
    const foot = el("div", "rs-foot");
    const undo = el("button", "btn", "↶ Undo");
    undo.addEventListener("click", () => {
      if (this.pending.pop()) {
        this.say("Barang terakhir dipulangkan ke kotak.");
        this.refresh();
      }
    });
    const cancel = el("button", "btn", "Batal");
    cancel.addEventListener("click", () => this.close(false));
    const confirm = el("button", "btn primary", "✔ Sahkan");
    confirm.addEventListener("click", () => this.close(true));
    foot.append(undo, cancel, confirm);
    const bottom = el("div", "rs-bottom");
    bottom.append(this.carton, foot);
    root.append(touch, top, this.msg, bottom);
    this.uiRoot.appendChild(root);
    this.root = root;
    this.say("Seret barang dari kotak ke rak. Bahagian yang betul akan bercahaya hijau. Leret skrin untuk geser rak.");
  }

  private drawCarton(): void {
    if (!this.carton) return;
    const used = (id: string) => this.pending.filter((m) => m.productId === id).reduce((a, m) => a + m.units, 0);
    const items = this.views.filter(
      (v, i, all) => v.unlocked && all.findIndex((w) => w.slot.slotId === v.slot.slotId) === i && (this.inv.basket[v.slot.productId] ?? 0) - used(v.slot.productId) > 0
    );
    if (this.selected && !items.some((v) => v.slot.productId === this.selected)) this.selected = null;
    const label = el("span", "rs-carton-label", "📦");
    if (!items.length) {
      const src = SOURCE_LABEL[SOURCE_OF[this.category]];
      this.carton.replaceChildren(label, el("span", "st-empty", `Kotak kosong. Ambil stok di ${src.icon} ${src.name}.`));
      return;
    }
    this.carton.replaceChildren(
      label,
      ...items.map((v) => {
        const item = getItem(v.slot.productId)!;
        const left = (this.inv.basket[item.id] ?? 0) - used(item.id);
        const pile = el("button", `st-pile ${this.selected === item.id ? "sel" : ""}`);
        pile.setAttribute("aria-label", `${item.name}, ${left} dalam kotak`);
        pile.append(productIcon(item), el("span", "st-pile-count", `×${left}`));
        this.makeDraggable(pile, item);
        return pile;
      })
    );
  }

  private makeDraggable(pile: HTMLElement, item: CatalogItem): void {
    let id = -1;
    let sx = 0;
    let sy = 0;
    let ghost: HTMLElement | null = null;
    pile.style.touchAction = "none";
    pile.addEventListener("dragstart", (e) => e.preventDefault());
    pile.addEventListener("pointerdown", (e) => {
      id = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      pile.setPointerCapture(id);
    });
    pile.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
        ghost = el("div", "st-ghost");
        ghost.appendChild(productIcon(item));
        document.body.appendChild(ghost);
        this.dragging = item.id;
        pile.classList.add("lifting");
      }
      if (ghost) ghost.style.transform = `translate(${e.clientX - 28}px, ${e.clientY - 28}px) scale(1.15)`;
    });
    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== id) return;
      id = -1;
      pile.classList.remove("lifting");
      this.dragging = null;
      if (!ghost) {
        if (!cancelled) {
          this.selected = this.selected === item.id ? null : item.id;
          if (this.selected) this.say(`Tekan slot ${item.name} yang bercahaya hijau di rak.`);
          this.drawCarton();
        }
        return;
      }
      const g = ghost;
      ghost = null;
      const ok = !cancelled && this.place(this.slotAt(e.clientX, e.clientY, item.id), item.id, e.clientX, e.clientY);
      if (ok) return g.remove();
      const r = pile.getBoundingClientRect();
      g.classList.add("back");
      g.style.transform = `translate(${r.left + r.width / 2 - 28}px, ${r.top + r.height / 2 - 28}px) scale(0.8)`;
      setTimeout(() => g.remove(), 260);
    };
    pile.addEventListener("pointerup", (e) => finish(e, false));
    pile.addEventListener("pointercancel", (e) => finish(e, true));
  }

  private zoom(delta: number): void {
    // from the back the camera may pull out past the chiller-room wall (walls near the camera fade)
    this.dist = THREE.MathUtils.clamp(this.dist + delta, this.fromBack ? 1.0 : 1.3, this.fromBack ? 3.4 : 4.2);
  }

  private msgTimer = 0;

  /** Small pill under the title that fades by itself (never covers the shelf for long). */
  private say(text: string, warn = false): void {
    if (!this.msg) return;
    this.msg.textContent = text;
    this.msg.classList.toggle("warn", warn);
    this.msg.classList.add("show");
    window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => this.msg?.classList.remove("show"), warn ? 2500 : 3500);
  }

  private float(text: string, x: number, y: number): void {
    const f = el("div", "rs-float", text);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 700);
  }
}
