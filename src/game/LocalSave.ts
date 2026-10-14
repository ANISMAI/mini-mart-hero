import type { RoomId } from "../data/rooms";

// LocalSave: player position, facing, camera and visited rooms in localStorage. Anything
// unreadable is ignored and the game starts at the entrance.

const KEY = "mini-market-hero-save-v1";

export interface SaveData {
  version: 1;
  x: number;
  z: number;
  facing: number;
  cam: { yaw: number; pitch: number; distance: number };
  visited: RoomId[];
  /** Career level (product unlocks). */
  level: number;
  prefs: { reducedMotion: boolean };
}

export function loadSave(): SaveData | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!s || s.version !== 1) return null;
    const nums = [s.x, s.z, s.facing, s.cam?.yaw, s.cam?.pitch, s.cam?.distance];
    if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    const level = Number.isInteger(s.level) && s.level >= 1 && s.level <= 99 ? s.level : 1;
    return { ...s, level, visited: Array.isArray(s.visited) ? s.visited : [], prefs: { reducedMotion: !!s.prefs?.reducedMotion } };
  } catch {
    return null;
  }
}

export function writeSave(d: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // storage unavailable (private mode): play continues unsaved
  }
}
