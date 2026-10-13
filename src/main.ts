import Phaser from "phaser";
import { gameConfig } from "./game/config";
import { RENDER_SCALE, viewportSize } from "./game/display";
import "./style.css";

const game = new Phaser.Game(gameConfig);

// Keep the canvas matched to the screen on rotation / window resize.
let pending = 0;
const fitToScreen = () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const { width, height } = viewportSize();
    game.scale.resize(width * RENDER_SCALE, height * RENDER_SCALE);
  });
};
window.addEventListener("resize", fitToScreen);
window.addEventListener("orientationchange", fitToScreen);
window.visualViewport?.addEventListener("resize", fitToScreen);

// Dev-only handle for debugging from the browser console (stripped from builds).
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
