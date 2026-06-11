export function isPrismaUniqueConstraintError(error: unknown) {
  return isRecord(error) && error.code === "P2002";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
