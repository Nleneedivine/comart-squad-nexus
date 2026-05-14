import * as Sentry from "@sentry/react";

let initialized = false;

const SENSITIVE_KEY = /password|token|secret|pin|cvv|card|account_number|otp|paystack|authorization|apikey|api_key/i;

function scrub(value: any, depth = 0): any {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) out[k] = "[Filtered]";
      else out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function initSentry() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  const mode = (import.meta.env.MODE || "development") as string;
  const environment = (import.meta.env.VITE_SENTRY_ENVIRONMENT as string) || mode;
  const isProd = environment === "production";

  Sentry.init({
    dsn,
    environment,
    release: (import.meta.env.VITE_APP_VERSION as string) || undefined,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: isProd ? 0.1 : 1.0,
    replaysSessionSampleRate: isProd ? 0.05 : 0.0,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      "Non-Error promise rejection captured",
    ],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "console" && breadcrumb.level === "debug") return null;
      if (breadcrumb.data) {
        const url = (breadcrumb.data as any).url;
        if (typeof url === "string" && /(access_token|apikey|api_key)=/i.test(url)) {
          (breadcrumb.data as any).url = url.replace(/(access_token|apikey|api_key)=[^&]+/gi, "$1=[Filtered]");
        }
        breadcrumb.data = scrub(breadcrumb.data);
      }
      return breadcrumb;
    },
    beforeSend(event) {
      try {
        if (event.request?.headers) {
          for (const h of Object.keys(event.request.headers)) {
            if (/^(authorization|cookie|apikey|x-api-key)$/i.test(h)) {
              (event.request.headers as any)[h] = "[Filtered]";
            }
          }
          if ((event.request as any).cookies) (event.request as any).cookies = "[Filtered]";
        }
        if (event.extra) event.extra = scrub(event.extra);
        if (event.contexts) event.contexts = scrub(event.contexts);
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, data: b.data ? scrub(b.data) : b.data }));
        }
      } catch {
        // never let scrubber crash the SDK
      }
      return event;
    },
  });

  Sentry.setTag("environment", environment);
  initialized = true;
}

export function setSentryUser(u: { userId: string; storeId?: string | null; role?: string | null }) {
  if (!initialized) return;
  Sentry.setUser({ id: u.userId });
  Sentry.setTag("store_id", u.storeId || "none");
  Sentry.setTag("role", u.role || "none");
}

export function clearSentryUser() {
  if (!initialized) return;
  Sentry.setUser(null);
  Sentry.setTag("store_id", "none");
  Sentry.setTag("role", "none");
}

export function captureError(err: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, any> }) {
  if (!initialized) {
    if (import.meta.env.DEV) console.error("[sentry:disabled]", err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context?.tags) for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    if (context?.extra) scope.setExtras(scrub(context.extra));
    Sentry.captureException(err);
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
export { Sentry };
