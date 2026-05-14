import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { SentryErrorBoundary } from "@/lib/sentry";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Go home</Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Comart" },
      { name: "description", content: "Comart+ unified business management for Nigerian stores: orders, inventory, staff, finance." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%231D9E75'/%3E%3Ctext x='50%25' y='54%25' font-family='system-ui,Segoe UI,Roboto,sans-serif' font-size='38' font-weight='800' text-anchor='middle' dominant-baseline='middle' fill='white'%3EC%3C/text%3E%3C/svg%3E" },
    ],
  }),
  shellComponent: RootShell,
  component: () => (
    <SentryErrorBoundary
      fallback={({ resetError }) => (
        <div className="min-h-screen flex items-center justify-center px-4 bg-background">
          <div className="max-w-md text-center space-y-3">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">An unexpected error occurred. Our team has been notified.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={resetError} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Try again</button>
              <a href="/" className="rounded-md border px-4 py-2 text-sm">Go home</a>
            </div>
          </div>
        </div>
      )}
    >
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </SentryErrorBoundary>
  ),
  notFoundComponent: NotFoundComponent,
  errorComponent: RouteErrorBoundary,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}
