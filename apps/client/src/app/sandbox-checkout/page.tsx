import { Suspense } from "react";

import { SandboxCheckout } from "@/features/sandbox-payment/SandboxCheckout";

export default function Page() {
  return (
    <Suspense fallback={<CheckoutLoading />}>
      <SandboxCheckout />
    </Suspense>
  );
}

function CheckoutLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 text-ink">
      <p className="text-sm font-bold text-muted">Loading sandbox checkout...</p>
    </main>
  );
}
