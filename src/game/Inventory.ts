import { getItem } from "../data/catalog";
import { BASKET_MAX, LOW_STOCK, SEED, SLOTS, isManaged, slotOf, type ShelfSlot } from "../data/inventory";
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

export type RestockError = "locked" | "wrongSlot" | "noStock" | "full" | "unknown";

// v2: new, mostly part-empty seed (older v1 saves are ignored and start from it)
const KEY = "mini-market-hero-inventory-v2";

export default class InventoryService {
  storage: Record<string, number> = {};
  shelf: Record<string, number> = {};
  basket: Record<string, number> = {};
  /** Units per bay (shelf board) for each slot; rebuilt from the quantity when missing. */
  layout: Record<string, Record<string, number>> = {};
  private soldOrders: string[] = [];
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

  /** Units a customer could buy right now (unmanaged sections are always available). */
  sellable(productId: string): number {
    return isManaged(productId) ? this.shelfQty(productId) : Infinity;
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
    this.changed();
    return n;
  }

  // ---------- basket -> shelf ----------

  /** Would one more unit of `productId` fit in `slotId`, given moves already pending? */
  check(slotId: string, productId: string, pending: RestockMove[]): RestockError | null {
    const slot = SLOTS.find((s) => s.slotId === slotId);
    if (!slot) return "unknown";
    if (!this.unlocked(productId)) return "locked";
    if (slot.productId !== productId) return "wrongSlot";
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

  /** A confirmed sale leaves the shelves: subtracted once per order id. Returns slots that just went low. */
  sell(orderId: string, lines: { productId: string; quantity: number }[]): ShelfSlot[] {
    if (this.soldOrders.includes(orderId)) return [];
    const wentLow: ShelfSlot[] = [];
    for (const l of lines) {
      const slot = slotOf(l.productId);
      if (!slot) continue;
      const before = this.shelf[slot.slotId] ?? 0;
      const after = Math.max(0, before - l.quantity);
      this.shelf[slot.slotId] = after;
      // goods leave from the top boards first
      const lay = this.layout[slot.slotId];
      if (lay) {
        let take = before - after;
        for (const k of Object.keys(lay).sort(sortKeys).reverse()) {
          const n = Math.min(take, lay[k]);
          lay[k] -= n;
          take -= n;
        }
      }
      if (before > LOW_STOCK && after <= LOW_STOCK) wentLow.push(slot);
    }
    this.soldOrders = [...this.soldOrders, orderId].slice(-200);
    this.changed();
    return wentLow;
  }

  // ---------- save ----------

  private seed(): void {
    SLOTS.forEach((s, i) => {
      this.storage[s.productId] = SEED.storage;
      this.shelf[s.slotId] = SEED.shelf(s, i);
    });
  }

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, storage: this.storage, shelf: this.shelf, basket: this.basket, layout: this.layout, soldOrders: this.soldOrders }));
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
  }
}
