if (process.env.PAYMENT_SERVICE_ENABLED?.toLowerCase() === "true") {
  await import("./apply-schema.mjs");
} else {
  console.log("Payment service disabled; skipping payment schema migration.");
}
await import("../dist/server.js");
