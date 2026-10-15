import { el } from "./dom";
import type Overlays from "./Overlays";
import { getItem, imageUrl, type CatalogItem } from "../data/catalog";
import type { DeliveryLine } from "../game/Delivery";

// Receiving the supplier delivery: the invoice on each row, the open carton beside it (one small
// picture per unit, so the player counts), and Enough / Short to mark. Once every carton is
// marked, "Terima stok" checks the marks and reports; stock always goes in at the real count.

function unitIcon(item: CatalogItem): HTMLElement {
  const box = el("span", "dv-unit", item.icon);
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.onload = () => box.replaceChildren(img);
  img.src = imageUrl(item);
  return box;
}

export interface DeliveryResult {
  /** Every carton marked correctly. */
  allRight: boolean;
  /** Short cartons the player reported. */
  reportedShort: number;
}

export default class DeliveryUI {
  private overlays: Overlays;

  constructor(overlays: Overlays) {
    this.overlays = overlays;
  }

  open(lines: DeliveryLine[], onReceive: (r: DeliveryResult) => string, onClose: () => void): void {
    const p = this.overlays.panel("Terima Penghantaran", "🚚", onClose, "morning delivery");
    const marks: (boolean | null)[] = lines.map(() => null); // true = enough, false = short
    const intro = el("div", "st-summary warn", "🧾 Kira barang dalam setiap kotak. Sama dengan invois?");
    const list = el("div", "dv-list");
    const receive = el("button", "btn primary", "📦 Terima stok");
    receive.disabled = true;
    lines.forEach((l, i) => {
      const item = getItem(l.productId)!;
      const row = el("div", "dv-row");
      const head = el("div", "dv-head");
      head.append(el("strong", "", item.name), el("span", "dv-inv", `Invois: ${l.invoiced}`));
      const carton = el("div", "dv-carton");
      for (let k = 0; k < l.actual; k++) carton.appendChild(unitIcon(item));
      const ok = el("button", "btn dv-mark", "✔ Cukup");
      const short = el("button", "btn dv-mark", "✖ Kurang");
      const pick = (v: boolean) => {
        marks[i] = v;
        ok.classList.toggle("on", v);
        short.classList.toggle("on", !v);
        row.classList.toggle("marked", true);
        receive.disabled = marks.some((m) => m === null);
      };
      ok.addEventListener("click", () => pick(true));
      short.addEventListener("click", () => pick(false));
      const btns = el("div", "dv-btns");
      btns.append(ok, short);
      row.append(head, carton, btns);
      list.appendChild(row);
    });
    receive.addEventListener("click", () => {
      const wrong: string[] = [];
      let reportedShort = 0;
      lines.forEach((l, i) => {
        const isShort = l.actual < l.invoiced;
        const name = getItem(l.productId)!.name;
        if (isShort && marks[i] === false) reportedShort += l.invoiced - l.actual;
        if (isShort && marks[i] !== false) wrong.push(`${name} sebenarnya kurang ${l.invoiced - l.actual} (ada ${l.actual}).`);
        if (!isShort && marks[i] === false) wrong.push(`${name} sebenarnya cukup ${l.invoiced}.`);
      });
      const msg = onReceive({ allRight: !wrong.length, reportedShort });
      const out = el("div", `st-summary ${wrong.length ? "warn" : "ok"}`, wrong.length ? `⚠️ Ada silap kira. ${wrong.join(" ")}` : msg);
      p.body.replaceChildren(out, el("p", "muted", wrong.length ? `${msg} Lain kali kira betul-betul ya.` : "Stok dah masuk stor. Ambil di Stor / Bilik Sejuk bila nak isi rak."));
      const done = el("button", "btn primary", "OK");
      done.addEventListener("click", () => p.close());
      p.foot.replaceChildren(done);
    });
    p.body.replaceChildren(intro, list);
    const later = el("button", "btn", "Nanti");
    later.addEventListener("click", () => p.close());
    p.foot.replaceChildren(later, receive);
  }
}
