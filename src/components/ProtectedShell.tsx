import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "./AppLayout";
import { canAccess } from "@/lib/rbac";
import EmptyState from "./EmptyState";
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type CheckState = "idle" | "checking" | "ok" | "redirect" | "error";

const ROLE_LANDING: Record<string, string> = {
  sales_rep: "/orders",
  inventory_manager: "/inventory/products",
  marketer: "/marketing/sales-forms",
  order_manager: "/orders",
  customer_care: "/customer-service",
  logistics_manager: "/inventory/waybill",
  accountant: "/finance",
  hr: "/staff",
};

export default function ProtectedShell({ children }: { children?: ReactNode }) {
  const { user, loading, hydrated, roles } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [check, setCheck] = useState<CheckState>("idle");
  const [attempts, setAttempts] = useState(0);
  // Track whether the one-time onboarding/superadmin check has succeeded for
  // this user. Once it has, never re-show the full-screen "Loading..." overlay
  // on subsequent navigations or auth-context updates — that was the source of
  // the reload flashes on every click and tab refocus.
  const checkedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || loading) return;
    if (!user) { nav({ to: "/auth" }); return; }
  }, [user, loading, hydrated, nav]);

  // One-time role-based landing: if a non-admin lands on /Dashboard, send to their natural page
  useEffect(() => {
    if (!user || roles.length === 0) return;
    const isAdmin = roles.some(r => ["owner","admin","manager","head_of_operations"].includes(r));
    if (isAdmin) return;
    if (loc.pathname !== "/Dashboard") return;
    const sessionKey = `landed-${user.id}`;
    if (sessionStorage.getItem(sessionKey)) return;
    const landing = roles.map(r => ROLE_LANDING[r]).find(Boolean);
    if (landing) { sessionStorage.setItem(sessionKey, "1"); nav({ to: landing }); }
  }, [user, roles, loc.pathname, nav]);

  useEffect(() => {
    if (!hydrated || loading) return;
    if (!user || loc.pathname === "/onboarding") { setCheck("ok"); return; }
    // Skip re-running the full check (and re-showing the loading overlay) if
    // we've already validated this user once. Only `attempts` (manual retry)
    // or a user identity change should force a re-check.
    const key = `${user.id}:${attempts}`;
    if (checkedForUserRef.current === key) return;
    let cancelled = false;
    const firstRun = checkedForUserRef.current === null || !checkedForUserRef.current.startsWith(user.id + ":");

    const run = async (attempt: number) => {
      // Only show the full-screen loading overlay on the very first check
      // for this user. Subsequent re-runs (e.g. retry) flip silently.
      if (firstRun && attempt === 0) setCheck("checking");
      try {
        // Superadmins skip onboarding and go to /admin
        const { data: sa } = await supabase.from("superadmins").select("id").eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        if (sa && !loc.pathname.startsWith("/admin")) {
          setCheck("redirect");
          nav({ to: "/admin" });
          return;
        }
        const { data, error } = await supabase
          .from("profiles")
          .select("onboarding_completed,onboarding_step")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        // No profile row yet (handle_new_user trigger may still be running) → retry briefly
        if (!data) {
          if (attempt < 5) { setTimeout(() => run(attempt + 1), 600 * (attempt + 1)); return; }
          checkedForUserRef.current = key;
          setCheck("ok");
          return;
        }
        const isStaffOnly = roles.length > 0 && !roles.some((r) => ["owner", "admin", "manager", "head_of_operations"].includes(r));
        if (isStaffOnly || data.onboarding_completed === false) {
          checkedForUserRef.current = key;
          setCheck("ok");
          return;
        }
        // Suspended members across all stores → forced sign-out
        const { data: rolesRows } = await supabase.from("user_roles").select("is_suspended").eq("user_id", user.id);
        if (cancelled) return;
        if (rolesRows && rolesRows.length > 0 && rolesRows.every((r: any) => r.is_suspended)) {
          await supabase.auth.signOut();
          nav({ to: "/auth" });
          return;
        }
        checkedForUserRef.current = key;
        setCheck("ok");
      } catch (e) {
        if (cancelled) return;
        if (attempt < 3) { setTimeout(() => run(attempt + 1), 800 * (attempt + 1)); return; }
        setCheck("error");
      }
    };
    run(0);
    return () => { cancelled = true; };
    // NOTE: deliberately exclude `loc.pathname` and `roles` from deps — they
    // change on every navigation / role-row refresh and would re-trigger the
    // loading overlay on every click. The check is per-user, gated by the
    // ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, attempts, hydrated, loading]);

  if (!hydrated || loading || !user || check === "checking" || check === "idle") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (check === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold">Couldn't load your account</h1>
          <p className="text-sm text-muted-foreground">We had trouble reaching the server. Check your connection and try again.</p>
          <Button onClick={() => setAttempts((a) => a + 1)}><RefreshCw className="h-4 w-4 mr-2" /> Retry</Button>
        </div>
      </div>
    );
  }

  if (check === "redirect") return null;

  // Block users whose store no longer exists (e.g. tenant deleted by superadmin).
  const isSuperadminPath = loc.pathname.startsWith("/admin");
  const isOnboarding = loc.pathname === "/onboarding";
  if (!isSuperadminPath && !isOnboarding && roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-muted/20">
        <div className="max-w-md text-center space-y-4 p-8 bg-background rounded-lg border shadow-sm animate-fade-in">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-bold">Your store is not registered</h1>
          <p className="text-sm text-muted-foreground">
            We couldn't find an active store linked to <strong>{user?.email}</strong>.
            Please sign up to create a new store, or accept an invitation from your store admin.
          </p>
          <Button
            className="w-full"
            onClick={async () => {
              try { localStorage.clear(); sessionStorage.clear(); } catch {}
              await supabase.auth.signOut();
              nav({ to: "/auth" });
            }}
          >
            Sign out & sign up
          </Button>
        </div>
      </div>
    );
  }

  const allowed = canAccess(roles, loc.pathname);

  return (
    <AppLayout>
      {allowed ? children : (
        <EmptyState
          icon={Lock}
          title="Access restricted"
          description="Your role does not have permission to view this page. Contact your store owner if you need access."
        />
      )}
    </AppLayout>
  );
}
