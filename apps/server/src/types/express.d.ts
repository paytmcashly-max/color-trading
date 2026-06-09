import type { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        email: string;
        role: UserRole;
        sessionId: string;
      };
      observability?: {
        requestId: string;
        startedAt: number;
        routeName: string;
      };
    }
  }
}

export {};
