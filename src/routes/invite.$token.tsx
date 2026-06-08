import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth, ROLE_LABELS } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MailCheck, Clock, ShieldX, Copy } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invite — Comart+" }, { name: "robots", content: "noindex" }] }),
  component: AcceptInvite,
});

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
  let out = "";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

function AcceptInvite() {
  const { token } = Route.useParams();
  const { user, loading, hydrated, refresh } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "expired" | "missing" | "used" | "wrong-email">("loading");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(() => genPassword());
  const [generatedShown, setGeneratedShown] = useState(true);
  const [finishingInvite, setFinishingInvite] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);

  const markStaffReady = async (userId: string) => {
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true, onboarding_step: 4 })
      .eq("id", userId);
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("staff_invites").select("*").eq("token", token).maybeSingle();
      if (!data) { setState("missing"); return; }
      setInvite(data);
      if (data.status !== "pending" || data.accepted_at) { setState("used"); return; }
      if (new Date(data.expires_at).getTime() < Date.now()) { setState("expired"); return; }
      const { data: s } = await supabase.from("stores").select("name").eq("id", data.store_id).maybeSingle();
      setStore(s);
      setState("ready");
    })();
  }, [token]);

  useEffect(() => {
    if (!hydrated || loading || finishingInvite) return;
    if (state === "ready" && user && invite && user.email && invite.email && user.email.toLowerCase() !== invite.email.toLowerCase()) {
      setState("wrong-email");
    }
  }, [state, user, invite, hydrated, loading, finishingInvite]);

  useEffect(() => {
    if (!hydrated || loading || !user || !invite || state !== "ready" || finishingInvite) return;
    if (user.email && invite.email && user.email.toLowerCase() === invite.email.toLowerCase()) {
      void acceptForCurrentUser(true);
    }
  }, [hydrated, loading, user, invite, state]);

  const acceptForCurrentUser = async (silent = false) => {
    if (!user || !invite) return;
    if (finishingInvite) return;
    setFinishingInvite(true);
    setBusy(true);
    try {
      const { error: roleErr } = await supabase.from("user_roles").insert({
        user_id: user.id, store_id: invite.store_id, role: invite.role,
      });
      if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) throw roleErr;
      await supabase.from("staff_invites").update({
        status: "accepted", accepted_by: user.id, accepted_at: new Date().toISOString(),
      }).eq("id", invite.id);
      await supabase.from("activity_log").insert({
        store_id: invite.store_id, user_id: user.id, type: "staff",
        activity: `${user.email} joined as ${ROLE_LABELS[invite.role] || invite.role}`,
      });
      await markStaffReady(user.id);
      await refresh();
      const storeName = store?.name || "your team";
      setWelcome(storeName);
      if (!silent) toast.success("Welcome to the team!");
      setTimeout(() => { nav({ to: "/staff-portal" }); }, 3200);
    } catch (e: any) {
      setFinishingInvite(false);
      toast.error(e.message || "Could not accept invite");
    } finally { setBusy(false); }
  };

  const signupAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/staff-portal",
          data: { full_name: fullName || invite.email.split("@")[0] },
        },
      });
      if (error) throw error;
      // The DB trigger handle_new_user consumes the invite automatically.
      toast.success("Account created — you're in!");
      // Attempt immediate sign-in (works if auto-confirm is on; otherwise prompt)
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: invite.email, password });
      if (signInErr) {
        toast.info("Check your inbox to confirm your email, then sign in with the password shown above.");
        setMode("signin");
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user?.id) await markStaffReady(sessionData.session.user.id);
        await refresh();
          await acceptForCurrentUser(true);
      }
    } catch (e: any) {
      toast.error(e.message || "Signup failed");
    } finally { setBusy(false); }
  };

  const signinExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
      if (error) throw error;
      await refresh();
      await acceptForCurrentUser(true);
    } catch (e: any) {
      toast.error(e.message || "Sign-in failed");
    } finally { setBusy(false); }
  };

  const google = async () => {
    if (!invite) return;
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + `/invite/${token}`,
    });
    if (r.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      {welcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm animate-fade-in cursor-pointer"
          onClick={() => nav({ to: "/staff-portal" })}
        >
          <div className="text-center px-6 animate-scale-in">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Welcome to {welcome}!</h1>
            <p className="mt-3 text-muted-foreground">Taking you to your dashboard…</p>
          </div>
        </div>
      )}
      <Card className="w-full max-w-md p-6 md:p-8 space-y-4">
        {state === "loading" && <div className="text-center text-muted-foreground py-8">Checking invitation…</div>}

        {state === "missing" && (
          <div className="text-center space-y-3 py-4">
            <ShieldX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Invitation not found</h1>
            <p className="text-sm text-muted-foreground">This link is invalid or was revoked.</p>
          </div>
        )}

        {state === "expired" && (
          <div className="text-center space-y-3 py-4">
            <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Invitation expired</h1>
            <p className="text-sm text-muted-foreground">Ask the store admin to send you a new invite.</p>
          </div>
        )}

        {state === "used" && (
          <div className="text-center space-y-3 py-4">
            <MailCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-bold">Already used</h1>
            <p className="text-sm text-muted-foreground">This invitation has already been accepted or cancelled.</p>
          </div>
        )}

        {state === "wrong-email" && (
          <div className="text-center space-y-3 py-4">
            <ShieldX className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="text-xl font-bold">Wrong account</h1>
            <p className="text-sm text-muted-foreground">
              This invitation was sent to <strong>{invite?.email}</strong>. You're signed in as {user?.email}.
            </p>
            <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); }}>Sign out & switch account</Button>
          </div>
        )}

        {state === "ready" && (
          <div className="space-y-4">
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary mb-2" />
              <h1 className="text-xl font-bold">You're invited to join</h1>
              <p className="text-2xl font-bold mt-1">{store?.name}</p>
              <p className="text-sm text-muted-foreground mt-1">as <strong>{ROLE_LABELS[invite.role] || invite.role}</strong></p>
              <p className="text-xs text-muted-foreground mt-2">{invite.email}</p>
            </div>

            {!loading && hydrated && user ? (
              <Button className="w-full" onClick={() => { void acceptForCurrentUser(); }} disabled={busy} size="lg">
                {busy ? "Joining…" : "Accept & join"}
              </Button>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button type="button" variant={mode === "signup" ? "default" : "outline"} className="flex-1" onClick={() => setMode("signup")}>Create account</Button>
                  <Button type="button" variant={mode === "signin" ? "default" : "outline"} className="flex-1" onClick={() => setMode("signin")}>I already have one</Button>
                </div>

                {mode === "signup" ? (
                  <form onSubmit={signupAccept} className="space-y-3">
                    <div className="space-y-2"><Label>Email</Label><Input value={invite.email} disabled /></div>
                    <div className="space-y-2"><Label>Full name</Label><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" required /></div>
                    <div className="space-y-2">
                      <Label>Auto-generated password</Label>
                      <div className="flex gap-2">
                        <Input type={generatedShown ? "text" : "password"} value={password} readOnly className="font-mono text-sm" />
                        <Button type="button" variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(password); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Save this password. You can change it later in Settings.</p>
                      <button type="button" className="text-xs text-primary" onClick={() => setGeneratedShown(s => !s)}>{generatedShown ? "Hide" : "Show"}</button>
                      <button type="button" className="text-xs text-primary ml-3" onClick={() => setPassword(genPassword())}>Regenerate</button>
                    </div>
                    <Button type="submit" disabled={busy} className="w-full" size="lg">{busy ? "Creating…" : "Create account & join"}</Button>
                  </form>
                ) : (
                  <form onSubmit={signinExisting} className="space-y-3">
                    <div className="space-y-2"><Label>Email</Label><Input value={invite.email} disabled /></div>
                    <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
                    <Button type="submit" disabled={busy} className="w-full" size="lg">{busy ? "Signing in…" : "Sign in & join"}</Button>
                  </form>
                )}

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
                <p className="text-xs text-center text-muted-foreground">Use the Google account matching {invite.email}.</p>
              </>
            )}
            <p className="text-xs text-center text-muted-foreground">Expires {new Date(invite.expires_at).toLocaleDateString()}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
