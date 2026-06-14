const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function kolkataDayBounds(now = new Date()) {
  const kolkata = new Date(now.getTime() + KOLKATA_OFFSET_MS);
  const startAsUtc = Date.UTC(
    kolkata.getUTCFullYear(),
    kolkata.getUTCMonth(),
    kolkata.getUTCDate(),
  );
  const start = new Date(startAsUtc - KOLKATA_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}
