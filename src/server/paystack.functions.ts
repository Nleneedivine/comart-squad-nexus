import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json();
  if (!res.ok || json?.status === false) throw new Error(json?.message || `Paystack ${res.status}`);
  return json;
}

async function ensureWallet(storeId: string) {
  const { data } = await supabaseAdmin.from("wallets").select("*").eq("store_id", storeId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabaseAdmin.from("wallets").insert({ store_id: storeId }).select("*").single();
  if (error) throw error;
  return created;
}

export const initFundWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amount: z.number().positive().max(10_000_000), email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("store_id").limit(1);
    const storeId = roles?.[0]?.store_id;
    if (!storeId) throw new Error("No store");
    const wallet = await ensureWallet(storeId);
    const reference = `fund_${storeId.slice(0, 8)}_${Date.now()}`;
    const r = await ps("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: data.email,
        amount: Math.round(data.amount * 100),
        reference,
        metadata: { store_id: storeId, wallet_id: wallet.id, kind: "funding" },
      }),
    });
    await supabaseAdmin.from("wallet_transactions").insert({
      store_id: storeId, wallet_id: wallet.id, kind: "funding", amount: data.amount,
      status: "pending", reference, paystack_reference: reference, created_by: userId,
      description: "Wallet funding (Paystack)",
    });
    return { authorization_url: r.data.authorization_url, reference };
  });

export const verifyFunding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().min(3).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const r = await ps(`/transaction/verify/${encodeURIComponent(data.reference)}`);
    const { data: tx } = await supabaseAdmin.from("wallet_transactions").select("*").eq("reference", data.reference).maybeSingle();
    if (!tx) return { ok: false, message: "Transaction not found" };
    if (tx.status === "success") return { ok: true, already: true };
    if (r.data.status === "success") {
      await supabaseAdmin.from("wallet_transactions").update({ status: "success" }).eq("id", tx.id);
      const { data: w } = await supabaseAdmin.from("wallets").select("balance").eq("id", tx.wallet_id).single();
      const newBal = Number(w?.balance || 0) + Number(tx.amount);
      await supabaseAdmin.from("wallets").update({ balance: newBal }).eq("id", tx.wallet_id);
      return { ok: true };
    }
    await supabaseAdmin.from("wallet_transactions").update({ status: "failed" }).eq("id", tx.id);
    return { ok: false, message: r.data.gateway_response || "Failed" };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amount: z.number().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await context.supabase.from("user_roles").select("store_id").limit(1);
    const storeId = roles?.[0]?.store_id;
    if (!storeId) throw new Error("No store");
    const wallet = await ensureWallet(storeId);
    if (!wallet.bank_account_number) throw new Error("Add bank account first");
    if (Number(wallet.balance) < data.amount) throw new Error("Insufficient balance");
    const reference = `wd_${storeId.slice(0, 8)}_${Date.now()}`;
    // Record as pending; manual approval / Paystack transfer flow handled offline
    await supabaseAdmin.from("wallet_transactions").insert({
      store_id: storeId, wallet_id: wallet.id, kind: "withdrawal", amount: data.amount,
      status: "pending", reference, created_by: userId,
      description: `Withdraw to ${wallet.bank_name || ""} ${wallet.bank_account_number}`,
    });
    await supabaseAdmin.from("wallets").update({ balance: Number(wallet.balance) - Number(data.amount) }).eq("id", wallet.id);
    return { ok: true, reference };
  });
