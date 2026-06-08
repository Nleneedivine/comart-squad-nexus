import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Trash2, Mail } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendInviteEmail } from "@/lib/invites.functions";
import { Switch } from "@/components/ui/switch";
import StaffPerformanceCard from "@/components/StaffPerformanceCard";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff Management — Comart+" }, { name: "description", content: "Invite and manage staff members for your Comart+ store." }] }),
  component: () => <ProtectedShell><Staff /></ProtectedShell>,
});

const ROLES = Object.keys(ROLE_LABELS).filter(r => r !== "owner" && r !== "admin");
const EXPIRY_OPTIONS = [
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

function inviteUrl(token: string) {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

function Staff() {
  const { store, user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_rep");
  const [expiryDays, setExpiryDays] = useState("7");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ link: string; email: string } | null>(null);

  const sendEmailFn = useServerFn(sendInviteEmail);

  const load = async () => {
    if (!store) return;
    const { data: detail, error: detailErr } = await supabase.rpc("get_store_members_detail", { _store_id: store.id });
    if (detailErr) {
      console.error("members detail error", detailErr);
      setMembers([]);
    } else {
      setMembers((detail || []).map((r: any) => ({
        user_id: r.user_id,
        name: r.full_name || "—",
        email: r.email || "—",
        phone: r.phone || "—",
        roles: r.roles || [],
        role_ids: r.role_ids || [],
        is_suspended: !!r.is_suspended,
        joined_at: r.joined_at,
        last_sign_in_at: r.last_sign_in_at,
        status: r.status,
      })));
    }

    // Auto-delete expired invitations (still pending past expiry)
    await supabase
      .from("staff_invites")
      .delete()
      .eq("store_id", store.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    // Only fetch pending invites (accepted move to team members; expired are deleted above)
    const { data: inv } = await supabase
      .from("staff_invites")
      .select("*")
      .eq("store_id", store.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setInvites(inv || []);
  };
  useEffect(() => { load(); }, [store]);

  const toggleSuspend = async (m: any, suspend: boolean) => {
    const { error } = await supabase.from("user_roles").update({ is_suspended: suspend }).in("id", m.role_ids);
    if (error) return toast.error(error.message);
    toast.success(suspend ? "Member suspended" : "Member reactivated");
    load();
  };

  const sendEmail = async (token: string, email: string, roleKey: string) => {
    try {
      await sendEmailFn({
        data: {
          email,
          invite_link: inviteUrl(token),
          store_name: store?.name || "Comart+",
          role_label: ROLE_LABELS[roleKey] || roleKey,
          inviter_name: user?.user_metadata?.full_name || user?.email || undefined,
        },
      });
      toast.success(`Invite email sent to ${email}`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send email");
    }
  };

  const invite = async () => {
    if (!store || !user) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter a valid email"); return; }
    const expiresAt = new Date(Date.now() + Number(expiryDays) * 86400000).toISOString();
    const { data, error } = await supabase.from("staff_invites").insert({
      store_id: store.id, email: email.trim().toLowerCase(), role: role as any, invited_by: user.id, expires_at: expiresAt,
    }).select("token,email,role").single();
    if (error) return toast.error(error.message);
    const link = inviteUrl(data.token);
    setCreated({ link, email: data.email });
    setEmail(""); setOpen(false); load();
    try { await navigator.clipboard.writeText(link); toast.success("Invite link copied"); } catch {}
    // Send email automatically via Resend
    sendEmail(data.token, data.email, data.role);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this invitation?")) return;
    const { error } = await supabase.from("staff_invites").update({ status: "revoked" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitation revoked"); load();
  };

  const copyLink = async (token: string) => {
    try { await navigator.clipboard.writeText(inviteUrl(token)); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-sm text-muted-foreground">Invite staff with a shareable link.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Invite staff</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a new staff member</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@example.com" /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Link expires in</Label>
                <Select value={expiryDays} onValueChange={setExpiryDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPIRY_OPTIONS.map(o => <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">A unique sign-up link will be created and emailed to the invitee. They must sign in with this email.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={invite}>Create invite link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {created && (
        <Card className="p-4 border-primary/40 bg-primary/5">
          <div className="text-sm font-semibold mb-1">Invite created for {created.email}</div>
          <div className="flex items-center gap-2">
            <Input value={created.link} readOnly className="font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(created.link).then(() => toast.success("Copied"))}><Copy className="h-3.5 w-3.5" /></Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Send this link to the invitee.</p>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Team members</h2>
        {members.length === 0 ? <p className="text-sm text-muted-foreground">No members yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Name</th><th>Email</th><th>Roles</th><th>Status</th><th className="text-right">Active</th></tr></thead>
            <tbody>
              {members.map((m: any) => (
                <tr key={m.user_id} className="border-t">
                  <td className="py-3">{m.name}</td>
                  <td>{m.email}</td>
                  <td className="py-3"><div className="flex gap-1 flex-wrap">{m.roles.map((r: string) => <Badge key={r} variant="secondary">{ROLE_LABELS[r] || r}</Badge>)}</div></td>
                  <td>{m.is_suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="outline">Active</Badge>}</td>
                  <td className="text-right"><Switch checked={!m.is_suspended} onCheckedChange={(v) => toggleSuspend(m, !v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <StaffPerformanceCard />

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Invitations</h2>
        {invites.length === 0 ? <p className="text-sm text-muted-foreground">No invitations yet.</p> : (
          <ul className="divide-y text-sm">
            {invites.map(i => {
              const expired = new Date(i.expires_at).getTime() < Date.now();
              const status = i.status === "accepted" ? "accepted" : i.status === "revoked" ? "revoked" : expired ? "expired" : "pending";
              const variant: any = status === "accepted" ? "default" : status === "pending" ? "secondary" : "destructive";
              return (
                <li key={i.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {ROLE_LABELS[i.role] || i.role} · {status === "pending" ? `Expires ${new Date(i.expires_at).toLocaleDateString()}` : `Created ${new Date(i.created_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={variant}>{status}</Badge>
                    {status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => sendEmail(i.token, i.email, i.role)} title="Email invite link"><Mail className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" onClick={() => copyLink(i.token)} title="Copy link"><Copy className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => revoke(i.id)} title="Revoke"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
