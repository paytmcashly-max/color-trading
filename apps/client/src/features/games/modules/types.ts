import type { ReactNode } from "react";

export type GameStatus = "LIVE" | "COMING_SOON";

export interface GameModule {
  id: string;
  name: string;
  tagline: string;
  status: GameStatus;
  category: string;
  activePlayers: number;
  accent: {
    from: string;
    via: string;
    to: string;
    glow: string;
  };
  route: `/game/${string}`;
  socketEvents: string[];
  stateManager: string;
  renderUI: () => ReactNode;
}
