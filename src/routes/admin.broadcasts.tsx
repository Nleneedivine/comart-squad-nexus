import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/broadcasts")({
  component: BroadcastsPage,
});

function BroadcastsPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [rows, setRows] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("broadcasts").select("*").order("sent_at", { ascending: false }).limit(50);
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Title and body required");
    const { error } = await supabase.from("broadcasts").insert({ title, body, audience, sent_by: user?.id });
    if (error) return toast.error(error.message);
    if (user) await supabase.from("platform_audit_log").insert({ actor_id: user.id, action: "broadcast.send", target_type: "broadcast", metadata: { title, audience } });
    toast.success("Broadcast sent");
    setTitle(""); setBody("");
    load();
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Broadcasts</h1>
      <Card className="p-4 space-y-3">
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Message body…" value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        <div className="flex items-center gap-3">
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              <SelectItem value="starter">Starter plan</SelectItem>
              <SelectItem value="growth">Growth plan</SelectItem>
              <SelectItem value="enterprise">Enterprise plan</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={send}>Send broadcast</Button>
        </div>
      </Card>
      <Card className="divide-y">
        {rows.length === 0 && <div className="p-6 text-center text-muted-foreground text-sm">No broadcasts yet</div>}
        {rows.map(r => (
          <div key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">{new Date(r.sent_at).toLocaleString()} · {r.audience}</div>
            </div>
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{r.body}</p>
          </div>
        ))}
      </Card>
    </div>
  );
}
