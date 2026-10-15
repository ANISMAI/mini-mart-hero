import { el } from "./dom";
import type Overlays from "./Overlays";
import { dateLabel } from "../data/inventory";
import StoreDay, { OPEN, TASKS, TASK_REWARD, type TaskId } from "../game/StoreDay";
import type UtilityService from "../game/Utilities";
import { ZONES } from "../data/utilities";
import { rmSen } from "../game/OrderService";

// Morning opening routine screens: the checklist (tasks with ticks and Go buttons, time until
// opening), the mop activity (wipe the puddle until it's clean) and the electricity bill.
// No speed scores; each task's small reward is granted once per day by StoreDay.

export default class MorningUI {
  private overlays: Overlays;
  private day: StoreDay;

  constructor(overlays: Overlays, day: StoreDay) {
    this.overlays = overlays;
    this.day = day;
  }

  /** The checklist. `onGo(task)` walks the player there; `dev` adds "open now". */
  checklist(onGo: (task: TaskId) => void, onClose: () => void, dev = false, onDevExpire?: () => number): void {
    const d = this.day;
    const p = this.overlays.panel(`Senarai Semak Pagi · ${dateLabel(d.day)}`, "🌅", onClose, "morning");
    const render = () => {
      const left = Math.max(0, Math.ceil(OPEN - d.minute));
      const status = d.morning
        ? el("div", "st-summary warn", `⏰ ${d.timeLabel()} · Kedai buka 10:00 pg (${Math.floor(left / 60)}j ${left % 60}m lagi)`)
        : el("div", "st-summary ok", `🏪 Kedai dah buka · ${d.timeLabel()}`);
      const list = el("div", "mb-list");
      for (const t of TASKS) {
        const done = d.done[t.id];
        const row = el("div", `mb-task ${done ? "done" : ""}`);
        const info = el("div", "mb-task-info");
        info.append(el("strong", "", `${done ? "✅" : t.icon} ${t.label}`), el("span", "", done ? `Siap · +${TASK_REWARD} 🪙` : t.where));
        row.appendChild(info);
        if (!done && t.from && d.minute < t.from) {
          // not possible yet (e.g. the lorry hasn't come)
          row.appendChild(el("span", "mb-wait", `🕗 ${Math.floor(t.from / 60)}:${String(t.from % 60).padStart(2, "0")} pg`));
        } else if (!done) {
          const go = el("button", "btn primary mb-go", "Pergi");
          go.addEventListener("click", () => {
            p.close();
            onGo(t.id);
          });
          row.appendChild(go);
        }
        list.appendChild(row);
      }
      const count = TASKS.filter((t) => d.done[t.id]).length;
      p.body.replaceChildren(status, list, el("p", "muted", count === TASKS.length ? "🎉 Semua tugas pagi siap. Kedai sedia dibuka!" : `${count}/${TASKS.length} tugas siap. Tugas ni pilihan, tapi kedai lebih kemas!`));
    };
    render();
    const btns: HTMLElement[] = [];
    if (dev && onDevExpire) {
      const mk = el("button", "btn", "🛠️ Buat barang luput");
      mk.addEventListener("click", () => {
        const n = onDevExpire();
        d.reopen("expiry");
        render();
        mk.textContent = n ? `🛠️ ${n} pek luput` : "🛠️ Rak kosong";
      });
      btns.push(mk);
    }
    if (dev && d.morning) {
      const open = el("button", "btn", "🛠️ Buka sekarang");
      open.addEventListener("click", () => {
        d.skipToOpen();
        p.close();
      });
      btns.push(open);
    }
    const ok = el("button", "btn", "Tutup");
    ok.addEventListener("click", () => p.close());
    btns.push(ok);
    p.foot.replaceChildren(...btns);
  }

  /** Mop a spill: drag over the puddle until at least 90% is wiped. */
  mop(onClean: () => void, onClose: () => void): void {
    const p = this.overlays.panel("Mop Lantai", "🧹", onClose, "small");
    const W = 300;
    const H = 220;
    const cv = document.createElement("canvas");
    cv.className = "mop-canvas";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr;
    cv.height = H * dpr;
    const c = cv.getContext("2d")!;
    c.scale(dpr, dpr);
    // floor tiles
    for (let x = 0; x < W; x += 30)
      for (let y = 0; y < H; y += 30) {
        c.fillStyle = (x + y) % 60 ? "#f2ece2" : "#e6ddcf";
        c.fillRect(x, y, 30, 30);
      }
    // the puddle as a mask of cells we track
    const cells: { x: number; y: number; wet: boolean }[] = [];
    const inPuddle = (x: number, y: number) => {
      const a = Math.atan2(y - H / 2, x - W / 2);
      const r = 80 + Math.sin(a * 3) * 14 + Math.sin(a * 5 + 1) * 8;
      return Math.hypot(x - W / 2, (y - H / 2) * 1.25) < r;
    };
    for (let x = 6; x < W; x += 12) for (let y = 6; y < H; y += 12) if (inPuddle(x, y)) cells.push({ x, y, wet: true });
    const drawPuddle = () => {
      for (const cell of cells) {
        if (!cell.wet) continue;
        c.fillStyle = "rgba(120, 196, 238, 0.75)";
        c.beginPath();
        c.arc(cell.x, cell.y, 8.5, 0, Math.PI * 2);
        c.fill();
      }
    };
    drawPuddle();
    const bar = el("div", "mop-bar");
    const fill = el("i");
    bar.appendChild(fill);
    const msg = el("p", "co-hint", "Leret jari (atau mouse) atas tumpahan untuk mop.");
    const total = cells.length;
    let finished = false;
    const wipe = (px: number, py: number) => {
      if (finished) return;
      const r = cv.getBoundingClientRect();
      const x = ((px - r.left) / r.width) * W;
      const y = ((py - r.top) / r.height) * H;
      let changed = false;
      for (const cell of cells)
        if (cell.wet && Math.hypot(cell.x - x, cell.y - y) < 26) {
          cell.wet = false;
          changed = true;
          // dry patch: repaint the floor under it
          c.fillStyle = ((Math.floor(cell.x / 30) + Math.floor(cell.y / 30)) % 2 ? "#e6ddcf" : "#f2ece2");
          c.fillRect(cell.x - 9, cell.y - 9, 18, 18);
        }
      if (!changed) return;
      // redraw remaining water over the repainted tiles
      drawPuddle();
      const cleaned = 1 - cells.filter((cl) => cl.wet).length / total;
      fill.style.width = `${Math.round(cleaned * 100)}%`;
      if (cleaned >= 0.9) {
        finished = true;
        msg.textContent = "✨ Bersih! Lantai dah kering.";
        msg.className = "co-hint ok";
        onClean();
        window.setTimeout(() => p.close(), 700);
      }
    };
    let down = false;
    cv.style.touchAction = "none";
    cv.addEventListener("pointerdown", (e) => {
      down = true;
      cv.setPointerCapture(e.pointerId);
      wipe(e.clientX, e.clientY);
    });
    cv.addEventListener("pointermove", (e) => down && wipe(e.clientX, e.clientY));
    cv.addEventListener("pointerup", () => (down = false));
    cv.addEventListener("pointercancel", () => (down = false));
    p.body.replaceChildren(cv, bar, msg);
    const close = el("button", "btn", "Tutup");
    close.addEventListener("click", () => p.close());
    p.foot.replaceChildren(close);
  }

  /** Yesterday's (fictional) electricity bill from the current utility settings. */
  bill(utils: UtilityService, onChecked: () => void, onClose: () => void): void {
    const p = this.overlays.panel("Bil Elektrik", "⚡", onClose, "small");
    // simple, fictional estimate: 12 open hours; integer sen throughout
    const litZones = ZONES.filter((z) => utils.zones.get(z.id)?.lightsOn).length;
    const lightsKwh = litZones * 6;
    const acKwh = utils.aircon.isOn ? Math.round(30 + (28 - utils.aircon.targetTemperature) * 4) : 0;
    const fridgeKwh = 24;
    const rateSen = 30; // per kWh
    const rows: [string, number][] = [
      [`💡 Lampu (${litZones} zon)`, lightsKwh],
      [`❄️ Aircond (${utils.aircon.isOn ? `${utils.aircon.targetTemperature}°C` : "tutup"})`, acKwh],
      ["🧊 Peti sejuk", fridgeKwh],
    ];
    const totalKwh = rows.reduce((a, r) => a + r[1], 0);
    const table = el("div", "bill");
    table.appendChild(el("div", "bill-head", "TENAGA KEDAI · Bil Harian (rekaan)"));
    for (const [label, kwh] of rows) {
      const r = el("div", "bill-row");
      r.append(el("span", "", label), el("span", "", `${kwh} kWh`), el("strong", "", rmSen(kwh * rateSen)));
      table.appendChild(r);
    }
    const tot = el("div", "bill-row total");
    tot.append(el("span", "", "Jumlah"), el("span", "", `${totalKwh} kWh`), el("strong", "", rmSen(totalKwh * rateSen)));
    table.appendChild(tot);
    const tip = el("p", "muted", acKwh > 40 ? "💡 Tip: naikkan suhu aircond 1–2°C atau tutup lampu zon yang kosong untuk jimat." : "👍 Penggunaan elektrik terkawal.");
    p.body.replaceChildren(table, tip);
    const ok = el("button", "btn primary", "✔ Dah semak");
    ok.addEventListener("click", () => {
      onChecked();
      p.close();
    });
    p.foot.replaceChildren(ok);
  }
}
