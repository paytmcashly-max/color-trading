import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";

import type { BetDto, WalletDto } from "@/types/api";

const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000";
let activeSocket: Socket | null = null;

export function createSocket(accessToken: string) {
  const socket = io(socketUrl, {
    auth: {
      token: accessToken,
    },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  });

  activeSocket = socket;

  socket.on("disconnect", () => {
    if (activeSocket === socket) {
      activeSocket = null;
    }
  });

  return socket;
}

export function getActiveSocket() {
  return activeSocket?.connected ? activeSocket : null;
}

export function clearActiveSocket(socket: Socket) {
  if (activeSocket === socket) {
    activeSocket = null;
  }
}

export function reconnectSocketWithToken(socket: Socket, accessToken: string) {
  socket.io.opts.reconnection = false;
  socket.disconnect();
  socket.auth = { token: accessToken };
  socket.io.opts.reconnection = true;
  activeSocket = socket;
  socket.connect();
}

export function disposeSocket(socket: Socket) {
  clearActiveSocket(socket);
  socket.removeAllListeners();
  socket.disconnect();
}

export function joinGameRoomOverSocket() {
  const socket = getActiveSocket();

  if (!socket) {
    return;
  }

  socket.emit("join:room", { room: "game" });
}

export function joinRoundOverSocket(roundId: string) {
  const socket = getActiveSocket();

  if (!socket) {
    return;
  }

  socket.emit("join:round", roundId);
}

export function placeBetOverSocket(input: {
  roundId: string;
  choice: string;
  coinsStaked: number;
  idempotencyKey: string;
}) {
  const socket = getActiveSocket();

  if (!socket) {
    return Promise.reject(new Error("Realtime connection is not ready."));
  }

  return new Promise<{ bet: BetDto; wallet?: WalletDto }>((resolve, reject) => {
    socket.timeout(5000).emit("bet:place", {
      ...input,
      selection: input.choice,
      amount: input.coinsStaked,
    }, (error: Error | null, response?: SocketBetAck) => {
      if (error) {
        reject(new Error("Realtime request timed out."));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.message ?? response?.error ?? "Prediction failed."));
        return;
      }

      resolve({
        bet: response.bet,
        wallet: response.wallet,
      });
    });
  });
}

interface SocketBetAck {
  ok: boolean;
  error?: string;
  message?: string;
  bet: BetDto;
  wallet?: WalletDto;
}
