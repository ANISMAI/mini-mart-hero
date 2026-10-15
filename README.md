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

## Phase 1.5: store utilities

An add-on to the Phase 1 store (no cashier or customer features). Everything reads one
authoritative service, **`src/game/Utilities.ts`** (`UtilityService`), saved under its own key
`mini-market-hero-utilities-v1` (the Phase 1 save is untouched; invalid data falls back to defaults).

| Piece | Where | How |
|---|---|---|
| Bilik Utiliti | east end of the back corridor (door on its west wall) | on both maps, Go Here works |
| Light zones | Kedai Utama, Peti Sejuk, Stor, Pejabat, Bilik Rehat, Tandas, Surau, Bilik Utiliti | wall switch beside each door: Interact toggles instantly (click + toast) |
| Manager light panel | office desk | every zone ON/OFF, plus all on / all off |
| Aircond | 3 wall units in the shop, controller on the wall beside the till | ON/OFF, 22 to 28 °C, saved |
| Electrical cabinet | closed box in the utility room | status panel only, **Panggil Juruteknik** |

Lighting is cheap on purpose: no extra dynamic lights. Each zone has glowing tube fixtures (one
instanced mesh) and a dark see-through shade above the walls; standing in a dark zone also dims
the scene lights. Zone data (areas, fixtures, switch spots) is in `src/data/utilities.ts`, the 3D
side in `src/world/UtilityVisuals.ts`, panels in `src/ui/Overlays.ts`.

**Simulated power trip (fictional):** about 5 minutes into play, then every 10 to 15 minutes,
a short warning is followed by an outage in 2 or 3 zones (lights; the AC too if the main shop is
hit). The player reads the cabinet panel and calls a technician; after about 20 s power returns
and every switch goes back to what the player had set. Refrigerator cooling is on a separate
circuit and is never affected. Events never stack and the technician can be called once. Add
`?dev` to the URL to get developer buttons on the cabinet panel: trigger a test event, resolve
now, **Reset Demo Event**.

## Phase 2: customer & cashier

One complete customer transaction, end to end, on top of Phase 1 and 1.5 (nothing removed). Like
a real kedai runcit, **customers shop by themselves**; the player runs the till.

1. **Customer shops:** a customer walks in with a red basket, follows the open lanes to each
   product on their list (1 to 4 items, only products unlocked at your level and actually on a
   shelf), stops to take it (the basket fills, a toast says what they took), then queues at the
   customer side of the till. Templates: express, ordinary, family. Markers are
   `CUSTOMER_MARKERS` in `src/world/CustomerNPC.ts`; if the customer gets stuck it visibly
   "poofs" to its next marker. The HUD card (top-left) shows their list being filled.
2. **Till:** stand on the cashier side and Interact → till screens over the 3D store (walking
   paused, camera kept): **scan** by swiping each item card onto the scanner (beep, once per unit,
   misses only cost a little, Restart scan) → **cash**: the customer pays with a note; next to
   the payment receipt you take the exact change from the cash drawer (RM50, 20, 10, 5, 1 notes;
   50, 20, 10, 5 sen coins; Undo, Clear, Confirm; integer sen).
3. **Done:** exact change completes the sale: the result panel shows in the till, the customer
   leaves and the next one arrives a few seconds later. (Bag packing is left for a later phase.)

Scoring (per order, once): scan 35, exact change 50, customer served 15. Mistakes only lower
that stage (to half at most) and can always be retried. Best score, total and coins are saved
under `mini-market-hero-orders-v2`; a refresh while the customer shops or mid-till brings them
back waiting at the till with a full basket; a corrupt save starts clean. Rewards are keyed by
order id, so they can't repeat.

Files: `src/game/OrderService.ts` (guarded state machine
`idle > shopping > waiting > scanning > paying > handoff > complete`),
`src/ui/Checkout.ts` (till screens), `src/world/CustomerNPC.ts` (shopping customer, routes,
basket), `src/data/strings.ts` (BM/EN dialogue table), `packClass` in `src/data/catalog.ts`.
Product spots come from the shelf filler (`fillShelf` returns them). `?dev` brings the first
customer in after 1 s.

## Phase 3 (stage 1): stock & restocking

Real stock for **all five sections, 44 SKUs**: coolers (refilled from the back, in the Bilik
Sejuk), Barang Dapur, Penjagaan Diri, Kelengkapan Rumah and Snek (dry goods from the Stor). Data: `src/data/inventory.ts` (fixed slot per SKU
such as `fridge.air-mineral-500ml`, capacity 12, bulky items 8; low stock at 3 or fewer; seed
24 units back-stock each). Logic: `src/game/Inventory.ts`. Screens: `src/ui/StockUI.ts`.

- **Take stock:** chilled goods in the **Bilik Sejuk** (behind the coolers), dry goods in the
  **Stor**. Interact → +/− per product into the restock basket (max 24 units), or put back.
- **Restock:** Interact at the cooler / green shelf → fixed labelled slots with count/capacity.
  Drag a basket item onto its slot, or tap item then slot. Zoom +/− (and pinch), pan when zoomed.
  A wrong slot, full slot, locked product or empty basket gives the unit back with a short note.
  **Confirm** applies all moves at once; **Cancel** changes nothing. No timers or scoring.
- **Sales:** a completed sale subtracts shelf stock once per order; customers only pick products
  that are on the shelf. A toast warns when a slot drops to low stock and says where to restock.
- **Expiry (perishables only):** Susu Segar, Coklat Malt, Air Soya, Yogurt, Mentega, Roti Putih and
  Telur carry a date per unit (other products have none). Game day 1 = 15 Okt 2026; days follow
  the store clock below. "Semak tarikh luput" (behind the coolers in
  the Bilik Sejuk, and at the green shelf) lists each unit front-to-back with a red / yellow /
  green label; tap a red one (or remove all expired) to take it off sale. Shelves stay
  earliest-first (FEFO); customers never buy expired units. `?dev` adds a +1 day button.
- **Low stock:** HUD pill "📦 Stok rendah: N" (tap for the list) and orange pins on the mini-map /
  full map at the shelves and at the Stor / Bilik Sejuk when that stock isn't carried yet.
- **3D:** each product shows fewer facings as its slot empties (instanced count, no new meshes).
- Saved under `mini-market-hero-inventory-v2` (missing/broken values fall back to the seed).

## Store day & morning routine

`src/game/StoreDay.ts`: the day clock (1 game minute per real second, paused while a panel is
open or the tab is hidden). **07:00** the day starts with the shop closed → **10:00** the shop
opens and customers come → **22:00** it closes → next day 07:00. The HUD date pill shows
date, time and 🔒/🟢; tap it for the **morning checklist** (`src/ui/MorningUI.ts`), which also
opens by itself each morning. Tasks (optional, +5 coins each, once per day), each with **Pergi**:

- 📅 **Semak tarikh luput**: done when nothing on the shelves is out of date after a check.
- 🧹 **Mop lantai**: 2–3 spills with wet-floor cones appear each morning
  (`src/world/Spills.ts`); Interact and wipe the puddle until it's clean.
- ⚡ **Semak bil elektrik**: at the office laptop; a fictional daily bill from the current lights
  and aircond settings (integer sen), with a saving tip.
- 📦 **Semak stok**: open the Stor / Bilik Sejuk stock screen.

`?dev` adds "Buka sekarang" to the checklist. The game day also drives expiry dates.

## Replacing models and textures

Everything is built from simple primitives in `world/StoreBuilder.ts` (one function per piece:
`buildShelf`, `buildFridge`, `buildRack`, counter, rooms…) and `player/Avatar.ts`. To use real
models, load a glTF (`GLTFLoader`) and add it at the same position; collision boxes are separate
(`solid(...)` calls), so models can change without touching gameplay. Floor tiles are a small
canvas texture (`makeTileTexture`); signs are canvas text (`label`).

## Performance notes

Lambert materials, no real-time shadows (blob shadows instead), instanced products (a few draw
calls per shelf), antialiasing on, pixel ratio capped at 2. If the frame rate stays under 30 fps
the resolution steps down (never below 1.5x on high-density phones, so it stays sharp) and steps
back up when it runs smoothly again; the first seconds of loading are ignored.

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

### Phase 1.5 checks

- [x] Utility service logic (Node script): switch affects only its zone; AC on/off and 22 to 28 °C
      clamp; no stacking events; technician only during an outage and only once; outage cuts the
      chosen zones and the AC but never the fridge zone; switch settings survive the outage;
      reload mid-repair keeps the state; corrupt save falls back to defaults; Reset Demo Event.
- [x] Every room spawn and every interact point (including the new switches, AC controller and
      cabinet) is clear of collision boxes.
- [ ] On a device: switches / panels in portrait, shade and fixture visuals, AC airflow, outage
      flow end to end, reload.

### Phase 2 checks

- [x] Order logic (Node script): guards with no customer; one customer at a time; till closed
      while they shop; customer only takes listed units; each unit scans once; tender always
      covers the total; wrong change rejected with the exact difference; exact change accepted;
      exact change completes the order; perfect order = 100, rewarded once;
      reload while shopping → waiting at the till with a full basket; bad save → idle.
- [x] The customer's routes from the entrance to all 44 products and on to the till are clear of
      every collision box (radius 0.3).
- [ ] On a device: watching a customer shop; swipe-to-scan, the cash drawer on
      a narrow phone; full transaction end to end; refresh mid-order.

## Out of scope (later phases)

Inventory restocking, the full 2D shelf organizer with zoom and advanced packing (Phase 3);
shift results, XP, leaderboards (Phase 4); production polish and app integration (Phase 5).
Card / e-wallet payment, multiple simultaneous customers and rush hours are also later.
