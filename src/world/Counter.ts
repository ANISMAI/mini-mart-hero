import * as THREE from "three";
import { at, cube, mat, rbox } from "./kit";

// The checkout counter, dressed like a Malaysian kedai runcit till: POS with a cashier screen and
// a customer display, cash drawer, receipt printer, card terminal, QR pay standee, flatbed
// scanner with a glowing laser line, conveyor, candy jars, a bell, plastic bags, a cashier stool
// and a small sweets rack. Built facing customers on +z (the cashier stands on the -z side).

function canvasPlane(w: number, h: number, px: number, draw: (c: CanvasRenderingContext2D, cw: number, ch: number) => void, basic = false): THREE.Mesh {
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = Math.round((px * h) / w);
  draw(cv.getContext("2d")!, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const material = basic ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ map: tex });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

const font = (size: number, weight = 900) => `${weight} ${size}px Nunito, "Segoe UI", "Segoe UI Emoji", sans-serif`;

/** Counter front facing the customers: wood panels with friendly stickers. */
function frontPanel(): THREE.Mesh {
  return canvasPlane(6, 0.72, 1024, (c, w, h) => {
    c.fillStyle = "#d9a86c";
    c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) {
      c.fillStyle = (x / 64) % 2 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
      c.fillRect(x, 0, 64, h);
      c.fillStyle = "rgba(120,80,40,0.35)";
      c.fillRect(x, 0, 2, h);
    }
    const sticker = (x: number, y: number, sw: number, sh: number, bg: string, lines: [string, number, string][]) => {
      c.fillStyle = bg;
      c.beginPath();
      c.roundRect(x, y, sw, sh, 14);
      c.fill();
      c.lineWidth = 5;
      c.strokeStyle = "#ffffff";
      c.stroke();
      c.textAlign = "center";
      c.textBaseline = "middle";
      let yy = y + sh / 2 - ((lines.length - 1) * lines[0][1]) / 2;
      for (const [t, s, col] of lines) {
        c.font = font(s);
        c.fillStyle = col;
        c.fillText(t, x + sw / 2, yy);
        yy += s * 1.1;
      }
    };
    sticker(40, 20, 300, 82, "#2fb38a", [["Terima Kasih 😊", 34, "#ffffff"]]);
    sticker(380, 20, 300, 82, "#ffffff", [["Kami terima:", 22, "#23364f"], ["💵 Tunai · 💳 Kad · 📱 QR", 22, "#23364f"]]);
    sticker(720, 20, 260, 82, "#f9c833", [["Sila beratur 🙏", 30, "#23364f"]]);
  });
}

function posScreen(): THREE.Mesh {
  return canvasPlane(0.46, 0.3, 256, (c, w, h) => {
    c.fillStyle = "#103a5c";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#2fb38a";
    c.fillRect(0, 0, w, 26);
    c.fillStyle = "#ffffff";
    c.font = font(16);
    c.textAlign = "left";
    c.fillText("MINI MARKET HERO · POS", 10, 18);
    c.font = font(14, 700);
    const rows = ["Teh Tarik Tin", "Roti Putih", "Mi Segera"];
    rows.forEach((r, i) => {
      c.fillStyle = "#cfe8ff";
      c.fillText(r, 10, 50 + i * 22);
      c.textAlign = "right";
      c.fillText(["2.50", "4.50", "5.90"][i], w - 10, 50 + i * 22);
      c.textAlign = "left";
    });
    c.fillStyle = "#f9c833";
    c.font = font(22);
    c.fillText("JUMLAH", 10, h - 16);
    c.textAlign = "right";
    c.fillText("RM12.90", w - 10, h - 16);
  }, true);
}

function customerDisplay(): THREE.Mesh {
  return canvasPlane(0.26, 0.1, 160, (c, w, h) => {
    c.fillStyle = "#0e2a1c";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#6dff9e";
    c.font = '700 26px "Courier New", monospace';
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("RM 12.90", w / 2, h / 2 + 1);
  }, true);
}

function qrStandee(): THREE.Mesh {
  return canvasPlane(0.22, 0.3, 160, (c, w, h) => {
    c.fillStyle = "#e8333f";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffffff";
    c.font = font(17);
    c.textAlign = "center";
    c.fillText("IMBAS & BAYAR", w / 2, 26);
    // fictional QR-like pattern
    c.fillRect(30, 40, w - 60, w - 60);
    const s = (w - 76) / 9;
    let seed = 5;
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++) {
        seed = (seed * 9301 + 49297) % 233280;
        const corner = (i < 3 && j < 3) || (i > 5 && j < 3) || (i < 3 && j > 5);
        if (corner ? (i % 2 === 0 || j % 2 === 0) && !(i === 1 && j === 1) : seed / 233280 > 0.5) {
          c.fillStyle = "#23262d";
          c.fillRect(38 + i * s, 48 + j * s, s, s);
        }
      }
    c.fillStyle = "#ffffff";
    c.font = font(15, 800);
    c.fillText("📱 QR Pay", w / 2, h - 14);
  });
}

/** Glass candy jar with coloured sweets. */
function candyJar(color: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 16), mat(0xe6f6ff, { transparent: true, opacity: 0.35 })), 0, 0.12, 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 16), mat(color)), 0, 0.26, 0));
  const colors = [0xe8333f, 0xf9c833, 0x2fb38a, 0x3b8ff0, 0xbb6bd9, 0xf5973f];
  const sweet = new THREE.SphereGeometry(0.025, 8, 6);
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39 + seed;
    const r = 0.06 * Math.sqrt((i % 6) / 6);
    g.add(at(new THREE.Mesh(sweet, mat(colors[(i + seed) % colors.length])), Math.cos(a) * r, 0.03 + Math.floor(i / 6) * 0.045, Math.sin(a) * r));
  }
  return g;
}

/** Plastic carrier bag with two handles. */
function plasticBag(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(rbox(0.3, 0.32, 0.16, color, 0.06), 0, 0, 0));
  for (const x of [-0.08, 0.08]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), mat(color));
    g.add(at(handle, x, 0.32, 0));
  }
  return g;
}

export function cashierCounter(group: THREE.Group, x: number, z: number): void {
  const g = new THREE.Group();
  // body, wooden top, trim
  g.add(at(rbox(6, 0.95, 0.8, 0xe8ecf1, 0.08), 0, 0, 0));
  g.add(at(rbox(6.1, 0.06, 0.9, 0xd9a86c, 0.05), 0, 0.95, 0));
  g.add(at(cube(6, 0.12, 0.82, 0x2fb38a), 0, 0.12, 0));
  g.add(at(frontPanel(), 0, 0.57, 0.405));

  // conveyor with belt seams and a "next customer" divider
  g.add(at(rbox(2.6, 0.06, 0.5, 0x3a4252, 0.04), 0.8, 1.0, 0.05));
  for (let i = 0; i < 9; i++) g.add(at(cube(0.02, 0.01, 0.48, 0x6b7586), -0.4 + i * 0.3, 1.065, 0.05));
  const divider = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 3).rotateX(Math.PI / 2), mat(0xf9c833));
  g.add(at(divider, 1.5, 1.1, 0.05));
  // a few items riding the belt
  g.add(at(rbox(0.14, 0.18, 0.1, 0xe8333f, 0.03), 0.4, 1.07, 0.05));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.13, 12), mat(0xc98a4b)), 0.75, 1.13, 0.1));
  g.add(at(rbox(0.2, 0.08, 0.12, 0xf9c833, 0.03), 1.0, 1.07, 0.0));

  // flatbed scanner with glowing laser line
  g.add(at(rbox(0.38, 0.06, 0.38, 0x2b3240, 0.04), -1.1, 0.99, 0));
  g.add(at(cube(0.3, 0.01, 0.3, 0x5f7a8f), -1.1, 1.055, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.025), new THREE.MeshBasicMaterial({ color: 0xff3b3b })), -1.1, 1.065, 0));

  // POS: base, cashier screen (faces -z), customer display (faces +z), cash drawer
  g.add(at(rbox(0.55, 0.12, 0.45, 0x3a4252, 0.04), -2.25, 0.99, -0.05));
  g.add(at(rbox(0.6, 0.14, 0.5, 0x2b3240, 0.03), -2.25, 0.8, -0.24)); // cash drawer
  g.add(at(cube(0.06, 0.22, 0.06, 0x3a4252), -2.25, 1.2, -0.05));
  const screenBack = cube(0.5, 0.34, 0.04, 0x23262d);
  screenBack.rotation.x = 0.2;
  g.add(at(screenBack, -2.25, 1.42, -0.08));
  const screen = posScreen();
  screen.rotation.y = Math.PI;
  screen.rotation.x = 0.2; // same lean as the housing (x rotation applies after the flip)
  g.add(at(screen, -2.25, 1.42, -0.105));
  g.add(at(cube(0.3, 0.13, 0.05, 0x23262d), -2.25, 1.22, 0.14));
  g.add(at(customerDisplay(), -2.25, 1.22, 0.166));
  // keyboard for the cashier
  g.add(at(rbox(0.4, 0.03, 0.14, 0x23262d, 0.01), -2.25, 0.99, -0.32));

  // receipt printer with a curl of paper
  g.add(at(rbox(0.2, 0.14, 0.24, 0xeef2f6, 0.04), -1.75, 0.99, -0.12));
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
  paper.rotation.x = -0.6;
  g.add(at(paper, -1.75, 1.18, -0.04));

  // card terminal on the customer side, QR standee
  g.add(at(rbox(0.12, 0.05, 0.2, 0x23262d, 0.02), -1.6, 0.99, 0.25));
  g.add(at(cube(0.09, 0.005, 0.06, 0x9fe8ff), -1.6, 1.045, 0.2));
  for (let i = 0; i < 9; i++) g.add(at(cube(0.022, 0.006, 0.018, 0xc9d2dc), -1.63 + (i % 3) * 0.03, 1.045, 0.26 + Math.floor(i / 3) * 0.025));
  const qr = qrStandee();
  qr.rotation.x = -0.15;
  g.add(at(qr, -0.62, 1.15, 0.3));
  g.add(at(cube(0.2, 0.03, 0.1, 0x23262d), -0.62, 0.99, 0.3));

  // candy jars and a service bell at the customer end
  [0xe8333f, 0x2fb38a, 0xf9c833].forEach((c, i) => g.add(at(candyJar(c, i * 3), 2.3 + i * 0.24, 0.98, 0.18)));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf2c94c)), 2.9, 0.98, -0.15));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12), mat(0x3a4252)), 2.9, 0.98, -0.15));

  // plastic bags ready on the cashier side
  g.add(at(plasticBag(0xffffff), 2.35, 0.98, -0.25));
  g.add(at(plasticBag(0xd8f3e8), 2.7, 0.98, -0.27));

  group.add(at(g, x, 0, z));

  // cashier stool behind the till
  const stool = new THREE.Group();
  stool.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), mat(0xe8333f)), 0, 0.68, 0));
  stool.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.64, 8), mat(0x9aa6b5)), 0, 0.34, 0));
  stool.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 16).rotateX(Math.PI / 2), mat(0x9aa6b5)), 0, 0.3, 0));
  stool.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), mat(0x9aa6b5)), 0, 0.015, 0));
  group.add(at(stool, x - 2.4, 0, z - 0.85));

  // little sweets rack at the end of the counter (impulse buys)
  const rack = new THREE.Group();
  for (const sx of [-0.25, 0.25]) rack.add(at(cube(0.03, 1.2, 0.03, 0x9aa6b5), sx, 0.6, 0));
  for (let r = 0; r < 4; r++) {
    rack.add(at(cube(0.55, 0.02, 0.22, 0x9aa6b5), 0, 0.3 + r * 0.25, 0));
    for (let i = 0; i < 4; i++)
      rack.add(at(rbox(0.1, 0.14, 0.06, [0xe8333f, 0xf9c833, 0xbb6bd9, 0x2fb38a, 0x3b8ff0][(i + r) % 5], 0.02), -0.18 + i * 0.12, 0.31 + r * 0.25, 0.04));
  }
  group.add(at(rack, x + 3.35, 0, z + 0.5, -Math.PI / 2));
}
