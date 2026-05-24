import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { captureError } from "@/lib/sentry";

export default function RouteErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    captureError(error, {
      tags: { module: "route_boundary", area: "routing", severity: "high" },
      extra: {
        pathname: router.state.location.pathname,
        search: router.state.location.search,
      },
    });
  }, [error, router.state.location.pathname, router.state.location.search]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground break-words">{error?.message || "An unexpected error occurred."}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Retry</button>
          <button onClick={() => (window.location.href = "/")} className="rounded-md border px-4 py-2 text-sm">Go home</button>
        </div>
      </div>
    </div>
  );
}
