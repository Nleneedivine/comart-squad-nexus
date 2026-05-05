import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Comart+" }, { name: "description", content: "Sign in or create your Comart+ account." }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/Dashboard" });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin + "/Dashboard",
            data: { full_name: fullName, store_name: storeName || "My Store" },
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome to Comart+");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally { setBusy(false); }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/Dashboard" });
    if (r.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground">
        <Link to="/" className="text-2xl font-bold tracking-tight">
          <span className="text-primary">Comart</span>+
        </Link>
        <div>
          <h2 className="text-4xl font-bold leading-tight">Run your Nigerian business with one calm dashboard.</h2>
          <p className="mt-4 text-base opacity-80">Orders, inventory, staff, finance and customers — in ₦, for your store.</p>
        </div>
        <p className="text-sm opacity-60">© {new Date().getFullYear()} Comart+</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="lg:hidden text-2xl font-bold mb-6"><span className="text-primary">Comart</span>+</div>
          <h1 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your store"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Sign in to continue to your dashboard" : "Sign up — we'll set up your store automatically"}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="store">Store name</Label>
                  <Input id="store" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="My Store" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={busy} className="w-full">{busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}</Button>
          </form>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
          <p className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button type="button" className="text-primary font-medium" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
