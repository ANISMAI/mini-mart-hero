// Phase 3 stock configuration: fixed shelf slots (one per SKU, never randomised), capacities,
// where back-stock lives, seed quantities and the low-stock threshold. Data only.

import { CATALOG, SECTIONS, type CatalogItem, type Category } from "./catalog";

/** Sections whose stock is managed: all five (44 SKUs). */
export const MANAGED: Category[] = ["fridge", "grocery", "personal", "household", "snacks"];

/** Where back-stock for a section is kept: chilled goods in the chiller room, dry goods in the store room. */
export type StockSource = "chiller" | "storage";
export const SOURCE_OF: Record<Category, StockSource> = {
  fridge: "chiller",
  grocery: "storage",
  personal: "storage",
  household: "storage",
  snacks: "storage",
};
export const SOURCE_LABEL: Record<StockSource, { name: string; icon: string }> = {
  chiller: { name: "Bilik Sejuk", icon: "❄️" },
  storage: { name: "Stor", icon: "📦" },
};

export interface ShelfSlot {
  /** Stable id, e.g. "fridge.air-mineral-500ml". */
  slotId: string;
  /** Shelf it belongs to (catalog shelfId, e.g. "FRIDGE_A"). */
  shelfId: string;
  category: Category;
  /** The only product allowed in this slot. */
  productId: string;
  capacity: number;
}

/** Bulky items hold fewer units per slot. */
const BULKY = new Set(["sack", "bigBottle", "jug", "tissueRolls", "eggs", "loaf"]);
const capacityOf = (p: CatalogItem) => (BULKY.has(p.shape) ? 8 : 12);

export const SLOTS: ShelfSlot[] = CATALOG.filter((p) => MANAGED.includes(p.category)).map((p) => ({
  slotId: `${p.category}.${p.modelKey}`,
  shelfId: SECTIONS[p.category].shelfId,
  category: p.category,
  productId: p.id,
  capacity: capacityOf(p),
}));

export const slotOf = (productId: string) => SLOTS.find((s) => s.productId === productId);
export const slotsOn = (category: Category) => SLOTS.filter((s) => s.category === category);
export const isManaged = (productId: string) => !!slotOf(productId);

/** Shelf stock at or below this many units counts as low (adjustable). */
export const LOW_STOCK = 3;
/** Most units the player can carry in the restock basket. */
export const BASKET_MAX = 24;

/** Starting shelf levels per SKU (most slots part-empty so there is restocking to do). */
const START_SHELF: Record<string, number> = { "04-002": 2 }; // Mi Segera: nearly empty
const PATTERN = [0.25, 0.5, 0.15, 0.6, 0.35]; // share of capacity for everything else

/** Deterministic seed: back-stock per SKU and a varied, mostly part-empty starting shelf. */
export const SEED = {
  storage: 24,
  shelf: (slot: ShelfSlot, i: number) => START_SHELF[slot.productId] ?? Math.max(1, Math.round(slot.capacity * PATTERN[i % PATTERN.length])),
};

// ---------- expiry (perishables only; everything else has no date) ----------

/** Shelf life in game days for perishable products (SKU -> days). */
export const SHELF_LIFE: Record<string, number> = {
  "01-002": 5, // Susu Segar 1L
  "01-004": 10, // Minuman Coklat Malt
  "01-005": 3, // Air Soya
  "01-008": 6, // Yogurt Strawberi
  "01-009": 14, // Mentega 250g
  "04-001": 3, // Roti Putih
  "04-007": 10, // Telur Gred A
};
export const isPerishable = (productId: string) => productId in SHELF_LIFE;

/** Game day 1 is this date; one game day passes every few completed sales (not real time). */
const START_DATE = new Date(2026, 9, 15);
const MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
export function dateLabel(day: number): string {
  const d = new Date(START_DATE);
  d.setDate(d.getDate() + day - 1);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** Completed sales per game day. */
export const SALES_PER_DAY = 3;
/** Expiry status of a unit on `today`: expired (before today), near (today or tomorrow), ok. */
export const expiryStatus = (exp: number, today: number): "expired" | "near" | "ok" => (exp < today ? "expired" : exp <= today + 1 ? "near" : "ok");
