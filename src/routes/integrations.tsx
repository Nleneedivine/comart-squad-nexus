import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, Plug, Lock, Sparkles, ShoppingBag, Globe, Trophy, Layout,
  Store as StoreIcon, CreditCard, MessageCircle, MessageSquare, Users, Zap
} from "lucide-react";

export const Route = createFileRoute("/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Comart+" }, { name: "description", content: "Connect Comart+ to other tools and services." }] }),
  component: () => <ProtectedShell><Integrations /></ProtectedShell>,
});

const INTEGRATIONS = [
  { name: "Auto Assign Orders", description: "Automatically distribute incoming orders to your sales agents.", tags: ["Orders", "Automation"], icon: Zap, color: "from-amber-500 to-orange-500" },
  { name: "Online Store", description: "Launch a public storefront powered by your Comart+ catalog.", tags: ["Storefront"], icon: StoreIcon, color: "from-emerald-500 to-teal-500" },
  { name: "Product Hunt", description: "Showcase your launches and gain early adopters.", tags: ["Marketing"], icon: Trophy, color: "from-orange-500 to-red-500" },
  { name: "Elementor Forms", description: "Capture leads from your WordPress site straight into Comart+.", tags: ["Forms", "WordPress"], icon: Layout, color: "from-pink-500 to-rose-500" },
  { name: "WooCommerce", description: "Sync products, orders and inventory with your WooCommerce store.", tags: ["E-commerce", "WordPress"], icon: ShoppingBag, color: "from-purple-500 to-indigo-500" },
  { name: "Paystack", description: "Accept secure payments and reconcile transactions automatically.", tags: ["Payments"], icon: CreditCard, color: "from-sky-500 to-blue-500" },
  { name: "WhatsApp Checkout", description: "Let customers complete purchases right inside WhatsApp.", tags: ["Checkout", "Messaging"], icon: MessageCircle, color: "from-green-500 to-emerald-500" },
  { name: "Chat Room", description: "Internal team chat with real-time messaging and DMs.", tags: ["Team"], icon: MessageSquare, color: "from-cyan-500 to-blue-500" },
  { name: "Staff Management", description: "Invite staff, assign roles and track attendance.", tags: ["HR", "Team"], icon: Users, color: "from-fuchsia-500 to-pink-500" },
];

function Integrations() {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => INTEGRATIONS.filter(i => (i.name + i.description + i.tags.join(" ")).toLowerCase().includes(q.toLowerCase())),
    [q]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Plug className="h-6 w-6 text-primary" />Integrations</h1>
        <p className="text-muted-foreground text-sm mt-1">Extend Comart+ with powerful third-party connections.</p>
      </div>

      {/* Banner */}
      <div className="overflow-x-auto">
        <div className="flex gap-3 pb-2 min-w-max">
          {INTEGRATIONS.map(i => {
            const Icon = i.icon;
            return (
              <div key={i.name} className={`shrink-0 w-56 h-24 rounded-xl bg-gradient-to-br ${i.color} text-white p-4 flex items-end relative overflow-hidden`}>
                <Icon className="absolute top-3 right-3 h-6 w-6 opacity-40" />
                <div>
                  <div className="text-xs font-semibold opacity-80">Integration</div>
                  <div className="font-bold">{i.name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search integrations..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(i => {
          const Icon = i.icon;
          return (
            <Card key={i.name} className="p-5 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${i.color} flex items-center justify-center text-white shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold flex items-center gap-1.5">{i.name}<Lock className="h-3 w-3 text-muted-foreground" /></div>
                  <div className="flex flex-wrap gap-1 mt-1">{i.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground flex-1">{i.description}</p>
              <Button className="mt-4 w-full" variant="outline" onClick={() => toast.info("Upgrade to a paid plan to activate this integration.")}>
                <Sparkles className="h-4 w-4 mr-2" />Upgrade to Activate
              </Button>
            </Card>
          );
        })}
        {filtered.length === 0 && <Card className="p-12 text-center text-muted-foreground md:col-span-3"><Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />No integrations match your search.</Card>}
      </div>
    </div>
  );
}
