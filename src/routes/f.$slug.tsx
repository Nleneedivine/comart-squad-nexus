import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/f/$slug")({
  head: ({ params }) => ({ meta: [{ title: `Order Form — ${params.slug}` }, { name: "description", content: "Place your order." }] }),
  component: PublicForm,
});

function PublicForm() {
  const { slug } = Route.useParams();
  const [form, setForm] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [info, setInfo] = useState({ customer_name: "", customer_phone: "", customer_email: "", customer_address: "", notes: "" });
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: f } = await supabase.from("sales_forms").select("*").eq("slug", slug).eq("status", "active").maybeSingle();
      if (!f) { setLoading(false); return; }
      setForm(f);
      const { data: p } = await supabase.from("products").select("id, name, selling_price").in("id", f.product_ids || []);
      setProducts(p || []);
      setLoading(false);
    })();
  }, [slug]);

  const total = products.reduce((s, p) => s + Number(p.selling_price) * (qty[p.id] || 0), 0);

  const submit = async () => {
    if (!info.customer_name || !info.customer_phone) return toast.error("Name and phone required");
    const items = products.filter(p => (qty[p.id] || 0) > 0).map(p => ({
      product_id: p.id, name: p.name, unit_price: Number(p.selling_price), quantity: qty[p.id], subtotal: Number(p.selling_price) * qty[p.id],
    }));
    if (items.length === 0) return toast.error("Pick at least one product");
    const { error } = await supabase.from("form_submissions").insert({
      store_id: form.store_id, form_id: form.id, ...info, items, total,
    });
    if (error) return toast.error(error.message);
    setDone(true);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!form) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Form not found or inactive.</div>;
  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="p-8 max-w-md text-center space-y-3">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
        <h1 className="text-xl font-bold">Order placed!</h1>
        <p className="text-sm text-muted-foreground">We'll contact you shortly to confirm your order.</p>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card className="p-6 space-y-2">
          <h1 className="text-2xl font-bold">{form.title}</h1>
          {form.description && <p className="text-sm text-muted-foreground">{form.description}</p>}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Your Details</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Full Name *</Label><Input value={info.customer_name} onChange={e => setInfo({ ...info, customer_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Phone *</Label><Input placeholder="08012345678" value={info.customer_phone} onChange={e => setInfo({ ...info, customer_phone: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={info.customer_email} onChange={e => setInfo({ ...info, customer_email: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Delivery Address</Label><Textarea value={info.customer_address} onChange={e => setInfo({ ...info, customer_address: e.target.value })} /></div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">Products</h2>
          <div className="space-y-2">
            {products.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 border rounded-md">
                <div className="flex-1"><p className="font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{formatNaira(Number(p.selling_price))}</p></div>
                <Input type="number" min={0} className="w-24" value={qty[p.id] || ""} onChange={e => setQty({ ...qty, [p.id]: Math.max(0, Number(e.target.value)) })} placeholder="Qty" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold">{formatNaira(total)}</span>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={info.notes} onChange={e => setInfo({ ...info, notes: e.target.value })} /></div>
          <Button onClick={submit} className="w-full" size="lg">Place Order</Button>
        </Card>
      </div>
    </div>
  );
}
