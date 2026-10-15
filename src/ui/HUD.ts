import { el } from "./dom";

export interface HUDCallbacks {
  onJoystick(x: number, y: number): void;
  onLook(dx: number, dy: number): void;
  onZoom(delta: number): void;
  onInteract(): void;
  onMap(): void;
  onPause(): void;
}

const JOY_R = 48;

/** Current UI scale (CSS variable --ui, set by the game from the screen size). */
export const uiScale = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui")) || 1;

/**
 * One UI scale for every screen: phones 1, tablets about 1.5 to 1.7, desktops a little less.
 * Based on the short side of the screen so portrait and landscape match.
 */
export function updateUiScale(): void {
  const short = Math.min(window.innerWidth, window.innerHeight);
  const long = Math.max(window.innerWidth, window.innerHeight);
  let s = Math.min(1.7, Math.max(1, short / 440));
  if (long / short > 1.6 && short > 700) s = Math.min(s, 1.4); // wide desktop monitors
  document.documentElement.style.setProperty("--ui", s.toFixed(3));
}

/**
 * Mobile HUD: profile/coins (top-left), mini-map (top-right), floating joystick (lower-left),
 * Interact (lower-right), room toast (top-centre). Touches on the rest of the screen rotate the
 * camera; pinch / wheel zoom. All controls are at least 44 CSS px.
 */
export default class HUD {
  readonly root: HTMLDivElement;
  readonly miniMapMount: HTMLButtonElement;
  private interact: HTMLButtonElement;
  private interactIcon: HTMLSpanElement;
  private interactLabel: HTMLSpanElement;
  private interactKey = "";
  private toast: HTMLDivElement;
  private toastTimer = 0;
  private joyBase: HTMLDivElement;
  private joyThumb: HTMLDivElement;
  private cb: HUDCallbacks;
  enabled = true;

  private levelPill: HTMLElement;
  private alertPill: HTMLElement;
  private coinsPill: HTMLElement;
  private stockPill: HTMLButtonElement;
  private datePill: HTMLButtonElement;
  /** Tap on the date: open the morning checklist. */
  onDatePill: (() => void) | null = null;
  private expiryPill: HTMLButtonElement;
  onExpiryPill: (() => void) | null = null;

  /** "🗑️ Luput: N" pill (null hides it). */
  setExpiryAlert(text: string | null): void {
    this.expiryPill.textContent = text ?? "";
    this.expiryPill.classList.toggle("hidden", !text);
  }

  setDate(text: string): void {
    this.datePill.textContent = text;
  }
  /** Tap on the low-stock pill. */
  onStockPill: (() => void) | null = null;

  /** "📦 Stok rendah: N" pill (null hides it). */
  setStockAlert(text: string | null): void {
    this.stockPill.textContent = text ?? "";
    this.stockPill.classList.toggle("hidden", !text);
  }
  private objective: HTMLElement;

  setCoins(n: number): void {
    this.coinsPill.textContent = `🪙 ${n}`;
  }

  /**
   * Phase 2 objective card (top-left, under the pills, clear of the mini-map): what to do now
   * and, while collecting, the shopping list with ticks. null hides it.
   */
  setObjective(o: { title: string; items?: { icon: string; name: string; have: number; need: number }[] } | null): void {
    this.objective.classList.toggle("hidden", !o);
    if (!o) return;
    const rows = (o.items ?? []).map((it) => {
      const done = it.have >= it.need;
      const r = el("div", `hud-obj-row ${done ? "done" : ""}`);
      r.append(el("span", "", done ? "✔" : it.icon), el("span", "hud-obj-name", it.name), el("span", "", `${it.have}/${it.need}`));
      return r;
    });
    this.objective.replaceChildren(el("div", "hud-obj-title", o.title), ...rows);
  }

  /** Small status pill (e.g. power problems); null hides it. */
  setAlert(text: string | null): void {
    this.alertPill.textContent = text ?? "";
    this.alertPill.classList.toggle("hidden", !text);
  }

  setLevel(level: number): void {
    this.levelPill.textContent = `⭐ Lv ${level}`;
  }

  constructor(parent: HTMLElement, canvas: HTMLCanvasElement, cb: HUDCallbacks) {
    this.cb = cb;
    this.root = el("div", "hud");

    const stats = el("div", "hud-stats");
    const pause = el("button", "hud-round", "⏸");
    pause.setAttribute("aria-label", "Pause");
    pause.addEventListener("click", () => cb.onPause());
    const profile = el("div", "hud-profile");
    this.levelPill = el("span", "hud-pill", "⭐ Lv 1");
    this.alertPill = el("span", "hud-pill hud-alert hidden");
    this.coinsPill = el("span", "hud-pill", "🪙 0");
    this.datePill = el("button", "hud-pill hud-date", "📅");
    this.datePill.addEventListener("click", () => this.onDatePill?.());
    this.stockPill = el("button", "hud-pill hud-stock hidden");
    this.stockPill.addEventListener("click", () => this.onStockPill?.());
    this.expiryPill = el("button", "hud-pill hud-stock hud-expiry hidden");
    this.expiryPill.addEventListener("click", () => this.onExpiryPill?.());
    this.objective = el("div", "hud-objective hidden");
    this.objective.setAttribute("aria-live", "polite");
    profile.append(el("span", "hud-avatar", "🧑‍💼"), this.levelPill, this.coinsPill, this.datePill, el("span", "hud-break"), this.alertPill, this.stockPill, this.expiryPill, this.objective);
    stats.append(pause, profile);

    this.miniMapMount = el("button", "hud-minimap");
    this.miniMapMount.setAttribute("aria-label", "Open store map");
    this.miniMapMount.addEventListener("click", () => cb.onMap());

    this.toast = el("div", "hud-toast");

    this.joyBase = el("div", "joy-base");
    this.joyThumb = el("div", "joy-thumb");
    this.joyBase.appendChild(this.joyThumb);
    const joyZone = el("div", "joy-zone");
    joyZone.appendChild(this.joyBase);

    this.interact = el("button", "hud-interact hidden");
    this.interactIcon = el("span", "hud-interact-icon");
    this.interactLabel = el("span", "hud-interact-label");
    this.interact.append(this.interactIcon, this.interactLabel);
    this.interact.addEventListener("click", () => cb.onInteract());

    this.root.append(stats, this.miniMapMount, this.toast, joyZone, this.interact);
    parent.appendChild(this.root);

    this.setupJoystick(joyZone);
    this.setupLook(canvas);
  }

  /** Floating joystick: appears where the left thumb touches. */
  private setupJoystick(zone: HTMLElement): void {
    let id: number | null = null;
    let origin = { x: 0, y: 0 };
    const rest = () => {
      this.joyBase.classList.remove("active");
      this.joyBase.style.left = "";
      this.joyBase.style.top = "";
      this.joyThumb.style.transform = "";
    };
    zone.addEventListener("pointerdown", (e) => {
      if (!this.enabled || id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      origin = { x: e.clientX, y: e.clientY };
      this.joyBase.classList.add("active");
      this.joyBase.style.left = `${e.clientX - r.left}px`;
      this.joyBase.style.top = `${e.clientY - r.top}px`;
    });
    zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      // the joystick is drawn at the UI scale: work in screen px, draw in local px
      const s = uiScale();
      const R = JOY_R * s;
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.joyThumb.style.transform = `translate(${dx / s}px, ${dy / s}px)`;
      this.cb.onJoystick(dx / R, dy / R);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      rest();
      this.cb.onJoystick(0, 0);
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }

  /** Drag on the 3D view to look around; pinch or wheel to zoom. */
  private setupLook(canvas: HTMLCanvasElement): void {
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p || !this.enabled) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.cb.onZoom((pinch - d) * 0.02);
        pinch = d;
      } else {
        this.cb.onLook(dx, dy);
      }
    });
    const up = (e: PointerEvent) => pts.delete(e.pointerId);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.enabled) this.cb.onZoom(e.deltaY * 0.004);
      },
      { passive: false }
    );
  }

  setInteract(target: { id: string; label: string; icon: string } | null): void {
    const key = target ? target.id : "";
    if (key === this.interactKey) return;
    this.interactKey = key;
    this.interact.classList.toggle("hidden", !target);
    if (target) {
      this.interactIcon.textContent = target.icon;
      this.interactLabel.textContent = target.label;
    }
  }

  showToast(text: string, ms = 1800): void {
    this.toast.textContent = text;
    this.toast.classList.remove("show");
    void this.toast.offsetWidth;
    this.toast.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), ms);
  }

  /** Locks the controls (modal open): releases the joystick so input can't leak underneath. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle("locked", !on);
    if (!on) {
      this.joyBase.classList.remove("active");
      this.joyThumb.style.transform = "";
      this.cb.onJoystick(0, 0);
    }
  }
}
