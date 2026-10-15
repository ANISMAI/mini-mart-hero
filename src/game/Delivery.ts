import { SLOTS } from "../data/inventory";

// DeliveryService: the supplier's morning drop at the storage room (arrives 08:00). Each day the
// lorry brings cartons for the products whose back-stock is lowest, with an invoice. Sometimes a
// carton is short (deterministic per day): the player counts each carton against the invoice and
// marks it Enough / Short. Receiving adds the actual units to back-stock (once per day).
// Saved under its own versioned key; broken data regenerates the day's delivery.

export interface DeliveryLine {
  productId: string;
  /** Units on the invoice. */
  invoiced: number;
  /** Units actually in the carton (may be fewer). */
  actual: number;
}

export const ARRIVE = 8 * 60;
const LINES = 4;
const MAX_BACK = 60;
const KEY = "mini-market-hero-delivery-v1";

export default class DeliveryService {
  day = 0;
  lines: DeliveryLine[] = [];
  received = false;

  constructor() {
    this.load();
  }

  /**
   * Make sure today's delivery exists. `storage` gives back-stock per product; `eligible` limits
   * it to products on display at this level.
   */
  ensure(day: number, storage: Record<string, number>, eligible: (productId: string) => boolean): void {
    if (this.day === day) return;
    this.day = day;
    this.received = false;
    const picks = SLOTS.filter((s) => eligible(s.productId) && (storage[s.productId] ?? 0) < MAX_BACK)
      .map((s, i) => ({ id: s.productId, have: storage[s.productId] ?? 0, i }))
      .sort((a, b) => a.have - b.have || ((a.i + day) % SLOTS.length) - ((b.i + day) % SLOTS.length))
      .slice(0, LINES);
    this.lines = picks.map((p) => {
      const invoiced = p.have < 12 ? 12 : 6;
      return { productId: p.id, invoiced, actual: invoiced };
    });
    // most days one carton comes up short by 1–2 units
    if (this.lines.length && (day * 7919) % 10 < 7) {
      const line = this.lines[day % this.lines.length];
      line.actual = line.invoiced - (1 + (day % 2));
    }
    this.save();
  }

  /** Units the supplier owes back (invoice minus what came). */
  get shortUnits(): number {
    return this.lines.reduce((a, l) => a + l.invoiced - l.actual, 0);
  }

  markReceived(): boolean {
    if (this.received) return false;
    this.received = true;
    this.save();
    return true;
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, day: this.day, lines: this.lines, received: this.received }));
    } catch {
      // storage unavailable
    }
  }

  private load(): void {
    let s: any;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return;
    }
    if (!s || s.version !== 1 || !Number.isInteger(s.day) || !Array.isArray(s.lines)) return;
    const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 99;
    const lines = s.lines.filter(
      (l: any) => l && SLOTS.some((sl) => sl.productId === l.productId) && ok(l.invoiced) && ok(l.actual) && l.actual <= l.invoiced
    ) as DeliveryLine[];
    if (lines.length !== s.lines.length) return;
    this.day = s.day;
    this.lines = lines;
    this.received = !!s.received;
  }
}
