import { el } from "./dom";
import type Overlays from "./Overlays";
import { getItem, imageUrl, SECTIONS, type CatalogItem, type Category } from "../data/catalog";
import { BASKET_MAX, LOW_STOCK, SLOTS, SOURCE_LABEL, slotsOn, type StockSource } from "../data/inventory";
import type InventoryService from "../game/Inventory";
import type { RestockError, RestockMove } from "../game/Inventory";

// Phase 3 stock screens over the paused 3D store:
//  - back-stock (chiller room / store room): take units into the restock basket or put them back
//  - shelf restock: fixed, labelled slots (one per SKU) with count / capacity; drag a basket item
//    onto its slot or tap item then slot; zoom +/- and pan; Confirm applies everything at once,
//    Cancel changes nothing. No timers, scores or hints: a wrong slot just gives the unit back.

function productIcon(item: CatalogItem): HTMLElement {
  const box = el("span", "st-icon", item.icon);
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.onload = () => box.replaceChildren(img);
  img.src = imageUrl(item);
  return box;
}

const ERR: Record<RestockError, (name: string) => string> = {
  locked: (n) => `🔒 ${n} belum dibuka pada level ini.`,
  wrongSlot: (n) => `Bukan slot untuk ${n}. Cari slot berlabel ${n} ya.`,
  noStock: (n) => `Tiada lagi ${n} dalam bakul. Ambil di stor dulu.`,
  full: (n) => `Slot ${n} dah penuh.`,
  unknown: () => "Slot tidak dikenali.",
};

export default class StockUI {
  private overlays: Overlays;
  private inv: InventoryService;

  constructor(overlays: Overlays, inv: InventoryService) {
    this.overlays = overlays;
    this.inv = inv;
  }

  /** Back-stock room: take into / put back from the restock basket. */
  backStock(source: StockSource, onClose: () => void): void {
    const label = SOURCE_LABEL[source];
    const p = this.overlays.panel(`Stok · ${label.name}`, label.icon, onClose, "till stock");
    const categories = (Object.keys(SECTIONS) as Category[]).filter((c) => slotsOn(c).length && (source === "chiller") === (c === "fridge"));
    // tabs on the left (one per section), the chosen section's products on the right
    const needOf = (slot: ReturnType<typeof slotsOn>[number]) =>
      this.inv.unlocked(slot.productId) ? Math.max(0, slot.capacity - (this.inv.shelf[slot.slotId] ?? 0) - (this.inv.basket[slot.productId] ?? 0)) : 0;
    const needIn = (cat: Category) => slotsOn(cat).reduce((a, sl) => a + needOf(sl), 0);
    let tab: Category = [...categories].sort((x, y) => needIn(y) - needIn(x))[0];
    const render = () => {
      const totalNeed = categories.reduce((a, c) => a + needIn(c), 0);
      const shortItems = categories.flatMap((c) => slotsOn(c)).filter((sl) => needOf(sl) > 0).length;
      const head = el("div", "st-head");
      head.append(
        el("div", `st-summary ${shortItems ? "warn" : "ok"}`, shortItems ? `⚠️ ${shortItems} barang perlu diisi · ${totalNeed} unit` : "✅ Semua rak penuh"),
        el("div", "st-basket-bar", `🧺 Bakul: ${this.inv.basketCount()}/${BASKET_MAX}`)
      );
      const tabs = el("div", "st-tabs");
      tabs.setAttribute("role", "tablist");
      for (const cat of categories) {
        const sec = SECTIONS[cat];
        const n = needIn(cat);
        const t = el("button", `st-tab ${cat === tab ? "on" : ""}`);
        t.setAttribute("role", "tab");
        t.setAttribute("aria-selected", String(cat === tab));
        t.append(el("span", "st-tab-icon", sec.icon), el("span", "st-tab-name", sec.label), el("span", `st-tab-badge ${n ? "" : "done"}`, n ? String(n) : "✓"));
        t.addEventListener("click", () => {
          tab = cat;
          render();
        });
        tabs.appendChild(t);
      }
      const rows = slotsOn(tab).map((slot) => {
        const item = getItem(slot.productId)!;
        return { slot, item, unlocked: this.inv.unlocked(item.id), onShelf: this.inv.shelf[slot.slotId] ?? 0, carried: this.inv.basket[item.id] ?? 0, need: needOf(slot) };
      });
      rows.sort((x, y) => Number(y.unlocked) - Number(x.unlocked) || y.need - x.need);
      const list = el("div", "st-list2");
      for (const { slot, item, unlocked, onShelf, carried, need } of rows) {
        const row = el("div", `st-item ${unlocked ? "" : "locked"} ${need > 0 ? "needs" : ""}`);
        const top = el("div", "st-item-top");
        const info = el("div", "st-item-info");
        const name = el("div", "st-stock-name");
        name.append(el("strong", "", item.name), unlocked ? el("span", `st-need ${need > 0 ? "" : "done"}`, need > 0 ? `Perlu: ${need}` : "✓ Penuh") : el("span", "st-need lock", `🔒 Lv ${item.unlockLevel}`));
        const bar = el("span", "st-bar");
        const fill = el("i");
        fill.style.width = `${Math.round((onShelf / slot.capacity) * 100)}%`;
        if (onShelf <= LOW_STOCK) fill.classList.add("low");
        bar.appendChild(fill);
        info.append(name, el("span", "st-stock-meta", unlocked ? `Rak ${onShelf}/${slot.capacity} · Stor ${this.inv.storage[item.id] ?? 0}` : ""), bar);
        top.append(productIcon(item), info);
        row.appendChild(top);
        if (unlocked) {
          const ctrl = el("div", "st-item-ctrl");
          const minus = el("button", "btn round", "−");
          minus.setAttribute("aria-label", `Pulangkan ${item.name}`);
          minus.disabled = !carried;
          minus.addEventListener("click", () => (this.inv.putBack(item.id, 1), render()));
          const count = el("span", "st-count", String(carried));
          const plus = el("button", "btn round", "+");
          plus.setAttribute("aria-label", `Ambil ${item.name}`);
          plus.disabled = !(this.inv.storage[item.id] ?? 0) || this.inv.basketCount() >= BASKET_MAX;
          plus.addEventListener("click", () => (this.inv.take(item.id, 1), render()));
          ctrl.append(minus, count, plus);
          if (need > 0) {
            const fillUp = el("button", "btn st-fill", `Ambil ${need}`);
            fillUp.setAttribute("aria-label", `Ambil ${need} ${item.name}, cukup untuk penuhkan rak`);
            fillUp.disabled = !(this.inv.storage[item.id] ?? 0) || this.inv.basketCount() >= BASKET_MAX;
            fillUp.addEventListener("click", () => (this.inv.take(item.id, need), render()));
            ctrl.appendChild(fillUp);
          }
          row.appendChild(ctrl);
        }
        list.appendChild(row);
      }
      const main = el("div", "st-main");
      main.append(tabs, list);
      p.body.className = "card-body st-room";
      p.body.replaceChildren(head, main, el("p", "co-hint", "Bawa kotak ke rak, kemudian tekan Isi stok di rak."));
    };
    render();
    const done = el("button", "btn primary", "Siap");
    done.addEventListener("click", () => p.close());
    p.foot.replaceChildren(done);
  }

  /**
   * Shelf restock as a hands-on drag-and-drop: a front view of the shelf with wooden boards,
   * every slot drawn as `capacity` empty spaces above its price tag. Drag one product from the
   * basket (a picture follows the finger) and drop it on its slot: it lands in the next empty
   * space. A wrong slot sends it back to the basket with a short note. Tap item then slot also
   * works. Zoom +/- (and pinch), pan when zoomed. Confirm applies everything at once.
   */
  restock(category: Category, onClose: () => void): void {
    const sec = SECTIONS[category];
    const p = this.overlays.panel(`Isi Stok · ${sec.label}`, sec.icon, onClose, "till stock");
    const allSlots = SLOTS.filter((s) => s.category === category);
    const pending: RestockMove[] = [];
    let selected: string | null = null;
    let lastDrop: string | null = null;
    let zoom = 1;

    const status = el("div", "st-status");
    const viewport = el("div", "st-viewport");
    const shelf = el("div", "st-shelf");
    viewport.appendChild(shelf);
    const tray = el("div", "st-tray");
    const msg = el("p", "co-hint");
    const zoomBar = el("div", "st-zoom");

    const pendingIn = (slotId: string) => pending.filter((m) => m.slotId === slotId).reduce((a, m) => a + m.units, 0);
    const pendingOf = (productId: string) => pending.filter((m) => m.productId === productId).reduce((a, m) => a + m.units, 0);
    const say = (text: string, warn = false) => {
      msg.textContent = text;
      msg.className = `co-hint ${warn ? "warn" : ""}`;
    };

    /** One unit into a slot; returns false (and explains) if it can't go there. */
    const place = (slotId: string, productId: string): boolean => {
      const err = this.inv.check(slotId, productId, pending);
      const name = getItem(productId)!.name;
      if (err) {
        say(ERR[err](name), true);
        return false;
      }
      pending.push({ slotId, productId, units: 1 });
      lastDrop = slotId;
      say(`👍 ${name} masuk rak`);
      draw();
      return true;
    };

    const draw = () => {
      const open = allSlots.filter((s) => this.inv.unlocked(s.productId));
      const low = open.filter((s) => (this.inv.shelf[s.slotId] ?? 0) + pendingIn(s.slotId) <= LOW_STOCK).length;
      status.textContent = low ? `⚠️ ${low} slot stok rendah` : "✅ Semua slot ada stok";
      status.className = `st-status ${low ? "warn" : "ok"}`;

      // shelf boards: slots in rows of up to 4, each row standing on a wooden board
      const rows: HTMLElement[] = [];
      for (let i = 0; i < allSlots.length; i += 4) {
        const row = el("div", "st-row");
        for (const s of allSlots.slice(i, i + 4)) {
          const item = getItem(s.productId)!;
          const unlocked = this.inv.unlocked(s.productId);
          const have = this.inv.shelf[s.slotId] ?? 0;
          const added = pendingIn(s.slotId);
          const qty = have + added;
          const slot = el("div", `st-bay ${unlocked ? "" : "locked"} ${qty <= LOW_STOCK && unlocked ? "low" : ""}`);
          if (unlocked) slot.dataset.slot = s.slotId;
          slot.setAttribute("role", "button");
          slot.setAttribute("aria-label", unlocked ? `${item.name}: ${qty} daripada ${s.capacity}` : `${item.name}: dikunci`);
          const cells = el("div", `st-cells cap${s.capacity}`);
          for (let k = 0; k < s.capacity; k++) {
            const cell = el("span", "st-cell");
            if (unlocked && k < qty) {
              cell.classList.add("filled");
              cell.appendChild(productIcon(item));
              if (k >= have && s.slotId === lastDrop && k === qty - 1) cell.classList.add("pop");
              if (k >= have) cell.classList.add("new");
            }
            cells.appendChild(cell);
          }
          const tag = el("div", "st-tag");
          tag.append(el("strong", "", unlocked ? item.name : `🔒 ${item.name}`), el("span", "", unlocked ? `${qty}/${s.capacity}` : `Lv ${item.unlockLevel}`));
          slot.append(cells, tag);
          if (unlocked)
            slot.addEventListener("click", () => {
              if (selected) place(s.slotId, selected);
            });
          row.appendChild(slot);
        }
        rows.push(row);
      }
      shelf.replaceChildren(...rows);
      lastDrop = null;

      // basket: one pile per product; drag takes a single unit
      const inBasket = open.filter((s) => (this.inv.basket[s.productId] ?? 0) - pendingOf(s.productId) > 0);
      if (selected && !inBasket.some((s) => s.productId === selected)) selected = null;
      tray.replaceChildren(
        el("span", "st-tray-label", "🧺"),
        ...(inBasket.length
          ? inBasket.map((s) => {
              const item = getItem(s.productId)!;
              const left = (this.inv.basket[s.productId] ?? 0) - pendingOf(s.productId);
              const pile = el("button", `st-pile ${selected === s.productId ? "sel" : ""}`);
              pile.setAttribute("aria-label", `${item.name}, ${left} dalam bakul`);
              pile.setAttribute("aria-pressed", String(selected === s.productId));
              pile.append(productIcon(item), el("span", "st-pile-count", `×${left}`));
              dragUnit(
                pile,
                item,
                (slotId) => (slotId ? place(slotId, s.productId) : (say(`Lepaskan ${item.name} atas slotnya di rak.`), false)),
                () => {
                  selected = selected === s.productId ? null : s.productId;
                  if (selected) say(`Tekan slot ${item.name} untuk letak satu.`);
                  draw();
                },
                viewport
              );
              return pile;
            })
          : [el("span", "st-empty", `Bakul kosong untuk rak ini. Ambil stok di ${SOURCE_LABEL[category === "fridge" ? "chiller" : "storage"].name}.`)])
      );
    };

    // zoom +/- (clamped) and pinch; the viewport scrolls to pan when zoomed in
    const zoomLabel = el("span", "", "100%");
    const setZoom = (z: number) => {
      zoom = Math.min(1.8, Math.max(0.6, z));
      shelf.style.transform = `scale(${zoom})`;
      shelf.style.width = `${100 / zoom}%`;
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    };
    const minus = el("button", "btn round", "−");
    minus.setAttribute("aria-label", "Zoom keluar");
    minus.addEventListener("click", () => setZoom(zoom - 0.15));
    const plus = el("button", "btn round", "+");
    plus.setAttribute("aria-label", "Zoom masuk");
    plus.addEventListener("click", () => setZoom(zoom + 0.15));
    zoomBar.append(minus, zoomLabel, plus);
    let pinch = 0;
    viewport.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 2) return;
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) setZoom(zoom * (d / pinch));
        pinch = d;
      },
      { passive: true }
    );
    viewport.addEventListener("touchend", () => (pinch = 0));

    const top = el("div", "st-top");
    top.append(status, zoomBar);
    p.body.className = "card-body st-body";
    p.body.replaceChildren(top, viewport, tray, msg);
    say("Seret barang dari bakul dan lepaskan atas slotnya di rak.");
    draw();

    const undo = el("button", "btn", "↶ Undo");
    undo.addEventListener("click", () => {
      if (pending.pop()) {
        say("Barang terakhir dipulangkan ke bakul.");
        draw();
      }
    });
    const cancel = el("button", "btn", "Batal");
    cancel.addEventListener("click", () => p.close());
    const confirm = el("button", "btn primary", "✔ Sahkan");
    confirm.addEventListener("click", () => {
      if (!pending.length) return p.close();
      if (this.inv.restock(pending)) p.close();
      else say("Stok berubah, sila cuba lagi.", true);
    });
    p.foot.replaceChildren(undo, cancel, confirm);
  }
}

/**
 * Drag one unit out of a basket pile: a picture of the product follows the pointer; on release
 * over a slot it calls onDrop(slotId) and, if refused, the picture flies back to the pile.
 * A plain tap selects the pile instead.
 */
function dragUnit(pile: HTMLElement, item: CatalogItem, onDrop: (slotId: string | null) => boolean, onTap: () => void, scroller?: HTMLElement): void {
  let id = -1;
  let sx = 0;
  let sy = 0;
  let ghost: HTMLElement | null = null;
  pile.style.touchAction = "none";
  pile.addEventListener("dragstart", (e) => e.preventDefault());
  pile.addEventListener("pointerdown", (e) => {
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    pile.setPointerCapture(id);
  });
  const moveGhost = (x: number, y: number) => {
    if (ghost) ghost.style.transform = `translate(${x - 28}px, ${y - 28}px) scale(1.15)`;
  };
  pile.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    if (!ghost && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
      ghost = el("div", "st-ghost");
      ghost.appendChild(productIcon(item));
      document.body.appendChild(ghost);
      pile.classList.add("lifting");
    }
    moveGhost(e.clientX, e.clientY);
    // near the edge of the shelf view while dragging: scroll it so far-away bays can be reached
    if (ghost && scroller) {
      const r = scroller.getBoundingClientRect();
      const edge = 40;
      if (e.clientY < r.top + edge) scroller.scrollTop -= 12;
      else if (e.clientY > r.bottom - edge && e.clientY < r.bottom + 60) scroller.scrollTop += 12;
      if (e.clientX < r.left + edge) scroller.scrollLeft -= 12;
      else if (e.clientX > r.right - edge) scroller.scrollLeft += 12;
    }
  });
  const finish = (e: PointerEvent, cancelled: boolean) => {
    if (e.pointerId !== id) return;
    id = -1;
    pile.classList.remove("lifting");
    if (!ghost) {
      if (!cancelled) onTap();
      return;
    }
    const g = ghost;
    ghost = null;
    let ok = false;
    if (!cancelled) {
      g.style.display = "none"; // so the slot under the finger is found
      const hit = document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).dataset?.slot) as HTMLElement | undefined;
      g.style.display = "";
      ok = onDrop(hit ? hit.dataset.slot! : null);
    }
    if (ok) {
      g.remove();
      return;
    }
    // refused: fly back to the basket pile
    const r = pile.getBoundingClientRect();
    g.classList.add("back");
    g.style.transform = `translate(${r.left + r.width / 2 - 28}px, ${r.top + r.height / 2 - 28}px) scale(0.8)`;
    setTimeout(() => g.remove(), 260);
  };
  pile.addEventListener("pointerup", (e) => finish(e, false));
  pile.addEventListener("pointercancel", (e) => finish(e, true));
}
