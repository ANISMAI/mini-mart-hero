import * as THREE from "three";

// Small helpers for building the cute low-poly store: cached materials, rounded boxes, labels.

const mats = new Map<string, THREE.Material>();

/** Cheap matte material (Lambert), cached per colour. */
export function mat(color: number, opts: { transparent?: boolean; opacity?: number } = {}): THREE.Material {
  const key = `${color}-${opts.opacity ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
    mats.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function roundedBoxGeometry(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const key = `${w}|${h}|${d}|${r}`;
  const cached = geoCache.get(key);
  if (cached) return cached;
  r = Math.min(r, w / 2, d / 2);
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -d / 2 + r;
  shape.moveTo(x, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, y);
  shape.lineTo(w / 2, d / 2 - r);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(x, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, y);
  shape.quadraticCurveTo(-w / 2, -d / 2, x, -d / 2);
  const bevel = Math.min(r * 0.6, h / 4);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, h - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelSegments: 2,
    curveSegments: 3,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  geoCache.set(key, g);
  return g;
}

/** Rounded box sitting on y = 0 at its base, centred on x/z. */
export function rbox(w: number, h: number, d: number, color: number, r = 0.06): THREE.Mesh {
  return new THREE.Mesh(roundedBoxGeometry(w, h, d, r), mat(color));
}

/** Plain box centred on its middle. */
export function cube(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rotY = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  return o;
}

/**
 * Text label rendered to a canvas. `sprite` labels always face the camera (hanging aisle
 * signs); otherwise a flat plane (wall signs).
 */
export function label(
  text: string,
  opts: { bg?: string; fg?: string; width?: number; height?: number; sprite?: boolean; font?: number } = {}
): THREE.Object3D {
  const width = opts.width ?? 1.6;
  const height = opts.height ?? 0.42;
  const px = 256;
  const canvas = document.createElement("canvas");
  canvas.width = px * 2;
  canvas.height = Math.round((px * 2 * height) / width);
  const c = canvas.getContext("2d")!;
  const r = canvas.height * 0.3;
  c.fillStyle = opts.bg ?? "#23364f";
  c.beginPath();
  c.roundRect(4, 4, canvas.width - 8, canvas.height - 8, r);
  c.fill();
  c.lineWidth = 6;
  c.strokeStyle = "rgba(255,255,255,0.9)";
  c.stroke();
  c.fillStyle = opts.fg ?? "#ffffff";
  c.font = `900 ${opts.font ?? Math.round(canvas.height * 0.5)}px Nunito, "Segoe UI", system-ui, sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (opts.sprite) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.set(width, height, 1);
    return s;
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return m;
}

/** Soft round shadow blob on the floor (cheaper than real shadows). */
export function blob(radius: number, opacity = 0.22): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color: 0x1d2738, transparent: true, opacity, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  return m;
}
