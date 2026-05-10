# Features to port from Comart Order Hub + recommended per-store features

## A. What Comart Order Hub has that we should adopt

The reference project is a single-tenant order-fulfilment dashboard. The pieces worth lifting (and adapting to our multi-tenant `store_id` model + existing `staff_invites` flow) are:

### 1. Staff Performance & Workload (HIGH value)

- `**staff_workload_stats**` rollup table (per staff_id × period) with: assigned_count, completed_count, cancelled_count, expired_count.
- **Staff Performance leaderboard** card (admin view): completion rate, active vs done vs cancelled vs expired, ranked, CSV export, period filter (week / month / last month / year), rating badges (Excellent / Good / Average / Needs Improvement).
- **My Performance card** (staff view): same metrics scoped to the logged-in user, with delivery rate.
- **Workload-aware assignment**: when bulk-assigning, sort staff by current open-order count so work is distributed fairly.

### 2. Order Assignment & Lifecycle

- `assigned_to` + `assigned_at` on orders, with statuses `New → Assigned → In Progress → Delivered / Cancelled / Expired`.
- **Auto-expire** stale assignments (e.g. 48h with no progress) via pg_cron → status = `Expired`, frees workload. (Admin. to approve before it is tagged expired)
- **Order Actions dropdown** (reassign, mark delivered, cancel with reason, archive).
- **Archived Orders** view with restore.
- **Bulk Order Actions**: multi-select → assign / status change / archive.

### 3. Bulk Order Import

- Paste raw text **or** upload `.xlsx/.csv`; AI-assisted parsing (use Lovable AI Gateway, no extra key needed) into structured rows; preview + edit before commit; staff workload preview; progress bar; success/failure summary.

### 4. WhatsApp / Message Templates

- Per-store template library with placeholders (`{customer_name}`, `{phone_number}`, `{total_price}`, `{order_id}`, `{status}`, …).
- "Send WhatsApp" button on each order opens `wa.me/<phone>?text=<rendered template>`.

### 5. Public Order Form

- We already have `/order/$formId` and `/f/$slug` — adopt their cleaner price-tier preview UX (live total as quantity changes, success state).

### 6. Staff suspension

- `is_suspended` flag (in addition to revoke). Suspended staff keep history but can't sign in or be assigned new work.

---

## B. Additional per-store features I recommend (not in either project yet)

Based on the schema you already have (orders, products, customers, agents, finance_records, wallets, waybills, tasks, goals, todos), these round out a "real" store ops platform:

1. **Role-based default landing pages & dashboard widgets** — Sales Rep → Orders + personal stats; Inventory Manager → Products + low-stock; Accountant → Finance; Customer Care → Customers + Chat; HR → Staff + Attendance.
2. **Task assignment hub** — `tasks` table is already there; add a "My Tasks" page for staff and an "Assign Task" flow for admins (priority, deadline, status updates, comments).
3. **Commissions** — auto-compute per sales_rep / agent from delivered orders × `commission_pct`; payable summary on the Finance page; one-click record as wallet payout.
4. **Low-stock alerts & reorder points** — `reorder_level` on products, daily check, in-app + email notification (respecting the new notification preferences), low-stock dashboard widget.
5. **Customer order history & lifetime value** — on `/customers/$id`, show all past orders, total spend, last order date, "VIP" badge above a threshold.
6. **Daily / shift reports** — auto-generated end-of-day summary per store: orders created, delivered, cancelled, revenue, top staff, pushed to chat + activity log.
7. **Goals tracking** — `goals` table is already there; surface progress bars on the dashboard and rank staff against shared targets.
8. **Audit log per store** — extend existing `activity_log` with structured "who changed what" entries on sensitive actions (price edits, role changes, refunds, stock adjustments).
9. **Refunds & returns** — return-reason workflow tied to `faulty_stocks` and a finance debit entry.
10. **Delivery / waybill tracking** — status timeline on `waybills` (dispatched → in transit → delivered), shareable tracking link for the customer.
11. **Customer feedback / NPS** — one-tap rating link sent after delivery; results feed into staff performance.
12. **Saved exports & scheduled reports** — re-run the same Reports/Export config on a schedule, email PDF/CSV to owner.
13. **Two-factor auth for owner/admin** and **session/device list** in Settings.
14. **Per-store branding on public pages** — logo, primary color, custom domain hint on `/f/$slug` and `/order/$formId`.

---

## Suggested build order (after you confirm)

1. **Phase 1 — Staff Ops core** (highest leverage, directly unlocks "what staff see"):
  - `staff_workload_stats` + triggers, Staff Performance card (admin), My Performance card (staff), role-based landing pages, Tasks hub, suspend toggle.
2. **Phase 2 — Order workflow polish**: assigned_to/assigned_at, bulk actions, archived orders, auto-expire cron, WhatsApp templates.
3. **Phase 3 — Bulk import + customer 360**: AI-parsed bulk import (Lovable AI), customer detail page with order history & LTV, low-stock alerts.
4. **Phase 4 — Finance & reporting depth**: commissions, daily report job, scheduled exports, refunds.

---

## Technical notes

- All new tables get `store_id` + RLS using existing `is_store_member` / `is_store_admin` helpers; superadmins read-all via `is_superadmin`.
- `staff_workload_stats` populated by an `AFTER UPDATE` trigger on `orders` (status change) + a daily pg_cron rollup, so the performance cards stay cheap to query.
- AI bulk-parse uses `google/gemini-2.5-flash` via Lovable AI Gateway — no user-supplied key.
- WhatsApp links are pure client-side (`wa.me/...`) — no Twilio / Meta API needed for v1.
- Reuse `staff_invites` for staff onboarding; add `is_suspended` to `user_roles` (or a `staff_status` table) so we don't lose history on revoke.

---

**Do you want me to start with Phase 1 (Staff Ops core), or should I re-shuffle the order? Also, should AI bulk-parse and WhatsApp templates be in Phase 1 too, or pushed to Phase 2/3 as listed?**