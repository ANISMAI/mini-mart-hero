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
