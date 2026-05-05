import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "./AppLayout";
import { canAccess } from "@/lib/rbac";
import EmptyState from "./EmptyState";
import { Lock } from "lucide-react";

export default function ProtectedShell({ children }: { children?: ReactNode }) {
  const { user, loading, roles } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [user, loading, nav]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

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
