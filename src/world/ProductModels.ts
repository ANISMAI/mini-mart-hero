import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { imageUrl, type CatalogItem, type Shape } from "../data/catalog";
import { mat } from "./kit";

// Placeholder product models: each catalog Shape is a few primitives with a printed label
// (canvas texture: colour, icon and name). Items are instanced, so a full shelf costs a few
// draw calls per product. To use real art later, swap modelOf() for a glTF looked up by
// item.modelKey; the shelf filling code stays the same.

/** Material roles; "labelBox" / "labelCyl" put the printed label on a box's front/back or a cylinder's side. */
type Role = "labelBox" | "labelCyl" | "label" | "body" | "accent" | "cap" | "white" | "silver" | "clear";
interface Part {
  geo: THREE.BufferGeometry;
  role: Role;
}

/** Models are authored near real size and scaled up a little to read well in the cute style. */
const S = 1.8;
/** Tiny items (butter, yogurt, tins) are enlarged towards this height (unscaled metres), at most 2×. */
const MIN_H = 0.16;
const MAX_BOOST = 2.4;
/** Per-shape size overrides when the rule above isn't enough. */
const SHAPE_BOOST: Partial<Record<Shape, number>> = { brick: 2.2, tissueRolls: 2 };

const box = (w: number, h: number, d: number, y: number, role: Role = "labelBox", x = 0, z = 0): Part => ({
  geo: new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z),
  role,
});
const cyl = (rTop: number, rBot: number, h: number, y: number, role: Role = "labelCyl", x = 0, z = 0, seg = 14): Part => ({
  geo: new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y + h / 2, z),
  role,
});

const SHAPES: Record<Shape, () => Part[]> = {
  bottle: () => [cyl(0.034, 0.034, 0.15, 0), cyl(0.014, 0.034, 0.05, 0.15, "clear"), cyl(0.016, 0.016, 0.025, 0.2, "cap")],
  bigBottle: () => [cyl(0.05, 0.05, 0.2, 0), cyl(0.02, 0.05, 0.05, 0.2, "body"), cyl(0.022, 0.022, 0.03, 0.25, "cap")],
  can: () => [cyl(0.033, 0.033, 0.115, 0), cyl(0.028, 0.033, 0.01, 0.115, "silver")],
  carton: () => [
    box(0.07, 0.17, 0.07, 0),
    { geo: new THREE.CylinderGeometry(0, 0.0495, 0.04, 4).rotateY(Math.PI / 4).translate(0, 0.19, 0), role: "white" },
    cyl(0.012, 0.012, 0.014, 0.19, "cap", 0.015, 0.012, 10),
  ],
  smallCarton: () => [box(0.06, 0.12, 0.04, 0), cyl(0.004, 0.004, 0.05, 0.12, "white", 0.016, 0, 6)],
  cup: () => [cyl(0.042, 0.033, 0.075, 0), cyl(0.044, 0.044, 0.006, 0.075, "silver")],
  slab: () => [box(0.11, 0.11, 0.025, 0)],
  brick: () => [box(0.1, 0.05, 0.06, 0)],
  tubeBox: () => [box(0.18, 0.045, 0.045, 0)],
  card: () => [box(0.06, 0.2, 0.018, 0), box(0.012, 0.15, 0.008, 0.025, "accent", 0, 0.012)],
  pump: () => [cyl(0.035, 0.035, 0.13, 0), cyl(0.012, 0.012, 0.035, 0.13, "white"), box(0.012, 0.012, 0.04, 0.155, "white", 0, 0.015)],
  flatBottle: () => [box(0.075, 0.17, 0.04, 0), cyl(0.015, 0.015, 0.025, 0.17, "cap")],
  spray: () => [cyl(0.035, 0.035, 0.15, 0), box(0.03, 0.045, 0.065, 0.15, "white", 0, 0.012), box(0.012, 0.035, 0.012, 0.13, "white", 0, 0.04)],
  pack: () => [box(0.13, 0.07, 0.09, 0)],
  jug: () => [box(0.12, 0.2, 0.08, 0), cyl(0.02, 0.02, 0.025, 0.2, "cap", 0.03), box(0.025, 0.08, 0.035, 0.11, "body", -0.04)],
  sponge: () => [box(0.09, 0.035, 0.06, 0, "body"), box(0.09, 0.012, 0.06, 0.035, "accent")],
  rollBox: () => [box(0.12, 0.07, 0.07, 0)],
  tissueRolls: () => [
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => cyl(0.045, 0.045, 0.1, 0, "white", x * 0.047, z * 0.047))),
    box(0.19, 0.035, 0.19, 0.035),
  ],
  loaf: () => [
    box(0.2, 0.07, 0.1, 0),
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.2, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0.07, 0), role: "body" },
  ],
  noodles: () => [box(0.18, 0.1, 0.11, 0)],
  sack: () => [box(0.2, 0.27, 0.09, 0), cyl(0.02, 0.03, 0.03, 0.27, "accent")],
  bag: () => [box(0.09, 0.15, 0.055, 0), box(0.09, 0.02, 0.04, 0.15, "body")],
  jar: () => [cyl(0.03, 0.03, 0.09, 0), cyl(0.032, 0.032, 0.02, 0.09, "cap")],
  eggs: () => [
    box(0.22, 0.05, 0.1, 0, "body"),
    ...[0, 1, 2, 3, 4].flatMap((i) =>
      [-1, 1].map((r) => ({ geo: new THREE.SphereGeometry(0.02, 8, 6).scale(1, 1.25, 1).translate(-0.08 + i * 0.04, 0.055, r * 0.024), role: "accent" as Role }))
    ),
  ],
  tin: () => [cyl(0.045, 0.045, 0.035, 0), cyl(0.045, 0.045, 0.035, 0.036)],
  beans: () => [cyl(0.037, 0.037, 0.1, 0), cyl(0.038, 0.038, 0.006, 0.1, "silver"), cyl(0.038, 0.038, 0.006, 0, "silver")],
  chipBag: () => [
    { geo: new THREE.SphereGeometry(0.1, 14, 10).scale(0.9, 1.25, 0.38).translate(0, 0.125, 0), role: "label" },
    box(0.15, 0.014, 0.025, 0.24, "body"),
  ],
  bar: () => [box(0.05, 0.15, 0.016, 0)],
  biscuitBox: () => [box(0.1, 0.16, 0.05, 0)],
  canister: () => [cyl(0.035, 0.035, 0.2, 0), cyl(0.037, 0.037, 0.012, 0.2, "accent")],
  pouch: () => [box(0.1, 0.14, 0.022, 0), box(0.1, 0.012, 0.024, 0.14, "accent")],
  crackers: () => [box(0.16, 0.06, 0.06, 0)],
};

// ---------- printed labels ----------

const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const labelMats = new Map<string, THREE.MeshLambertMaterial>();

function labelMaterial(p: CatalogItem): THREE.MeshLambertMaterial {
  let m = labelMats.get(p.id);
  if (m) return m;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = css(p.color);
  c.fillRect(0, 0, 128, 128);
  c.fillStyle = css(p.accent);
  c.fillRect(0, 0, 128, 16);
  c.fillRect(0, 116, 128, 12);
  c.font = '42px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(p.icon, 64, 50);
  c.fillStyle = "rgba(255,255,255,0.92)";
  c.beginPath();
  c.roundRect(8, 78, 112, 32, 8);
  c.fill();
  c.fillStyle = "#23364f";
  const text = p.name.replace(/ \(.*\)/, "");
  let size = 20;
  do c.font = `900 ${size--}px Nunito, "Segoe UI", system-ui, sans-serif`;
  while (c.measureText(text).width > 106 && size > 9);
  c.fillText(text, 64, 95);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  m = new THREE.MeshLambertMaterial({ map: tex });
  labelMats.set(p.id, m);
  return m;
}

function materialFor(role: Role, p: CatalogItem): THREE.Material | THREE.Material[] {
  const body = mat(p.color);
  switch (role) {
    case "labelBox": // +x, -x, +y, -y, +z (front), -z (back)
      return [body, body, body, body, labelMaterial(p), labelMaterial(p)];
    case "labelCyl": // side, top, bottom
      return [labelMaterial(p), body, body];
    case "label":
      return labelMaterial(p);
    case "body":
      return body;
    case "accent":
    case "cap":
      return mat(p.accent);
    case "white":
      return mat(0xffffff);
    case "silver":
      return mat(0xc9d2dc);
    case "clear":
      return mat(0xd8f1ff, { transparent: true, opacity: 0.7 });
  }
}

interface Model {
  parts: { geo: THREE.BufferGeometry; role: Role }[];
  /** Footprint (unscaled): width along local x, depth along local z, height. */
  w: number;
  d: number;
  h: number;
}
const models = new Map<Shape, Model>();

/** Parts of a shape, with plain-colour parts of the same role merged to save draw calls. */
function modelOf(shape: Shape): Model {
  let m = models.get(shape);
  if (m) return m;
  const raw = SHAPES[shape]();
  const parts: Model["parts"] = [];
  const byRole = new Map<Role, THREE.BufferGeometry[]>();
  for (const p of raw) {
    if (p.role.startsWith("label")) parts.push(p);
    else byRole.set(p.role, [...(byRole.get(p.role) ?? []), p.geo]);
  }
  for (const [role, geos] of byRole) {
    for (const g of geos) g.clearGroups();
    parts.push({ geo: geos.length > 1 ? mergeGeometries(geos)! : geos[0], role });
  }
  const bounds = new THREE.Box3();
  for (const p of raw) {
    p.geo.computeBoundingBox();
    bounds.union(p.geo.boundingBox!);
  }
  const size = bounds.getSize(new THREE.Vector3());
  m = { parts, w: size.x, d: size.z, h: size.y };
  models.set(shape, m);
  return m;
}

// ---------- shelf filling ----------

/** One shelf board: products stand on it at height y, spread along z, front edge at xFront facing `face`. */
export interface ShelfRun {
  y: number;
  z0: number;
  z1: number;
  xFront: number;
  xBack: number;
  /** +1: product fronts face +x; -1: face -x. */
  face: 1 | -1;
  /** Clear height above the board; products are shrunk to fit. */
  maxH: number;
}

/**
 * Fills shelf runs with products, like a real shop: each product gets one block of facings
 * (rows side by side, a few deep), blocks follow each other along the boards.
 */
/** Where a product sits on its shelf (parent-local): middle of its front facings, and which way they face. */
export interface ProductSpot {
  sku: string;
  x: number;
  y: number;
  z: number;
  face: 1 | -1;
}

export function fillShelf(parent: THREE.Object3D, items: CatalogItem[], runs: ShelfRun[]): ProductSpot[] {
  const spots: ProductSpot[] = [];
  if (!items.length || !runs.length) return spots;
  const lens = runs.map((r) => r.z1 - r.z0);
  const total = lens.reduce((a, b) => a + b, 0);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  // each product's share of the boards follows its width, so big items still get several facings
  const want = (item: CatalogItem) => {
    const m = modelOf(item.shape);
    return S * (SHAPE_BOOST[item.shape] ?? Math.min(MAX_BOOST, Math.max(1, MIN_H / m.h)));
  };
  const weights = items.map((it) => modelOf(it.shape).w * want(it) + 0.012);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const share = weights.map((wt) => (wt / weightSum) * total);
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  items.forEach((item, i) => {
    const model = modelOf(item.shape);
    const target = want(item);
    const start = share.slice(0, i).reduce((a, b) => a + b, 0);
    const end = start + share[i];

    /**
     * Facings for a footprint (unscaled width fw, row spacing fd, height fh): side by side along
     * the boards, `maxRows` deep, each as big as wanted but never taller than the board allows.
     */
    const layout = (fw: number, fd: number, fh: number, gap: number, maxRows: number): THREE.Matrix4[] => {
      const out: THREE.Matrix4[] = [];
      let u = start;
      while (u < end) {
        const r = starts.findIndex((s, k) => u >= s - 1e-6 && u < s + lens[k]);
        if (r < 0) break;
        const run = runs[r];
        const k = Math.min(target, run.maxH / fh);
        const w = fw * k + gap;
        const d = fd * k;
        if (u + w > end + 1e-6) break;
        if (u + w > starts[r] + lens[r]) {
          u = starts[r] + lens[r]; // doesn't fit on this board: continue on the next one
          continue;
        }
        const z = run.z0 + (u - starts[r]) + w / 2;
        const rows = Math.max(1, Math.min(maxRows, Math.floor(Math.abs(run.xFront - run.xBack) / d)));
        q.setFromAxisAngle(up, (run.face * Math.PI) / 2);
        const scale = new THREE.Vector3(k, k, k);
        for (let row = 0; row < rows; row++) {
          const x = run.xFront - run.face * (d / 2 + row * d);
          out.push(new THREE.Matrix4().compose(new THREE.Vector3(x, run.y, z), q, scale));
        }
        u += w;
      }
      return out;
    };

    const matrices = layout(model.w, model.d + 0.01 / S, model.h, 0.012, 3);
    if (!matrices.length) return;
    // pickup spot: middle of the front facings on the product's first board
    const first = new THREE.Vector3().setFromMatrixPosition(matrices[0]);
    const run = runs.find((r) => Math.abs(r.y - first.y) < 1e-4 && first.z >= r.z0 - 1e-4 && first.z <= r.z1 + 1e-4) ?? runs[0];
    const zs = matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m)).filter((p) => Math.abs(p.y - first.y) < 1e-4).map((p) => p.z);
    spots.push({ sku: item.id, x: run.xFront, y: run.y, z: (Math.min(...zs) + Math.max(...zs)) / 2, face: run.face });
    const placeholders: THREE.InstancedMesh[] = [];
    for (const part of model.parts) {
      const inst = new THREE.InstancedMesh(part.geo, materialFor(part.role, item), matrices.length);
      matrices.forEach((m, k) => inst.setMatrixAt(k, m));
      inst.userData.sku = item.id;
      parent.add(inst);
      placeholders.push(inst);
    }
    // a product picture, if one exists, replaces the placeholder with a slim cut-out solid,
    // re-laid out for the picture's own width: tight side by side and several rows deep
    loadPicture(item).then((pic) => {
      if (!pic) return;
      let h = model.h;
      let w = h * pic.aspect;
      if (w > model.w * 1.15) {
        w = model.w * 1.15;
        h = w / pic.aspect;
      }
      const depth = Math.min(model.d * 0.35, 0.03);
      const rowGap = Math.max(depth * 1.8, 0.035);
      const placed = layout(w, rowGap, h, 0.006, 6);
      if (!placed.length) return;
      const solid = new THREE.InstancedMesh(cutoutSolid(pic, w, h, depth), pictureMaterials(item, pic), placed.length);
      placed.forEach((m, k) => solid.setMatrixAt(k, m));
      solid.userData.sku = item.id;
      parent.add(solid);
      for (const p of placeholders) p.visible = false;
    });
  });
  return spots;
}

// ---------- product pictures (public/products/<iconKey>.webp) ----------

/** A loaded picture: cropped texture, its outline (u,v in 0..1, from the alpha) and side colour. */
interface Picture {
  tex: THREE.Texture;
  aspect: number;
  outline: THREE.Vector2[];
  side: THREE.Color;
}

const pictures = new Map<string, Promise<Picture | null>>();
const pictureMats = new Map<string, THREE.Material[]>();
const solids = new Map<string, THREE.BufferGeometry>();

function loadPicture(p: CatalogItem): Promise<Picture | null> {
  let req = pictures.get(p.iconKey);
  if (!req) {
    req = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(readPicture(img));
      img.onerror = () => resolve(null); // no picture yet: keep the placeholder model
      img.src = imageUrl(p);
    });
    pictures.set(p.iconKey, req);
  }
  return req;
}

/**
 * Crops the transparent margin (scaled to at most 256 px tall), traces the product's outline
 * row by row from the alpha channel and takes the average colour for the sides.
 */
function readPicture(img: HTMLImageElement): Picture {
  const src = document.createElement("canvas");
  src.width = img.naturalWidth;
  src.height = img.naturalHeight;
  const sc = src.getContext("2d", { willReadFrequently: true })!;
  sc.drawImage(img, 0, 0);
  const full = sc.getImageData(0, 0, src.width, src.height);
  const solidAt = (d: ImageData, x: number, y: number) => d.data[(y * d.width + x) * 4 + 3] > 40;
  let x0 = full.width, y0 = full.height, x1 = -1, y1 = -1;
  for (let y = 0; y < full.height; y++)
    for (let x = 0; x < full.width; x++)
      if (solidAt(full, x, y)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, full.width - 1, full.height - 1];
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const k = Math.min(1, 256 / ch);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k));
  out.height = Math.max(1, Math.round(ch * k));
  const oc = out.getContext("2d", { willReadFrequently: true })!;
  oc.drawImage(src, x0, y0, cw, ch, 0, 0, out.width, out.height);
  const data = oc.getImageData(0, 0, out.width, out.height);

  // outline: left edge top→bottom, then right edge bottom→top (fine for bottles, bags, boxes)
  const rows = 48;
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = Math.round((i / rows) * (data.height - 1));
    let a = -1, b = -1;
    for (let x = 0; x < data.width; x++) if (solidAt(data, x, y)) { if (a < 0) a = x; b = x; }
    if (a < 0) continue;
    const v = 1 - y / (data.height - 1);
    left.push(new THREE.Vector2(a / data.width, v));
    right.push(new THREE.Vector2((b + 1) / data.width, v));
  }
  const outline = left.length >= 2 ? [...left, ...right.reverse()] : [new THREE.Vector2(0, 1), new THREE.Vector2(0, 0), new THREE.Vector2(1, 0), new THREE.Vector2(1, 1)];

  let r = 0, g = 0, bl = 0, n = 0;
  for (let i = 0; i < data.data.length; i += 16)
    if (data.data[i + 3] > 200) {
      r += data.data[i];
      g += data.data[i + 1];
      bl += data.data[i + 2];
      n++;
    }
  const side = n ? new THREE.Color().setRGB(r / n / 255, g / n / 255, bl / n / 255, THREE.SRGBColorSpace).multiplyScalar(0.85) : new THREE.Color(0xcccccc);

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: out.width / out.height, outline, side };
}

/** The outline extruded to the item's depth: picture on front and back, plain colour sides. */
function cutoutSolid(pic: Picture, w: number, h: number, depth: number): THREE.BufferGeometry {
  const key = `${pic.tex.id}-${w.toFixed(4)}-${h.toFixed(4)}-${depth.toFixed(4)}`;
  let geo = solids.get(key);
  if (!geo) {
    // built in picture space (0..1) so the caps' UVs are the picture coordinates, then sized
    geo = new THREE.ExtrudeGeometry(new THREE.Shape(pic.outline), { depth: 1, bevelEnabled: false, curveSegments: 1 });
    geo.translate(-0.5, 0, -0.5).scale(w, h, depth);
    geo.computeVertexNormals();
    solids.set(key, geo);
  }
  return geo;
}

function pictureMaterials(p: CatalogItem, pic: Picture): THREE.Material[] {
  let m = pictureMats.get(p.iconKey);
  if (!m) {
    m = [new THREE.MeshLambertMaterial({ map: pic.tex, alphaTest: 0.3 }), new THREE.MeshLambertMaterial({ color: pic.side })];
    pictureMats.set(p.iconKey, m);
  }
  return m;
}
