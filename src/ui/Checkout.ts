import { css, el } from "./dom";
import type Overlays from "./Overlays";
import { getItem, imageUrl, type CatalogItem } from "../data/catalog";
import { t, type StringKey } from "../data/strings";
import OrderService, { DENOMINATIONS, MAX_POINTS, rmSen, type Order } from "../game/OrderService";

// Phase 2 till screens on top of the (still mounted) 3D store: barcode scanning by swiping
// cards onto the scanner, cash change with Malaysian notes and coins, basic
// bag packing (tap or drag), and the result panel. All money is integer sen.

/** Product picture with an emoji fallback. */
function productIcon(item: CatalogItem, cls = "co-icon"): HTMLElement {
  const box = el("span", cls, item.icon);
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false; // a native image drag would cancel our pointer drag
  img.onload = () => box.replaceChildren(img);
  img.src = imageUrl(item);
  return box;
}

/** Fake EAN bars drawn from the barcode digits (purely visual). */
function barcode(code: string): HTMLElement {
  const bars = el("span", "co-barcode");
  for (const ch of code) {
    const d = Number(ch);
    for (let k = 0; k < 2; k++) {
      const b = el("i");
      b.style.width = `${1 + ((d + k) % 3)}px`;
      bars.appendChild(b);
    }
  }
  bars.appendChild(el("small", "", code));
  return bars;
}

/** Pointer drag that works for touch, pen and mouse. Calls onDrop with the release point. */
function draggable(node: HTMLElement, onDrop: (x: number, y: number) => void, onTap?: () => void): void {
  let sx = 0;
  let sy = 0;
  let id = -1;
  let moved = false;
  node.style.touchAction = "none";
  node.addEventListener("dragstart", (e) => e.preventDefault());
  node.addEventListener("pointerdown", (e) => {
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    moved = false;
    node.setPointerCapture(id);
    node.classList.add("dragging");
  });
  node.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.hypot(dx, dy) > 6) moved = true;
    node.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const reset = () => {
    id = -1;
    node.classList.remove("dragging");
    node.style.transform = "";
  };
  node.addEventListener("pointerup", (e) => {
    if (e.pointerId !== id) return;
    reset();
    if (moved) onDrop(e.clientX, e.clientY);
    else onTap?.();
  });
  // cancelled by the browser (scroll, gesture…): just snap back, no drop and no penalty
  node.addEventListener("pointercancel", (e) => e.pointerId === id && reset());
}

const inside = (x: number, y: number, r: DOMRect, pad = 24) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

export default class Checkout {
  private overlays: Overlays;
  private svc: OrderService;
  /** Short beep (provided by the game's audio). */
  beep: () => void = () => {};

  constructor(overlays: Overlays, svc: OrderService) {
    this.overlays = overlays;
    this.svc = svc;
  }

  // ---------- till: scan → pay → pack (resumes at the saved step) ----------

  till(onClose: () => void): void {
    const p = this.overlays.panel(t("scan_title"), "🧾", onClose, "till");
    const render = () => {
      const s = this.svc.state;
      if (s === "scanning") this.scanStep(p, render);
      else if (s === "paying") this.payStep(p, render);
      else if (s === "handoff") {
        // paid with exact change: hand the goods over and show the result right here
        const done = this.svc.handoff();
        if (done) this.showResult(p, done);
        else p.close();
      } else p.close();
    };
    render();
  }

  private posBox(): HTMLElement {
    const o = this.svc.order!;
    const pos = el("div", "co-pos");
    const counts = new Map<string, number>();
    for (const u of o.scanned) counts.set(u.split("#")[0], (counts.get(u.split("#")[0]) ?? 0) + 1);
    let sub = 0;
    for (const [id, n] of counts) {
      const item = getItem(id)!;
      sub += item.priceCents * n;
      const row = el("div", "co-pos-row");
      row.append(el("span", "", `${item.name}${n > 1 ? ` ×${n}` : ""}`), el("span", "", rmSen(item.priceCents * n)));
      pos.appendChild(row);
    }
    if (!counts.size) pos.appendChild(el("div", "co-pos-row dim", "—"));
    const total = el("div", "co-pos-total");
    total.append(el("span", "", t("subtotal")), el("strong", "", rmSen(sub)));
    pos.appendChild(total);
    return pos;
  }

  private scanStep(p: ReturnType<Overlays["panel"]>, next: () => void): void {
    const o = this.svc.order!;
    p.setHead(t("scan_title"), "🔴");
    const left = this.svc.scanUnits().filter((u) => !o.scanned.includes(u));
    const unit = left[0];
    const item = getItem(unit.split("#")[0])!;
    const belt = el("div", "co-belt");
    const card = el("div", "co-card");
    card.append(productIcon(item, "co-icon big"), el("strong", "", item.name), el("span", "co-price", rmSen(item.priceCents)), barcode(item.barcode));
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${item.name}: ${t("scan_hint")}`);
    const scanner = el("div", "co-scanner");
    scanner.append(el("span", "co-laser"), el("span", "co-scanner-label", "SCAN"));
    belt.append(card, scanner);
    const hint = el("p", "co-hint", `${t("scan_hint")} · ${o.scanned.length + 1}/${this.svc.scanUnits().length}`);
    const doScan = () => {
      if (this.svc.scan(unit)) {
        this.beep();
        scanner.classList.add("hit");
        setTimeout(next, 220);
      }
    };
    draggable(card, (x, y) => {
      if (inside(x, y, scanner.getBoundingClientRect())) doScan();
      else {
        this.svc.scanMiss();
        hint.textContent = t("scan_miss");
        hint.classList.add("warn");
      }
    });
    // keyboard: Enter / Space on the card swipes it
    card.tabIndex = 0;
    card.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && doScan());
    const greet: Record<Order["customerId"], StringKey> = { express: "greet_express", ordinary: "greet_ordinary", family: "greet_family" };
    const speech = o.scanned.length ? [] : [el("div", "co-speech", `🧍 ${t(greet[o.customerId])}`)];
    p.body.className = "card-body step-scan";
    p.body.replaceChildren(...speech, this.posBox(), belt, hint);
    const restart = el("button", "btn", t("scan_restart"));
    restart.disabled = !o.scanned.length;
    restart.addEventListener("click", () => {
      this.svc.restartScan();
      next();
    });
    p.foot.replaceChildren(restart);
  }

  private payStep(p: ReturnType<Overlays["panel"]>, next: () => void): void {
    p.setHead(t("pay_title"), "💵");
    const total = this.svc.totalSen();
    const paid = this.svc.order!.paymentTenderedSen;
    const due = this.svc.changeDueSen();
    const pieces: number[] = [];
    // left: the payment receipt; right: the cash drawer (notes at the back, coins in front)
    const receipt = el("div", "co-receipt");
    const row = (label: string, value: string | HTMLElement, cls = "") => {
      const r = el("div", `co-r-row ${cls}`);
      r.append(el("span", "", label), typeof value === "string" ? el("strong", "", value) : value);
      return r;
    };
    const head = el("div", "co-r-head");
    head.append(el("strong", "", "MINI MARKET HERO"), el("span", "", "Resit Bayaran"));
    const lines = el("div", "co-r-items");
    for (const { item, line } of this.svc.items()) lines.appendChild(row(`${item.name}${line.quantity > 1 ? ` ×${line.quantity}` : ""}`, rmSen(item.priceCents * line.quantity)));
    const givenRow = row(t("change_given"), rmSen(0), "given");
    const tray = el("div", "co-tray");
    const feedback = el("p", "co-hint");
    receipt.append(
      head,
      lines,
      row(t("subtotal"), rmSen(total), "total"),
      row(t("paid"), rmSen(paid)),
      row(t("change_due"), rmSen(due), "due"),
      givenRow,
      tray,
      feedback
    );
    const refresh = () => {
      // one picture per denomination (largest first) with a ×n badge
      const counts = new Map<number, number>();
      for (const d of pieces) counts.set(d, (counts.get(d) ?? 0) + 1);
      tray.replaceChildren(
        ...[...counts.entries()]
          .sort((x, y) => y[0] - x[0])
          .map(([d, n]) => {
            const g = el("span", "co-tray-item");
            g.appendChild(denomChip(d, true));
            if (n > 1) g.appendChild(el("span", "co-tray-count", `×${n}`));
            return g;
          })
      );
      givenRow.lastElementChild!.textContent = rmSen(pieces.reduce((a, b) => a + b, 0));
    };
    const drawer = el("div", "co-drawer");
    const notes = el("div", "co-drawer-row notes");
    const coins = el("div", "co-drawer-row coins");
    for (const d of DENOMINATIONS.filter((d) => d <= 5000)) {
      const slot = el("div", `co-slot ${d >= 100 ? "note" : "coin"}`);
      // a pile of the same note / coin lying in the compartment (decoration; the button is the slot)
      const pile = el("div", "co-pile");
      for (let i = 0; i < (d >= 100 ? 4 : 11); i++) {
        const img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        img.onerror = () => img.remove();
        img.src = moneyUrl(d);
        pile.appendChild(img);
      }
      slot.appendChild(pile);
      const b = denomChip(d, false);
      b.addEventListener("click", () => {
        pieces.push(d);
        feedback.textContent = "";
        feedback.className = "co-hint";
        refresh();
      });
      slot.appendChild(b);
      (d >= 100 ? notes : coins).appendChild(slot);
    }
    drawer.append(notes, coins, el("span", "co-drawer-lock"));
    refresh();
    p.body.className = "card-body step-cash";
    p.body.replaceChildren(receipt, drawer);
    const undo = el("button", "btn", t("undo"));
    undo.addEventListener("click", () => {
      pieces.pop();
      refresh();
    });
    const clear = el("button", "btn", t("clear"));
    clear.addEventListener("click", () => {
      pieces.length = 0;
      refresh();
    });
    const confirm = el("button", "btn primary", t("confirm"));
    confirm.addEventListener("click", () => {
      const diff = this.svc.giveChange([...pieces]);
      if (diff === 0) {
        this.beep();
        next();
      } else {
        feedback.textContent = diff < 0 ? t("change_short", { amount: rmSen(-diff) }) : t("change_over", { amount: rmSen(diff) });
        feedback.className = "co-hint warn";
      }
    });
    p.foot.replaceChildren(undo, clear, confirm);
  }

  // ---------- result ----------

  private showResult(p: ReturnType<Overlays["panel"]>, o: Order): void {
    p.setHead(t("result_title"), "🎉");
    p.body.className = "card-body step-result";
    // hero: score ring + flat stars + thanks
    const hero = el("div", "res-hero");
    const ring = el("div", "res-ring");
    ring.style.setProperty("--p", String(o.earnedScore));
    const inner = el("div", "res-ring-inner");
    inner.append(el("strong", "", String(o.earnedScore)), el("span", "", "/ 100"));
    ring.appendChild(inner);
    const earned = o.earnedScore >= 90 ? 3 : o.earnedScore >= 70 ? 2 : 1;
    const stars = el("div", "res-stars");
    for (let i = 0; i < 3; i++) stars.appendChild(starIcon(i < earned));
    hero.append(ring, stars, el("p", "res-thanks", t("thanks")));
    // breakdown with little progress bars
    const rows = el("div", "res-rows");
    const parts: [StringKey, number, number][] = [
      ["score_scan", o.points.scan, MAX_POINTS.scan],
      ["score_change", o.points.change, MAX_POINTS.change],
      ["score_handoff", o.points.handoff, MAX_POINTS.handoff],
    ];
    for (const [k, v, max] of parts) {
      const r = el("div", "res-row");
      const bar = el("span", "res-bar");
      const fill = el("i");
      fill.style.width = `${Math.round((v / max) * 100)}%`;
      bar.appendChild(fill);
      r.append(el("span", "res-label", t(k)), el("strong", "", `${v}/${max}`), bar);
      rows.appendChild(r);
    }
    const chips = el("div", "res-chips");
    chips.append(el("span", "res-chip", `🏆 ${t("best")} ${this.svc.stats.bestScore}`), el("span", "res-chip coin", `🪙 +${this.svc.coinsFor(o)} (${this.svc.stats.coins})`));
    const side = el("div", "res-side");
    side.append(rows, chips, el("p", "res-next", t("next_customer")));
    p.body.replaceChildren(hero, side);
    const ok = el("button", "btn primary", t("continue"));
    ok.addEventListener("click", () => p.close());
    p.foot.replaceChildren(ok);
  }
}

/** Flat cartoon star (SVG): gold when earned, grey otherwise. */
function starIcon(on: boolean): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("class", `res-star ${on ? "on" : ""}`);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M24 4.5l5.9 12.3 13.5 1.7-9.9 9.3 2.5 13.4L24 34.6l-12 6.6 2.5-13.4-9.9-9.3 13.5-1.7z");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

/** Picture of a note or coin (public/money/rm5.webp, sen20.webp, …). */
const moneyUrl = (sen: number) => `${import.meta.env.BASE_URL}money/${sen >= 100 ? `rm${sen / 100}` : `sen${sen}`}.webp`;

/** Note / coin button: the money picture when available, otherwise a coloured chip. */
function denomChip(sen: number, small: boolean): HTMLButtonElement {
  const colors: Record<number, number> = { 5000: 0x2f8fb3, 2000: 0xe08a2e, 1000: 0xd94a4a, 500: 0x3a9b5a, 100: 0x3b6fd1, 50: 0xd4a73a, 20: 0xb9c2cc, 10: 0xb9c2cc, 5: 0xb9c2cc };
  const coin = sen < 100;
  const text = coin ? `${sen} sen` : `RM${sen / 100}`;
  const b = el("button", `co-denom ${coin ? "coin" : "note"} ${small ? "small" : ""}`, text);
  b.style.setProperty("--c", css(colors[sen] ?? 0x9aa6b5));
  b.setAttribute("aria-label", text);
  if (small) b.tabIndex = -1;
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.onload = () => {
    b.classList.add("has-img");
    b.replaceChildren(img, el("span", "co-denom-label", text));
  };
  img.src = moneyUrl(sen);
  return b;
}

