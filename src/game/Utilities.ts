import { AC_MAX, AC_MIN, ZONES, type ZoneId } from "../data/utilities";

// UtilityService: the one authoritative state for lights, air-conditioning and the simulated
// power trip. Switches, panels, 3D visuals and the HUD all read from here and get notified on
// change. Saved under its own versioned key, so the Phase 1 save is never touched.
//
// The power trip is a fictional, simplified game event: the player only reads a closed status
// panel and calls a technician. Refrigerators are on a separate protected circuit and are never
// affected.

export type PowerState = "normal" | "warning" | "outage" | "technician" | "restored";

export interface UtilityZone {
  id: ZoneId;
  label: string;
  /** The player's switch setting (kept through outages). */
  lightsOn: boolean;
  powered: boolean;
  affectedByOutage: boolean;
}

export interface AirconState {
  isOn: boolean;
  targetTemperature: number;
  powered: boolean;
}

export interface PowerEvent {
  state: PowerState;
  affectedZoneIds: ZoneId[];
  startedAt: number | null;
  requestedAt: number | null;
  resolvedAt: number | null;
}

const KEY = "mini-market-hero-utilities-v1";
/** Event timings (ms). */
const WARNING_MS = 15_000;
const TECHNICIAN_MS = 20_000;
const RESTORED_MS = 6_000;
const FIRST_EVENT_MS = 5 * 60_000;
const EVENT_GAP_MS = [10 * 60_000, 15 * 60_000];

export default class UtilityService {
  readonly zones = new Map<ZoneId, UtilityZone>();
  aircon: AirconState = { isOn: true, targetTemperature: 24, powered: true };
  event: PowerEvent = { state: "normal", affectedZoneIds: [], startedAt: null, requestedAt: null, resolvedAt: null };
  /** Short messages for the HUD toast. */
  onNotice: ((text: string) => void) | null = null;
  private listeners = new Set<() => void>();
  private nextEventAt = Date.now() + FIRST_EVENT_MS;

  constructor() {
    for (const z of ZONES) this.zones.set(z.id, { id: z.id, label: z.label, lightsOn: true, powered: true, affectedByOutage: false });
    this.load();
  }

  // ---------- reading ----------

  /** Are the lights in this zone actually shining (switched on and powered)? */
  lit(id: ZoneId): boolean {
    const z = this.zones.get(id)!;
    return z.lightsOn && z.powered;
  }

  get acRunning(): boolean {
    return this.aircon.isOn && this.aircon.powered;
  }

  /** Seconds until the technician finishes (technician state only). */
  get technicianEta(): number {
    if (this.event.state !== "technician" || this.event.requestedAt === null) return 0;
    return Math.max(0, Math.ceil((this.event.requestedAt + TECHNICIAN_MS - Date.now()) / 1000));
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- controls ----------

  setZone(id: ZoneId, on: boolean): void {
    const z = this.zones.get(id)!;
    if (z.lightsOn === on) return;
    z.lightsOn = on;
    this.changed();
  }

  toggleZone(id: ZoneId): boolean {
    this.setZone(id, !this.zones.get(id)!.lightsOn);
    return this.zones.get(id)!.lightsOn;
  }

  /** Manager panel: every zone at once (individual switches still work afterwards). */
  setAll(on: boolean): void {
    for (const z of this.zones.values()) z.lightsOn = on;
    this.changed();
  }

  setAircon(on: boolean): void {
    if (this.aircon.isOn === on) return;
    this.aircon.isOn = on;
    this.changed();
  }

  setTemperature(t: number): void {
    const v = Math.max(AC_MIN, Math.min(AC_MAX, Math.round(t)));
    if (v === this.aircon.targetTemperature) return;
    this.aircon.targetTemperature = v;
    this.changed();
  }

  // ---------- power trip (fictional) ----------

  /** Starts a test event: a short warning, then an outage in a couple of zones. Never stacks. */
  triggerEvent(zones?: ZoneId[]): boolean {
    if (this.event.state !== "normal") return false;
    const pool = ZONES.filter((z) => z.tripable).map((z) => z.id);
    const picked = zones ?? shuffle(pool).slice(0, 2 + Math.floor(Math.random() * 2));
    this.event = { state: "warning", affectedZoneIds: picked, startedAt: Date.now(), requestedAt: null, resolvedAt: null };
    this.notice("⚠️ Bekalan elektrik tidak stabil. Semak panel di Bilik Utiliti.");
    this.changed();
    return true;
  }

  /** Player action at the cabinet. Only once per outage. */
  callTechnician(): boolean {
    if (this.event.state !== "outage") return false;
    this.event.state = "technician";
    this.event.requestedAt = Date.now();
    this.notice("🧑‍🔧 Juruteknik dalam perjalanan.");
    this.changed();
    return true;
  }

  /** Developer demo: finish the repair now. */
  resolveNow(): void {
    if (this.event.state === "outage" || this.event.state === "technician" || this.event.state === "warning") this.restore();
  }

  /** Developer demo: back to a clean normal state and reschedule the next event. */
  resetDemo(): void {
    for (const z of this.zones.values()) {
      z.powered = true;
      z.affectedByOutage = false;
    }
    this.aircon.powered = true;
    this.event = { state: "normal", affectedZoneIds: [], startedAt: null, requestedAt: null, resolvedAt: null };
    this.scheduleNext();
    this.changed();
  }

  /** Call every frame (cheap): advances event timers and the low-frequency scripted event. */
  update(): void {
    const now = Date.now();
    const e = this.event;
    if (e.state === "normal" && now >= this.nextEventAt) this.triggerEvent();
    else if (e.state === "warning" && e.startedAt !== null && now - e.startedAt >= WARNING_MS) this.startOutage();
    else if (e.state === "technician" && e.requestedAt !== null && now - e.requestedAt >= TECHNICIAN_MS) this.restore();
    else if (e.state === "restored" && e.resolvedAt !== null && now - e.resolvedAt >= RESTORED_MS) {
      this.event = { state: "normal", affectedZoneIds: [], startedAt: null, requestedAt: null, resolvedAt: null };
      this.scheduleNext();
      this.changed();
    }
  }

  private startOutage(): void {
    this.event.state = "outage";
    this.applyPower();
    const names = this.event.affectedZoneIds.map((id) => this.zones.get(id)!.label).join(", ");
    this.notice(`⚡ Gangguan elektrik: ${names}. Panggil juruteknik di Bilik Utiliti.`);
    this.changed();
  }

  private restore(): void {
    this.event.state = "restored";
    this.event.resolvedAt = Date.now();
    this.applyPower();
    this.notice("✅ Bekalan elektrik telah pulih.");
    this.changed();
  }

  /** Powered flags follow the event; the player's own switch settings are left untouched. */
  private applyPower(): void {
    const cut = this.event.state === "outage" || this.event.state === "technician";
    for (const z of this.zones.values()) {
      z.affectedByOutage = cut && this.event.affectedZoneIds.includes(z.id);
      z.powered = !z.affectedByOutage;
    }
    // the AC units run on the main shop circuit
    this.aircon.powered = !(cut && this.event.affectedZoneIds.includes("main"));
  }

  private scheduleNext(): void {
    const [a, b] = EVENT_GAP_MS;
    this.nextEventAt = Date.now() + a + Math.random() * (b - a);
  }

  private notice(text: string): void {
    this.onNotice?.(text);
  }

  private changed(): void {
    this.save();
    for (const fn of this.listeners) fn();
  }

  // ---------- save ----------

  private save(): void {
    try {
      const lights: Partial<Record<ZoneId, boolean>> = {};
      for (const z of this.zones.values()) lights[z.id] = z.lightsOn;
      localStorage.setItem(
        KEY,
        JSON.stringify({ version: 1, lights, aircon: { isOn: this.aircon.isOn, targetTemperature: this.aircon.targetTemperature }, event: this.event })
      );
    } catch {
      // storage unavailable: play continues unsaved
    }
  }

  /** Loads and validates; anything unreadable falls back to the defaults. */
  private load(): void {
    let s: any;
    try {
      s = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return;
    }
    if (!s || s.version !== 1) return;
    if (s.lights && typeof s.lights === "object")
      for (const z of this.zones.values()) if (typeof s.lights[z.id] === "boolean") z.lightsOn = s.lights[z.id];
    if (s.aircon) {
      if (typeof s.aircon.isOn === "boolean") this.aircon.isOn = s.aircon.isOn;
      const t = s.aircon.targetTemperature;
      if (Number.isInteger(t) && t >= AC_MIN && t <= AC_MAX) this.aircon.targetTemperature = t;
    }
    const e = s.event;
    const states: PowerState[] = ["normal", "warning", "outage", "technician", "restored"];
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    if (e && states.includes(e.state) && Array.isArray(e.affectedZoneIds)) {
      const ids = e.affectedZoneIds.filter((id: unknown) => this.zones.has(id as ZoneId)) as ZoneId[];
      this.event = { state: e.state, affectedZoneIds: ids, startedAt: num(e.startedAt), requestedAt: num(e.requestedAt), resolvedAt: num(e.resolvedAt) };
      if (this.event.state !== "normal" && !ids.length) this.event = { state: "normal", affectedZoneIds: [], startedAt: null, requestedAt: null, resolvedAt: null };
      // missing timestamps would stall the event: restart that step from now
      const now = Date.now();
      if (this.event.state === "warning") this.event.startedAt ??= now;
      if (this.event.state === "technician") this.event.requestedAt ??= now;
      if (this.event.state === "restored") this.event.resolvedAt ??= now;
      this.applyPower();
    }
  }
}

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
