import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MailCheck, Clock, ShieldX } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invite — Comart+" }, { name: "robots", content: "noindex" }] }),
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useParams();
  const { user, loading, refresh } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "missing" | "used" | "wrong-email">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("staff_invites").select("*").eq("token", token).maybeSingle();
      if (!data) { setState("missing"); return; }
      setInvite(data);
      if (data.status !== "pending" || data.accepted_at) { setState("used"); return; }
      if (new Date(data.expires_at).getTime() < Date.now()) { setState("expired"); return; }
      const { data: s } = await supabase.from("stores").select("name").eq("id", data.store_id).maybeSingle();
      setStore(s);
      setState("ready");
    })();
  }, [token]);

  useEffect(() => {
    if (state === "ready" && user && invite && user.email && invite.email && user.email.toLowerCase() !== invite.email.toLowerCase()) {
      setState("wrong-email");
    }
  }, [state, user, invite]);

  const accept = async () => {
    if (!user || !invite) return;
    setBusy(true);
    try {
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: user.id, store_id: invite.store_id, role: invite.role,
      });
      if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) throw roleErr;
      const { error: invErr } = await supabase.from("staff_invites").update({
        status: "accepted", accepted_by: user.id, accepted_at: new Date().toISOString(),
      }).eq("id", invite.id);
      if (invErr) throw invErr;
      await supabase.from("activity_log").insert({
        store_id: invite.store_id, user_id: user.id, type: "staff",
        activity: `${user.email} joined as ${ROLE_LABELS[invite.role] || invite.role}`,
      });
      await refresh();
      toast.success("Invitation accepted!");
      nav({ to: "/Dashboard" });
    } catch (e: any) {
      toast.error(e.message || "Could not accept invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 md:p-8 space-y-4">
        {state === "loading" && <div className="text-center text-muted-foreground py-8">Checking invitation…</div>}

        {state === "missing" && (
          <div className="text-center space-y-3 py-4">
            <ShieldX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Invitation not found</h1>
            <p className="text-sm text-muted-foreground">This link is invalid or was revoked.</p>
          </div>
        )}

        {state === "expired" && (
          <div className="text-center space-y-3 py-4">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Invitation expired</h1>
            <p className="text-sm text-muted-foreground">Ask the store admin to send you a new invite.</p>
          </div>
        )}

        {state === "used" && (
          <div className="text-center space-y-3 py-4">
            <MailCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Already used</h1>
            <p className="text-sm text-muted-foreground">This invitation has already been accepted or cancelled.</p>
          </div>
        )}

        {state === "wrong-email" && (
          <div className="text-center space-y-3 py-4">
            <ShieldX className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="text-xl font-bold">Wrong account</h1>
            <p className="text-sm text-muted-foreground">
              This invitation was sent to <strong>{invite?.email}</strong>. You're signed in as {user?.email}.
            </p>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }}>Sign out & switch account</Button>
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-4">
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary mb-2" />
              <h1 className="text-xl font-bold">You're invited to join</h1>
              <p className="text-2xl font-bold mt-1">{store?.name}</p>
              <p className="text-sm text-muted-foreground mt-1">as <strong>{ROLE_LABELS[invite.role] || invite.role}</strong></p>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Expires {new Date(invite.expires_at).toLocaleDateString()}
            </p>
            {!loading && !user && (
              <div className="space-y-2">
                <p className="text-sm text-center">Sign in or create an account with <strong>{invite.email}</strong> to accept.</p>
                <Button className="w-full" onClick={() => nav({ to: "/auth", search: { redirect: `/invite/${token}` } as any })}>Sign in to continue</Button>
              </div>
            )}
            {user && (
              <Button className="w-full" onClick={accept} disabled={busy} size="lg">
                {busy ? "Accepting…" : "Accept invitation"}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
