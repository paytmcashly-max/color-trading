import { getRedisClient } from "../../database/redis.client.js";
import { getPrismaClient } from "../../database/prisma.client.js";
import { FraudService } from "./fraud.service.js";

let fraudService: FraudService | null = null;

export function getFraudService() {
  fraudService ??= new FraudService(getPrismaClient(), getRedisClient());
  return fraudService;
}
