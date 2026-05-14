/**
 * Worker-safe Sentry client for server functions and server routes.
 * Uses the Sentry envelope HTTP API directly via fetch — no Node-only SDKs,
 * no native deps, safe for Cloudflare Workers SSR runtime.
 *
 * Reads SENTRY_DSN at call time (env is injected per-request on Workers).
 * Silently no-ops if DSN is missing or fetch fails — never breaks the caller.
 */

const SENSITIVE_KEY = /password|token|secret|pin|cvv|card|account_number|otp|authorization|cookie|paystack/i;

type DsnParts = { host: string; projectId: string; publicKey: string; protocol: string };

function parseDsn(dsn: string): DsnParts | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    if (!u.username || !projectId) return null;
    return { host: u.host, projectId, publicKey: u.username, protocol: u.protocol.replace(":", "") };
  } catch { return null; }
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (i++ > 50) break;
      if (SENSITIVE_KEY.test(k)) { out[k] = "[redacted]"; continue; }
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return value.slice(0, 2000) + "…";
  return value;
}

function envName(): "production" | "preview" | "development" {
  const env = (process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production").toLowerCase();
  if (env.startsWith("dev")) return "development";
  if (env.startsWith("prev") || env.startsWith("stag")) return "preview";
  return "production";
}

export interface CaptureContext {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
  user?: { id?: string; ip_address?: string };
  request?: { url?: string; method?: string; headers?: Record<string, string> };
  fingerprint?: string[];
  level?: "fatal" | "error" | "warning" | "info" | "debug";
}

export async function captureServerException(
  error: unknown,
  context: CaptureContext = {}
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const parts = parseDsn(dsn);
  if (!parts) return;

  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : JSON.stringify(error));
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Date.now() / 1000;

  // Strip auth headers if caller passed any.
  const safeHeaders: Record<string, string> = {};
  if (context.request?.headers) {
    for (const [k, v] of Object.entries(context.request.headers)) {
      if (SENSITIVE_KEY.test(k)) safeHeaders[k] = "[redacted]";
      else safeHeaders[k] = v;
    }
  }

  const event = {
    event_id: eventId,
    timestamp,
    platform: "javascript",
    level: context.level || "error",
    environment: envName(),
    server_name: "tanstack-worker",
    release: process.env.SENTRY_RELEASE || undefined,
    tags: scrub(context.tags || {}) as Record<string, string>,
    extra: scrub(context.extra || {}) as Record<string, unknown>,
    user: context.user,
    fingerprint: context.fingerprint,
    request: context.request ? {
      url: context.request.url,
      method: context.request.method,
      headers: safeHeaders,
    } : undefined,
    exception: {
      values: [{
        type: err.name || "Error",
        value: String(err.message || err).slice(0, 1000),
        stacktrace: err.stack ? {
          frames: err.stack.split("\n").slice(1, 30).reverse().map((line) => ({
            filename: line.trim(),
            function: "?",
            in_app: true,
          })),
        } : undefined,
      }],
    },
  };

  const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn });
  const itemHeader = JSON.stringify({ type: "event", content_type: "application/json" });
  const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(event)}\n`;

  const url = `${parts.protocol}://${parts.host}/api/${parts.projectId}/envelope/`;
  const auth = `Sentry sentry_version=7, sentry_client=comart-server/1.0, sentry_key=${parts.publicKey}`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": auth },
      body,
    });
  } catch {
    // Never let telemetry break the request.
  }
}

/**
 * Wrap a server-route HTTP handler with try/catch + Sentry capture.
 * Re-throws so the outer framework returns a normal 500.
 */
export function withSentryRoute<TCtx extends { request: Request }>(
  name: string,
  handler: (ctx: TCtx) => Promise<Response>,
): (ctx: TCtx) => Promise<Response> {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (e) {
      await captureServerException(e, {
        tags: { route: name, kind: "server_route" },
        request: { url: ctx.request.url, method: ctx.request.method },
      });
      throw e;
    }
  };
}
