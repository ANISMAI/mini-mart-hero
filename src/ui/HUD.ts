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
    profile.append(el("span", "hud-avatar", "🧑‍💼"), this.levelPill, el("span", "hud-pill", "🪙 0"));
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
      let dx = e.clientX - origin.x;
      let dy = e.clientY - origin.y;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) {
        dx = (dx / d) * JOY_R;
        dy = (dy / d) * JOY_R;
      }
      this.joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;
      this.cb.onJoystick(dx / JOY_R, dy / JOY_R);
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

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.remove("show");
    void this.toast.offsetWidth;
    this.toast.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("show"), 1800);
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
