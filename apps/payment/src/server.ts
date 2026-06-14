import express from "express";
import { z } from "zod";

import { verifyCashfreeSignature } from "./cashfree.client.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { startOutboxWorker } from "./outbox.worker.js";
import { PaymentService } from "./payment.service.js";

const app = express();
const service = new PaymentService();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("content-security-policy", "default-src 'self'; script-src 'self' https://sdk.cashfree.com 'unsafe-inline'; connect-src 'self' https://sandbox.cashfree.com https://*.cashfree.com; frame-src https://*.cashfree.com; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'");
  next();
});
app.use(express.json({
  limit: "128kb",
  verify(req, _res, buffer) {
    (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
  },
}));

app.get("/health/live", (_req, res) => res.json({ status: "healthy" }));
app.get("/health/ready", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy" });
  } catch {
    res.status(503).json({ status: "unhealthy" });
  }
});

app.get("/pay", async (req, res, next) => {
  try {
    const sessionId = await service.exchangeSignedIntent(String(req.query.token ?? ""));
    res.redirect(303, `/checkout/${sessionId}`);
  } catch (error) {
    next(error);
  }
});

app.get("/checkout/:sessionId", async (req, res, next) => {
  try {
    const session = await service.getSession(z.string().uuid().parse(req.params.sessionId));
    res.type("html").send(checkoutHtml(session.id, session.intentPayload.amountPaise));
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const sessionId = z.string().uuid().parse(req.body.sessionId);
    const order = await service.createProviderOrder(sessionId);
    res.json(order);
  } catch (error) {
    next(error);
  }
});

app.get("/return", async (req, res, next) => {
  try {
    const result = await service.reconcileOrder(String(req.query.order_id ?? ""));
    res.redirect(303, `${config.MAIN_CLIENT_URL}/sandbox-checkout?intent_id=${encodeURIComponent(result.intentId)}`);
  } catch (error) {
    next(error);
  }
});

app.post("/api/webhooks/cashfree", async (req, res, next) => {
  try {
    const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;
    const timestamp = req.get("x-webhook-timestamp");
    const signature = req.get("x-webhook-signature");
    if (!rawBody || !timestamp || !signature || !verifyCashfreeSignature(rawBody, timestamp, signature)) {
      res.status(401).json({ code: "INVALID_WEBHOOK_SIGNATURE" });
      return;
    }
    const payload = req.body as { data?: { order?: { order_id?: string } } };
    const providerOrderId = payload.data?.order?.order_id;
    if (!providerOrderId) {
      res.status(400).json({ code: "ORDER_ID_REQUIRED" });
      return;
    }
    await service.reconcileOrder(providerOrderId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  console.error("payment_service_request_failed", {
    message: error instanceof Error ? error.message : "unknown",
  });
  res.status(400).json({ code: "PAYMENT_REQUEST_FAILED", message: "Unable to complete payment request." });
});

let stopOutboxWorker: (() => void) | undefined;
const httpServer = app.listen(config.PORT, () => {
  console.log("payment_service_listening", { port: config.PORT, provider: "cashfree-sandbox" });
  stopOutboxWorker = startOutboxWorker();
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopOutboxWorker?.();
    httpServer.close(() => void pool.end());
  });
}

function checkoutHtml(sessionId: string, amountPaise: string) {
  const amount = (Number(amountPaise) / 100).toFixed(2);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Premium credits sandbox checkout</title><script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
<style>body{font-family:system-ui;background:#f6f8f4;color:#17201a;margin:0;padding:24px}.box{max-width:440px;margin:0 auto;background:white;border:1px solid #dfe6df;border-radius:16px;padding:20px}.warn{background:#fff8e7;color:#73510d;padding:12px;border-radius:12px}button{width:100%;height:48px;border:0;border-radius:12px;background:#16874f;color:white;font-weight:800;font-size:16px;margin-top:16px}</style>
</head><body><main class="box"><h1>Premium credits</h1><p class="warn">Cashfree sandbox only. Premium credits cannot be used for bets or converted to game coins.</p><h2>INR ${amount}</h2><button id="pay">Open sandbox checkout</button><p id="message"></p></main>
<script>
const button=document.getElementById('pay');const message=document.getElementById('message');
button.onclick=async()=>{button.disabled=true;message.textContent='Creating secure order...';
try{const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:${JSON.stringify(sessionId)}})});
if(!response.ok)throw new Error('Unable to create order');const order=await response.json();
if(!order.paymentSessionId)throw new Error('Payment session unavailable');
await Cashfree({mode:'sandbox'}).checkout({paymentSessionId:order.paymentSessionId,redirectTarget:'_self'});
}catch(error){message.textContent=error.message;button.disabled=false;}};
</script></body></html>`;
}
