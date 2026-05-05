import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff Management — Comart+" }, { name: "description", content: "Invite and manage staff members for your Comart+ store." }] }),
  component: () => <ProtectedShell><Staff /></ProtectedShell>,
});

const ROLES = Object.keys(ROLE_LABELS).filter(r => r !== "owner" && r !== "admin");

function Staff() {
  const { store, user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_rep");

  const load = async () => {
    if (!store) return;
    const { data: roleRows } = await supabase.from("user_roles").select("user_id, role, profiles(full_name, email)").eq("store_id", store.id);
    const grouped: Record<string, { name: string; email: string; roles: string[] }> = {};
    (roleRows || []).forEach((r: any) => {
      const k = r.user_id;
      if (!grouped[k]) grouped[k] = { name: r.profiles?.full_name || "—", email: r.profiles?.email || "—", roles: [] };
      grouped[k].roles.push(r.role);
    });
    setMembers(Object.values(grouped));
    const { data: inv } = await supabase.from("staff_invites").select("*").eq("store_id", store.id).order("created_at", { ascending: false });
    setInvites(inv || []);
  };
  useEffect(() => { load(); }, [store]);

  const invite = async () => {
    if (!store || !user) return;
    const { error } = await supabase.from("staff_invites").insert({ store_id: store.id, email, role: role as any, invited_by: user.id });
    if (error) return toast.error(error.message);
    toast.success("Invitation sent");
    setEmail(""); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-sm text-muted-foreground">Invite staff and assign roles.</p>
        </div>
        <Dialog>
          <DialogTrigger asChild><Button>Invite staff</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Invite a new staff member</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={invite} className="w-full">Send invite</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Team members</h2>
        {members.length === 0 ? <p className="text-sm text-muted-foreground">No members yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Name</th><th>Email</th><th>Roles</th></tr></thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={i} className="border-t">
                  <td className="py-3">{m.name}</td>
                  <td>{m.email}</td>
                  <td className="flex gap-1 flex-wrap py-3">{m.roles.map((r: string) => <Badge key={r} variant="secondary">{ROLE_LABELS[r] || r}</Badge>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Pending invitations</h2>
        {invites.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> : (
          <ul className="divide-y text-sm">
            {invites.map(i => (
              <li key={i.id} className="py-3 flex justify-between">
                <div><div className="font-medium">{i.email}</div><div className="text-xs text-muted-foreground">{ROLE_LABELS[i.role] || i.role}</div></div>
                <Badge variant="outline">{i.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
