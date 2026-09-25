import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureServerException } from "@/lib/sentry.server";
import { z } from "zod";

const PAYSTACK = "https://api.paystack.co";

function key() {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("PAYSTACK_SECRET_KEY not configured");
  return k;
}

async function ps(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${PAYSTACK}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key()}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const json = await res.json();
    if (!res.ok || json?.status === false) {
      const err = new Error(json?.message || `Paystack ${res.status}`);
      await captureServerException(err, {
        tags: { kind: "paystack_api", path, status: res.status },
        extra: { gateway_response: json?.data?.gateway_response ?? null },
        fingerprint: ["paystack-api", path],
      });
      throw err;
    }
    return json;
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith("Paystack"))) {
      await captureServerException(e, {
        tags: { kind: "paystack_api", path },
        fingerprint: ["paystack-api", path],
      });
    }
    throw e;
  }
}

async function ensureWallet(storeId: string) {
  const { data } = await supabaseAdmin.from("wallets").select("*").eq("store_id", storeId).maybeSingle();
  if (data) return data;
  const { data: created, error } = await supabaseAdmin.from("wallets").insert({ store_id: storeId }).select("*").single();
  if (error) throw error;
  return created;
}

export const ensureWalletForCurrentStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: pref } = await context.supabase.from("user_store_preferences")
      .select("active_store_id").eq("user_id", userId).maybeSingle();
    const storeId = pref?.active_store_id;
    if (!storeId) throw new Error("No active store");
    if (!await context.supabase.rpc("has_permission", {
      _user_id: userId, _store_id: storeId, _permission: "wallet.view"
    }).then(r => r.data)) throw new Error("Not authorized");

    const wallet = await ensureWallet(storeId);
    return {
      id: wallet.id, store_id: wallet.store_id, balance: wallet.balance,
      bank_name: wallet.bank_name, bank_account_number: wallet.bank_account_number,
      bank_account_name: wallet.bank_account_name, created_at: wallet.created_at,
      updated_at: wallet.updated_at,
    };
  });

export const initFundWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ amount: z.number().positive().max(10_000_000), email: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pref } = await supabase.from("user_store_preferences").select("active_store_id").eq("user_id", userId).maybeSingle();
    const storeId = pref?.active_store_id;
    if (!storeId) throw new Error("No active store");
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
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: pref } = await supabase.from("user_store_preferences")
      .select("active_store_id").eq("user_id", userId).maybeSingle();
    const storeId = pref?.active_store_id;
    if (!storeId) throw new Error("No active store");

    const { data: tx } = await supabase.from("wallet_transactions")
      .select("amount").eq("store_id", storeId).eq("reference", data.reference).maybeSingle();
    if (!tx) return { ok: false, message: "Transaction not found" };

    const r = await ps("/transaction/verify/" + encodeURIComponent(data.reference));
    if (r.data.status === "success") {
      const { data: done, error } = await supabase.rpc("complete_wallet_funding", {
        _store_id: storeId,
        _reference: data.reference,
        _amount: Number(r.data.amount) / 100,
      });
      if (error) throw error;
      return { ok: done === true };
    }

    await supabaseAdmin.from("wallet_transactions")
      .update({ status: "failed" })
      .eq("store_id", storeId)
      .eq("reference", data.reference)
      .eq("status", "pending");
    return { ok: false, message: r.data.gateway_response || "Failed" };
  });

export const setWalletPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pin: z.string().regex(/^\d{4,6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: pref } = await supabase.from("user_store_preferences")
      .select("active_store_id").eq("user_id", userId).maybeSingle();
    const storeId = pref?.active_store_id;
    if (!storeId) throw new Error("No active store");
    const { error } = await supabase.rpc("set_wallet_pin", { _store_id: storeId, _pin: data.pin });
    if (error) throw error;
    return { ok: true };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    amount: z.number().positive().max(10_000_000),
    pin: z.string().regex(/^\d{4,6}$/),
    idempotency_key: z.string().min(8).max(128),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const { data: pref } = await supabase.from("user_store_preferences")
      .select("active_store_id").eq("user_id", userId).maybeSingle();
    const storeId = pref?.active_store_id;
    if (!storeId) throw new Error("No active store");

    const { data: result, error } = await supabase.rpc("request_wallet_withdrawal", {
      _store_id: storeId,
      _amount: data.amount,
      _pin: data.pin,
      _idempotency_key: data.idempotency_key,
    });
    if (error) throw error;
    const row = Array.isArray(result) ? result[0] : result;
    return { ok: row?.ok === true, reference: row?.reference };
  });
