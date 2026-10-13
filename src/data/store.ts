import type { ShelfId } from "./products";

// Floor plan of the mini mart (world units). Portrait, like a phone screen:
//
//   [ shelf ][ shelf ][ shelf ]     <- back wall: bakery, dairy, drinks
//   [ shelf ]          [ shelf ]    <- middle aisle: snacks, fruit
//
//   [====== counter ======]  queue
//          entrance

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}

export const WORLD = { width: 420, height: 720 };
export const WALL = 18;
export const PLAYER_RADIUS = 12;

export interface ShelfDef {
  id: ShelfId;
  rect: Rect;
  /** Where the player stands to take items. */
  front: Point;
}

const shelf = (id: ShelfId, x: number, y: number, w: number, h: number): ShelfDef => ({
  id,
  rect: { x, y, width: w, height: h },
  front: { x: x + w / 2, y: y + h + 22 },
});

export const SHELVES: ShelfDef[] = [
  shelf("bakery", 34, 70, 104, 46),
  shelf("dairy", 158, 70, 104, 46),
  shelf("drinks", 282, 70, 104, 46),
  shelf("snacks", 34, 230, 140, 46),
  shelf("fruit", 246, 230, 140, 46),
];

/** Cashier side of the counter (where the player stands) and the customer side. */
export const COUNTER: Rect = { x: 60, y: 430, width: 300, height: 44 };
export const COUNTER_SPOT: Point = { x: 210, y: 410 };
export const SERVE_SPOT: Point = { x: 210, y: 520 };
export const QUEUE_SPOTS: Point[] = [SERVE_SPOT, { x: 210, y: 572 }, { x: 210, y: 624 }];
export const DOOR: Point = { x: 210, y: 700 };

/** Solid areas: walls, shelves and the counter (the door gap at the bottom stays open). */
export function solids(): Rect[] {
  const { width: W, height: H } = WORLD;
  return [
    { x: 0, y: 0, width: W, height: WALL + 34 }, // back wall (with its painted face)
    { x: 0, y: 0, width: WALL, height: H },
    { x: W - WALL, y: 0, width: WALL, height: H },
    { x: 0, y: H - WALL, width: 160, height: WALL },
    { x: 260, y: H - WALL, width: W - 260, height: WALL },
    ...SHELVES.map((s) => s.rect),
    COUNTER,
  ];
}
