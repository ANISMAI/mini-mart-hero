import { getItem } from "../data/catalog";
import { BASKET_MAX, LOW_STOCK, SALES_PER_DAY, SEED, SHELF_LIFE, SLOTS, isManaged, isPerishable, slotOf, type ShelfSlot } from "../data/inventory";
import { sortKeys } from "../world/ShelfBays";

// InventoryService (Phase 3): real stock for the managed sections. Back-stock (storage / chiller
// room), what the player carries in the restock basket, and units in each fixed shelf slot.
// Every mutation is guarded: no negatives, no exceeding capacity, no locked or wrong-slot
// products, restocks apply atomically, and a sale is subtracted exactly once per order.
// Saved under its own versioned key; unreadable data falls back to the deterministic seed.

export interface RestockMove {
  slotId: string;
  productId: string;
  units: number;
  /** Shelf board (bay) the unit was put on. */
  bay?: string;
}

export type RestockError = "locked" | "wrongSlot" | "expired" | "noStock" | "full" | "unknown";

// v2: new, mostly part-empty seed (older v1 saves are ignored and start from it)
const KEY = "mini-market-hero-inventory-v2";

export default class InventoryService {
  storage: Record<string, number> = {};
  shelf: Record<string, number> = {};
  basket: Record<string, number> = {};
  /** Units per bay (shelf board) for each slot; rebuilt from the quantity when missing. */
  layout: Record<string, Record<string, number>> = {};
  private soldOrders: string[] = [];
  /** Game day (1 = 15 Okt 2026); advances every few completed sales, never in real time. */
  day = 1;
  private salesToday = 0;
  /** Last game day whose morning checklist the player has seen. */
  briefDay = 0;
  /**
   * Perishables only: the expiry day of every unit, kept sorted earliest first (FEFO: the front of
   * the shelf and the first to be picked). Lengths always match the matching quantity.
   */
  exp: { storage: Record<string, number[]>; basket: Record<string, number[]>; shelf: Record<string, number[]> } = { storage: {}, basket: {}, shelf: {} };
  private listeners = new Set<() => void>();
  /** Current career level (locked products can't be stocked). */
  level = 1;

  constructor() {
    this.seed();
    this.load();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- reading ----------

  shelfQty(productId: string): number {
    const s = slotOf(productId);
    return s ? this.shelf[s.slotId] ?? 0 : 0;
  }

  /**
   * Units a customer could buy right now (unmanaged sections are always available). Expired units
   * left on the shelf count too: customers take from the front and may walk off with one.
   */
  sellable(productId: string): number {
    if (!isManaged(productId)) return Infinity;
    return this.shelfQty(productId);
  }

  /** Expired units on a shelf slot (perishables). */
  expiredCount(slotId: string): number {
    return (this.exp.shelf[slotId] ?? []).filter((d) => d < this.day).length;
  }

  basketCount(): number {
    return Object.values(this.basket).reduce((a, b) => a + b, 0);
  }

  lowSlots(): ShelfSlot[] {
    return SLOTS.filter((s) => this.unlocked(s.productId) && (this.shelf[s.slotId] ?? 0) <= LOW_STOCK);
  }

  unlocked(productId: string): boolean {
    const p = getItem(productId);
    return !!p && p.unlockLevel <= this.level;
  }

  // ---------- back-stock <-> basket ----------

  /** Take units from back-stock into the basket. Returns how many were actually taken. */
  take(productId: string, units = 1): number {
    if (!isManaged(productId) || !this.unlocked(productId)) return 0;
    const n = Math.max(0, Math.min(units, this.storage[productId] ?? 0, BASKET_MAX - this.basketCount()));
    if (!n) return 0;
    this.storage[productId] -= n;
    this.basket[productId] = (this.basket[productId] ?? 0) + n;
    if (isPerishable(productId)) {
      const from = (this.exp.storage[productId] ?? []).sort((a, b) => a - b);
      this.exp.basket[productId] = [...(this.exp.basket[productId] ?? []), ...from.splice(0, n)].sort((a, b) => a - b);
      this.exp.storage[productId] = from;
    }
    this.changed();
    return n;
  }

  /** Put units from the basket back into back-stock. */
  putBack(productId: string, units = 1): number {
    const n = Math.max(0, Math.min(units, this.basket[productId] ?? 0));
    if (!n) return 0;
    this.basket[productId] -= n;
    if (!this.basket[productId]) delete this.basket[productId];
    this.storage[productId] = (this.storage[productId] ?? 0) + n;
    if (isPerishable(productId)) {
      const from = this.exp.basket[productId] ?? [];
      this.exp.storage[productId] = [...(this.exp.storage[productId] ?? []), ...from.splice(from.length - n, n)].sort((a, b) => a - b);
      this.exp.basket[productId] = from;
    }
    this.changed();
    return n;
  }

  /** Supplier delivery into back-stock; perishables arrive with fresh dates. */
  receive(lines: { productId: string; units: number }[]): void {
    for (const l of lines) {
      if (!isManaged(l.productId) || !Number.isInteger(l.units) || l.units <= 0) continue;
      this.storage[l.productId] = Math.min(9999, (this.storage[l.productId] ?? 0) + l.units);
      if (isPerishable(l.productId)) {
        const fresh = Array.from({ length: l.units }, () => this.day + SHELF_LIFE[l.productId]);
        this.exp.storage[l.productId] = [...(this.exp.storage[l.productId] ?? []), ...fresh].sort((a, b) => a - b).slice(0, this.storage[l.productId]);
      }
    }
    this.changed();
  }

  // ---------- basket -> shelf ----------

  /** Would one more unit of `productId` fit in `slotId`, given moves already pending? */
  check(slotId: string, productId: string, pending: RestockMove[]): RestockError | null {
    const slot = SLOTS.find((s) => s.slotId === slotId);
    if (!slot) return "unknown";
    if (!this.unlocked(productId)) return "locked";
    if (slot.productId !== productId) return "wrongSlot";
    // out-of-date units have to come off the shelf before fresh stock goes on
    if (this.expiredCount(slotId) > 0) return "expired";
    const used = pending.filter((m) => m.productId === productId).reduce((a, m) => a + m.units, 0);
    if ((this.basket[productId] ?? 0) - used <= 0) return "noStock";
    const into = pending.filter((m) => m.slotId === slotId).reduce((a, m) => a + m.units, 0);
    if ((this.shelf[slotId] ?? 0) + into >= slot.capacity) return "full";
    return null;
  }

  /**
   * Applies all moves or none (validated against the current state). `layouts` (optional) is the
   * resulting units per bay for the touched slots; kept only if it adds up to the new quantity.
   */
  restock(moves: RestockMove[], layouts: Record<string, Record<string, number>> = {}): boolean {
    const nextShelf = { ...this.shelf };
    const nextBasket = { ...this.basket };
    for (const m of moves) {
      const slot = SLOTS.find((s) => s.slotId === m.slotId);
      if (!slot || slot.productId !== m.productId || !this.unlocked(m.productId) || m.units <= 0 || !Number.isInteger(m.units)) return false;
      if ((nextBasket[m.productId] ?? 0) < m.units) return false;
      if ((nextShelf[m.slotId] ?? 0) + m.units > slot.capacity) return false;
      nextBasket[m.productId] -= m.units;
      nextShelf[m.slotId] = (nextShelf[m.slotId] ?? 0) + m.units;
    }
    for (const k of Object.keys(nextBasket)) if (!nextBasket[k]) delete nextBasket[k];
    // perishables: the earliest-dated units go up first and the shelf stays earliest-first (FEFO)
    for (const m of moves) {
      if (!isPerishable(m.productId)) continue;
      const from = (this.exp.basket[m.productId] ?? []).sort((a, b) => a - b);
      this.exp.shelf[m.slotId] = [...(this.exp.shelf[m.slotId] ?? []), ...from.splice(0, m.units)].sort((a, b) => a - b);
      this.exp.basket[m.productId] = from;
    }
    this.shelf = nextShelf;
    this.basket = nextBasket;
    for (const [slotId, lay] of Object.entries(layouts)) {
      const sum = Object.values(lay).reduce((a, b) => a + b, 0);
      if (sum === this.shelf[slotId] && Object.values(lay).every((v) => Number.isInteger(v) && v >= 0)) this.layout[slotId] = { ...lay };
      else delete this.layout[slotId];
    }
    this.changed();
    return true;
  }

  // ---------- sales ----------

  /**
   * A confirmed sale leaves the shelves: subtracted once per order id. Returns slots that just went
   * low, and any expired units the customer took (perishables go front first, FEFO).
   */
  sell(orderId: string, lines: { productId: string; quantity: number }[]): { low: ShelfSlot[]; expired: { productId: string; units: number }[] } {
    if (this.soldOrders.includes(orderId)) return { low: [], expired: [] };
    const wentLow: ShelfSlot[] = [];
    const expired: { productId: string; units: number }[] = [];
    for (const l of lines) {
      const slot = slotOf(l.productId);
      if (!slot) continue;
      const before = this.shelf[slot.slotId] ?? 0;
      const qty = Math.min(l.quantity, before);
      if (isPerishable(l.productId)) {
        // customers take from the front: the earliest dates, expired ones included
        const taken = (this.exp.shelf[slot.slotId] ?? []).splice(0, qty);
        const bad = taken.filter((d) => d < this.day).length;
        if (bad) expired.push({ productId: l.productId, units: bad });
      }
      const after = before - qty;
      this.shelf[slot.slotId] = after;
      this.trimLayout(slot.slotId, qty);
      if (before > LOW_STOCK && after <= LOW_STOCK) wentLow.push(slot);
    }
    this.soldOrders = [...this.soldOrders, orderId].slice(-200);
    this.changed();
    return { low: wentLow, expired };
  }

  /** Units leave a slot from its top boards first. */
  private trimLayout(slotId: string, n: number): void {
    const lay = this.layout[slotId];
    if (!lay) return;
    let take = n;
    for (const k of Object.keys(lay).sort(sortKeys).reverse()) {
      const m = Math.min(take, lay[k]);
      lay[k] -= m;
      take -= m;
    }
  }

  // ---------- expiry ----------

  /** Remove one expired unit (by its index in the slot's date list). False if it isn't expired. */
  removeExpired(slotId: string, index: number): boolean {
    const dates = this.exp.shelf[slotId];
    if (!dates || index < 0 || index >= dates.length || dates[index] >= this.day) return false;
    dates.splice(index, 1);
    this.shelf[slotId] = Math.max(0, (this.shelf[slotId] ?? 0) - 1);
    this.trimLayout(slotId, 1);
    this.changed();
    return true;
  }

  /** Developer: the front `n` units of a perishable slot go out of date (to see expiry in action). */
  devExpire(slotId: string, n = 2): number {
    const dates = this.exp.shelf[slotId];
    if (!dates?.length) return 0;
    const k = Math.min(n, dates.length);
    for (let i = 0; i < k; i++) dates[i] = Math.min(dates[i], this.day - 1);
    dates.sort((a, b) => a - b);
    this.changed();
    return k;
  }

  /** Remove every expired unit from a slot; returns how many went. */
  removeAllExpired(slotId: string): number {
    const dates = this.exp.shelf[slotId] ?? [];
    const keep = dates.filter((d) => d >= this.day);
    const gone = dates.length - keep.length;
    if (!gone) return 0;
    this.exp.shelf[slotId] = keep;
    this.shelf[slotId] = Math.max(0, (this.shelf[slotId] ?? 0) - gone);
    this.trimLayout(slotId, gone);
    this.changed();
    return gone;
  }

  /** Counts a completed sale towards the game day; returns true when a new day starts. */
  registerSale(): boolean {
    this.salesToday++;
    if (this.salesToday < SALES_PER_DAY) {
      this.save();
      return false;
    }
    this.salesToday = 0;
    this.advanceDay();
    return true;
  }

  /** Mark today's morning checklist as seen. */
  briefSeen(): void {
    this.briefDay = this.day;
    this.save();
  }

  /** Near-expiry (today / tomorrow) units on a slot. */
  nearCount(slotId: string): number {
    return (this.exp.shelf[slotId] ?? []).filter((d) => d >= this.day && d <= this.day + 1).length;
  }

  /** The store clock owns the day; keep the inventory (expiry) in step. */
  setDay(day: number): void {
    if (day === this.day || !Number.isInteger(day) || day < 1) return;
    this.day = day;
    this.changed();
  }

  advanceDay(): void {
    this.day++;
    this.changed();
  }

  // ---------- save ----------

  private seed(): void {
    SLOTS.forEach((s, i) => {
      this.storage[s.productId] = SEED.storage;
      this.shelf[s.slotId] = SEED.shelf(s, i);
      if (isPerishable(s.productId)) this.seedDates(s);
    });
  }

  /**
   * Known test dates: back-stock is fresh; shelf units run from already-expired through
   * close-dated to fresh, so there is always something to check.
   */
  private seedDates(s: ShelfSlot): void {
    const life = SHELF_LIFE[s.productId];
    this.exp.storage[s.productId] = Array.from({ length: this.storage[s.productId] }, () => this.day + life);
    const offsets = [-1, 0, 1, 2, life - 1, life];
    this.exp.shelf[s.slotId] = Array.from({ length: this.shelf[s.slotId] }, (_, k) => this.day + offsets[k % offsets.length]).sort((a, b) => a - b);
    this.exp.basket[s.productId] = [];
  }

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ version: 1, storage: this.storage, shelf: this.shelf, basket: this.basket, layout: this.layout, soldOrders: this.soldOrders, day: this.day, salesToday: this.salesToday, briefDay: this.briefDay, exp: this.exp })
      );
    } catch {
      // storage unavailable: play continues unsaved
    }
  }

  /** Keeps valid numbers from the save; anything missing or broken stays at the seed. */
  private load(): void {
    let s: any;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return;
    }
    if (!s || s.version !== 1) return;
    const ok = (v: unknown, max = 9999) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
    for (const slot of SLOTS) {
      if (ok(s.storage?.[slot.productId])) this.storage[slot.productId] = s.storage[slot.productId];
      if (ok(s.shelf?.[slot.slotId], slot.capacity)) this.shelf[slot.slotId] = s.shelf[slot.slotId];
      if (ok(s.basket?.[slot.productId], BASKET_MAX) && s.basket[slot.productId] > 0) this.basket[slot.productId] = s.basket[slot.productId];
    }
    if (this.basketCount() > BASKET_MAX) this.basket = {};
    if (s.layout && typeof s.layout === "object")
      for (const slot of SLOTS) {
        const lay = s.layout[slot.slotId];
        if (lay && typeof lay === "object" && Object.values(lay).every((v) => ok(v, slot.capacity))) this.layout[slot.slotId] = lay as Record<string, number>;
      }
    if (Array.isArray(s.soldOrders)) this.soldOrders = s.soldOrders.filter((x: unknown) => typeof x === "string").slice(-200);
    if (Number.isInteger(s.day) && s.day >= 1) this.day = s.day;
    if (Number.isInteger(s.briefDay) && s.briefDay >= 0 && s.briefDay <= this.day) this.briefDay = s.briefDay;
    if (Number.isInteger(s.salesToday) && s.salesToday >= 0) this.salesToday = s.salesToday % SALES_PER_DAY;
    // expiry lists must match the quantities; otherwise (older saves) start them as fresh stock
    const dates = (v: unknown, n: number) => (Array.isArray(v) && v.length === n && v.every((d) => Number.isInteger(d)) ? [...(v as number[])].sort((a, b) => a - b) : null);
    for (const slot of SLOTS) {
      if (!isPerishable(slot.productId)) continue;
      const fresh = (n: number) => Array.from({ length: n }, () => this.day + SHELF_LIFE[slot.productId]);
      this.exp.storage[slot.productId] = dates(s.exp?.storage?.[slot.productId], this.storage[slot.productId] ?? 0) ?? fresh(this.storage[slot.productId] ?? 0);
      this.exp.basket[slot.productId] = dates(s.exp?.basket?.[slot.productId], this.basket[slot.productId] ?? 0) ?? fresh(this.basket[slot.productId] ?? 0);
      const saved = dates(s.exp?.shelf?.[slot.slotId], this.shelf[slot.slotId] ?? 0);
      if (saved) this.exp.shelf[slot.slotId] = saved;
      else {
        // a save from before expiry tracking: give the shelf the same known test spread
        const life = SHELF_LIFE[slot.productId];
        const offsets = [-1, 0, 1, 2, life - 1, life];
        this.exp.shelf[slot.slotId] = Array.from({ length: this.shelf[slot.slotId] ?? 0 }, (_, k) => this.day + offsets[k % offsets.length]).sort((x, y) => x - y);
      }
    }
  }
}
