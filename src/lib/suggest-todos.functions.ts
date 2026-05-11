import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM = `You are a productivity assistant for a Nigerian retail/sales operator using Comart+.
Given the user's open todos, assigned tasks, assigned open orders and active goals, propose 5-8
focused, action-oriented to-do items for TODAY. Each item must be short (<= 80 chars).
Return STRICT JSON: { "items": [ { "title": string, "priority": "low"|"medium"|"high",
"time_of_day": "morning"|"afternoon"|"evening", "rationale"?: string } ] }.
No commentary, no markdown.`;

export const suggestTodos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const { supabase, userId } = context;

    const [todosR, tasksR, ordersR, goalsR] = await Promise.all([
      supabase.from("todos").select("title,priority,due_date,completed").eq("user_id", userId).eq("completed", false).limit(30),
      supabase.from("tasks").select("title,priority,deadline,status").eq("assigned_to", userId).neq("status", "completed").limit(30),
      supabase.from("orders").select("customer_name,amount,status,created_at").eq("assigned_to", userId).in("status", ["pending","processing","shipped"]).limit(30),
      supabase.from("goals").select("title,target_value,current_value,unit,deadline,status").eq("status", "active").limit(15),
    ]);

    const ctx = {
      open_todos: todosR.data || [],
      assigned_tasks: tasksR.data || [],
      open_orders: ordersR.data || [],
      active_goals: goalsR.data || [],
      today: new Date().toISOString().slice(0, 10),
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(ctx) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("Rate limited. Try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted.");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return { items };
  });
