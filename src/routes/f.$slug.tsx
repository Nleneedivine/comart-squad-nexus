import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import { toast } from "sonner";
import { CheckCircle2, Minus, Plus, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/f/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Order Form — Comart+` },
      { name: "description", content: "Place your order securely with Comart+." },
      { property: "og:title", content: "Place Your Order" },
      { property: "og:description", content: `Secure order form powered by Comart+` },
    ],
  }),
  component: PublicForm,
});

function PublicForm() {
  const { slug } = Route.useParams();
  const [form, setForm] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [info, setInfo] = useState({ customer_name: "", customer_phone: "", customer_email: "", state: "", city: "", customer_address: "", notes: "" });
  const [done, setDone] = useState(false);
  const [orderRef, setOrderRef] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("sales_forms").select("*").eq("slug", slug).eq("status", "active").maybeSingle();
      if (!f) { setLoading(false); return; }
      setForm(f);
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from("products").select("id, name, selling_price, stock_qty").in("id", f.product_ids || []),
        supabase.from("stores").select("name, logo_url, contact_phone").eq("id", f.store_id).maybeSingle(),
      ]);
      setProducts(p || []);
      setStore(s);
      setLoading(false);
    })();
  }, [slug]);

  const total = products.reduce((s, p) => s + Number(p.selling_price) * (qty[p.id] || 0), 0);
  const inc = (id: string) => setQty(q => ({ ...q, [id]: (q[id] || 0) + 1 }));
  const dec = (id: string) => setQty(q => ({ ...q, [id]: Math.max(0, (q[id] || 0) - 1) }));

  const submit = async () => {
    if (!info.customer_name.trim() || !info.customer_phone.trim()) return toast.error("Name and phone are required");
    const items = products.filter(p => (qty[p.id] || 0) > 0).map(p => ({
      product_id: p.id, name: p.name, unit_price: Number(p.selling_price), quantity: qty[p.id], subtotal: Number(p.selling_price) * qty[p.id],
    }));
    if (items.length === 0) return toast.error("Please select at least one product");
    setSubmitting(true);
    const fullAddr = [info.customer_address, info.city, info.state].filter(Boolean).join(", ");
    const { error } = await supabase.from("form_submissions").insert({
      store_id: form.store_id, form_id: form.id,
      customer_name: info.customer_name, customer_phone: info.customer_phone,
      customer_email: info.customer_email || null, customer_address: fullAddr,
      notes: info.notes || null, items, total,
    });
    if (error) { setSubmitting(false); return toast.error(error.message); }

    const orderNumber = "ORD-" + Date.now().toString(36).toUpperCase();
    try {
      const { data: existingCust } = await supabase.from("customers")
        .select("id").eq("store_id", form.store_id).eq("phone", info.customer_phone).maybeSingle();
      let custId = existingCust?.id;
      if (!custId) {
        const { data: newCust } = await supabase.from("customers").insert({
          store_id: form.store_id, name: info.customer_name, phone: info.customer_phone,
          email: info.customer_email || null, address: fullAddr || null, state: info.state || null, city: info.city || null,
        }).select("id").maybeSingle();
        custId = newCust?.id;
      }
      const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
      const { data: ord } = await supabase.from("orders").insert({
        store_id: form.store_id, customer_id: custId || null, customer_name: info.customer_name,
        amount: total, units: totalUnits, status: "pending", order_number: orderNumber,
        notes: `From form: ${form.title}`,
      }).select("id").maybeSingle();
      if (ord?.id) {
        await supabase.from("order_items").insert(items.map(i => ({
          order_id: ord.id, store_id: form.store_id, product_id: i.product_id,
          product_name: i.name, quantity: i.quantity, unit_price: i.unit_price, subtotal: i.subtotal,
        })));
      }
    } catch { /* silent */ }
    setOrderRef(orderNumber);
    setDone(true);
    setSubmitting(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!form) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="p-8 max-w-md text-center">
        <h1 className="text-xl font-bold mb-2">Form not found</h1>
        <p className="text-sm text-muted-foreground">This order form is no longer active.</p>
      </Card>
    </div>
  );
  if (done) return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <Header store={store} />
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Order placed!</h1>
          <p className="text-sm text-muted-foreground">{store?.name || "The store"} will contact you shortly to confirm your order.</p>
          <div className="bg-muted rounded-md p-3">
            <p className="text-xs text-muted-foreground">Order Reference</p>
            <p className="font-mono font-bold text-lg">{orderRef}</p>
          </div>
          {store?.contact_phone && <p className="text-xs text-muted-foreground">Questions? Call {store.contact_phone}</p>}
        </Card>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <Header store={store} />
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <Card className="p-6 space-y-2">
            <h1 className="text-2xl font-bold">{form.title}</h1>
            {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-primary" /> Select Products</h2>
            <div className="space-y-2">
              {products.length === 0 && <p className="text-sm text-muted-foreground">No products available.</p>}
              {products.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 border rounded-md">
                  <div className="flex-1">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{formatNaira(Number(p.selling_price))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => dec(p.id)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center font-semibold">{qty[p.id] || 0}</span>
                    <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => inc(p.id)}><Plus className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-primary">{formatNaira(total)}</span>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Your Details</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Full Name *</Label><Input value={info.customer_name} onChange={e => setInfo({ ...info, customer_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone *</Label><Input placeholder="08012345678" value={info.customer_phone} onChange={e => setInfo({ ...info, customer_phone: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Email</Label><Input type="email" value={info.customer_email} onChange={e => setInfo({ ...info, customer_email: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Select value={info.state} onValueChange={v => setInfo({ ...info, state: v })}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{NIGERIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>City</Label><Input value={info.city} onChange={e => setInfo({ ...info, city: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Delivery Address</Label><Textarea value={info.customer_address} onChange={e => setInfo({ ...info, customer_address: e.target.value })} /></div>
              <div className="space-y-1.5 md:col-span-2"><Label>Order Notes</Label><Textarea value={info.notes} placeholder="Anything we should know?" onChange={e => setInfo({ ...info, notes: e.target.value })} /></div>
            </div>
            <Button onClick={submit} disabled={submitting} className="w-full" size="lg">{submitting ? "Placing order..." : `Place Order · ${formatNaira(total)}`}</Button>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Header({ store }: { store: any }) {
  return (
    <header className="bg-background border-b">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 flex items-center gap-3">
        {store?.logo_url
          ? <img src={store.logo_url} alt={store.name} className="h-10 w-10 rounded-md object-cover" />
          : <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold">{(store?.name || "S").slice(0, 1)}</div>}
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{store?.name || "Store"}</p>
          <p className="text-xs text-muted-foreground">Powered by <span className="text-primary font-medium">Comart+</span></p>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-background py-5 text-center text-xs text-muted-foreground">
      Secure checkout · Powered by <a href="/" className="text-primary font-medium">Comart+</a>
    </footer>
  );
}
