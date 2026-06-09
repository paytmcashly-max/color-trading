import type { Prisma, PrismaClient } from "@prisma/client";

export class AuditService {
  constructor(private readonly prisma: PrismaClient) {}

  write(input: {
    actorId: string;
    actorType: "ADMIN" | "USER" | "SYSTEM";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        adminUserId: input.actorType === "SYSTEM" ? undefined : input.actorId,
        actorId: input.actorId,
        actorType: input.actorType,
        action: input.action,
        actionType: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as Prisma.InputJsonObject | undefined,
      },
    });
  }
}
