export function roundStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "INIT":
    case "WAITING":
      return "Get ready";
    case "OPEN":
    case "BETTING":
    case "BETTING_OPEN":
      return "Betting open";
    case "LOCKED":
    case "BETTING_CLOSED":
      return "Betting closed";
    case "RESOLVING":
    case "RESULT":
      return "Result is coming";
    case "COMPLETED":
    case "SETTLED":
    case "RESULT_DECLARED":
      return "Result declared";
    case "CANCELLED":
      return "Round cancelled";
    case "ERROR":
      return "Round paused";
    default:
      return "Updating...";
  }
}

export function betStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "PENDING":
      return "Waiting for result";
    case "WON":
      return "Won";
    case "LOST":
      return "Lost";
    case "CANCELLED":
      return "Cancelled";
    case "REFUNDED":
      return "Refunded";
    default:
      return "Updating...";
  }
}

export function walletActivityLabel(type: string | null | undefined) {
  switch (type) {
    case "BET":
    case "BET_DEBIT":
    case "BET_LOCKED":
    case "BET_PLACED":
      return { title: "Bet amount locked", description: "Your bet is waiting for the result" };
    case "WIN":
    case "BET_WIN_CREDIT":
    case "BET_WIN_PAYOUT":
      return { title: "Winnings added", description: "Your winnings are now in your wallet" };
    case "BET_REFUND":
      return { title: "Refund received", description: "Your money is back" };
    case "BONUS_CREDIT":
    case "BONUS":
      return { title: "Bonus added", description: "Bonus coins added to your wallet" };
    case "DEPOSIT":
    case "PURCHASE_CREDIT":
      return { title: "Coins added", description: "Coins added to your wallet" };
    case "ADMIN_ADJUSTMENT":
      return { title: "Balance updated", description: "Your wallet balance was updated" };
    default:
      return { title: "Wallet updated", description: "Your balance was updated" };
  }
}

export function errorToPlayerMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toUpperCase();

  if (normalized.includes("INSUFFICIENT") || normalized.includes("TOO LOW")) {
    return "Not enough balance.";
  }
  if (
    normalized.includes("ROUND_NOT_OPEN") ||
    normalized.includes("BETTING") && (normalized.includes("CLOSED") || normalized.includes("ACCEPTED ONLY"))
  ) {
    return "Betting is closed for this round.";
  }
  if (normalized.includes("GAME_PAUSED") || normalized.includes("GAME IS PAUSED")) {
    return "The game is paused. Please wait.";
  }
  if (normalized.includes("SESSION_EXPIRED") || normalized.includes("SESSION EXPIRED")) {
    return "Your session expired. Please log in again.";
  }
  if (normalized.includes("UNAUTHORIZED") || normalized.includes("LOG IN")) {
    return "Please log in to continue.";
  }
  if (normalized.includes("IDEMPOTENCY") || normalized.includes("ALREADY") || normalized.includes("DUPLICATE")) {
    return "Your bet is already placed.";
  }
  if (
    normalized.includes("NETWORK") ||
    normalized.includes("CONNECTION") ||
    normalized.includes("TIMED OUT") ||
    normalized.includes("FAILED TO FETCH")
  ) {
    return "Connection problem. Please try again.";
  }

  return "Something went wrong. Please try again.";
}

export function resultPopupCopy(status: string | null | undefined) {
  switch (status) {
    case "WON":
      return {
        title: "You won",
        subtitle: "Your winnings are now in your wallet.",
        action: "Play next round",
      };
    case "LOST":
      return {
        title: "You lost",
        subtitle: "Better luck next round.",
        action: "Try again",
      };
    case "CANCELLED":
    case "REFUNDED":
      return {
        title: "Round cancelled",
        subtitle: "Your bet amount has been returned.",
        action: "Okay",
      };
    default:
      return {
        title: "Waiting for result",
        subtitle: "Your bet is still active.",
        action: "Okay",
      };
  }
}

export const playerConnectionCopy = {
  disconnected: "Connection lost. Trying to reconnect...",
  connected: "Connected",
  restored: "You are back online.",
} as const;
