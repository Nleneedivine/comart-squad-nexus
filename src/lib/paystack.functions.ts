import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { captureServerException } from "@/lib/sentry.server";
import { z } from "zod";

const PAYSTACK = "https://api.paystack.co";

function key() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return k;
}

async function ps(path: string, init?: RequestInit) {
  const res = await fetch(`${PAYSTACK}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const json = await res.json();
  if (!res.ok || json?.status === false) {
    const err = new Error(json?.message || `Paystack ${res.status}`);
    await captureServerException(err, { tags: { kind: "paystack_api", path, status: res.status }, fingerprint: ["paystack-api", path] });
    throw err;
  }
  return json;
}

// Funding: the caller must hold wallet.fund on the given store (checked in the DB function as auth.uid()).
export const initFundWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ store_id: z.string().uuid(), amount: z.number().positive().max(10_000_000), email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const reference = `fund_${data.store_id.replace(/-/g, "").slice(0, 12)}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await context.supabase.rpc("wallet_create_funding", { _store_id: data.store_id, _amount: data.amount, _reference: reference });
    if (error) throw new Error(error.message);
    const r = await ps("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: data.email, amount: Math.round(data.amount * 100), reference,
        metadata: { store_id: data.store_id, kind: "funding" },
      }),
    });
    return { authorization_url: r.data.authorization_url as string, reference };
  });

// Verify: the reference must belong to a store the caller can see (RLS), then settle via the trusted path.
export const verifyFunding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().regex(/^fund_[a-z0-9_]{8,80}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tx } = await context.supabase.from("wallet_transactions")
      .select("id, store_id, status, amount").eq("reference", data.reference).maybeSingle();
    if (!tx) return { ok: false, message: "Transaction not found" };
    if (tx.status !== "pending") return { ok: tx.status === "success", already: true };
    const r = await ps(`/transaction/verify/${encodeURIComponent(data.reference)}`);
    const paid = r.data?.status === "success";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.rpc("wallet_settle_transaction", {
      _reference: data.reference, _success: paid, _paid_amount: paid ? Number(r.data.amount) / 100 : undefined,
    });
    if (error) throw new Error(error.message);
    const out = res as any;
    return { ok: !!out?.ok, message: out?.error || (paid ? undefined : r.data?.gateway_response || "Failed") };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    store_id: z.string().uuid(), amount: z.number().positive().max(10_000_000),
    pin: z.string().regex(/^\d{4,6}$/), idempotency_key: z.string().min(8).max(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("wallet_request_withdrawal", {
      _store_id: data.store_id, _amount: data.amount, _pin: data.pin, _idempotency_key: data.idempotency_key,
    });
    if (error) throw new Error(error.message);
    const out = res as any;
    if (!out?.ok) throw new Error(out?.error || "Withdrawal failed");
    return { ok: true, reference: out.reference as string };
  });
