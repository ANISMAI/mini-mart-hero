import { getItem, type CatalogItem } from "../data/catalog";

// OrderService: one customer transaction as a guarded state machine. The customer shops by
// themselves; the player runs the till.
//   idle > shopping > waiting > scanning > paying > handoff > complete
// (paid with exact change = done: the order is handed over straight away)
// Every step validates the current state, so nothing can be skipped, repeated or rewarded twice.
// Money is integer sen only. State and stats are saved under their own key (the Phase 1 and 1.5
// saves are untouched); a reload mid-till resumes safely at "waiting".

export type OrderState = "idle" | "shopping" | "waiting" | "scanning" | "paying" | "handoff" | "complete";

/** Customer templates: how many items they pick up. */
export type CustomerTemplate = "express" | "ordinary" | "family";

export interface OrderLine {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  customerId: CustomerTemplate;
  /** Which of the customer looks walks in (cosmetic). */
  look: number;
  lines: OrderLine[];
  state: OrderState;
  /** What the customer has put in their basket so far. */
  collected: Record<string, number>;
  /** One entry per scanned unit: `${productId}#${unitIndex}`. */
  scanned: string[];
  paymentTenderedSen: number;
  /** Stage scores, filled as stages complete. */
  points: { scan: number; change: number; handoff: number };
  scanMisses: number;
  changeTries: number;
  earnedScore: number;
}

export interface OrderStats {
  completedOrderIds: string[];
  bestScore: number;
  totalScore: number;
  coins: number;
}

const KEY = "mini-market-hero-orders-v2";
/** Malaysian notes and coins, in sen. */
export const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 100, 50, 20, 10, 5];
export const MAX_POINTS = { scan: 35, change: 50, handoff: 15 };
const TEMPLATES: Record<CustomerTemplate, [number, number]> = { express: [1, 2], ordinary: [2, 3], family: [3, 4] };
const TILL_STATES: OrderState[] = ["scanning", "paying"];

export const rmSen = (sen: number) => `RM${Math.floor(sen / 100)}.${String(sen % 100).padStart(2, "0")}`;

export default class OrderService {
  order: Order | null = null;
  stats: OrderStats = { completedOrderIds: [], bestScore: 0, totalScore: 0, coins: 0 };
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  get state(): OrderState {
    return this.order?.state ?? "idle";
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- reading ----------

  items(): { item: CatalogItem; line: OrderLine }[] {
    return (this.order?.lines ?? []).map((line) => ({ item: getItem(line.productId)!, line }));
  }

  totalSen(): number {
    return this.items().reduce((sum, { item, line }) => sum + item.priceCents * line.quantity, 0);
  }

  unitCount(): number {
    return (this.order?.lines ?? []).reduce((n, l) => n + l.quantity, 0);
  }

  collectedCount(): number {
    const o = this.order;
    return o ? o.lines.reduce((n, l) => n + Math.min(l.quantity, o.collected[l.productId] ?? 0), 0) : 0;
  }

  /** Every unit to scan, in order: `${productId}#${i}`. */
  scanUnits(): string[] {
    return (this.order?.lines ?? []).flatMap((l) => Array.from({ length: l.quantity }, (_, i) => `${l.productId}#${i}`));
  }

  changeDueSen(): number {
    return (this.order?.paymentTenderedSen ?? 0) - this.totalSen();
  }

  // ---------- transitions (each one guarded) ----------

  /**
   * A customer walks in with a shopping list drawn only from `available` (unlocked and actually
   * on the shelves). Only when idle.
   */
  spawn(available: CatalogItem[], looks: number, stockOf: (id: string) => number = () => Infinity): boolean {
    if (this.state !== "idle" || !available.length) return false;
    const kinds: CustomerTemplate[] = ["express", "ordinary", "ordinary", "family"];
    const customerId = kinds[Math.floor(Math.random() * kinds.length)];
    const [lo, hi] = TEMPLATES[customerId];
    const count = Math.min(available.length, lo + Math.floor(Math.random() * (hi - lo + 1)));
    const picks = shuffle(available).slice(0, count);
    const lines = picks.map((p) => ({ productId: p.id, quantity: 1 }));
    // now and then two of something cheap
    if (lines.length <= 2 && picks[0].priceCents <= 500 && Math.random() < 0.5 && stockOf(picks[0].id) >= 2) lines[0].quantity = 2;
    this.order = {
      id: `ord-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      customerId,
      look: Math.floor(Math.random() * looks),
      lines,
      state: "shopping",
      collected: {},
      scanned: [],
      paymentTenderedSen: 0,
      points: { scan: 0, change: 0, handoff: 0 },
      scanMisses: 0,
      changeTries: 0,
      earnedScore: 0,
    };
    this.changed();
    return true;
  }

  /** The customer took one unit off the shelf (refuses anything not on the list). */
  customerPicked(productId: string): boolean {
    const o = this.order;
    if (!o || o.state !== "shopping") return false;
    const line = o.lines.find((l) => l.productId === productId);
    if (!line || (o.collected[productId] ?? 0) >= line.quantity) return false;
    o.collected[productId] = (o.collected[productId] ?? 0) + 1;
    this.changed();
    return true;
  }

  /** The customer reached the till with their basket. */
  arrivedAtTill(): boolean {
    const o = this.order;
    if (!o || o.state !== "shopping") return false;
    for (const l of o.lines) o.collected[l.productId] = l.quantity; // nothing gets lost on the way
    o.state = "waiting";
    this.changed();
    return true;
  }

  /** Player at the till. Starts scanning, or resumes where a closed panel left off. */
  startCheckout(): OrderState | null {
    const o = this.order;
    if (!o) return null;
    if (o.state === "waiting") {
      o.state = "scanning";
      this.changed();
    }
    return TILL_STATES.includes(o.state) ? o.state : null;
  }

  /** Swipe landed on the scanner. Each unit counts once. */
  scan(unit: string): boolean {
    const o = this.order;
    if (!o || o.state !== "scanning" || o.scanned.includes(unit) || !this.scanUnits().includes(unit)) return false;
    o.scanned.push(unit);
    if (o.scanned.length === this.scanUnits().length) {
      o.points.scan = Math.max(Math.ceil(MAX_POINTS.scan / 2), MAX_POINTS.scan - 2 * o.scanMisses);
      o.state = "paying";
      o.paymentTenderedSen = tenderFor(this.totalSen());
    }
    this.changed();
    return true;
  }

  scanMiss(): void {
    if (this.order?.state === "scanning") {
      this.order.scanMisses++;
      this.save();
    }
  }

  /** Clears scans (not points) so the player can start the conveyor again. */
  restartScan(): void {
    const o = this.order;
    if (!o || o.state !== "scanning") return;
    o.scanned = [];
    this.changed();
  }

  /** Checks the change built by the player. Exact balance only; returns the difference (sen). */
  giveChange(pieces: number[]): number {
    const o = this.order;
    if (!o || o.state !== "paying") return NaN;
    const given = pieces.reduce((a, b) => a + b, 0);
    const diff = given - this.changeDueSen();
    if (diff === 0) {
      o.points.change = Math.max(Math.ceil(MAX_POINTS.change / 2), MAX_POINTS.change - 5 * o.changeTries);
      o.state = "handoff";
    } else o.changeTries++;
    this.changed();
    return diff;
  }

  /** Bag handed over: totals the order and records the reward exactly once. */
  handoff(): Order | null {
    const o = this.order;
    if (!o || o.state !== "handoff") return null;
    o.points.handoff = MAX_POINTS.handoff;
    o.earnedScore = o.points.scan + o.points.change + o.points.handoff;
    o.state = "complete";
    if (!this.stats.completedOrderIds.includes(o.id)) {
      this.stats.completedOrderIds = [...this.stats.completedOrderIds, o.id].slice(-200);
      this.stats.totalScore += o.earnedScore;
      this.stats.bestScore = Math.max(this.stats.bestScore, o.earnedScore);
      this.stats.coins += this.coinsFor(o);
    }
    this.changed();
    return o;
  }

  /** Coins an order earns: a tenth of its score plus one per RM10 sold. */
  coinsFor(o: Order): number {
    const total = o.lines.reduce((sum, l) => sum + (getItem(l.productId)?.priceCents ?? 0) * l.quantity, 0);
    return Math.round(o.earnedScore / 10) + Math.floor(total / 1000);
  }

  /** Coins from other store work (e.g. morning tasks), saved with the stats. */
  addCoins(n: number): void {
    if (n <= 0 || !Number.isInteger(n)) return;
    this.stats.coins += n;
    this.changed();
  }

  /** Coins lost (e.g. a refund for an expired product); never below zero. */
  penalty(n: number): number {
    if (n <= 0 || !Number.isInteger(n)) return 0;
    const lost = Math.min(n, this.stats.coins);
    this.stats.coins -= lost;
    this.changed();
    return lost;
  }

  /** The customer has left: back to idle for the next one. */
  clear(): void {
    if (this.order?.state !== "complete") return;
    this.order = null;
    this.changed();
  }

  // ---------- save ----------

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 2, order: this.order, stats: this.stats }));
    } catch {
      // storage unavailable: play continues unsaved
    }
  }

  /** Validates everything; a broken order is dropped, a mid-till one resumes at "waiting". */
  private load(): void {
    let s: any;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return;
    }
    if (!s || s.version !== 2) return;
    const st = s.stats;
    if (st && Array.isArray(st.completedOrderIds)) {
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
      this.stats = {
        completedOrderIds: st.completedOrderIds.filter((x: unknown) => typeof x === "string"),
        bestScore: Math.min(100, n(st.bestScore)),
        totalScore: n(st.totalScore),
        coins: n(st.coins),
      };
    }
    const o = s.order;
    const states = ["shopping", "waiting", "scanning", "paying", "packing", "handoff", "complete"];
    const valid =
      o &&
      typeof o.id === "string" &&
      states.includes(o.state) &&
      Array.isArray(o.lines) &&
      o.lines.length > 0 &&
      o.lines.every((l: any) => getItem(l?.productId) && Number.isInteger(l.quantity) && l.quantity > 0 && l.quantity < 10) &&
      o.points &&
      typeof o.collected === "object";
    if (!valid) return;
    this.order = {
      ...o,
      look: Number.isInteger(o.look) ? o.look : 0,
      scanned: Array.isArray(o.scanned) ? o.scanned : [],
      scanMisses: o.scanMisses | 0,
      changeTries: o.changeTries | 0,
      paymentTenderedSen: o.paymentTenderedSen | 0,
      points: { scan: o.points.scan | 0, change: o.points.change | 0, handoff: o.points.handoff | 0 },
    };
    const order = this.order!;
    // shopping or mid-till on reload: the customer is simply waiting at the till again
    // ("packing" was a till step in an earlier build; treat it like the rest of the till)
    if (order.state === "shopping" || TILL_STATES.includes(order.state) || (order.state as string) === "packing") {
      for (const l of order.lines) order.collected[l.productId] = l.quantity;
      order.state = "waiting";
      order.scanned = [];
      order.points.scan = order.points.change = 0;
    }
    // the customer already left with their reward recorded
    if (order.state === "complete" || this.stats.completedOrderIds.includes(order.id)) this.order = null;
  }
}

/** What the customer hands over: the smallest note covering the total, sometimes the next one up. */
function tenderFor(total: number): number {
  const notes = [100, 500, 1000, 2000, 5000, 10000];
  const i = notes.findIndex((n) => n > total);
  if (i < 0) return Math.ceil(total / 10000) * 10000 + 10000;
  return Math.random() < 0.35 && i + 1 < notes.length ? notes[i + 1] : notes[i];
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
