import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Copy, FileText, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/marketing/sales-forms")({
  head: () => ({ meta: [{ title: "Sales Forms — Comart+" }, { name: "description", content: "Build shareable order forms." }] }),
  component: () => <ProtectedShell><SalesForms /></ProtectedShell>,
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
}

function SalesForms() {
  const { store } = useAuth();
  const [forms, setForms] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", product_ids: [] as string[] });

  const load = async () => {
    if (!store) return;
    const [{ data: f }, { data: p }] = await Promise.all([
      supabase.from("sales_forms").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("products").select("id, name, selling_price").eq("store_id", store.id),
    ]);
    setForms(f || []); setProducts(p || []);
  };
  useEffect(() => { load(); }, [store]);

  const stats = useMemo(() => ({
    total: forms.length,
    active: forms.filter(f => f.status === "active").length,
    inactive: forms.filter(f => f.status !== "active").length,
  }), [forms]);

  const create = async () => {
    if (!store) return;
    if (!form.title) return toast.error("Title required");
    if (form.product_ids.length === 0) return toast.error("Pick at least one product");
    const slug = slugify(form.title);
    const { error } = await supabase.from("sales_forms").insert({
      store_id: store.id, title: form.title, description: form.description, slug,
      product_ids: form.product_ids, status: "active",
      fields: [{ key: "name", label: "Full Name", required: true }, { key: "phone", label: "Phone", required: true }, { key: "address", label: "Address", required: false }],
    });
    if (error) return toast.error(error.message);
    toast.success("Form created"); setOpen(false);
    setForm({ title: "", description: "", product_ids: [] }); load();
  };

  const toggle = async (f: any) => {
    const next = f.status === "active" ? "inactive" : "active";
    await supabase.from("sales_forms").update({ status: next }).eq("id", f.id);
    load();
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold">Sales Forms</h1><p className="text-sm text-muted-foreground">Shareable order forms for your products.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Build New Form</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Sales Form</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Products</Label>
                <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1">
                  {products.length === 0 ? <p className="text-xs text-muted-foreground p-2">No products yet — add some in Inventory.</p> :
                    products.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm p-1.5 hover:bg-muted rounded">
                        <Checkbox checked={form.product_ids.includes(p.id)} onCheckedChange={(c) => {
                          setForm({ ...form, product_ids: c ? [...form.product_ids, p.id] : form.product_ids.filter((x: string) => x !== p.id) });
                        }} />
                        <span className="flex-1">{p.name}</span>
                        <span className="text-xs text-muted-foreground">₦{Number(p.selling_price).toLocaleString()}</span>
                      </label>
                    ))}
                </div>
              </div>
              <Button onClick={create} className="w-full">Create Form</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center"><FileText className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">Total Forms</p><p className="text-lg font-bold">{stats.total}</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><CheckCircle2 className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">Active Forms</p><p className="text-lg font-bold">{stats.active}</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-9 w-9 rounded-md bg-muted text-muted-foreground flex items-center justify-center"><XCircle className="h-4 w-4" /></div><div><p className="text-xs text-muted-foreground">Inactive Forms</p><p className="text-lg font-bold">{stats.inactive}</p></div></div></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {forms.length === 0 ? <p className="text-sm text-muted-foreground col-span-full text-center py-8">No forms yet.</p> :
          forms.map(f => (
            <Card key={f.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2">{f.description || "No description"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={f.status === "active"} onCheckedChange={() => toggle(f)} />
                  <Badge variant={f.status === "active" ? "default" : "secondary"}>{f.status}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <code className="flex-1 truncate bg-muted px-2 py-1 rounded">/f/{f.slug}</code>
                <Button variant="outline" size="sm" onClick={() => copyLink(f.slug)}><Copy className="h-3 w-3 mr-1" />Copy</Button>
                <Link to="/f/$slug" params={{ slug: f.slug }} target="_blank" className="text-primary text-xs underline">Open</Link>
              </div>
              <p className="text-xs text-muted-foreground">{(f.product_ids || []).length} product(s)</p>
            </Card>
          ))}
      </div>
    </div>
  );
}
