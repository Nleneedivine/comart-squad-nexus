import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const FLAGS = ["wallet", "marketing_forms", "agents", "waybill", "webhooks", "ai_assistant"];

export const Route = createFileRoute("/admin/flags")({
  component: FlagsPage,
});

function FlagsPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.from("stores").select("id,name").order("name").then(({ data }) => {
      setStores(data ?? []);
      if (data?.[0]) setStoreId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!storeId) return;
    supabase.from("feature_flags").select("flag_key,enabled").eq("store_id", storeId).then(({ data }) => {
      const m: Record<string, boolean> = {};
      FLAGS.forEach(f => { m[f] = true; });
      (data ?? []).forEach((r: any) => { m[r.flag_key] = r.enabled; });
      setFlags(m);
    });
  }, [storeId]);

  const toggle = async (flag: string, enabled: boolean) => {
    setFlags(prev => ({ ...prev, [flag]: enabled }));
    const { error } = await supabase.from("feature_flags").upsert({ store_id: storeId, flag_key: flag, enabled }, { onConflict: "store_id,flag_key" });
    if (error) { toast.error(error.message); return; }
    toast.success(`${flag} ${enabled ? "enabled" : "disabled"}`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Feature Flags</h1>
      <div className="max-w-sm">
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
          <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card className="divide-y">
        {FLAGS.map(f => (
          <div key={f} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium capitalize">{f.replace(/_/g, " ")}</div>
              <div className="text-xs text-muted-foreground">flag key: {f}</div>
            </div>
            <Switch checked={flags[f] ?? true} onCheckedChange={(v) => toggle(f, v)} />
          </div>
        ))}
      </Card>
    </div>
  );
}
