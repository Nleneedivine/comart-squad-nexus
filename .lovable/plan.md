# Sentry Integration Plan — Comart+ Frontend

## 1. Dependencies

- `bun add @sentry/react`

## 2. Environment

- Add `VITE_SENTRY_DSN` (DSN provided by user) — also add `VITE_SENTRY_ENVIRONMENT` (optional override; default derived from `import.meta.env.MODE`) and `VITE_APP_VERSION` (optional, for `release`).
- Update `.env` is auto-managed; document required var in plan output. User pastes DSN in Lovable env settings.
- Init is a no-op when `VITE_SENTRY_DSN` is missing (dev without DSN, previews, tests).

## 3. New file: `src/lib/sentry.ts`

Exports:
- `initSentry()` — called once from `src/router.tsx` (or `__root.tsx` module top-level) before React renders.
- `setSentryUser({ userId, storeId, role })` / `clearSentryUser()` — called from `useAuth` effect.
- `captureError(err, context?)` — thin wrapper used by realtime/upload/paystack/edge-fn helpers.
- `SentryErrorBoundary` — re-export of `Sentry.ErrorBoundary` preconfigured with fallback.

`initSentry()` config:
- `dsn: import.meta.env.VITE_SENTRY_DSN` — early return if absent.
- `environment`: `VITE_SENTRY_ENVIRONMENT ?? MODE` (`development` | `staging` | `production`).
- `release`: `VITE_APP_VERSION` if set.
- `integrations`:
  - `Sentry.browserTracingIntegration()` — navigation + pageload spans (TanStack Router instrumented via `Sentry.tanstackRouterBrowserTracingIntegration(router)` if available; otherwise default browser tracing covers it).
  - `Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true, maskAllInputs: true })` — privacy-strict.
- Sample rates (mobile-friendly):
  - `tracesSampleRate`: 1.0 dev, 0.1 prod.
  - `replaysSessionSampleRate`: 0.0 dev, 0.05 prod.
  - `replaysOnErrorSampleRate`: 1.0.
- `sendDefaultPii: false`.
- `beforeSend(event, hint)` — redact:
  - Strip request/response bodies; remove cookies, `authorization`, `apikey`, `x-api-key` headers.
  - Walk `event.extra`, `event.contexts`, `event.breadcrumbs[].data` and scrub keys matching `/password|token|secret|pin|cvv|card|account_number|otp|paystack/i` → `[Filtered]`.
  - Drop events whose message matches known noisy benign errors (e.g. `ResizeObserver loop`).
- `beforeBreadcrumb` — drop `console.debug`, scrub fetch URLs containing `access_token=` or `apikey=`.
- `ignoreErrors`: `['ResizeObserver loop limit exceeded', 'Non-Error promise rejection captured']`.

Unhandled promise rejections + global errors are auto-instrumented by `@sentry/react` defaults; no extra code needed.

## 4. Bootstrap order

- Call `initSentry()` at the top of `src/router.tsx` (module scope, before `getRouter`). Module is imported by SSR entry and client entry — guard with `typeof window !== 'undefined'` to avoid running during SSR/build prerender.
- Wrap the app in `SentryErrorBoundary` inside `src/routes/__root.tsx` `component` (around `<AuthProvider>...</AuthProvider>`), with a graceful fallback that reuses the styling of `RouteErrorBoundary` (icon, title, retry, go home).
- Keep existing per-route `errorComponent` and router `defaultErrorComponent` — the Sentry boundary is the outermost net.

## 5. User/tenant context

- In `src/hooks/useAuth.tsx`, after `loadStoreAndRoles` resolves, call `setSentryUser({ userId: session.user.id, storeId: store?.id, role: roles[0] })`. On sign-out, `clearSentryUser()`.
- Tags set: `store_id`, `role`, `environment` (already on init, also as tag for filtering).
- Never send `email` / `phone` (PII off).

## 6. Targeted error logging hooks

Add `captureError(err, { tags: { area: '...' } })` calls in:
- `src/hooks/useStoreChannel.ts` — on `CHANNEL_ERROR` / `TIMED_OUT` status.
- `src/server/paystack.functions.ts` and `src/routes/api/public/paystack-webhook.ts` — wrap fetch/handler in try/catch (server-side uses `@sentry/react` browser SDK only on client; for server functions we only instrument the client-side caller for now — full server instrumentation is out of scope for this pass).
- Upload helpers (search for `supabase.storage` usage in routes; add capture on error).
- Dashboard render: wrap `src/routes/Dashboard.tsx` inner content in `SentryErrorBoundary` with section-level fallback.
- Server-fn callers: add a `withCaptureServerFn` thin wrapper used by hot paths (orders, integrations, suggest-todos) — captures on rejection with tag `area: 'server-fn'` and rethrows.

(Scope note: instrument the client side of these flows; server-runtime Sentry is a separate phase.)

## 7. Dev-only "Test Sentry" button

- Add a small floating button in `src/components/AppLayout.tsx` rendered only when `import.meta.env.DEV && import.meta.env.VITE_SENTRY_DSN`.
- onClick: `throw new Error("This is your first error!")` inside a setTimeout so it surfaces as unhandled.
- Per requirement #11: after user verifies in Sentry dashboard, they tell me to remove it. The plan includes the removal step as a follow-up turn (cannot auto-detect dashboard receipt from here).

## 8. Privacy / redaction guarantees

- `maskAllText`, `maskAllInputs`, `blockAllMedia` on Replay → no form values, no media leak.
- `sendDefaultPii: false` → no IP, no cookies.
- `beforeSend` scrubber covers `password|token|secret|pin|cvv|card|account_number|otp` in extras/breadcrumb data.
- Auth headers stripped from breadcrumb fetch URLs.

## 9. Performance

- Prod `tracesSampleRate: 0.1`, `replaysSessionSampleRate: 0.05` keeps mobile cost low.
- Replay integration is lazy-loaded by Sentry by default.
- Init guarded by DSN presence and `typeof window !== 'undefined'`.

## 10. Files touched

Create:
- `src/lib/sentry.ts`

Edit:
- `src/router.tsx` — call `initSentry()`.
- `src/routes/__root.tsx` — wrap with `SentryErrorBoundary`.
- `src/hooks/useAuth.tsx` — set/clear user context.
- `src/hooks/useStoreChannel.ts` — capture channel errors.
- `src/components/AppLayout.tsx` — dev-only test button.
- `src/routes/Dashboard.tsx` — section-level boundary.
- `src/server/paystack.functions.ts` — capture failures (client-callable surface).
- `package.json` — `@sentry/react` dependency.

## 11. Verification

- `bun add` runs build automatically; confirm no SSR crash.
- Manually click dev test button → confirm event in Sentry → user reports back → I remove the button in a follow-up turn.

## 12. Out of scope (explicit)

- Server-runtime Sentry on the Cloudflare Worker (TanStack server fns / server routes). Documented `@sentry/cloudflare` is the right next step but adds bundling complexity; flag for a follow-up phase.
- Source map upload pipeline (requires auth token + CI step).
- Alerting rules / dashboards in Sentry org.

## Confirmation needed

After approval I will:
1. Install `@sentry/react`.
2. Implement the files above.
3. Request you add `VITE_SENTRY_DSN` to env (paste the provided DSN) — init is a no-op until then, so nothing breaks in the meantime.
