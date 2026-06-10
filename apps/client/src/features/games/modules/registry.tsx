import { GamePage } from "@/features/game/GamePage";
import { PlaceholderGameModule } from "./PlaceholderGameModule";
import type { GameModule } from "./types";

function comingSoon(game: GameModule) {
  return <PlaceholderGameModule game={game} />;
}

export const gameModules: GameModule[] = [
  {
    id: "color-prediction",
    name: "Fast Parity",
    tagline: "Fast 60-second rounds with live color outcomes.",
    status: "LIVE",
    category: "Prediction",
    activePlayers: 1284,
    imageSrc: "/game-images/color-prediction.svg",
    accent: {
      from: "from-[#dcfce7]",
      via: "via-[#e0f2fe]",
      to: "to-[#ede9fe]",
      glow: "shadow-[0_14px_34px_rgba(22,135,79,0.12)]",
    },
    route: "/game/color-prediction",
    socketEvents: ["round:state", "round:timer", "round:lock", "round:result", "wallet:update", "bet:placed"],
    stateManager: "game-store",
    renderUI: () => <GamePage title="Fast Parity" />,
  },
  {
    id: "parity",
    name: "Parity",
    tagline: "Classic 4-minute parity rounds.",
    status: "COMING_SOON",
    category: "Prediction",
    activePlayers: 903,
    imageSrc: "/game-images/color-prediction.svg",
    accent: {
      from: "from-[#e0f2fe]",
      via: "via-[#f0fdf4]",
      to: "to-[#fef3c7]",
      glow: "shadow-[0_14px_34px_rgba(14,165,233,0.12)]",
    },
    route: "/game/parity",
    socketEvents: [],
    stateManager: "future-parity-store",
    renderUI() {
      return comingSoon(this);
    },
  },
  {
    id: "crash-game",
    name: "Crash",
    tagline: "Cash out before the multiplier curve disappears.",
    status: "COMING_SOON",
    category: "Multiplier",
    activePlayers: 642,
    imageSrc: "/game-images/crash-game.svg",
    accent: {
      from: "from-[#fee2e2]",
      via: "via-[#eef2ff]",
      to: "to-[#ffedd5]",
      glow: "shadow-[0_14px_34px_rgba(248,113,113,0.12)]",
    },
    route: "/game/crash-game",
    socketEvents: [],
    stateManager: "future-crash-store",
    renderUI() {
      return comingSoon(this);
    },
  },
  {
    id: "roulette",
    name: "Roulette",
    tagline: "A modern virtual table built for quick rounds.",
    status: "COMING_SOON",
    category: "Table",
    activePlayers: 438,
    imageSrc: "/game-images/roulette.svg",
    accent: {
      from: "from-[#fef3c7]",
      via: "via-[#dcfce7]",
      to: "to-[#ffedd5]",
      glow: "shadow-[0_14px_34px_rgba(251,146,60,0.12)]",
    },
    route: "/game/roulette",
    socketEvents: [],
    stateManager: "future-roulette-store",
    renderUI() {
      return comingSoon(this);
    },
  },
  {
    id: "dice-game",
    name: "Dice",
    tagline: "Roll prediction mechanics prepared for the next module.",
    status: "COMING_SOON",
    category: "Arcade",
    activePlayers: 519,
    imageSrc: "/game-images/dice-game.svg",
    accent: {
      from: "from-[#dbeafe]",
      via: "via-[#e0e7ff]",
      to: "to-[#fce7f3]",
      glow: "shadow-[0_14px_34px_rgba(96,165,250,0.12)]",
    },
    route: "/game/dice-game",
    socketEvents: [],
    stateManager: "future-dice-store",
    renderUI() {
      return comingSoon(this);
    },
  },
];

export function getGameModule(gameId: string) {
  return gameModules.find((game) => game.id === gameId) ?? null;
}
