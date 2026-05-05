import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NIGERIAN_STATES } from "@/lib/nigeria";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Get started — Comart+" }, { name: "robots", content: "noindex" }] }),
  component: OnboardingWizard,
});

const STEPS = ["Welcome", "Your Store", "Your Profile", "Add a Product", "Done"];

function OnboardingWizard() {
  const { user, store, refresh, loading } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Step 1 — store
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  // Step 2 — profile
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  // Step 3 — product
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pStock, setPStock] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/auth" }); return; }
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (prof?.onboarding_completed) { nav({ to: "/Dashboard" }); return; }
      setFullName(prof?.full_name ?? "");
      setPhone(prof?.phone ?? "");
      setStep(prof?.onboarding_step ?? 0);
      if (store) {
        const { data: s } = await supabase.from("stores").select("*").eq("id", store.id).maybeSingle();
        setStoreName(s?.name ?? store.name);
        setStorePhone(s?.contact_phone ?? "");
        setStoreAddress(s?.address ?? "");
      }
    })();
  }, [user, loading, store, nav]);

  const persistStep = async (next: number) => {
    if (!user) return;
    await supabase.from("profiles").update({ onboarding_step: next }).eq("id", user.id);
  };

  const next = async () => {
    setBusy(true);
    try {
      if (step === 1 && store) {
        const { error } = await supabase.from("stores").update({
          name: storeName, contact_phone: storePhone, address: storeAddress + (storeState ? `, ${storeState}` : ""),
        }).eq("id", store.id);
        if (error) throw error;
        await refresh();
      }
      if (step === 2 && user) {
        const { error } = await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", user.id);
        if (error) throw error;
      }
      if (step === 3 && store && pName) {
        const { error } = await supabase.from("products").insert({
          store_id: store.id, name: pName,
          selling_price: Number(pPrice) || 0,
          stock_qty: Number(pStock) || 0,
        });
        if (error) throw error;
      }
      const ns = step + 1;
      setStep(ns);
      await persistStep(ns);
      if (ns >= STEPS.length - 1) {
        await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user!.id);
      }
    } catch (e: any) {
      toast.error(e.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => { const ns = step + 1; setStep(ns); await persistStep(ns); };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1 flex items-center gap-2">
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold",
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/20 text-primary border-2 border-primary" : "bg-muted text-muted-foreground")}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={cn("flex-1 h-0.5", i < step ? "bg-primary" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="text-center space-y-4 py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center"><Sparkles className="h-7 w-7 text-primary" /></div>
            <h1 className="text-3xl font-bold">Welcome to Comart+</h1>
            <p className="text-muted-foreground max-w-md mx-auto">Let's set up your store in under 2 minutes. You can change anything later in Settings.</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Tell us about your store</h2>
            <div><Label>Store name</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="My Store" /></div>
            <div><Label>Contact phone</Label><Input value={storePhone} onChange={(e) => setStorePhone(e.target.value)} placeholder="080..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>State</Label>
                <Select value={storeState} onValueChange={setStoreState}>
                  <SelectTrigger><SelectValue placeholder="Choose state" /></SelectTrigger>
                  <SelectContent>{NIGERIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Address</Label><Input value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder="Street, city" /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Your profile</h2>
            <div><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Add your first product</h2>
            <p className="text-sm text-muted-foreground">Optional — you can add more later in Inventory.</p>
            <div><Label>Product name</Label><Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Hair cream" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Selling price (₦)</Label><Input type="number" value={pPrice} onChange={(e) => setPPrice(e.target.value)} /></div>
              <div><Label>Stock quantity</Label><Input type="number" value={pStock} onChange={(e) => setPStock(e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center space-y-4 py-6">
            <div className="mx-auto h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center"><Check className="h-7 w-7 text-primary" /></div>
            <h1 className="text-3xl font-bold">You're all set!</h1>
            <p className="text-muted-foreground">Your 14-day free trial is now active. Explore your dashboard.</p>
            <Button onClick={() => nav({ to: "/Dashboard" })} size="lg">Go to Dashboard</Button>
          </div>
        )}

        {step > 0 && step < 4 && (
          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button variant="ghost" onClick={skip} disabled={busy}>Skip</Button>
            <Button onClick={next} disabled={busy}>{busy ? "Saving…" : "Continue"}</Button>
          </div>
        )}
        {step === 0 && (
          <div className="flex justify-end mt-6"><Button onClick={next} size="lg">Get started</Button></div>
        )}
      </Card>
    </div>
  );
}
