// Phase 1.5 utilities: lighting zones, their wall switches and fixtures, the air-conditioners
// and the electrical cabinet. World units as in rooms.ts (x right, z towards the entrance).

import type { Rect } from "./rooms";

export type ZoneId = "main" | "fridge" | "storage" | "office" | "rest" | "toilet" | "surau" | "utility";
export type Facing = "south" | "north" | "east" | "west";

export interface WallSpot {
  x: number;
  y: number;
  z: number;
  /** Direction the device's front looks. */
  face: Facing;
  /** Where the player stands to use it. */
  ix: number;
  iz: number;
}

export interface ZoneDef {
  id: ZoneId;
  label: string;
  icon: string;
  /** Floor area lit by this zone (used for dimming and for "which zone am I in"). */
  rects: Rect[];
  /** Ceiling light fixtures (x, z). */
  fixtures: [number, number][];
  /** Wall switch next to the zone's door. */
  switchAt: WallSpot;
  /** Can a simulated power trip cut this zone? (fridge area is on its own protected circuit) */
  tripable: boolean;
}

const aisleLights: [number, number][] = [];
for (const x of [3.9, 8.5, 13, 16.8]) for (const z of [12, 15, 18]) aisleLights.push([x, z]);

export const ZONES: ZoneDef[] = [
  {
    id: "main",
    label: "Kedai Utama",
    icon: "🏪",
    rects: [
      { x: 0, z: 7, w: 19, d: 3 }, // back corridor
      { x: 2, z: 10, w: 16, d: 20 }, // aisles, cashier, entrance
      { x: 0, z: 19, w: 2, d: 11 }, // front left
      { x: 18, z: 23, w: 6, d: 7 }, // dining corner
    ],
    fixtures: [...aisleLights, [5, 24.5], [5, 27.5], [12, 24.5], [12, 27.5], [16, 27.5], [20.5, 25.5], [22, 28.2], [4, 8.5], [10, 8.5], [16, 8.5]],
    switchAt: { x: 7.5, y: 0.95, z: 29.88, face: "north", ix: 7.5, iz: 29.15 },
    tripable: true,
  },
  {
    id: "fridge",
    label: "Kawasan Peti Sejuk",
    icon: "🧊",
    rects: [{ x: 0, z: 10, w: 2, d: 9 }],
    fixtures: [[1, 12.5], [1, 16.5], [2.6, 12], [2.6, 15], [2.6, 18]],
    switchAt: { x: 1.95, y: 1.3, z: 9.88, face: "north", ix: 1.95, iz: 9.25 },
    tripable: false,
  },
  {
    id: "storage",
    label: "Stor",
    icon: "📦",
    rects: [{ x: 0, z: 0, w: 8, d: 7 }],
    fixtures: [[2.5, 3.5], [5.5, 3.5]],
    switchAt: { x: 3.25, y: 1.3, z: 7.12, face: "south", ix: 3.25, iz: 7.75 },
    tripable: true,
  },
  {
    id: "office",
    label: "Pejabat",
    icon: "📋",
    rects: [{ x: 8, z: 0, w: 8, d: 7 }],
    fixtures: [[12, 3.5]],
    switchAt: { x: 10.85, y: 1.3, z: 7.12, face: "south", ix: 10.85, iz: 7.75 },
    tripable: true,
  },
  {
    id: "rest",
    label: "Bilik Rehat",
    icon: "☕",
    rects: [{ x: 16, z: 0, w: 8, d: 7 }],
    fixtures: [[20, 3.5]],
    switchAt: { x: 16.05, y: 1.3, z: 7.12, face: "south", ix: 16.05, iz: 7.75 },
    tripable: true,
  },
  {
    id: "toilet",
    label: "Tandas",
    icon: "🚻",
    rects: [{ x: 18, z: 17, w: 6, d: 6 }],
    fixtures: [[21, 20]],
    switchAt: { x: 17.88, y: 1.3, z: 18.6, face: "west", ix: 17.25, iz: 18.6 },
    tripable: true,
  },
  {
    id: "surau",
    label: "Surau",
    icon: "🕌",
    rects: [{ x: 18, z: 10, w: 6, d: 7 }],
    fixtures: [[21, 13.5]],
    switchAt: { x: 17.88, y: 1.3, z: 12.3, face: "west", ix: 17.25, iz: 12.3 },
    tripable: true,
  },
  {
    id: "utility",
    label: "Bilik Utiliti",
    icon: "⚡",
    rects: [{ x: 19, z: 7, w: 5, d: 3 }],
    fixtures: [[21.5, 8.5]],
    switchAt: { x: 18.88, y: 1.3, z: 7.5, face: "west", ix: 18.3, iz: 7.5 },
    tripable: true,
  },
];

export const getZone = (id: ZoneId) => ZONES.find((z) => z.id === id)!;

/** The lighting zone containing a floor point. */
export function zoneAt(x: number, z: number): ZoneId | null {
  for (const zone of ZONES)
    for (const r of zone.rects) if (x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d) return zone.id;
  return null;
}

/** Wall-mounted air-conditioners in the main shop (all on the "main" circuit). */
export const AC_UNITS: { x: number; y: number; z: number; face: Facing }[] = [
  { x: 0.12, y: 2.2, z: 22, face: "east" },
  { x: 17.88, y: 2.2, z: 16.6, face: "west" },
  { x: 21.75, y: 2.25, z: 23.12, face: "south" },
];

/** AC wall controller beside the till (staff side). */
export const AC_CONTROLLER: WallSpot = { x: 0.11, y: 1.35, z: 23.5, face: "east", ix: 0.8, iz: 23.5 };

/** Closed distribution cabinet in the utility room. */
export const CABINET: WallSpot = { x: 23.72, y: 0, z: 8.5, face: "west", ix: 22.9, iz: 8.5 };

export const AC_MIN = 22;
export const AC_MAX = 28;
