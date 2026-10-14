import { ROOMS, STORE, getRoom, type RoomId } from "../data/rooms";
import { css, el } from "./dom";

/** Fixtures drawn on the plan for orientation (x, z, w, d in metres): shelves, coolers, till. */
const FIXTURES: { x: number; z: number; w: number; d: number; kind: "shelf" | "cooler" | "till" }[] = [
  { x: 5.7, z: 11.5, w: 1, d: 7, kind: "shelf" },
  { x: 10.25, z: 11.5, w: 1, d: 7, kind: "shelf" },
  { x: 14.7, z: 11.5, w: 1, d: 7, kind: "shelf" },
  { x: 2.05, z: 11, w: 1, d: 7, kind: "cooler" },
  { x: 2, z: 21.55, w: 6, d: 0.9, kind: "till" },
];

/**
 * Full store map: a floor plan with every room labelled, the shelves / coolers / till drawn in,
 * the entrance and a pulsing "you" marker. Tap a room (on the plan or in the list) and Go Here.
 * Sizes itself from the screen: plan above the list on portrait phones, side by side elsewhere.
 */
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
    card.setAttribute("aria-label", "Peta Kedai");
    const head = el("div", "card-head");
    head.append(el("span", "card-icon", "🗺️"), el("h2", "", "Peta Kedai"));
    const x = el("button", "card-x", "✕");
    x.setAttribute("aria-label", "Tutup");
    x.addEventListener("click", () => this.close());
    head.appendChild(x);

    // ---- floor plan ----
    const planWrap = el("div", "map-plan-wrap");
    this.plan = el("div", "map-plan");
    const pct = (v: number, of: number) => `${(v / of) * 100}%`;
    const place = (node: HTMLElement, x0: number, z0: number, w: number, d: number) => {
      node.style.left = pct(x0, STORE.w);
      node.style.top = pct(z0, STORE.d);
      node.style.width = pct(w, STORE.w);
      node.style.height = pct(d, STORE.d);
    };
    // open zones first (underneath), enclosed rooms on top
    for (const r of [...ROOMS].sort((a, b) => Number(a.enclosed) - Number(b.enclosed))) {
      const b = el("button", `map-zone ${r.enclosed ? "room" : "open"}`);
      place(b, r.bounds.x, r.bounds.z, r.bounds.w, r.bounds.d);
      b.style.setProperty("--c", css(r.color));
      b.setAttribute("aria-label", r.name);
      const label = el("span", "map-zone-label");
      label.append(el("span", "map-zone-icon", r.icon), el("span", "map-zone-name", r.short ?? r.name));
      b.append(label);
      b.addEventListener("click", () => this.select(r.id));
      this.plan.appendChild(b);
      this.items.set(r.id, [b]);
    }
    for (const f of FIXTURES) {
      const node = el("div", `map-fixture ${f.kind}`);
      place(node, f.x, f.z, f.w, f.d);
      this.plan.appendChild(node);
    }
    const door = el("div", "map-door", "🚪 Pintu Masuk");
    door.style.left = pct(10, STORE.w);
    door.style.width = pct(4, STORE.w);
    this.plan.appendChild(door);
    this.you = el("div", "map-you");
    this.you.append(el("span", "map-you-dot"), el("span", "map-you-label", "Anda"));
    this.plan.appendChild(this.you);
    planWrap.appendChild(this.plan);

    // ---- side: list of places, selection detail, Go Here ----
    const side = el("div", "map-side");
    const list = el("div", "map-list");
    for (const r of ROOMS) {
      const b = el("button", "map-item");
      b.style.setProperty("--c", css(r.color));
      b.append(el("span", "map-item-icon", r.icon), el("span", "map-item-name", r.short ?? r.name));
      b.addEventListener("click", () => this.select(r.id));
      list.appendChild(b);
      this.items.get(r.id)!.push(b);
    }
    this.detail = el("div", "map-detail");
    this.go = el("button", "btn primary map-go", "Pergi Ke Sini");
    this.go.addEventListener("click", () => {
      if (!this.selected || this.selected === this.here) return;
      const id = this.selected;
      this.close();
      this.onGo(id);
    });
    side.append(list, this.detail, this.go);

    const body = el("div", "map-body");
    body.append(planWrap, side);
    card.append(head, body);
    this.root.appendChild(card);
    this.root.addEventListener("click", (e) => e.target === this.root && this.close());
    parent.appendChild(this.root);
  }

  private select(id: RoomId): void {
    this.selected = id;
    this.items.forEach((els, rid) => els.forEach((e) => e.classList.toggle("selected", rid === id)));
    const r = getRoom(id);
    const isHere = id === this.here;
    this.detail.replaceChildren(el("span", "map-detail-icon", r.icon), el("span", "", isHere ? `${r.name} · anda di sini` : r.name));
    this.go.disabled = isHere;
    this.go.textContent = isHere ? "Anda di sini" : "Pergi Ke Sini";
  }

  get isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  open(here: RoomId | null, x: number, z: number): void {
    this.here = here;
    this.selected = null;
    this.items.forEach((els, rid) => els.forEach((e) => (e.classList.remove("selected"), e.classList.toggle("here", rid === here))));
    this.you.style.left = `${(x / STORE.w) * 100}%`;
    this.you.style.top = `${(z / STORE.d) * 100}%`;
    this.detail.replaceChildren(el("span", "", "Tekan tempat pada peta atau senarai."));
    this.go.disabled = true;
    this.go.textContent = "Pergi Ke Sini";
    this.root.classList.remove("hidden");
  }

  close(): void {
    if (this.root.classList.contains("hidden")) return;
    this.root.classList.add("hidden");
    this.onClose();
  }
}
