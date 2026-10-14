import { ROOMS, STORE, type RoomId } from "../data/rooms";
import { css } from "./dom";

const W = 92;
const H = Math.round((W * STORE.d) / STORE.w);

/** Always-on top-right map: store zones, the avatar's position and facing. North (back) is up. */
export default class MiniMap {
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private pulse = 0;

  constructor(mount: HTMLElement) {
    const c = document.createElement("canvas");
    c.width = W * this.dpr;
    c.height = H * this.dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    this.ctx = c.getContext("2d")!;
    const cap = document.createElement("span");
    cap.className = "hud-minimap-cap";
    cap.textContent = "MAP";
    mount.append(c, cap);
  }

  draw(x: number, z: number, facing: number, here: RoomId | null): void {
    const c = this.ctx;
    const s = W / STORE.w;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = "#f2ece2";
    c.fillRect(0, 0, W, H);
    for (const r of ROOMS) {
      const b = r.bounds;
      c.globalAlpha = r.id === here ? 1 : r.enclosed ? 0.75 : 0.45;
      c.fillStyle = css(r.color);
      c.beginPath();
      c.roundRect(b.x * s + 0.5, b.z * s + 0.5, b.w * s - 1, b.d * s - 1, 2);
      c.fill();
      if (r.id === "surau" || r.id === "restroom") {
        c.globalAlpha = 1;
        c.font = "9px sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(r.icon, (b.x + b.w / 2) * s, (b.z + b.d / 2) * s);
      }
    }
    c.globalAlpha = 1;
    // avatar arrow
    this.pulse = (this.pulse + 0.06) % (Math.PI * 2);
    const px = x * s;
    const pz = z * s;
    c.beginPath();
    c.arc(px, pz, 5 + Math.sin(this.pulse) * 1.2, 0, Math.PI * 2);
    c.fillStyle = "rgba(232, 51, 63, 0.3)";
    c.fill();
    c.save();
    c.translate(px, pz);
    c.rotate(-facing);
    c.beginPath();
    c.moveTo(0, -5);
    c.lineTo(4, 4);
    c.lineTo(0, 2);
    c.lineTo(-4, 4);
    c.closePath();
    c.fillStyle = "#e8333f";
    c.strokeStyle = "#fff";
    c.lineWidth = 1.5;
    c.stroke();
    c.fill();
    c.restore();
  }
}
