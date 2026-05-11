# Phase 5 — Store Owner Workflow Polish

## 1. Fix Bulk Import routing

**Problem:** `/orders` and `/orders/import` render the same screen because `orders.tsx` has no `<Outlet />`, so the child route can't mount.

**Fix:** Convert `orders.tsx` into a pathless wrapper that renders an `<Outlet />` plus the existing list at the index, and split the list into `orders.index.tsx`. `orders.import.tsx` already exists with the correct AI paste-text → review → commit flow — it will start showing once routing works.

## 2. Create Order — customer picker

On the New Order dialog (currently in `orders.tsx` / `orders.$id.tsx`):

- Add a combobox "Customer" field that searches existing `customers` by name/phone.
- Toggle "+ New customer" to expose name / phone / address inputs.
- On submit: reuse existing customer (link `customer_id`) or insert a new row, then attach to the order. This automatically fulfils "orders save to customers section."

## 3. Products at registration + Store > Products add

- `inventory.products.tsx`: add an "Add product" dialog (name, SKU, price, stock, reorder point) for store owners — already partially present, will be polished and surfaced under My Store > Products.
- `onboarding.tsx`: add a "Starter products" step where the owner can add 1–N products in a repeatable mini-form before finishing onboarding. Skippable.

## 4. Round-robin assignment on bulk import

- During the commit step in `orders.import.tsx`, fetch active sales reps (`user_roles` with role `sales_rep`/`agent`, not suspended) for the store.
- Compute current open-order count per rep from `orders` (status in pending/processing/shipped, not archived).
- Assign each new order to the rep with the lowest open count, then increment locally to keep distribution even within the batch.
- Manual `assigned_to` value entered in the review grid always wins (never overridden).
- Reps see assigned orders on `/tasks` (already wired to `assigned_to = auth.uid()`).
- Owner reassignment from order detail page already works and continues to override.

## 5. Staff Management deep view

Extend `/staff` with a per-staff drawer (click row → opens panel) showing:

- Profile + role + suspended state (existing).
- KPIs from `staff_workload_stats` aggregated all-time + this month: assigned, completed, delivered, cancelled, expired, completion rate, delivery rate.
- Calls log from `activity_log` (filter `type = 'call'`) — count + last 20 entries.
- Active workload (open orders), recent commissions earned (`commissions` table), tasks completed (`tasks` table).
- Mini sparkline of last 30 days completion rate.
- CSV export per staff.

## 6. Group chat (subscription-gated)

- Migration: add `chat_groups` (id, store_id, name, created_by, created_at) and `chat_group_members` (group_id, user_id). Add `group_id` column to `chat_messages` (nullable, coexists with current `channel`/`recipient_id`).
- RLS: members of a group can read/post; group creator + store admin can manage members.
- Plan gating: read `subscriptions.plan` — enable group creation only when plan is `pro` or `business`. Super admin override via existing `feature_flags` (`chat_groups` flag) wins both ways.
- UI in `chat.tsx`: "Create Group" button (disabled with upsell tooltip when locked), group list in sidebar, member picker dialog.

## 7. Auto to-do suggestions (AI-assisted)

- New server fn `suggestTodos` calling Lovable AI Gateway (`google/gemini-2.5-flash`) with the user's open tasks + assigned orders + active goals.
- Returns 5–8 suggested to-do items with priority + suggested time of day.
- `productivity.tsx` (To-do section): add "✨ Suggest my day" button → preview drawer with checkboxes:
  - "Use all" inserts every suggestion into `todos`.
  - Per-item edit before insert.
  - "Dismiss" keeps the user's current list.
- Tasks and goals remain pre-assignable by admins; users can append their own (already supported by current RLS).

## 8. Integration payments (Hybrid model)

**Control model (per your answer):** Lovable ships the integration code. You (super admin) set the price and approve activations. Store owners pay via Paystack and the system auto-enables the feature flag.

Implementation:

- Migration: `integration_catalog` (key, name, description, monthly_price, is_active) — seeded by you in `/admin`. `store_integrations` (store_id, integration_key, status enum: locked/pending/active, activated_at, paystack_reference).
- `/admin/integrations` (new): super admin manages catalog + sees activation requests, can manually toggle.
- `integrations.tsx`: "Upgrade to Activate" → opens checkout dialog showing price → calls existing Paystack server fn → on webhook success, `store_integrations.status = active` and notification fires.
- Existing `/api/public/paystack-webhook` route gets a new branch for `integration_purchase` metadata.

## 9. WP Forms webhook + general inbound

- New public route `src/routes/api/public/wp-forms-webhook.ts`. Accepts WP Forms JSON; verifies a per-store HMAC secret stored on `stores.webhook_secret` (new column).
- Maps fields → creates `customers` row + `orders` + `order_items`, runs the round-robin assigner.
- New page `/webhooks/setup` shows each store its endpoint URL, secret, sample payload, and recent deliveries (`webhook_deliveries` table). keep the weebhook secrets in webhook section of owners page.
- Same endpoint pattern documented for generic JSON, Zapier, Make.

## Technical notes

- Migrations: 4 new files (group chat, integration catalog/store_integrations, webhook deliveries + store secret, plus index for round-robin workload).
- New routes: `orders.index.tsx`, `admin.integrations.tsx`, `webhooks.setup.tsx`, `api/public/wp-forms-webhook.ts`.
- New server fns: `suggest-todos.functions.ts`, `assign-round-robin.functions.ts`, `activate-integration.functions.ts`.
- Touched: `orders.tsx`, `orders.import.tsx`, `orders.$id.tsx` (customer picker), `inventory.products.tsx`, `onboarding.tsx`, `staff.tsx`, `chat.tsx`, `productivity.tsx`, `integrations.tsx`, `AppLayout.tsx`, `api/public/paystack-webhook.ts`.

## Out of scope (flag if you want them)

- Real WhatsApp/SMS sending (currently uses `wa.me` deep links). 
- Migrating away from `pg_cron` for scheduled jobs.
- Replacing existing `agents` table with `user_roles`-only model.

Approve to implement, or tell me what to adjust.