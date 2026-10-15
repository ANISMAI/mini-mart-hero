// MissionService: three optional daily missions (a new set each game day, deterministic).
// Progress comes from game events (sales, 3-star service, restocked units, coins from sales,
// complaints). A finished mission pays its coins once; "no complaints" is settled at closing.
// Saved under its own versioned key; broken data regenerates the day's missions.

export type MissionKind = "serve" | "stars" | "restock" | "coins" | "noComplaint";

export interface Mission {
  kind: MissionKind;
  target: number;
  progress: number;
  done: boolean;
  reward: number;
}

const POOL: { kind: MissionKind; targets: number[]; reward: number }[] = [
  { kind: "serve", targets: [3, 4, 5], reward: 15 },
  { kind: "stars", targets: [2, 3], reward: 15 },
  { kind: "restock", targets: [10, 15, 20], reward: 10 },
  { kind: "coins", targets: [30, 40, 50], reward: 10 },
  { kind: "noComplaint", targets: [1], reward: 20 },
];

export function missionLabel(m: Mission): string {
  switch (m.kind) {
    case "serve":
      return `Layan ${m.target} pelanggan`;
    case "stars":
      return `Dapat ⭐⭐⭐ ${m.target} kali di kaunter`;
    case "restock":
      return `Isi rak ${m.target} unit`;
    case "coins":
      return `Kumpul ${m.target} 🪙 dari jualan`;
    case "noComplaint":
      return "Tiada komplen pelanggan hari ni";
  }
}

export const MISSION_ICON: Record<MissionKind, string> = { serve: "🧑‍🤝‍🧑", stars: "⭐", restock: "📦", coins: "🪙", noComplaint: "😊" };

const KEY = "mini-market-hero-missions-v1";

export default class MissionService {
  day = 0;
  list: Mission[] = [];
  complaints = 0;
  served = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.load();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Today's three missions (a different mix each day). */
  ensure(day: number): void {
    if (this.day === day && this.list.length) return;
    this.day = day;
    this.complaints = 0;
    this.served = 0;
    const skip = day % POOL.length; // leave one kind out, rotating
    const kinds = POOL.filter((_, i) => i !== skip).filter((_, i) => i !== (day * 3) % 4);
    this.list = kinds.map((p, i) => ({ kind: p.kind, target: p.targets[(day + i) % p.targets.length], progress: 0, done: false, reward: p.reward }));
    this.changed();
  }

  /**
   * Add progress; returns the missions that just finished (their coins are paid by the caller).
   * "noComplaint" only finishes at closing (see `endOfDay`).
   */
  bump(kind: Exclude<MissionKind, "noComplaint">, n = 1): Mission[] {
    if (n <= 0) return [];
    if (kind === "serve") this.served += n;
    const finished: Mission[] = [];
    for (const m of this.list) {
      if (m.kind !== kind || m.done) continue;
      m.progress = Math.min(m.target, m.progress + n);
      if (m.progress >= m.target) {
        m.done = true;
        finished.push(m);
      }
    }
    this.changed();
    return finished;
  }

  complaint(): void {
    this.complaints++;
    this.changed();
  }

  /** Closing time: "no complaints" counts if at least one customer was served without any. */
  endOfDay(): Mission[] {
    const m = this.list.find((x) => x.kind === "noComplaint" && !x.done);
    if (!m || this.complaints > 0 || this.served < 1) return [];
    m.progress = 1;
    m.done = true;
    this.changed();
    return [m];
  }

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, day: this.day, list: this.list, complaints: this.complaints, served: this.served }));
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
    if (!s || s.version !== 1 || !Number.isInteger(s.day) || !Array.isArray(s.list)) return;
    const n = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 9999;
    const kinds = POOL.map((p) => p.kind);
    const list = s.list.filter((m: any) => m && kinds.includes(m.kind) && n(m.target) && m.target > 0 && n(m.progress) && n(m.reward)) as Mission[];
    if (list.length !== s.list.length) return;
    this.day = s.day;
    this.list = list.map((m) => ({ kind: m.kind, target: m.target, progress: Math.min(m.progress, m.target), done: !!m.done, reward: m.reward }));
    this.complaints = n(s.complaints) ? s.complaints : 0;
    this.served = n(s.served) ? s.served : 0;
  }
}
