import { FraudSeverity, type PrismaClient } from "@prisma/client";

const DECAY_POINTS_PER_HOUR = 1;
const MAX_DECAY_POINTS = 20;

export interface RiskAdjustment {
  userId: string;
  points: number;
  reason: string;
  severity: FraudSeverity;
  botSuspected?: boolean;
}

export class RiskEngine {
  constructor(private readonly prisma: PrismaClient) {}

  async getRiskProfile(userId: string) {
    return this.prisma.userRiskProfile.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async adjustRisk(input: RiskAdjustment) {
    const existing = await this.getRiskProfile(input.userId);
    const decayedScore = this.applyDecay(existing.riskScore, existing.lastUpdated);
    const nextScore = clampRiskScore(decayedScore + input.points);
    const botSuspected = existing.botSuspected || Boolean(input.botSuspected);

    return this.prisma.userRiskProfile.update({
      where: { userId: input.userId },
      data: {
        riskScore: nextScore,
        botSuspected,
        isBlocked: nextScore >= 81,
        lastUpdated: new Date(),
      },
    });
  }

  async decayRisk(userId: string) {
    const existing = await this.getRiskProfile(userId);
    const nextScore = this.applyDecay(existing.riskScore, existing.lastUpdated);

    if (nextScore === existing.riskScore) {
      return existing;
    }

    return this.prisma.userRiskProfile.update({
      where: { userId },
      data: {
        riskScore: nextScore,
        isBlocked: nextScore >= 81,
        lastUpdated: new Date(),
      },
    });
  }

  private applyDecay(score: number, lastUpdated: Date) {
    const elapsedHours = Math.floor((Date.now() - lastUpdated.getTime()) / (60 * 60 * 1000));
    const decay = Math.min(elapsedHours * DECAY_POINTS_PER_HOUR, MAX_DECAY_POINTS);
    return clampRiskScore(score - decay);
  }
}

function clampRiskScore(score: number) {
  return Math.max(0, Math.min(100, score));
}
