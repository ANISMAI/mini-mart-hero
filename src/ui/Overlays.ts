import { css, el } from "./dom";
import { imageUrl, isUnlocked, itemsIn, rm, SECTIONS, type Category } from "../data/catalog";
import { AC_MAX, AC_MIN, ZONES, type ZoneId } from "../data/utilities";
import type UtilityService from "../game/Utilities";
import type { PowerState } from "../game/Utilities";

/**
 * OverlayController: the 2D task screens shown on top of the 3D store (hybrid mode).
 * Only one is open at a time; closing it calls `onClose` once, which hands control back to 3D.
 */
export default class Overlays {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private onClose: (() => void) | null = null;
  /** Live panels: rebuilds the body when the state they show changes. */
  private live: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = el("div", "overlay hidden");
    this.card = el("div", "card");
    this.card.setAttribute("role", "dialog");
    this.root.appendChild(this.card);
    this.root.addEventListener("click", (e) => e.target === this.root && this.close());
    window.addEventListener("keydown", (e) => e.key === "Escape" && this.close());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  private open(title: string, icon: string, body: HTMLElement[], footer: HTMLElement[], onClose: () => void, cls = ""): void {
    this.card.className = `card ${cls}`;
    this.card.setAttribute("aria-label", title);
    const head = el("div", "card-head");
    head.append(el("span", "card-icon", icon), el("h2", "", title));
    const x = el("button", "card-x", "✕");
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => this.close());
    head.appendChild(x);
    const b = el("div", "card-body");
    b.append(...body);
    const f = el("div", "card-foot");
    f.append(...footer);
    this.card.replaceChildren(head, b, f);
    this.onClose = onClose;
    this.live = null;
    this.root.classList.remove("hidden");
  }

  /** Opens a panel whose body is re-rendered by refresh() (state changes, countdowns). */
  private openLive(title: string, icon: string, render: () => HTMLElement[], footer: HTMLElement[], onClose: () => void, cls = ""): void {
    this.open(title, icon, render(), footer, onClose, cls);
    const body = this.card.querySelector(".card-body")!;
    this.live = () => {
      const scroll = body.scrollTop;
      body.replaceChildren(...render());
      body.scrollTop = scroll;
    };
  }

  /** Opens an empty panel for a multi-step flow that manages its own body and footer. */
  panel(title: string, icon: string, onClose: () => void, cls = ""): { body: HTMLElement; foot: HTMLElement; setHead(title: string, icon: string): void; close(): void } {
    this.open(title, icon, [], [], onClose, cls);
    const body = this.card.querySelector(".card-body") as HTMLElement;
    const foot = this.card.querySelector(".card-foot") as HTMLElement;
    const h2 = this.card.querySelector(".card-head h2") as HTMLElement;
    const ic = this.card.querySelector(".card-head .card-icon") as HTMLElement;
    return {
      body,
      foot,
      setHead: (t, i) => {
        h2.textContent = t;
        ic.textContent = i;
        this.card.setAttribute("aria-label", t);
      },
      close: () => this.close(),
    };
  }

  /** Re-renders the open live panel, if any. */
  refresh(): void {
    if (this.isOpen) this.live?.();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add("hidden");
    this.live = null;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  private closeBtn(text: string, primary = true): HTMLButtonElement {
    const b = el("button", `btn ${primary ? "primary" : ""}`, text);
    b.addEventListener("click", () => this.close());
    return b;
  }

  /** Checkout counter: preview only in Phase 1. */
  cashier(onClose: () => void): void {
    const art = el("div", "till-art");
    art.append(el("span", "", "🧾"), el("span", "", "🛒"), el("span", "", "💳"));
    this.open(
      "Cashier",
      "🧾",
      [art, el("p", "big-msg", "Cashier gameplay coming in Phase 2"), el("p", "muted", "Scanning, payment and giving change will happen here.")],
      [this.closeBtn("Back to store")],
      onClose,
      "small"
    );
  }

  /**
   * 2D top-down organizer preview with zoom (no real item logic yet). A shelf shows every SKU
   * of its catalog section: unlocked ones with price and stock, the rest as locked previews.
   */
  organizer(shelf: Category | "storage", level: number, onClose: () => void): void {
    const tiles =
      shelf === "storage"
        ? [
            { icon: "📦", name: "Snack cartons", sub: "12 boxes", color: 0xe8a25a, locked: false, img: "" },
            { icon: "🧃", name: "Drink crates", sub: "8 crates", color: 0x3b8ff0, locked: false, img: "" },
            { icon: "🍚", name: "Rice sacks", sub: "6 sacks", color: 0x2fb38a, locked: false, img: "" },
            { icon: "🥚", name: "Egg trays", sub: "10 trays", color: 0xf9c833, locked: false, img: "" },
          ]
        : itemsIn(shelf).map((p) =>
            isUnlocked(p, level)
              ? { icon: p.icon, name: p.name, sub: `${rm(p.priceCents)} · ${p.stock}/${p.shelfCapacity}`, color: p.color, locked: false, img: imageUrl(p) }
              : { icon: p.icon, name: p.name, sub: `🔒 Lv ${p.unlockLevel}`, color: 0xb9c2cf, locked: true, img: imageUrl(p) }
          );
    const title = shelf === "storage" ? "Stock Room" : SECTIONS[shelf].label;
    let zoom = 1;
    const grid = el("div", "org-grid");
    for (const t of tiles) {
      const tile = el("div", t.locked ? "org-tile locked" : "org-tile");
      tile.style.setProperty("--c", css(t.color === 0xffffff ? 0xcfd6df : t.color));
      const icon = el("span", "org-icon", t.icon);
      if (t.img) {
        // product picture when it exists, emoji otherwise
        const pic = document.createElement("img");
        pic.className = "org-pic";
        pic.alt = "";
        pic.onload = () => icon.replaceChildren(pic);
        pic.src = t.img;
      }
      tile.append(icon, el("strong", "", t.name), el("span", "", t.sub));
      grid.appendChild(tile);
    }
    const view = el("div", "org-view");
    view.appendChild(grid);
    const zoomBar = el("div", "org-zoom");
    const label = el("span", "", "100%");
    const setZoom = (z: number) => {
      zoom = Math.min(1.6, Math.max(0.7, z));
      grid.style.transform = `scale(${zoom})`;
      label.textContent = `${Math.round(zoom * 100)}%`;
    };
    const minus = el("button", "btn round", "−");
    minus.setAttribute("aria-label", "Zoom out");
    minus.addEventListener("click", () => setZoom(zoom - 0.15));
    const plus = el("button", "btn round", "+");
    plus.setAttribute("aria-label", "Zoom in");
    plus.addEventListener("click", () => setZoom(zoom + 0.15));
    zoomBar.append(minus, label, plus);
    this.open(
      title,
      shelf === "storage" ? "📦" : SECTIONS[shelf].icon,
      [el("p", "muted", shelf === "storage" ? "Stock tasks preview (top-down view)." : "Shelf organizer preview (top-down view)."), view, zoomBar],
      [this.closeBtn("Back", false), this.closeBtn("Done")],
      onClose,
      "organizer"
    );
  }

  info(title: string, icon: string, text: string, onClose: () => void): void {
    this.open(title, icon, [el("p", "info-text", text)], [this.closeBtn("OK")], onClose, "small");
  }

  pause(onReset: () => void, onClose: () => void): void {
    const reset = el("button", "btn", "📍 Unstuck: back to entrance");
    reset.addEventListener("click", () => {
      onReset();
      this.close();
    });
    // start over: wipes every save of this game (tap twice to confirm), then reloads
    const wipe = el("button", "btn danger", "🔄 Mula semula (padam semua progress)");
    let armed = false;
    wipe.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        wipe.textContent = "⚠️ Pasti? Tekan sekali lagi";
        return;
      }
      try {
        window.dispatchEvent(new Event("mmh-wipe")); // the game stops saving (no write-back on unload)
        for (const k of Object.keys(localStorage)) if (k.startsWith("mini-market-hero")) localStorage.removeItem(k);
      } catch {
        // storage unavailable
      }
      location.reload();
    });
    this.open(
      "Paused",
      "⏸",
      [
        el("p", "muted", "Controls: left thumb to walk · drag to look · pinch to zoom. Desktop: WASD / arrows, mouse drag, wheel, E to interact, M for the map."),
        reset,
        wipe,
      ],
      [this.closeBtn("Resume")],
      onClose,
      "small"
    );
  }

  // ---------- Phase 1.5 utilities ----------

  /** Air-conditioner controller: ON/OFF and a preset temperature. */
  aircon(svc: UtilityService, onClose: () => void): void {
    this.openLive(
      "Aircond",
      "❄️",
      () => {
        const a = svc.aircon;
        const status = el("div", `util-status ${svc.acRunning ? "ok" : "off"}`, !a.powered ? "⚡ Tiada bekalan elektrik" : a.isOn ? "❄️ Sedang berjalan" : "Dimatikan");
        const temp = el("div", "ac-temp", `${a.targetTemperature}°C`);
        const minus = el("button", "btn round", "−");
        minus.setAttribute("aria-label", "Turunkan suhu");
        minus.disabled = a.targetTemperature <= AC_MIN;
        minus.addEventListener("click", () => svc.setTemperature(a.targetTemperature - 1));
        const plus = el("button", "btn round", "+");
        plus.setAttribute("aria-label", "Naikkan suhu");
        plus.disabled = a.targetTemperature >= AC_MAX;
        plus.addEventListener("click", () => svc.setTemperature(a.targetTemperature + 1));
        const row = el("div", "ac-row");
        row.append(minus, temp, plus);
        const presets = el("div", "chip-row");
        for (const t of [22, 24, 26, 28]) {
          const chip = el("button", `chip ${t === a.targetTemperature ? "on" : ""}`, `${t}°`);
          chip.addEventListener("click", () => svc.setTemperature(t));
          presets.appendChild(chip);
        }
        const power = el("button", `btn ${a.isOn ? "" : "primary"}`, a.isOn ? "⏻ Matikan" : "⏻ Hidupkan");
        power.addEventListener("click", () => svc.setAircon(!a.isOn));
        const note = el("p", "muted", "Aircond guna litar kedai utama. Peti sejuk dan lampu tidak terjejas.");
        return [status, row, presets, power, note];
      },
      [this.closeBtn("Tutup")],
      onClose,
      "small"
    );
  }

  /** Manager's light panel: every zone, plus all on / all off. */
  lights(svc: UtilityService, onClose: () => void): void {
    this.openLive(
      "Panel Lampu",
      "💡",
      () => {
        const all = el("div", "chip-row");
        const on = el("button", "btn", "💡 Semua ON");
        on.addEventListener("click", () => svc.setAll(true));
        const off = el("button", "btn", "🌙 Semua OFF");
        off.addEventListener("click", () => svc.setAll(false));
        all.append(on, off);
        const list = el("div", "util-list");
        for (const z of ZONES) list.appendChild(zoneRow(svc, z.id, z.icon));
        return [el("p", "muted", "Suis di dinding setiap bilik masih boleh tukar zon masing-masing."), all, list];
      },
      [this.closeBtn("Tutup")],
      onClose
    );
  }

  /** Closed electrical cabinet: fictional status only; the player can just call a technician. */
  electrical(svc: UtilityService, dev: boolean, onClose: () => void): void {
    const labels: Record<PowerState, [string, string]> = {
      normal: ["✅ Normal", "ok"],
      warning: ["⚠️ Amaran", "warn"],
      outage: ["⚡ Gangguan", "bad"],
      technician: ["🔧 Juruteknik dipanggil", "info"],
      restored: ["✅ Pulih", "ok"],
    };
    this.openLive(
      "Panel Elektrik",
      "⚡",
      () => {
        const e = svc.event;
        const [text, cls] = labels[e.state];
        const out: HTMLElement[] = [el("div", `util-status ${cls}`, text)];
        if (e.state === "warning") out.push(el("p", "muted", "Bekalan tidak stabil. Zon bertanda mungkin terputus sebentar lagi."));
        if (e.state === "technician") out.push(el("p", "big-msg", `Juruteknik tiba dalam ${svc.technicianEta}s`));
        const list = el("div", "util-list");
        for (const z of ZONES) {
          const st = svc.zones.get(z.id)!;
          const atRisk = e.state === "warning" && e.affectedZoneIds.includes(z.id);
          const row = el("div", `util-row ${st.powered ? (atRisk ? "risk" : "") : "cut"}`);
          const pill = !z.tripable ? "🛡️ Litar berasingan" : !st.powered ? "⚡ Terputus" : atRisk ? "⚠️ Berisiko" : "Ada bekalan";
          row.append(el("span", "util-name", `${z.icon} ${z.label}`), el("span", "util-pill", pill));
          list.appendChild(row);
        }
        const ac = el("div", `util-row ${svc.aircon.powered ? "" : "cut"}`);
        ac.append(el("span", "util-name", "❄️ Aircond"), el("span", "util-pill", svc.aircon.powered ? "Ada bekalan" : "⚡ Terputus"));
        list.appendChild(ac);
        const fridge = el("div", "util-row");
        fridge.append(el("span", "util-name", "🧊 Penyejukan peti sejuk"), el("span", "util-pill", "🛡️ Sentiasa sejuk"));
        list.appendChild(fridge);
        out.push(list);
        const call = el("button", "btn primary", e.state === "technician" ? "🔧 Juruteknik sudah dipanggil" : "🔧 Panggil Juruteknik");
        call.disabled = e.state !== "outage";
        call.addEventListener("click", () => svc.callTechnician());
        out.push(call, el("p", "muted", "Panel ini untuk melihat status sahaja. Kerja elektrik hanya dibuat oleh juruteknik bertauliah."));
        if (dev) {
          const box = el("div", "dev-box");
          box.appendChild(el("p", "muted", "🛠️ Developer (demo sahaja)"));
          const row = el("div", "chip-row");
          const trig = el("button", "btn", "Uji gangguan");
          trig.disabled = e.state !== "normal";
          trig.addEventListener("click", () => svc.triggerEvent());
          const now = el("button", "btn", "Selesai segera");
          now.disabled = e.state === "normal" || e.state === "restored";
          now.addEventListener("click", () => svc.resolveNow());
          const reset = el("button", "btn", "Reset Demo Event");
          reset.addEventListener("click", () => svc.resetDemo());
          row.append(trig, now, reset);
          box.appendChild(row);
          out.push(box);
        }
        return out;
      },
      [this.closeBtn("Tutup")],
      onClose
    );
  }
}

function zoneRow(svc: UtilityService, id: ZoneId, icon: string): HTMLElement {
  const st = svc.zones.get(id)!;
  const row = el("div", `util-row ${st.powered ? "" : "cut"}`);
  const btn = el("button", `switch-btn ${st.lightsOn ? "on" : ""}`, st.lightsOn ? "ON" : "OFF");
  btn.setAttribute("aria-label", `${st.label}: ${st.lightsOn ? "ON" : "OFF"}`);
  btn.setAttribute("aria-pressed", String(st.lightsOn));
  btn.addEventListener("click", () => svc.toggleZone(id));
  row.append(el("span", "util-name", `${icon} ${st.label}`));
  if (!st.powered) row.append(el("span", "util-pill", "⚡ Tiada bekalan"));
  row.append(btn);
  return row;
}
