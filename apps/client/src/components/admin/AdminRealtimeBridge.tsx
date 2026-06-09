"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { createSocket } from "@/services/socket";
import { useAuthStore } from "@/store/auth-store";

const adminInvalidationMap: Record<string, string[][]> = {
  "round:created": [["admin", "rounds"], ["admin", "active-round"], ["admin", "health"]],
  "round:lock": [["admin", "rounds"], ["admin", "active-round"], ["admin", "health"]],
  "round:locked": [["admin", "rounds"], ["admin", "active-round"], ["admin", "health"]],
  "round:result": [["admin", "rounds"], ["admin", "active-round"], ["admin", "bets"], ["admin", "health"]],
  "round:completed": [["admin", "rounds"], ["admin", "active-round"], ["admin", "health"]],
  "bet:placed": [["admin", "bets"], ["admin", "rounds"], ["admin", "health"]],
  "wallet:update": [["admin", "wallet"], ["admin", "ledger"], ["admin", "users"], ["admin", "health"]],
  "system:error": [["admin", "health"]],
  "fraud:alert": [["admin", "fraud-logs"], ["admin", "risk-profiles"], ["admin", "health"]],
  "fraud:high_risk_user": [["admin", "risk-profiles"], ["admin", "health"]],
  "fraud:rate_limit_triggered": [["admin", "fraud-logs"], ["admin", "health"]],
  "observability:alert": [["admin", "health"], ["admin", "audit-logs"]],
};

export function AdminRealtimeBridge() {
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const role = useAuthStore((state) => state.user?.role);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken || role !== "ADMIN") {
      return;
    }

    const socket = createSocket(accessToken);

    Object.entries(adminInvalidationMap).forEach(([eventName, queryKeys]) => {
      socket.on(eventName, () => {
        queryKeys.forEach((queryKey) => {
          void queryClient.invalidateQueries({ queryKey });
        });
      });
    });

    socket.on("connect", () => {
      socket.emit("join:room", { room: "game" });
      socket.emit("state:sync");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken, queryClient, role]);

  return null;
}
