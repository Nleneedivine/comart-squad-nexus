import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Circle, MessageSquare, Undo2 } from "lucide-react";

export const Route = createFileRoute("/orders/$id")({
  head: () => ({ meta: [{ title: "Order Detail — Comart+" }, { name: "description", content: "View order details and status timeline." }] }),
  component: () => <ProtectedShell><OrderDetail /></ProtectedShell>,
});

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;

function OrderDetail() {
  const { id } = Route.useParams();
  const { store, user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [newStatus, setNewStatus] = useState<string>("");

  const load = async () => {
    const { data: o } = await supabase.from("orders").select("*, customers(name, phone)").eq("id", id).maybeSingle();
    setOrder(o); setNewStatus(o?.status || "");
    const { data: it } = await supabase.from("order_items").select("*").eq("order_id", id);
    setItems(it || []);
    const { data: h } = await supabase.from("order_status_history").select("*").eq("order_id", id).order("created_at");
    setHistory(h || []);
  };
  useEffect(() => { load(); }, [id]);

  const updateStatus = async () => {
    if (!order || !user || !store || newStatus === order.status) return;
    const { error } = await supabase.from("orders").update({ status: newStatus as any }).eq("id", order.id);
    if (error) return toast.error(error.message);
    await supabase.from("order_status_history").insert({ order_id: order.id, store_id: store.id, status: newStatus as any, changed_by: user.id });
    toast.success("Status updated"); load();
  };

  if (!order) return <Card className="p-8 text-center text-muted-foreground">Loading...</Card>;

  return (
    <div className="space-y-6">
      <Link to="/orders" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Back to Orders</Link>
      <Card className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Order {order.order_number || order.id.slice(0, 8)}</h1>
            <p className="text-sm text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
            <p className="text-sm mt-2">Customer: <span className="font-medium">{order.customers?.name || order.customer_name || "—"}</span></p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <WhatsAppSendDialog order={order} />
            <RefundDialog order={order} />
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={updateStatus} disabled={newStatus === order.status}>Update</Button>
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-4">
          <h2 className="font-semibold mb-3 px-2">Items</h2>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead>Subtotal</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map(i => (
                <TableRow key={i.id}>
                  <TableCell>{i.product_name}</TableCell>
                  <TableCell>{i.quantity}</TableCell>
                  <TableCell>{formatNaira(Number(i.unit_price))}</TableCell>
                  <TableCell>{formatNaira(Number(i.subtotal))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t mt-3 pt-3 flex justify-between px-2 font-bold"><span>Total</span><span className="text-primary">{formatNaira(Number(order.amount))}</span></div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-4">Status Timeline</h2>
          <ol className="space-y-4">
            {history.length === 0 ? <p className="text-sm text-muted-foreground">No history.</p> :
              history.map((h, i) => (
                <li key={h.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center"><Circle className="h-2 w-2 fill-current" /></div>
                    {i < history.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <Badge variant="outline" className="capitalize">{h.status}</Badge>
                    <div className="text-xs text-muted-foreground mt-1">{new Date(h.created_at).toLocaleString()}</div>
                    {h.note && <div className="text-sm mt-1">{h.note}</div>}
                  </div>
                </li>
              ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}

function fillTemplate(body: string, order: any, storeName: string) {
  return body
    .replaceAll("{customer_name}", order.customers?.name || order.customer_name || "")
    .replaceAll("{order_number}", order.order_number || order.id?.slice(0, 8) || "")
    .replaceAll("{amount}", new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(order.amount || 0)))
    .replaceAll("{store_name}", storeName || "")
    .replaceAll("{status}", order.status || "");
}

function WhatsAppSendDialog({ order }: { order: any }) {
  const { store } = useAuth();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [message, setMessage] = useState("");
  const phone = order.customers?.phone || "";

  useEffect(() => {
    if (!open || !store) return;
    supabase.from("message_templates").select("*").eq("store_id", store.id).eq("channel", "whatsapp").then(({ data }) => setTemplates(data || []));
  }, [open, store]);

  const onPick = (id: string) => {
    setSelectedId(id);
    const t = templates.find(x => x.id === id);
    if (t) setMessage(fillTemplate(t.body, order, store?.name || ""));
  };

  const send = () => {
    if (!phone) return toast.error("Customer phone missing");
    if (!message.trim()) return toast.error("Message empty");
    const cleaned = phone.replace(/[^\d]/g, "");
    window.open(`https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><MessageSquare className="h-4 w-4 mr-1" />WhatsApp</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Send WhatsApp message</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Template</Label>
            <Select value={selectedId} onValueChange={onPick}>
              <SelectTrigger><SelectValue placeholder={templates.length ? "Pick a template" : "No templates yet"} /></SelectTrigger>
              <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea rows={6} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type or pick a template" />
          </div>
          <p className="text-xs text-muted-foreground">To: {phone || "(no phone on customer)"}</p>
          <Button onClick={send} className="w-full" disabled={!phone}>Open WhatsApp</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({ order }: { order: any }) {
  const { store, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(String(order.amount || 0));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!store || !user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    const { error } = await supabase.from("refunds").insert({
      store_id: store.id, order_id: order.id, amount: amt,
      reason: reason || null, requested_by: user.id, status: "requested",
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Refund requested"); setOpen(false); setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Undo2 className="h-4 w-4 mr-1" />Refund</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request a refund</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (₦)</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>Reason</Label><Textarea rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this refund being requested?" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

