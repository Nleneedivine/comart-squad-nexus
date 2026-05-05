import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/format";
import { toast } from "sonner";
import { Package, ShoppingCart, Store as StoreIcon } from "lucide-react";

export const Route = createFileRoute("/StoreManagement")({
  head: () => ({ meta: [
    { title: "My Store — Comart+" },
    { name: "description", content: "Overview of your store: products, orders and profile." },
  ]}),
  component: () => <ProtectedShell><StoreManagement /></ProtectedShell>,
});

function StoreManagement() {
  const { store, refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>({ name: "", logo_url: "", description: "", contact_email: "", contact_phone: "", address: "" });
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const load = async () => {
    if (!store) return;
    setLoading(true);
    const [{ data: s }, { data: p }, { data: o }] = await Promise.all([
      supabase.from("stores").select("*").eq("id", store.id).maybeSingle(),
      supabase.from("products").select("*").eq("store_id", store.id).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(50),
    ]);
    if (s) setProfile(s);
    setProducts(p || []);
    setOrders(o || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [store]);

  const saveProfile = async () => {
    if (!store) return;
    const { error } = await supabase.from("stores").update({
      name: profile.name, logo_url: profile.logo_url, description: profile.description,
      contact_email: profile.contact_email, contact_phone: profile.contact_phone, address: profile.address,
    }).eq("id", store.id);
    if (error) return toast.error(error.message);
    toast.success("Store profile updated"); refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Store</h1>
        <p className="text-sm text-muted-foreground">Manage your storefront, products and orders.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi icon={Package} label="Products" value={loading ? "—" : String(products.length)} />
        <Kpi icon={ShoppingCart} label="Orders" value={loading ? "—" : String(orders.length)} />
        <Kpi icon={StoreIcon} label="Store" value={profile.name || "—"} />
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="profile">Store Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card className="p-4">
            {loading ? <SkeletonRows /> : products.length === 0 ? (
              <EmptyState icon={Package} title="No products yet" description="Add your first product to start selling."
                action={<Link to="/inventory/products"><Button>Add Product</Button></Link>} />
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>SKU</TableHead><TableHead>Stock</TableHead><TableHead>Selling</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {products.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.sku || "—"}</TableCell>
                      <TableCell><Badge variant={p.stock_qty < 10 ? "destructive" : "secondary"}>{p.stock_qty}</Badge></TableCell>
                      <TableCell>{formatNaira(Number(p.selling_price))}</TableCell>
                      <TableCell><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card className="p-4">
            {loading ? <SkeletonRows /> : orders.length === 0 ? (
              <EmptyState icon={ShoppingCart} title="No orders yet" description="Orders placed in your store will appear here." />
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Order #</TableHead><TableHead>Customer</TableHead><TableHead>Units</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {orders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.order_number || o.id.slice(0, 8)}</TableCell>
                      <TableCell>{o.customer_name || "—"}</TableCell>
                      <TableCell>{o.units}</TableCell>
                      <TableCell>{formatNaira(Number(o.amount))}</TableCell>
                      <TableCell><Badge>{o.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card className="p-6 space-y-4 max-w-2xl">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Store Name</Label><Input value={profile.name || ""} onChange={e => setProfile({ ...profile, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Logo URL</Label><Input value={profile.logo_url || ""} onChange={e => setProfile({ ...profile, logo_url: e.target.value })} placeholder="https://..." /></div>
              <div className="space-y-1.5"><Label>Contact Email</Label><Input type="email" value={profile.contact_email || ""} onChange={e => setProfile({ ...profile, contact_email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Contact Phone</Label><Input value={profile.contact_phone || ""} onChange={e => setProfile({ ...profile, contact_phone: e.target.value })} placeholder="08012345678" /></div>
            </div>
            <div className="space-y-1.5"><Label>Address</Label><Input value={profile.address || ""} onChange={e => setProfile({ ...profile, address: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea rows={4} value={profile.description || ""} onChange={e => setProfile({ ...profile, description: e.target.value })} /></div>
            <Button onClick={saveProfile}>Save Profile</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: any) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-5 w-5" /></div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold truncate">{value}</p></div>
      </div>
    </Card>
  );
}

function SkeletonRows() {
  return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
}
