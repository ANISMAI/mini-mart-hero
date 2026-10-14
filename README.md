# Mini Market Hero — Phase 1

Cute stylized **3D** grocery store with third-person exploration, built with
**Three.js + TypeScript + Vite** for mobile WebViews (portrait first, 390 × 844).
Phase 1 is the world and the 3D ↔ 2D mode-switching foundation; cashier and 2D puzzle rules
come in later phases.

## Setup

```bash
npm install
npm run dev      # dev server
npm run build    # production build into dist/
npm run preview  # preview the build
```

## Controls

| | Mobile | Desktop |
|---|---|---|
| Walk | floating joystick (touch anywhere lower-left) | WASD / arrow keys |
| Look | drag anywhere else on the 3D view | mouse drag |
| Zoom | pinch | mouse wheel |
| Interact | yellow button (appears near something) | E or Space |
| Map | tap the mini-map (top-right) | M |
| Pause / unstuck | ⏸ (top-left) | — |

## Store layout

```
z=0  ┌────────┬────────┬────────┐
     │Storage │ Office │ Staff  │   back rooms (doors to the corridor)
z=7  ├──┐ ┌───┴──┐ ┌───┴─┐ ┌────┤
     │       corridor            │
z=10 │▮▮ DRINKS GROCERY SNACKS  ├─┤ Surau     (door on its west wall)
     │▮▮  ║       ║       ║      │ ├─ Restroom (Tandas, accessible)
z=23 │ [ cashier ]   queue       │
z=30 └────────────[doors]────────┘ entrance (spawn)
```

Behind the drink coolers (left wall) is the **Bilik Sejuk** (chiller room, door from the back
corridor): the coolers have glass backs and staff top them up from inside, like a real kedai
runcit.

Rooms live in **`src/data/rooms.ts`** (`ROOMS`, the RoomRegistry): id, name, icon, bounds,
safe spawn (used by Go Here and by the corrupt-save reset) and map colour. Doorways are in
`DOORS`. The mini-map, full map, room toasts and fast travel all read from this one list.

## Project structure

```
src/
  main.ts                  boots the game
  game/Game.ts             StoreScene + loop; enterTaskMode / exitTaskMode / travelToRoom
  game/LocalSave.ts        position, facing, camera, visited rooms (localStorage, versioned)
  world/StoreBuilder.ts    builds the store, collision boxes, interactables, swing doors
  world/collisions.ts      WorldCollisions (circle vs boxes)
  world/kit.ts             materials, rounded boxes, canvas-text signs, blob shadows
  world/AmbientCustomer.ts 2 non-quest strolling customers
  player/Avatar.ts         cute primitive character with Idle / Walk animation
  player/PlayerController.ts  joystick / keyboard movement relative to the camera
  player/ThirdPersonCamera.ts follow cam: yaw/pitch/zoom limits, wall occlusion
  ui/HUD.ts                stats, floating joystick, look/zoom input, Interact, toasts
  ui/MiniMap.ts, ui/FullMap.ts   top-right map and full map with Go Here
  ui/Overlays.ts           OverlayController: cashier preview, 2D organizer (zoom), info, pause
  data/catalog.ts          master product catalog: 44 SKUs, prices, level unlocks, sections
  world/ProductModels.ts   placeholder product models (printed labels) + shelf filling
```

## Product catalog & level unlocks

All 44 products live in **`src/data/catalog.ts`** (one record per SKU: `id` such as `01-001`,
`name`, `category`, `priceCents`, `unlockLevel`, `shelfId`, `stock`, `shelfCapacity`,
`modelKey`, `iconKey`, `barcode`). The 3D shelves, the 2D organizer and (later) the cashier and
restock tasks all refer to items by this SKU id.

| Section | Items | Where |
|---|---|---|
| Minuman & Tenusu (`FRIDGE_A`) | 10 | glass-door coolers, left wall |
| Penjagaan Diri (`PERSONAL_A`) | 8 | purple shelf, cooler-side face |
| Kelengkapan Rumah (`HOUSEHOLD_A`) | 8 | purple shelf, grocery-side face |
| Barang Dapur (`GROCERY_A`) | 10 | green shelf |
| Snek (`SNACKS_A`) | 8 | pink shelf |

Unlocks: Lv 1 → 10 items, Lv 3 → 20, Lv 5 → 32, Lv 8 → 44. There is no progression system
yet: the career level is stored in the save (default 1), shelves show only unlocked items and
the organizer shows the rest as 🔒 locked previews. Add `?lv=8` (or 3, 5) to the URL to preview
another level without changing the save.

Items are everyday Malaysian kedai runcit goods under generic names (no real brands or logos).

**Product pictures:** drop `public/products/<folder>/<iconKey>.webp` (512 × 512, transparent
background, front view), e.g. `public/products/minuman-tenusu/teh-tarik-tin.webp`. Folders:
`minuman-tenusu`, `penjagaan-diri`, `kelengkapan-rumah`, `barang-dapur`, `snek`. When a picture exists it is used as the
organizer icon and as a standing cut-out on the shelves; otherwise the placeholder model
(`world/ProductModels.ts`, one shape per item with a printed label) is shown. Missing pictures
just log a 404 in the console. The `iconKey` of every item is in `src/data/catalog.ts`.

## Replacing models and textures

Everything is built from simple primitives in `world/StoreBuilder.ts` (one function per piece:
`buildShelf`, `buildFridge`, `buildRack`, counter, rooms…) and `player/Avatar.ts`. To use real
models, load a glTF (`GLTFLoader`) and add it at the same position; collision boxes are separate
(`solid(...)` calls), so models can change without touching gameplay. Floor tiles are a small
canvas texture (`makeTileTexture`); signs are canvas text (`label`).

## Performance notes

Lambert materials, no real-time shadows (blob shadows instead), instanced products (a few draw
calls per shelf), pixel ratio capped at 2 and lowered automatically if the frame rate stays
under 40 fps.

## Mobile WebView packaging

`npm run build` produces static files in `dist/`. Host them, or bundle them in the app and load
`index.html` in Android `WebView` / iOS `WKWebView` (enable JavaScript and DOM storage on
Android). The page handles safe areas and disables page zoom/scroll. The only network request
is the optional Nunito font (Google Fonts); remove it in `index.html` for fully offline use.

## Phase 1 QA checklist

- [x] `npm run build` succeeds (TypeScript strict).
- [x] Every room's spawn point checked by hand against the collision boxes (cashier spawn fixed).
- [ ] Walk entrance → cashier, 3 aisles, storage, office, staff rest, restroom, surau.
- [ ] Joystick on a phone; WASD + mouse on desktop; camera drag/zoom doesn't block buttons.
- [ ] Mini-map follows the avatar; full map → Go Here lands at each room's door.
- [ ] Cashier overlay opens/closes; avatar and camera unchanged afterwards.
- [ ] Organizer preview opens from a shelf and from storage, zoom works, returns to 3D.
- [ ] Restroom and surau reachable, signed, on both maps; doors swing open.
- [ ] Reload restores position; clearing / corrupting the save starts at the entrance.

Unticked items need a manual pass on a device (automated browser testing was not available in
this environment at the time of writing).

## Out of scope (later phases)

Customers with shopping requests, scanning, payment and change (Phase 2); restocking, shelf
organizer and bag packing with scoring (Phase 3); shift results, XP, leaderboards (Phase 4);
production polish and app integration (Phase 5).
