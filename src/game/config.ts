import Phaser from "phaser";
import StoreScene from "../scenes/StoreScene";
import { RENDER_SCALE, viewportSize } from "./display";

// The canvas fills the screen (portrait or landscape) at RENDER_SCALE for sharp vector art.
const initial = viewportSize();

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#93cf6f",
  antialias: true,
  scale: {
    mode: Phaser.Scale.NONE,
    width: initial.width * RENDER_SCALE,
    height: initial.height * RENDER_SCALE,
    zoom: 1 / RENDER_SCALE,
  },
  fps: { panicMax: 0 },
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scene: [StoreScene],
};
