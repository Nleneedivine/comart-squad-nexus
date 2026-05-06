import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "./AppLayout";
import { canAccess } from "@/lib/rbac";
import EmptyState from "./EmptyState";
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type CheckState = "idle" | "checking" | "ok" | "redirect" | "error";

export default function ProtectedShell({ children }: { children?: ReactNode }) {
  const { user, loading, roles } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [check, setCheck] = useState<CheckState>("idle");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!loading && !user) { nav({ to: "/auth" }); return; }
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user || loc.pathname === "/onboarding") { setCheck("ok"); return; }
    let cancelled = false;

    const run = async (attempt: number) => {
      setCheck("checking");
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
          if (attempt < 3) { setTimeout(() => run(attempt + 1), 600 * (attempt + 1)); return; }
          setCheck("ok"); // allow access; better than blocking forever
          return;
        }
        if (data.onboarding_completed === false) {
          setCheck("redirect");
          nav({ to: "/onboarding" });
          return;
        }
        setCheck("ok");
      } catch (e) {
        if (cancelled) return;
        if (attempt < 3) { setTimeout(() => run(attempt + 1), 800 * (attempt + 1)); return; }
        setCheck("error");
      }
    };
    run(0);
    return () => { cancelled = true; };
  }, [user, loc.pathname, attempts, nav]);

  if (loading || !user || check === "checking" || check === "idle") {
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

  const allowed = roles.length === 0 ? true : canAccess(roles, loc.pathname);

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
