# Mini Mart Hero

A cashier game set in a Malaysian mini mart, built with **Phaser + TypeScript + Vite**
(same stack as Eczema Care Hero).

Current state: starter scene. The store (shelves, counter, cashier) is drawn and customers walk
in to the counter and out again. Gameplay is planned next:

1. Customer shows a shopping list.
2. Walk to the shelves and pick the items.
3. Checkout: scan items, bag them (heavy first, fragile on top), give the right change (RM).

## Setup

```bash
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
```

## Structure

```
src/
  main.ts              boots the game, keeps the canvas matched to the screen
  game/config.ts       Phaser config
  game/display.ts      render scale and font
  scenes/StoreScene.ts starter scene
  art/                 vector art: palette, baking helper, store, people
  data/store.ts        floor plan (shelves, counter, queue, door)
  data/products.ts     products, prices (sen), shelves, ringgit helpers
  entities/Person.ts   walking customer
```
