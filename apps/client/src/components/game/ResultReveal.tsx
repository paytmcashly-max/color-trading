"use client";

import { motion } from "framer-motion";
import { Sparkles, Trophy, X } from "lucide-react";
import type { PredictionColor } from "@color-trading/shared";

export function ResultReveal({
  result,
  selection,
  outcome,
}: {
  result: PredictionColor | string | null | undefined;
  selection: PredictionColor | string | null | undefined;
  outcome: "WIN" | "LOSS" | "WAITING";
}) {
  if (!result) {
    return null;
  }

  const isWin = outcome === "WIN";

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className={`relative overflow-hidden rounded-[28px] border p-5 ${
        isWin
          ? "border-[#a7e8c3] bg-[#eefbf4] shadow-[0_16px_42px_rgba(22,135,79,0.14)]"
          : "border-line bg-white shadow-[0_12px_34px_rgba(23,32,26,0.08)]"
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(22,135,79,0.12),transparent_30%)]" />
      {isWin ? <ConfettiDots /> : null}
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase text-muted">Round result</p>
          <h2 className="mt-2 flex items-center gap-2 text-2xl font-black text-ink">
            {isWin ? <Trophy size={24} aria-hidden="true" /> : <X size={24} aria-hidden="true" />}
            {isWin ? "You won" : outcome === "LOSS" ? "You lost" : "Result"}
          </h2>
          <p className="mt-1 text-sm font-bold text-muted">
            Result: {colorLabel(result)}. Your pick: {colorLabel(selection)}.
          </p>
        </div>
        <motion.div
          initial={{ rotate: -12, scale: 0.82 }}
          animate={{ rotate: 0, scale: 1 }}
          className={`grid size-20 shrink-0 place-items-center rounded-full ${resultColorClass(result)} text-sm font-black text-white shadow-2xl`}
        >
          <Sparkles size={28} aria-hidden="true" />
        </motion.div>
      </div>
    </motion.section>
  );
}

function colorLabel(value: string | null | undefined) {
  return value ? value.charAt(0) + value.slice(1).toLowerCase() : "Waiting";
}

function ConfettiDots() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 9 }).map((_, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, y: 20, x: 0 }}
          animate={{ opacity: [0, 1, 0], y: [-4, -48 - index * 3], x: (index % 3 - 1) * 26 }}
          transition={{ duration: 1.2, delay: index * 0.04, repeat: 1 }}
          className="absolute bottom-8 left-1/2 size-2 rounded-full bg-[#ffe66d]"
        />
      ))}
    </div>
  );
}

function resultColorClass(result: string | null | undefined) {
  if (result === "RED") {
    return "bg-[#ff3b4f]";
  }

  if (result === "GREEN") {
    return "bg-[#19d879]";
  }

  if (result === "VIOLET") {
    return "bg-[#9b5cff]";
  }

  return "bg-[#dfe6df]";
}
