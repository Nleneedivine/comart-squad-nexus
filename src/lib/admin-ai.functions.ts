// Super Admin AI assistant. Streams via tool-calling against Lovable AI Gateway.
// Caller MUST be a superadmin (re-checked inside every mutating tool).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[]; name?: string };

interface ChatInput {
  messages: { role: "user" | "assistant"; content: string }[];
  storeContext?: string[]; // store ids resolved from @ mentions
  pageContext?: string[];  // page paths resolved from / mentions
}

const TOOLS = [
  { type: "function", function: { name: "list_stores", description: "List all stores on the platform, optionally filtered by name", parameters: { type: "object", properties: { search: { type: "string", description: "Optional name filter" }, limit: { type: "number", default: 20 } } } } },
  { type: "function", function: { name: "get_store_details", description: "Get full details for a store: owner, staff count, subscription, recent activity", parameters: { type: "object", properties: { store_id: { type: "string" } }, required: ["store_id"] } } },
  { type: "function", function: { name: "list_store_staff", description: "List staff/team members of a store with role, status, last active", parameters: { type: "object", properties: { store_id: { type: "string" } }, required: ["store_id"] } } },
  { type: "function", function: { name: "list_recent_orders", description: "List recent orders for a store", parameters: { type: "object", properties: { store_id: { type: "string" }, limit: { type: "number", default: 10 } }, required: ["store_id"] } } },
  { type: "function", function: { name: "list_recent_errors", description: "List recent app errors for a store", parameters: { type: "object", properties: { store_id: { type: "string" }, limit: { type: "number", default: 10 } } } } },
  { type: "function", function: { name: "message_store_admin", description: "Send a direct in-app message to the owner/admin of a store. Use when the user wants to ask or notify a store admin.", parameters: { type: "object", properties: { store_id: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["store_id", "body"] } } },
  { type: "function", function: { name: "list_messages_with_store", description: "List previous messages exchanged with a store's admin", parameters: { type: "object", properties: { store_id: { type: "string" }, limit: { type: "number", default: 20 } }, required: ["store_id"] } } },
  { type: "function", function: { name: "toggle_feature_flag", description: "Enable or disable a feature flag globally", parameters: { type: "object", properties: { flag_key: { type: "string" }, enabled: { type: "boolean" } }, required: ["flag_key", "enabled"] } } },
  { type: "function", function: { name: "list_feature_flags", description: "List all feature flags and their current state", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "suspend_user", description: "Suspend or unsuspend a user across all stores", parameters: { type: "object", properties: { user_id: { type: "string" }, suspended: { type: "boolean" } }, required: ["user_id", "suspended"] } } },
  { type: "function", function: { name: "update_subscription_status", description: "Update a store's subscription status (active, trialing, past_due, cancelled)", parameters: { type: "object", properties: { store_id: { type: "string" }, status: { type: "string" } }, required: ["store_id", "status"] } } },
  { type: "function", function: { name: "broadcast_message", description: "Create a platform-wide broadcast banner shown to all stores", parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, severity: { type: "string", enum: ["info", "warning", "critical"] } }, required: ["title", "body"] } } },
];

async function runTool(name: string, args: any, ctx: { supabase: any; admin: any; userId: string }) {
  const { admin, userId } = ctx;
  switch (name) {
    case "list_stores": {
      const q = admin.from("stores").select("id, name, owner_id, created_at, is_active").order("created_at", { ascending: false }).limit(args.limit || 20);
      if (args.search) q.ilike("name", `%${args.search}%`);
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { stores: data };
    }
    case "get_store_details": {
      const { data: store } = await admin.from("stores").select("*").eq("id", args.store_id).maybeSingle();
      if (!store) return { error: "Store not found" };
      const { data: owner } = await admin.from("profiles").select("id, full_name, email, phone").eq("id", store.owner_id).maybeSingle();
      const { count: staffCount } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("store_id", args.store_id);
      const { data: sub } = await admin.from("subscriptions").select("plan, status, billing_cycle, amount, current_period_end").eq("store_id", args.store_id).maybeSingle();
      const { count: orderCount } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("store_id", args.store_id);
      return { store, owner, staff_count: staffCount, subscription: sub, total_orders: orderCount };
    }
    case "list_store_staff": {
      const { data } = await admin.rpc("get_store_members_detail", { _store_id: args.store_id });
      return { staff: data };
    }
    case "list_recent_orders": {
      const { data } = await admin.from("orders").select("id, customer_name, amount, status, created_at").eq("store_id", args.store_id).order("created_at", { ascending: false }).limit(args.limit || 10);
      return { orders: data };
    }
    case "list_recent_errors": {
      const q = admin.from("app_errors").select("id, message, severity, created_at, route, store_id").order("created_at", { ascending: false }).limit(args.limit || 10);
      if (args.store_id) q.eq("store_id", args.store_id);
      const { data } = await q;
      return { errors: data };
    }
    case "message_store_admin": {
      const { data: store } = await admin.from("stores").select("owner_id, name").eq("id", args.store_id).maybeSingle();
      if (!store) return { error: "Store not found" };
      const { data, error } = await admin.from("admin_messages").insert({
        store_id: args.store_id, sender_id: userId, recipient_user_id: store.owner_id,
        subject: args.subject || null, body: args.body, from_superadmin: true,
      }).select("id").single();
      if (error) return { error: error.message };
      await admin.from("platform_audit_log").insert({ action: "admin_message_sent", actor_id: userId, target_store_id: args.store_id, metadata: { message_id: data.id, store: store.name } });
      return { ok: true, message_id: data.id, sent_to: store.name };
    }
    case "list_messages_with_store": {
      const { data } = await admin.from("admin_messages").select("id, subject, body, from_superadmin, read_at, created_at").eq("store_id", args.store_id).order("created_at", { ascending: false }).limit(args.limit || 20);
      return { messages: data };
    }
    case "toggle_feature_flag": {
      const { error } = await admin.from("feature_flags").upsert({ flag_key: args.flag_key, enabled: args.enabled }, { onConflict: "flag_key" });
      if (error) return { error: error.message };
      await admin.from("platform_audit_log").insert({ action: "flag_toggled", actor_id: userId, metadata: { flag_key: args.flag_key, enabled: args.enabled } });
      return { ok: true };
    }
    case "list_feature_flags": {
      const { data } = await admin.from("feature_flags").select("*").order("flag_key");
      return { flags: data };
    }
    case "suspend_user": {
      const { error } = await admin.from("user_roles").update({ is_suspended: args.suspended }).eq("user_id", args.user_id);
      if (error) return { error: error.message };
      await admin.from("platform_audit_log").insert({ action: args.suspended ? "user_suspended" : "user_unsuspended", actor_id: userId, metadata: { user_id: args.user_id } });
      return { ok: true };
    }
    case "update_subscription_status": {
      const { error } = await admin.from("subscriptions").update({ status: args.status }).eq("store_id", args.store_id);
      if (error) return { error: error.message };
      await admin.from("platform_audit_log").insert({ action: "subscription_status_changed", actor_id: userId, target_store_id: args.store_id, metadata: { status: args.status } });
      return { ok: true };
    }
    case "broadcast_message": {
      const { data, error } = await admin.from("broadcasts").insert({ title: args.title, body: args.body, severity: args.severity || "info", created_by: userId, is_active: true }).select("id").single();
      if (error) return { error: error.message };
      return { ok: true, broadcast_id: data.id };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export const superAdminChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ChatInput) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Verify superadmin
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sa } = await supabaseAdmin.from("superadmins").select("id").eq("user_id", userId).maybeSingle();
    if (!sa) throw new Error("Forbidden: superadmin only");

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    // Build context preamble
    let contextNote = "";
    if (data.storeContext?.length) {
      const { data: stores } = await supabaseAdmin.from("stores").select("id, name").in("id", data.storeContext);
      contextNote += `\n\nUser referenced these stores: ${(stores || []).map(s => `${s.name} (id: ${s.id})`).join(", ")}`;
    }
    if (data.pageContext?.length) {
      contextNote += `\n\nUser referenced these app pages: ${data.pageContext.join(", ")}`;
    }

    const systemPrompt = `You are the Comart+ Super Admin Assistant. You help the platform owner manage all tenant stores.

You have tools to:
- Inspect stores, staff, orders, errors, subscriptions, feature flags
- Send direct messages to store admins (use message_store_admin when the user wants to ask, notify, or get feedback from an admin)
- Configure platform settings (feature flags, subscription statuses, broadcasts, user suspensions)

Rules:
- When the user mentions a store by name, call list_stores first to resolve the ID if not provided in context.
- For destructive actions (suspend, broadcast, status changes), be concise and confirm what you did.
- Format responses in markdown. Use tables and lists when showing data.
- Be terse and operational, not chatty.${contextNote}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...data.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const toolTrace: { name: string; args: any; result: any }[] = [];
    let finalText = "";

    for (let step = 0; step < 8; step++) {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: TOOLS,
          tool_choice: "auto",
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 429) throw new Error("AI rate limit exceeded. Try again shortly.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
        throw new Error(`AI gateway error ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const body = await resp.json();
      const msg = body.choices?.[0]?.message;
      if (!msg) break;

      if (msg.tool_calls?.length) {
        messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
        for (const tc of msg.tool_calls) {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const result = await runTool(tc.function.name, parsedArgs, { supabase: context.supabase, admin: supabaseAdmin, userId });
          toolTrace.push({ name: tc.function.name, args: parsedArgs, result });
          messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(result).slice(0, 8000) });
        }
        continue;
      }

      finalText = msg.content || "";
      break;
    }

    return { text: finalText, tools: toolTrace };
  });
