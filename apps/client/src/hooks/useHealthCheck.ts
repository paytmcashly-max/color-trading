"use client";

import { useEffect, useState } from "react";

import { fetchHealth } from "@/services/api-client";

export function useHealthCheck() {
  const [status, setStatus] = useState<"idle" | "healthy" | "unhealthy">("idle");

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then(() => {
        if (active) {
          setStatus("healthy");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("unhealthy");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return status;
}
