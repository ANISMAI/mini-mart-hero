// StoreDay: the shop's day clock and the morning opening checklist.
//   07:00 the day starts (shop closed) -> morning tasks -> 10:00 the shop opens (customers come)
//   -> 22:00 the shop closes -> next day 07:00.
// One game minute passes per real second (so the morning is about 3 real minutes). The clock is
// paused while the tab is hidden. Morning tasks (optional): check expiry dates, mop the spills,
// check the electricity bill, check the stock room. Each grants a small coin reward once per day.
// Saved under its own versioned key; broken data falls back to day 1, 07:00.

export type TaskId = "expiry" | "mop" | "bill" | "stock" | "delivery";
/** `from`: the task can only be done from this minute (e.g. the lorry arrives at 08:00). */
export const TASKS: { id: TaskId; label: string; icon: string; where: string; from?: number }[] = [
  { id: "expiry", label: "Buang barang luput", icon: "📅", where: "Peti sejuk (dari Bilik Sejuk) & rak Barang Dapur" },
  { id: "mop", label: "Mop lantai", icon: "🧹", where: "Tumpahan di lantai kedai" },
  { id: "bill", label: "Semak bil elektrik", icon: "⚡", where: "Meja Pejabat" },
  { id: "stock", label: "Semak stok", icon: "📦", where: "Stor / Bilik Sejuk" },
  { id: "delivery", label: "Terima penghantaran", icon: "🚚", where: "Kotak di Stor, tepi pintu", from: 8 * 60 },
];
export const TASK_REWARD = 5;

export const DAY_START = 7 * 60;
export const OPEN = 10 * 60;
export const CLOSE = 22 * 60;
/** Game minutes per real second. */
const SPEED = 1;

/** Fixed spots where floor spills can appear (aisles and the till area). */
export const SPILL_SPOTS: [number, number][] = [
  [4.9, 15.0],
  [9.0, 13.5],
  [13.0, 16.5],
  [11.5, 24.5],
  [4.9, 12.0],
  [16.8, 13.0],
];

const KEY = "mini-market-hero-day-v1";

export default class StoreDay {
  day = 1;
  /** Minutes since midnight. */
  minute = DAY_START;
  done: Record<TaskId, boolean> = { expiry: false, mop: false, bill: false, stock: false, delivery: false };
  rewarded: Record<TaskId, boolean> = { expiry: false, mop: false, bill: false, stock: false, delivery: false };
  /** Spills still on the floor today (indices into SPILL_SPOTS). */
  spills: number[] = [];
  /** Opened an expiry screen today (the expiry task needs a real look, not just luck). */
  expiryLooked = false;
  private listeners = new Set<() => void>();
  private lastSave = 0;
  /** Called when a new day starts / the shop opens / closes. */
  onEvent: ((e: "newDay" | "open" | "close" | "delivery") => void) | null = null;

  constructor() {
    if (!this.load()) this.startDay(this.day);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get open(): boolean {
    return this.minute >= OPEN && this.minute < CLOSE;
  }

  get morning(): boolean {
    return this.minute < OPEN;
  }

  timeLabel(): string {
    const h = Math.floor(this.minute / 60);
    const m = Math.floor(this.minute % 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "pg" : "ptg"}`;
  }

  /** Advance the clock (dt in real seconds). */
  tick(dt: number): void {
    if (document.hidden) return;
    const before = this.minute;
    this.minute += dt * SPEED;
    if (before < 8 * 60 && this.minute >= 8 * 60) this.onEvent?.("delivery");
    if (before < OPEN && this.minute >= OPEN) this.onEvent?.("open");
    if (before < CLOSE && this.minute >= CLOSE) {
      this.onEvent?.("close");
      this.startDay(this.day + 1);
      this.onEvent?.("newDay");
    }
    // the HUD shows whole minutes; save now and then
    if (Math.floor(before) !== Math.floor(this.minute)) this.emit();
    this.lastSave += dt;
    if (this.lastSave > 5) {
      this.lastSave = 0;
      this.save();
    }
  }

  /** Fresh morning: tasks reset, 2–3 spills (deterministic per day). */
  private startDay(day: number): void {
    this.day = day;
    this.minute = DAY_START;
    this.done = { expiry: false, mop: false, bill: false, stock: false, delivery: false };
    this.rewarded = { expiry: false, mop: false, bill: false, stock: false, delivery: false };
    this.expiryLooked = false;
    const n = 2 + (day % 2);
    this.spills = Array.from({ length: n }, (_, i) => (day * 3 + i * 2) % SPILL_SPOTS.length).filter((v, i, a) => a.indexOf(v) === i);
    this.save();
    this.emit();
  }

  /** Mark a task done; returns coins to grant (only the first time each day). */
  complete(id: TaskId): number {
    if (!this.done[id]) this.done[id] = true;
    let coins = 0;
    if (!this.rewarded[id]) {
      this.rewarded[id] = true;
      coins = TASK_REWARD;
    }
    this.save();
    this.emit();
    return coins;
  }

  /** Developer: undo a task's tick (its reward stays paid, so no double coins). */
  reopen(id: TaskId): void {
    this.done[id] = false;
    this.save();
    this.emit();
  }

  cleanSpill(index: number): boolean {
    if (!this.spills.includes(index)) return false;
    this.spills = this.spills.filter((s) => s !== index);
    this.save();
    this.emit();
    return true;
  }

  /** Developer: jump to opening time. */
  skipToOpen(): void {
    if (this.minute < OPEN) this.minute = OPEN - 0.01;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, day: this.day, minute: this.minute, done: this.done, rewarded: this.rewarded, spills: this.spills, expiryLooked: this.expiryLooked }));
    } catch {
      // storage unavailable
    }
  }

  private load(): boolean {
    let s: any;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return false;
    }
    if (!s || s.version !== 1 || !Number.isInteger(s.day) || s.day < 1 || typeof s.minute !== "number" || !(s.minute >= 0 && s.minute < 24 * 60)) return false;
    this.day = s.day;
    this.minute = Math.max(DAY_START, Math.min(CLOSE - 1, s.minute));
    const flags = (o: any) => ({ expiry: !!o?.expiry, mop: !!o?.mop, bill: !!o?.bill, stock: !!o?.stock, delivery: !!o?.delivery });
    this.done = flags(s.done);
    this.rewarded = flags(s.rewarded);
    this.spills = Array.isArray(s.spills) ? s.spills.filter((i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < SPILL_SPOTS.length) : [];
    this.expiryLooked = !!s.expiryLooked;
    return true;
  }
}
