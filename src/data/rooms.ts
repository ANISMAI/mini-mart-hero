// RoomRegistry: the single source of truth for store zones (id, name, bounds, safe spawn,
// map colour). World units are metres; x to the right, z towards the entrance (front).
//
//   z=0  ┌────────┬────────┬────────┐
//        │Storage │ Office │ Staff  │   back rooms (doors on their south walls)
//   z=7  ├─┐ ┌────┴──┐ ┌───┴─┐ ┌────┤
//        │      corridor           │
//   z=10 │ DRINKS GROCERY SNACKS ├─┤ Surau    (door on its west wall)
//        │   ║      ║       ║    │ ├─ Restroom
//   z=23 │ [cashier]  queue        │ open
//   z=30 └──────────[ doors ]──────┘   entrance

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Spawn {
  x: number;
  z: number;
  /** Facing angle (radians, 0 = towards -z / the back of the store). */
  yaw: number;
}

export type RoomId =
  | "entrance"
  | "cashier"
  | "queue"
  | "snacks"
  | "grocery"
  | "drinks"
  | "household"
  | "storage"
  | "office"
  | "rest"
  | "surau"
  | "restroom"
  | "chiller";

export interface RoomDef {
  id: RoomId;
  name: string;
  /** Shorter name for small map tiles (defaults to `name`). */
  short?: string;
  icon: string;
  /** Map / floor colour. */
  color: number;
  bounds: Rect;
  /** Safe point just inside the room's entrance (used by Go Here and corrupt-save reset). */
  spawn: Spawn;
  /** Enclosed rooms are drawn with walls; open zones are areas of the shop floor. */
  enclosed: boolean;
}

export const STORE = { w: 24, d: 30, wallH: 2.6, wall: 0.2 };
export const PLAYER_RADIUS = 0.35;

const N = 0; // facing the back of the store
const S = Math.PI; // facing the entrance
const E = -Math.PI / 2; // facing +x (east)

export const ROOMS: RoomDef[] = [
  { id: "entrance", name: "Entrance", icon: "🚪", color: 0xd9d3c9, enclosed: false, bounds: { x: 8, z: 25, w: 10, d: 5 }, spawn: { x: 12, z: 28, yaw: N } },
  { id: "cashier", name: "Cashier Counter", icon: "🧾", color: 0xf9c833, enclosed: false, bounds: { x: 1, z: 20.5, w: 8, d: 3 }, spawn: { x: 5, z: 20.9, yaw: S } },
  { id: "queue", name: "Customer Queue", icon: "🧍", color: 0xf5c99a, enclosed: false, bounds: { x: 1, z: 24, w: 7, d: 6 }, spawn: { x: 7.2, z: 26, yaw: N } },
  { id: "snacks", name: "Snacks Aisle", icon: "🍪", color: 0xf7b6c8, enclosed: false, bounds: { x: 13, z: 10, w: 5, d: 10 }, spawn: { x: 13.8, z: 19.3, yaw: N } },
  { id: "grocery", name: "Grocery Aisle", icon: "🍚", color: 0xa8e0cf, enclosed: false, bounds: { x: 8.5, z: 10, w: 4.5, d: 10 }, spawn: { x: 9.3, z: 19.3, yaw: N } },
  { id: "drinks", name: "Drinks (Peti Sejuk)", icon: "🧃", color: 0xbfe0f7, enclosed: false, bounds: { x: 2, z: 10, w: 2.6, d: 10 }, spawn: { x: 3.8, z: 19.3, yaw: N } },
  { id: "household", name: "Kelengkapan Rumah & Penjagaan Diri", short: "Rumah & Diri", icon: "🧴", color: 0xdcc8f2, enclosed: false, bounds: { x: 4.6, z: 10, w: 3.9, d: 10 }, spawn: { x: 5.2, z: 19.3, yaw: N } },
  { id: "storage", name: "Storage", icon: "📦", color: 0xf5dc96, enclosed: true, bounds: { x: 0, z: 0, w: 8, d: 7 }, spawn: { x: 4.5, z: 5.6, yaw: N } },
  { id: "office", name: "Manager Office", icon: "📋", color: 0xd9c8f2, enclosed: true, bounds: { x: 8, z: 0, w: 8, d: 7 }, spawn: { x: 12, z: 5.6, yaw: N } },
  { id: "rest", name: "Staff Rest Area", icon: "☕", color: 0xffcfb3, enclosed: true, bounds: { x: 16, z: 0, w: 8, d: 7 }, spawn: { x: 17, z: 5.6, yaw: N } },
  { id: "surau", name: "Surau", icon: "🕌", color: 0xb5dfc3, enclosed: true, bounds: { x: 18, z: 10, w: 6, d: 7 }, spawn: { x: 19.4, z: 13.5, yaw: E } },
  { id: "chiller", name: "Bilik Sejuk", icon: "❄️", color: 0xcfe9f7, enclosed: true, bounds: { x: 0, z: 10, w: 2, d: 9 }, spawn: { x: 1, z: 10.8, yaw: S } },
  { id: "restroom", name: "Tandas", icon: "🚻", color: 0xc9e6f5, enclosed: true, bounds: { x: 18, z: 17, w: 6, d: 6 }, spawn: { x: 19.4, z: 19.8, yaw: E } },
];

/** Door openings (gaps) in interior walls: the wall line and the gap span. */
export interface Door {
  room: RoomId;
  /** Wall orientation: "h" runs along x (at constant z), "v" along z (at constant x). */
  axis: "h" | "v";
  /** Constant coordinate of the wall line. */
  at: number;
  from: number;
  to: number;
}

export const DOORS: Door[] = [
  { room: "storage", axis: "h", at: 7, from: 3.6, to: 5.4 },
  { room: "office", axis: "h", at: 7, from: 11.1, to: 12.9 },
  { room: "rest", axis: "h", at: 7, from: 16.3, to: 18.1 },
  { room: "surau", axis: "v", at: 18, from: 12.6, to: 14.4 },
  { room: "restroom", axis: "v", at: 18, from: 18.9, to: 20.7 },
  { room: "chiller", axis: "h", at: 10, from: 0.35, to: 1.65 },
];

/** Main entrance gap in the front wall. */
export const ENTRANCE_GAP = { from: 10, to: 14 };

export function getRoom(id: RoomId): RoomDef {
  return ROOMS.find((r) => r.id === id)!;
}

/** The room containing a point (enclosed rooms first, then open zones). */
export function roomAt(x: number, z: number): RoomDef | null {
  const inside = (r: RoomDef) => x >= r.bounds.x && x <= r.bounds.x + r.bounds.w && z >= r.bounds.z && z <= r.bounds.z + r.bounds.d;
  return ROOMS.find((r) => r.enclosed && inside(r)) ?? ROOMS.find((r) => !r.enclosed && inside(r)) ?? null;
}
