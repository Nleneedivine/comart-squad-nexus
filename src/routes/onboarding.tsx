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
import { Check, Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Get started — Comart+" }, { name: "robots", content: "noindex" }] }),
  component: OnboardingWizard,
});

const STEPS = ["Welcome", "Your Store", "Your Profile", "Add a Product", "Done"];

async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < max; i++) {
    try { return await fn(); }
    catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 500 * (i + 1))); }
  }
  throw lastErr;
}

function OnboardingWizard() {
  const { user, store, refresh, loading } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState(false);
  const [booting, setBooting] = useState(true);

  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeState, setStoreState] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const [pRows, setPRows] = useState<{ name: string; price: string; stock: string }[]>([{ name: "", price: "", stock: "" }]);

  const boot = async () => {
    if (!user) return;
    setBooting(true); setBootError(false);
    try {
      const prof = await withRetry(async () => {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (error) throw error; return data;
      });
      if (prof?.onboarding_completed) { nav({ to: "/Dashboard" }); return; }
      setFullName(prof?.full_name ?? "");
      setPhone(prof?.phone ?? "");
      setStep(Math.min(prof?.onboarding_step ?? 0, STEPS.length - 1));
      if (store) {
        const { data: s } = await supabase.from("stores").select("*").eq("id", store.id).maybeSingle();
        setStoreName(s?.name ?? store.name);
        setStorePhone(s?.contact_phone ?? "");
        setStoreAddress(s?.address ?? "");
      }
    } catch {
      setBootError(true);
    } finally {
      setBooting(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/auth" }); return; }
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, store?.id]);

  const persistStep = async (next: number) => {
    if (!user) return;
    try {
      await withRetry(async () => {
        const { error } = await supabase.from("profiles").update({ onboarding_step: next }).eq("id", user.id);
        if (error) throw error;
      });
    } catch {
      toast.error("Couldn't save progress. Please check your connection.");
    }
  };

  const validate = (): string | null => {
    if (step === 1) {
      if (!storeName.trim()) return "Store name is required";
      if (storeName.length > 80) return "Store name is too long";
      if (storePhone && !/^[0-9+()\-\s]{6,20}$/.test(storePhone)) return "Phone number looks invalid";
    }
    if (step === 2) {
      if (!fullName.trim()) return "Full name is required";
      if (phone && !/^[0-9+()\-\s]{6,20}$/.test(phone)) return "Phone number looks invalid";
    }
    if (step === 3 && pName.trim()) {
      if (Number(pPrice) < 0) return "Price cannot be negative";
      if (Number(pStock) < 0) return "Stock cannot be negative";
    }
    return null;
  };

  const next = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      if (step === 1 && store) {
        await withRetry(async () => {
          const { error } = await supabase.from("stores").update({
            name: storeName.trim(),
            contact_phone: storePhone.trim() || null,
            address: storeAddress.trim() ? `${storeAddress.trim()}${storeState ? `, ${storeState}` : ""}` : null,
          }).eq("id", store.id);
          if (error) throw error;
        });
        await refresh();
      }
      if (step === 2 && user) {
        await withRetry(async () => {
          const { error } = await supabase.from("profiles").update({ full_name: fullName.trim(), phone: phone.trim() || null }).eq("id", user.id);
          if (error) throw error;
        });
      }
      if (step === 3 && store && pName.trim()) {
        await withRetry(async () => {
          const { error } = await supabase.from("products").insert({
            store_id: store.id, name: pName.trim(),
            selling_price: Number(pPrice) || 0,
            stock_qty: Number(pStock) || 0,
          });
          if (error) throw error;
        });
      }
      const ns = step + 1;
      setStep(ns);
      await persistStep(ns);
      if (ns >= STEPS.length - 1 && user) {
        await withRetry(async () => {
          const { error } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
          if (error) throw error;
        });
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => { const ns = step + 1; setStep(ns); await persistStep(ns); };
  const back = async () => { const ns = Math.max(step - 1, 0); setStep(ns); await persistStep(ns); };

  if (loading || booting) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center space-y-3">
          <h1 className="text-xl font-bold">Couldn't load setup</h1>
          <p className="text-sm text-muted-foreground">We had trouble reaching the server.</p>
          <Button onClick={boot}><RefreshCw className="h-4 w-4 mr-2" />Retry</Button>
        </Card>
      </div>
    );
  }

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
            <div><Label>Store name *</Label><Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="My Store" maxLength={80} /></div>
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
            <div><Label>Full name *</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Add your first product</h2>
            <p className="text-sm text-muted-foreground">Optional — leave blank to skip.</p>
            <div><Label>Product name</Label><Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Hair cream" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Selling price (₦)</Label><Input type="number" min="0" value={pPrice} onChange={(e) => setPPrice(e.target.value)} /></div>
              <div><Label>Stock quantity</Label><Input type="number" min="0" value={pStock} onChange={(e) => setPStock(e.target.value)} /></div>
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={back} disabled={busy}>Back</Button>
              <Button variant="ghost" onClick={skip} disabled={busy}>Skip</Button>
            </div>
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
