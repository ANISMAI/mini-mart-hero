import { ROOMS, STORE, getRoom, type RoomId } from "../data/rooms";
import { css, el } from "./dom";

/** Full store map: tap a room (on the plan or in the list) to highlight it, then Go Here. */
export default class FullMap {
  private root: HTMLDivElement;
  private plan: HTMLDivElement;
  private items = new Map<RoomId, HTMLElement[]>();
  private detail: HTMLDivElement;
  private go: HTMLButtonElement;
  private you: HTMLDivElement;
  private selected: RoomId | null = null;
  private here: RoomId | null = null;
  private onGo: (id: RoomId) => void;
  private onClose: () => void;

  constructor(parent: HTMLElement, onGo: (id: RoomId) => void, onClose: () => void) {
    this.onGo = onGo;
    this.onClose = onClose;
    this.root = el("div", "overlay hidden");
    const card = el("div", "card map-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Store map");
    const head = el("div", "card-head");
    head.append(el("span", "card-icon", "🗺️"), el("h2", "", "Store Map"));
    const x = el("button", "card-x", "✕");
    x.setAttribute("aria-label", "Close");
    x.addEventListener("click", () => this.close());
    head.appendChild(x);

    this.plan = el("div", "map-plan");
    this.plan.style.aspectRatio = `${STORE.w} / ${STORE.d}`;
    for (const r of ROOMS) {
      const b = el("button", `map-zone ${r.enclosed ? "room" : "open"}`);
      b.style.left = `${(r.bounds.x / STORE.w) * 100}%`;
      b.style.top = `${(r.bounds.z / STORE.d) * 100}%`;
      b.style.width = `${(r.bounds.w / STORE.w) * 100}%`;
      b.style.height = `${(r.bounds.d / STORE.d) * 100}%`;
      b.style.setProperty("--c", css(r.color));
      b.setAttribute("aria-label", r.name);
      b.append(el("span", "map-zone-icon", r.icon));
      b.addEventListener("click", () => this.select(r.id));
      this.plan.appendChild(b);
      this.items.set(r.id, [b]);
    }
    this.you = el("div", "map-you");
    this.plan.appendChild(this.you);

    const list = el("div", "map-list");
    for (const r of ROOMS) {
      const b = el("button", "map-item");
      b.append(el("span", "", r.icon), el("span", "", r.short ?? r.name));
      b.addEventListener("click", () => this.select(r.id));
      list.appendChild(b);
      this.items.get(r.id)!.push(b);
    }

    this.detail = el("div", "map-detail", "Tap a place on the map or in the list.");
    this.go = el("button", "btn primary", "Go Here");
    this.go.addEventListener("click", () => {
      if (!this.selected || this.selected === this.here) return;
      const id = this.selected;
      this.close();
      this.onGo(id);
    });
    const body = el("div", "map-body");
    body.append(this.plan, list);
    card.append(head, body, this.detail, this.go);
    this.root.appendChild(card);
    this.root.addEventListener("click", (e) => e.target === this.root && this.close());
    parent.appendChild(this.root);
  }

  private select(id: RoomId): void {
    this.selected = id;
    this.items.forEach((els, rid) => els.forEach((e) => e.classList.toggle("selected", rid === id)));
    const r = getRoom(id);
    const isHere = id === this.here;
    this.detail.textContent = isHere ? `${r.icon} ${r.name} · you are here` : `${r.icon} ${r.name}`;
    this.go.disabled = isHere;
    this.go.textContent = isHere ? "You're here" : "Go Here";
  }

  open(here: RoomId | null, x: number, z: number): void {
    this.here = here;
    this.selected = null;
    this.items.forEach((els, rid) => els.forEach((e) => (e.classList.remove("selected"), e.classList.toggle("here", rid === here))));
    this.you.style.left = `${(x / STORE.w) * 100}%`;
    this.you.style.top = `${(z / STORE.d) * 100}%`;
    this.detail.textContent = "Tap a place on the map or in the list.";
    this.go.disabled = true;
    this.go.textContent = "Go Here";
    this.root.classList.remove("hidden");
  }

  close(): void {
    if (this.root.classList.contains("hidden")) return;
    this.root.classList.add("hidden");
    this.onClose();
  }
}
