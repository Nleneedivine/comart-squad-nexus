
# Platform Integrations System — Fix & Extend Plan

You already have a working integrations foundation. I'll extend it instead of rebuilding.

## What already exists (KEEP, do not rebuild)

- `integration_catalog` — platform-level catalog with pricing, active flag, RLS for superadmins
- `store_integrations` — per-tenant activation rows (status: locked/pending/active, paystack ref)
- `webhook_deliveries` — incoming webhook log (store_id, source, status, payload, result, error)
- `POST /api/public/wp-forms-webhook` — already parses WPForms payloads, creates customers + orders + order_items, runs round-robin assignment, logs to `webhook_deliveries`
- `/admin/integrations` — superadmin catalog + activation approvals
- `/integrations` — tenant marketplace
- `initIntegrationPurchase` server fn — Paystack checkout

## What's actually missing (BUILD)

### 1. Schema extensions (migration)
Add to `store_integrations` (don't create a duplicate `integrations` table):
- `api_key text unique` — generated per tenant per integration
- `settings jsonb not null default '{}'` — holds field mappings, etc.
- `last_webhook_at timestamptz` — for "Last received"
- `orders_imported_count int not null default 0` — increment counter

Add to `webhook_deliveries`:
- `response jsonb` — what we sent back
- `integration_key text` — so superadmin can filter by WPForms

New RPC `generate_integration_api_key(_store_id, _key)` — superadmin or store admin only, rotates key.

### 2. Extend webhook endpoint
Keep existing `/api/public/wp-forms-webhook` (HMAC mode for store-secret path) AND add NEW endpoint `/api/public/integrations/wpforms/webhook` that:
- Reads `x-api-key` header
- Looks up `store_integrations` by api_key, status='active', integration_key='wpforms'
- Rejects invalid/inactive keys (logged to webhook_deliveries with store_id null + error)
- Applies tenant's saved field mapping from `settings.field_mapping`
- Calls the SAME order creation + round-robin logic as the existing webhook (extract into shared helper `processWpFormsOrder` in `src/lib/wpforms.server.ts`)
- Sets order metadata source='wpforms'
- Increments `orders_imported_count`, sets `last_webhook_at`
- Logs full request+response into `webhook_deliveries`

Auto-assignment: existing `tg_orders_auto_assign` trigger ALREADY runs on every order insert — orders from this endpoint will be distributed identically to AI-imported orders. No new assignment engine.

### 3. Tenant UI — `/integrations` WPForms card enhancements
Only the WPForms card gets new actions (other cards untouched):
- "Connect" → opens setup modal showing webhook URL + API key + instructions (install WPForms Pro, enable Webhooks addon, paste URL, add `x-api-key` header)
- "Generate API Key" (rotate) button inside modal
- "Copy" buttons for URL and key
- Status badge (active/pending/inactive)
- "Last webhook received" timestamp
- "Orders imported" count
- "Configure Fields" → opens mapping editor (WPForms field name → Comart+ field: customer_name/phone/product/quantity/address/notes/amount). Saved to `store_integrations.settings.field_mapping`
- "Test Connection" → posts a sample payload to the endpoint with the tenant's key, shows the response

### 4. Superadmin WPForms panel — `/admin/integrations`
Append a "WPForms" stats block (existing catalog table stays):
- Global enable/disable toggle (uses existing `integration_catalog.is_active` for key='wpforms')
- Monthly price (already editable in existing table)
- Active tenants count (`store_integrations` where integration_key='wpforms' and status='active')
- Webhook traffic (count of `webhook_deliveries` source='wp-forms' last 24h / 7d)
- Failed requests (status='failed' or 'rejected' last 24h)

Seed `integration_catalog` with `wpforms` row if missing.

## Technical implementation map

```text
DB migration
 ├─ ALTER store_integrations  (api_key, settings, last_webhook_at, orders_imported_count)
 ├─ ALTER webhook_deliveries  (response, integration_key)
 ├─ CREATE FUNCTION generate_integration_api_key
 └─ INSERT into integration_catalog (wpforms) if not exists

New file: src/lib/wpforms.server.ts
 └─ processWpFormsOrder(storeId, payload, mapping) — extracted from existing route

New file: src/routes/api/public/integrations.wpforms.webhook.ts
 └─ x-api-key auth → processWpFormsOrder → log delivery + bump counter

Edit: src/routes/api/public/wp-forms-webhook.ts
 └─ Refactor to call processWpFormsOrder (no behavior change, just dedupe)

Edit: src/routes/integrations.tsx
 └─ Special render path for catalog row where key='wpforms':
     Connect modal, mapping dialog, test-connection, stats

Edit: src/routes/admin.integrations.tsx
 └─ Add WPForms metrics block at top
```

## Out of scope (per "fix & extend only")
- Won't create a duplicate `integrations` table — `store_integrations` already serves this purpose
- Won't create a duplicate `webhook_logs` table — `webhook_deliveries` already serves this purpose
- Won't touch existing order creation, auto-assignment, or other integration cards
- WooCommerce / Elementor / WhatsApp Checkout cards remain catalog-only until you ask for their endpoints
