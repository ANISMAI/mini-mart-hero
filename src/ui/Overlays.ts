import { css, el } from "./dom";
import { imageUrl, isUnlocked, itemsIn, rm, SECTIONS, type Category } from "../data/catalog";

/**
 * OverlayController: the 2D task screens shown on top of the 3D store (hybrid mode).
 * Only one is open at a time; closing it calls `onClose` once, which hands control back to 3D.
 */
export default class Overlays {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private onClose: (() => void) | null = null;

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
    this.root.classList.remove("hidden");
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add("hidden");
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
    this.open(
      "Paused",
      "⏸",
      [
        el("p", "muted", "Controls: left thumb to walk · drag to look · pinch to zoom. Desktop: WASD / arrows, mouse drag, wheel, E to interact, M for the map."),
        reset,
      ],
      [this.closeBtn("Resume")],
      onClose,
      "small"
    );
  }
}
