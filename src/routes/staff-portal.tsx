import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Phone, Clock, LogIn, LogOut, Upload, TrendingUp, Package, CheckCircle2, XCircle } from "lucide-react";
import { formatNaira } from "@/lib/format";

export const Route = createFileRoute("/staff-portal")({
  head: () => ({ meta: [{ title: "My Workspace — Comart+" }, { name: "robots", content: "noindex" }] }),
  component: () => <ProtectedShell><StaffPortal /></ProtectedShell>,
});

function StaffPortal() {
  const { user, store, refresh } = useAuth();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [maxCalls, setMaxCalls] = useState(3);
  const [perf, setPerf] = useState({ assigned: 0, confirmed: 0, cancelled: 0, delivered: 0 });
  const [profile, setProfile] = useState<any>({ full_name: "", phone: "", email: "", address: "", bio: "", avatar_url: "" });
  const [todayAtt, setTodayAtt] = useState<any | null>(null);
  const [attHistory, setAttHistory] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [callOpen, setCallOpen] = useState(false);
  const [callOutcome, setCallOutcome] = useState("no_answer");
  const [callNotes, setCallNotes] = useState("");

  const load = async () => {
    if (!store || !user) return;
    const { data: o } = await supabase.from("orders")
      .select("id, order_number, customer_name, amount, status, notes, created_at, customers(phone, full_address)")
      .eq("store_id", store.id).eq("assigned_to", user.id).eq("is_archived", false)
      .order("created_at", { ascending: false }).limit(100);
    setOrders(o || []);
    const { data: s } = await supabase.from("stores").select("max_call_attempts").eq("id", store.id).maybeSingle();
    setMaxCalls(s?.max_call_attempts ?? 3);

    // Performance
    const { data: stats } = await supabase.from("orders")
      .select("status").eq("store_id", store.id).eq("assigned_to", user.id);
    const counts = { assigned: stats?.length || 0, confirmed: 0, cancelled: 0, delivered: 0 };
    (stats || []).forEach((r: any) => {
      if (["delivered","completed","fulfilled"].includes(r.status)) counts.delivered++;
      if (["processing","shipped"].includes(r.status)) counts.confirmed++;
      if (["cancelled","canceled"].includes(r.status)) counts.cancelled++;
    });
    setPerf(counts);

    // Profile
    const { data: p } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (p) setProfile({ full_name: p.full_name || "", phone: p.phone || "", email: p.email || user.email || "", address: p.address || "", bio: p.bio || "", avatar_url: p.avatar_url || "" });

    // Attendance today
    const today = new Date().toISOString().slice(0,10);
    const { data: a } = await supabase.from("attendance")
      .select("*").eq("store_id", store.id).eq("user_id", user.id)
      .gte("clock_in", today + "T00:00:00").order("clock_in", { ascending: false }).limit(1);
    setTodayAtt(a?.[0] || null);
    const { data: hist } = await supabase.from("attendance")
      .select("*").eq("store_id", store.id).eq("user_id", user.id)
      .order("clock_in", { ascending: false }).limit(20);
    setAttHistory(hist || []);
  };

  useEffect(() => { load(); }, [store, user]);

  const openOrder = async (o: any) => {
    setSelectedOrder(o);
    const { data } = await supabase.from("order_call_attempts")
      .select("*").eq("order_id", o.id).order("created_at", { ascending: true });
    setAttempts(data || []);
  };

  const logCall = async () => {
    if (!selectedOrder || !user || !store) return;
    if (attempts.length >= maxCalls) return toast.error(`Max ${maxCalls} calls reached`);
    const { error } = await supabase.from("order_call_attempts").insert({
      store_id: store.id, order_id: selectedOrder.id, user_id: user.id,
      attempt_number: attempts.length + 1, outcome: callOutcome, notes: callNotes || null,
    });
    if (error) return toast.error(error.message);
    // Auto-update order status based on outcome
    if (callOutcome === "confirmed") await supabase.from("orders").update({ status: "processing" }).eq("id", selectedOrder.id);
    if (callOutcome === "cancelled") await supabase.from("orders").update({ status: "cancelled" }).eq("id", selectedOrder.id);
    toast.success("Call logged");
    setCallNotes(""); setCallOutcome("no_answer"); setCallOpen(false);
    openOrder(selectedOrder); load();
  };

  const updateStatus = async (status: string) => {
    if (!selectedOrder) return;
    const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", selectedOrder.id);
    if (error) return toast.error(error.message);
    toast.success("Status updated"); openOrder(selectedOrder); load();
  };

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name, phone: profile.phone, address: profile.address, bio: profile.bio,
    }).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated"); refresh();
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setProfile((p: any) => ({ ...p, avatar_url: url }));
    toast.success("Avatar updated");
  };

  const clockIn = async () => {
    if (!store || !user) return;
    const { error } = await supabase.from("attendance").insert({ store_id: store.id, user_id: user.id, clock_in: new Date().toISOString() });
    if (error) return toast.error(error.message);
    toast.success("Clocked in"); load();
  };

  const clockOut = async () => {
    if (!todayAtt) return;
    const { error } = await supabase.from("attendance").update({ clock_out: new Date().toISOString() }).eq("id", todayAtt.id);
    if (error) return toast.error(error.message);
    toast.success("Clocked out"); load();
  };

  const conversion = perf.assigned ? Math.round((perf.delivered / perf.assigned) * 100) : 0;
  const initials = useMemo(() => (profile.full_name || profile.email || "?").split(" ").map((s: string) => s[0]).join("").slice(0,2).toUpperCase(), [profile]);

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Workspace</h1>
          <p className="text-sm text-muted-foreground">Your assigned orders, calls, attendance and performance.</p>
        </div>
        <div className="flex items-center gap-2">
          {todayAtt && !todayAtt.clock_out
            ? <Button onClick={clockOut} variant="outline"><LogOut className="h-4 w-4 mr-1" /> Clock out</Button>
            : <Button onClick={clockIn}><LogIn className="h-4 w-4 mr-1" /> Clock in</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Assigned</div><div className="text-2xl font-bold">{perf.assigned}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Delivered</div><div className="text-2xl font-bold text-green-600">{perf.delivered}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Cancelled</div><div className="text-2xl font-bold text-destructive">{perf.cancelled}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" />Conversion</div><div className="text-2xl font-bold">{conversion}%</div></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="orders"><Package className="h-4 w-4 mr-1" />My Orders</TabsTrigger>
          <TabsTrigger value="attendance"><Clock className="h-4 w-4 mr-1" />Attendance</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-2 mt-4">
          {orders.length === 0
            ? <Card className="p-8 text-center text-muted-foreground">No orders assigned to you yet.</Card>
            : orders.map(o => (
              <Card key={o.id} className="p-4 cursor-pointer hover:bg-muted/40" onClick={() => openOrder(o)}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="font-semibold">{o.customer_name || "—"} <span className="text-xs text-muted-foreground">#{o.order_number || o.id.slice(0,8)}</span></div>
                    <div className="text-xs text-muted-foreground">{o.customers?.phone || "no phone"} · {o.customers?.full_address || "no address"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{o.status}</Badge>
                    <span className="font-semibold">{formatNaira(o.amount)}</span>
                  </div>
                </div>
              </Card>
            ))}
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Recent attendance</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Date</th><th>In</th><th>Out</th><th className="text-right">Hours</th></tr></thead>
              <tbody>
                {attHistory.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground">No records yet</td></tr>}
                {attHistory.map(a => {
                  const hrs = a.clock_out ? ((new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000).toFixed(2) : "—";
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="py-2">{new Date(a.clock_in).toLocaleDateString()}</td>
                      <td>{new Date(a.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                      <td>{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                      <td className="text-right">{hrs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="mt-4">
          <Card className="p-6 space-y-4 max-w-2xl">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={profile.avatar_url} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <label className="text-sm flex items-center gap-1 cursor-pointer text-primary hover:underline">
                <Upload className="h-3.5 w-3.5" /> Change photo
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Email</Label><Input value={profile.email} disabled /></div>
              <div className="md:col-span-2"><Label>Address</Label><Input value={profile.address} onChange={e => setProfile({ ...profile, address: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Bio</Label><Textarea rows={3} value={profile.bio} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></div>
            </div>
            <Button onClick={saveProfile}>Save profile</Button>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={o => !o && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Order #{selectedOrder?.order_number || selectedOrder?.id?.slice(0,8)}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Customer</div><div className="font-medium">{selectedOrder.customer_name}</div></div>
                <div><div className="text-xs text-muted-foreground">Phone</div><div className="font-medium">{selectedOrder.customers?.phone || "—"}</div></div>
                <div className="col-span-2"><div className="text-xs text-muted-foreground">Address</div><div className="font-medium">{selectedOrder.customers?.full_address || "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Amount</div><div className="font-semibold">{formatNaira(selectedOrder.amount)}</div></div>
                <div><div className="text-xs text-muted-foreground">Status</div><Badge>{selectedOrder.status}</Badge></div>
                {selectedOrder.notes && <div className="col-span-2"><div className="text-xs text-muted-foreground">Notes</div><div>{selectedOrder.notes}</div></div>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm">Call attempts ({attempts.length}/{maxCalls})</h4>
                  {attempts.length < maxCalls && (
                    <Button size="sm" onClick={() => setCallOpen(true)}><Phone className="h-3 w-3 mr-1" />Log call</Button>
                  )}
                </div>
                {attempts.length === 0
                  ? <p className="text-sm text-muted-foreground">No calls logged yet.</p>
                  : (
                    <ul className="space-y-2 text-sm">
                      {attempts.map(a => (
                        <li key={a.id} className="border rounded p-2">
                          <div className="flex justify-between">
                            <span className="font-medium">Call #{a.attempt_number} · <Badge variant="outline">{a.outcome}</Badge></span>
                            <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                          </div>
                          {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => updateStatus("processing")}><CheckCircle2 className="h-3 w-3 mr-1" />Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => updateStatus("delivered")}>Delivered</Button>
                <Button size="sm" variant="destructive" onClick={() => updateStatus("cancelled")}><XCircle className="h-3 w-3 mr-1" />Cancel</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Log call dialog */}
      <Dialog open={callOpen} onOpenChange={setCallOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log call attempt</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Outcome</Label>
              <Select value={callOutcome} onValueChange={setCallOutcome}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_answer">No answer</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                  <SelectItem value="confirmed">Confirmed order</SelectItem>
                  <SelectItem value="cancelled">Cancelled order</SelectItem>
                  <SelectItem value="callback">Customer requested callback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={3} value={callNotes} onChange={e => setCallNotes(e.target.value)} placeholder="What did the customer say?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCallOpen(false)}>Cancel</Button>
            <Button onClick={logCall}>Save attempt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
