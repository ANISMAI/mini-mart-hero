import Game from "./game/Game";
import "./style.css";

const game = new Game(document.getElementById("app")!, document.getElementById("ui-root")!);

// Dev-only handle for debugging from the browser console (stripped from builds).
if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
