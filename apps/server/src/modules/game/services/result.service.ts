import crypto from "node:crypto";
import { PredictionColor } from "@prisma/client";

const COLORS = [PredictionColor.RED, PredictionColor.GREEN, PredictionColor.VIOLET] as const;

export class ResultService {
  createSeed() {
    const seedReveal = crypto.randomBytes(32).toString("hex");
    const seedHash = crypto.createHash("sha256").update(seedReveal).digest("hex");

    return { seedHash, seedReveal };
  }

  generateResult(seedReveal?: string | null) {
    const index = seedReveal
      ? crypto.createHash("sha256").update(seedReveal).digest().readUInt32BE(0) % COLORS.length
      : crypto.randomInt(0, COLORS.length);
    const color = COLORS[index];

    if (!color) {
      throw new Error("Secure RNG returned an invalid color index.");
    }

    return color;
  }
}
