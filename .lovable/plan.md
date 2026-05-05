# Comart+ — Full Site Audit

This is a review-only report. Nothing has been changed. Below is what works, what is broken or only half-built, what is missing, and where to improve — organized by area. After your approval I can start fixing in priority order.

---

## 1. Sidebar / global navigation (`AppLayout.tsx`)

Works: 25 links, collapsible desktop sidebar, mobile drawer, role-based filtering, theme toggle, profile menu, store name in header.

Issues:
- **Top-bar search input does nothing** (no handler, no results). Either wire it to a global search or remove.
- **Bell / notifications** has a red dot but no dropdown / data source.
- **Maximize button** (`Maximize2`) has no `onClick` — dead button.
- **Calculator / Documentation / Support** items in profile dropdown have no `onClick` handlers.
- "Marketing" group only contains "Sales Forms" — collapsing it adds a click for no reason. Either flatten or add the missing items (Campaigns, Email blast etc. mentioned in earlier briefs).
- "Finance" group contains only "Records" — same issue.
- No active-route highlight for parent group (only leaf).
- Sidebar shows ALL items when `roles=[]` (loading state) — fine, but a brief flash happens after roles arrive and items disappear. Should render a skeleton until roles loaded.

---

## 2. Auth (`/auth`, `ProtectedShell`)

Works: email/password sign-in & sign-up, redirect to `/Dashboard`, route guard.

Issues / missing:
- **No Google OAuth button** even though earlier brief required it.
- **No "Forgot password" / reset flow.**
- **No email-verification gate** — users can sign in immediately (auto-confirm seems on). Confirm with you whether that's intentional.
- **Staff invites table exists but invite acceptance flow is missing** — invites are inserted (`staff_invites`) but nothing converts an invite into a `user_roles` row when the invitee signs up.
- New sign-up doesn't create a `stores` row or assign `owner` role automatically (need a DB trigger on `auth.users` insert, or app-side onboarding).

---

## 3. Dashboard (`/Dashboard`)

Works: 6 KPIs computed from orders, latest orders list, delivery rate badge.

Issues:
- **"Orders and Revenue Trends" chart is hard-coded to zeros** — the `chartData` array has `Revenue:0, Orders:0` for every day. Should bucket `orders` by day from the actual data and respect the `range` selector (Today/Week/Month/Year currently does nothing).
- **"Total Stock Unit" KPI is hard-coded "0"** — should sum `products.stock_qty`.
- **"Top 3 Best Performing Staff" / "Agents"** panels are empty placeholders — need real aggregation.
- KPIs ignore the `range` filter entirely; selecting "Year" changes nothing.
- No currency localization fallback if `formatNaira` receives NaN.

---

## 4. Orders (`/orders`, `/orders/$id`)

Works: list, status/customer/date filters, create order modal with line items, totals, status history insert, link to detail.

Issues / missing:
- **Stock is not decremented** when an order is created — `stock_qty` should drop and a `stock_movements` row of type `sale` inserted.
- **No payment status** field (paid/unpaid/partial) — only delivery status.
- **Cannot edit an order** after creation; only status can change.
- **No bulk actions** (mark shipped, export selected).
- **No print invoice / receipt** action on detail page.
- Search field for customer/order number not in filters — only dropdown selects.
- Order detail page is minimal (only status update). Should show line items, customer block, totals, status timeline.

---

## 5. Customers (`/customer-service`, `/customers/$id`)

Works: KPIs, search, add/edit modal, all 36 states present.

Issues:
- **No customer-detail order history** shown by default? (Need to check `customers.$id.tsx` — it's only 80 lines, likely barebones.)
- **Cannot delete or merge** duplicate customers.
- **Phone validation**: free-text — should validate Nigerian format (`08012345678` or `+234…`).
- **Import CSV** missing.

---

## 6. Inventory

### `/inventory/products`
Works: list/add (assumed). Should verify: low-stock badge, edit, delete.
Likely missing: **bulk import**, **product images**, **categories/variants**, **barcode**.

### `/inventory/buy-stock`
Works: multi-line purchase entry.
Issues: **does it create `stock_movements` and increment `stock_qty`?** Need to confirm the insert side-effects. Also **no link to a Business/Supplier** — supplier dropdown not visible in shown code.

### `/inventory/stock-record`
Works: read-only movement log.
Issue: **no filters** (product, type, date) — for a real ledger this is required. No CSV export.

### `/inventory/faulty`
Works: log faulty items.
Issue: **does it deduct stock?** Confirm. Also no photo evidence upload.

### `/inventory/agent-stock`
Works: allocate stock to agents.
**Bug:** "agents" list is built from `user_roles` (staff), NOT from the `agents` table. Allocations to non-staff agents (the field reps stored in `/agents`) are impossible. Should pull from `agents` table.
Also: **does not deduct main `stock_qty`** when allocating.

### `/inventory/waybill`
Works: create + list.
Missing: **print view** is mentioned ("Printer" icon imported) but printable layout/PDF not visible. Need a `/waybill/$id/print` printable template.

---

## 7. Businesses (`/businesses`)
Need to verify CRUD completeness, but generally:
- Should integrate with Buy-Stock (supplier dropdown).
- No "transactions with this supplier" view.

---

## 8. Marketing — Sales Forms (`/marketing/sales-forms`) + public `/f/$slug`

Works: form list, public form fetches active form, submits to `form_submissions`.

Issues / missing:
- **No "Build New Form" UX visible** — need to confirm. Brief required builder.
- **Form submission does NOT create an Order or Customer** — it goes into `form_submissions` and dies there. Should auto-create a customer and order, push to `/orders`.
- Public form has **no store branding** (logo, store name, colors).
- **No success page customization** (thank-you message, redirect URL).
- **No payment** on the public form (Paystack inline checkout) — submissions are unpaid.
- **No share-link UI** (copy button, QR code).
- Stats KPIs: "Total / Active / Inactive" — confirm they're shown.

---

## 9. Wallet (`/wallet`)

Works: balance, fund via Paystack server function, withdraw request, bank account, PIN (SHA-256), transactions table, Paystack callback verification.

Issues:
- **PIN is never required** before withdraw — defeats its purpose. Should prompt for PIN on `withdraw()`.
- **PIN stored as plain SHA-256** (no salt) — weak. Use bcrypt/argon via edge function or add per-user salt.
- **Withdrawal is not actually paid out** — it's just a DB row. Need Paystack Transfer API call from the server function (`requestWithdrawal` likely just inserts).
- **No balance reconciliation** with Paystack on app load.
- **No transaction detail / receipt**.
- **No webhook endpoint** for Paystack `charge.success` / `transfer.success` (auto-credit/finalize) — need `/api/public/paystack-webhook` route with HMAC verification.
- "show/hide balance" persists per session only.

---

## 10. Finance (`/finance`)

Works: KPIs, filters (date + type), add record, CSV export.

Issues:
- **No edit / delete** of records.
- **Income/expense are manual** — no auto-record on order delivery or wallet funding.
- "Source/Reference" is free text — should link to actual entities (order id, supplier id).
- No category management (categories hard-coded list).

---

## 11. Agents (`/agents`)

Works: list, add agent.

Issues:
- **Performance computed wrong**: it counts `agent_stocks` rows as "orders" and sums `quantity` as "revenue". These aren't sales — that's allocations. Real performance should query orders attributed to the agent.
- No edit / delete / deactivate.
- No commission payout view.

---

## 12. Staff (`/staff`)

Works: list members + roles, send invite (DB row).

Issues:
- **Invitation email is never sent.** `staff_invites` row is created but no email goes out → invitee can't act on it.
- **No accept-invite flow** (no `/invite/$token` page).
- **Cannot remove a member** or change a role from the table.
- Pending invites cannot be revoked or resent.

---

## 13. Chat (`/chat`)

Works: realtime via Supabase channel, channels + DMs, mark-as-read.

Issues:
- **No unread badge** in sidebar / on contacts.
- **No file/image attachments**.
- **No typing indicator / online presence**.
- "General" channel + DMs only — earlier brief mentioned "Message Store Owner" shortcut; confirm it exists.
- Search filters contacts but not message history.

---

## 14. Productivity (`/productivity`)

Tabs: Todos / Tasks / Goals.

Likely OK as a scaffold; verify:
- Tasks assignment to staff actually filters by store.
- Goals progress bar updates.
- No reminders/notifications.

---

## 15. Reports

### `/reports/export`
Works: CSV / Excel / PDF buttons for 5 datasets.
Verify: **Excel** truly exports XLSX (not CSV with .xls), **PDF** uses a real renderer (not just a print dialog). Likely placeholder behavior.

### `/reports/activity`
Works: searchable log table.
Issue: **nothing actually writes to `activity_log`** consistently across modules — most user actions are silent. Need to add inserts on key actions (order created, stock adjusted, staff invited, withdrawal requested, etc.).

---

## 16. Integrations (`/integrations`)
Pure marketing UI — every card shows "Upgrade to Activate" toast. None actually connect. Acceptable as v1 if you intend to gate behind a paid plan, but mark them clearly as "Coming soon" rather than implying they exist.

Issues:
- "Search integrations" works against the static list but no category filter.
- Horizontal scrolling banner mentioned in brief — confirm it's there.

---

## 17. Webhook Logs (`/webhooks`)
Works: list, search, refresh, "Test Webhook" inserts a fake row.

Issues:
- **No real outbound webhooks are ever sent** anywhere in the app — the table is decorative. Either wire real webhook delivery (e.g. for new orders) or remove.
- No retry button per row, no payload viewer.

---

## 18. My Store (`/StoreManagement`)
Works: products tab, orders tab, profile editor, KPIs.

Issues:
- **Logo is a URL field** — should be an upload to Supabase Storage with preview.
- **Store profile cannot be deleted / transferred.**
- **No "view public storefront"** link (since there is no public storefront yet — see #20).

---

## 19. Settings (`/Settings`)
Works: profile edit, avatar upload (with 30-day lock).

Issues:
- **Avatar is stored as a base64 data URL in the DB** — bloats the row hugely. Should upload to Storage and store the URL.
- "General Settings" tab is literally empty ("General settings will appear here.").
- No password change, no 2FA, no email change, no danger-zone (delete account).
- No notification preferences.

---

## 20. Missing user-facing surfaces

- **Public storefront** (`/s/$slug` or similar) — customers have no way to browse a store's catalogue. Only the single-form flow exists.
- **Customer order tracking page** — customers receive no link to follow their order.
- **Email/SMS notifications** — order created, status changed, withdrawal processed.
- **Receipts/invoices PDF** for orders.
- **Landing page** — `/` redirects to `/Dashboard`; there's no marketing/home page.
- **Onboarding wizard** for new owners (create store, add first product, invite staff).

---

## 21. Cross-cutting issues

- **Loading states** are inconsistent — some pages use `Skeleton`, most just render an empty table.
- **Empty states**: `EmptyState` exists but isn't used everywhere (Stock Record, Agent Stock just show "No movements yet" inside table).
- **Error handling**: most queries don't show errors; on Supabase failure the user sees an empty table.
- **No pagination** on any list — `.limit(500)` everywhere. Will break when data grows.
- **No optimistic updates** — every action requires a refetch.
- **Accessibility**: many icon-only buttons lack `aria-label` (header bell/maximize, table action icons).
- **Form validation** is minimal — phone/email format not checked outside of HTML `type=email`.
- **No tests** in `package.json` (assumed).
- **TanStack route metadata**: most routes set `head()` ✓, but several are missing `og:title` / `og:image`.

---

## 22. Suggested priority order for fixes

```text
P0 — broken / data-integrity
  1. Stock not decremented on order create / agent allocation
  2. Agents list in Agent-Stock pulls wrong table
  3. Wallet PIN never enforced; withdrawals never paid out
  4. Staff invites don't send email or grant access on signup
  5. Owner role not assigned automatically on first signup
  6. Dashboard chart hard-coded zeros; range filter inert

P1 — major UX gaps
  7. Sales-form submission must auto-create customer + order
  8. Webhook endpoint for Paystack (charge/transfer)
  9. Activity log writes from real actions
 10. Order detail page (line items, timeline, print)
 11. Avatar/logo upload to Storage instead of base64
 12. Forgot-password + Google OAuth
 13. Real export (XLSX/PDF) in Reports
 14. Pagination on long tables

P2 — polish / nice-to-have
 15. Top-bar search, notifications dropdown, calculator/support
 16. Public storefront + customer order-tracking page
 17. Onboarding wizard
 18. Email/SMS notifications
 19. 2FA, password change, account deletion
 20. Chat: unread badges, file uploads, presence
 21. Bulk import (products, customers)
 22. Per-supplier and per-agent transaction views
```

---

## Technical notes

- Several stub buttons (`Maximize2`, bell, calculator) are easy wins — either wire or delete.
- The `webhook_logs` and `integrations` tables are currently decorative; decide whether to invest or hide.
- `wallet_transactions.kind` filter assumes `'sale' | 'funding' | 'withdrawal'` — confirm enum matches inserts from Paystack callback path.
- Add a Supabase trigger `on auth.users insert → create profile + (optional) create personal store + assign owner role`.
- Add `/api/public/paystack-webhook.ts` route with HMAC SHA-512 signature check (Paystack uses `x-paystack-signature`).

---

## What would you like me to tackle first?

If you approve, I'll start with the **P0 list** (data integrity + auth onboarding + dashboard) and check in before moving to P1. Tell me if any P2 item is actually higher priority for you (e.g. public storefront), or if any items in this list should be dropped.
