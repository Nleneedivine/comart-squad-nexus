import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("platform_audit_log").select("*").order("created_at", { ascending: false }).limit(200).then(({ data }) => {
      setRows(data ?? []); setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr><th className="p-3">When</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Metadata</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="p-10 text-center">
                <ScrollText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <div className="text-muted-foreground">No audit entries yet</div>
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t align-top">
                <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-3 font-mono text-xs">{r.action}</td>
                <td className="p-3 text-xs">{r.target_type ?? "—"} {r.target_id ? `· ${r.target_id.slice(0,8)}` : ""}</td>
                <td className="p-3 text-xs text-muted-foreground"><pre className="whitespace-pre-wrap">{JSON.stringify(r.metadata, null, 0)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
