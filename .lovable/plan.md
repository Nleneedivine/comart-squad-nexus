# Security hardening for Comart+ (connected database)

## Key finding first
The hardening you described (permission-based RLS, `has_permission`, `active_store_id`, wallet RPCs, role-mutation RPCs, WhatsApp credential protection, procurement RPC hardening, audit logging) is **not present** in this Lovable project or its connected database. No migration, function, or code file references `has_permission` or `active_store_id`. It likely lives only in the GitHub repo on a branch that was never synced here. So this is a build-from-scratch, not a gap-fix.

Option A (recommended): sync/merge that GitHub work into this project first, then I verify and close gaps.
Option B: I build the full system here, as below.

## Critical issues confirmed in the live database
1. **Wallet balance is client-writable**: store admins can `UPDATE wallets.balance` directly; any member can `INSERT` wallet_transactions (fake "success" rows).
2. **PIN hash exposed and checked in the browser**: `wallets.pin_hash` is readable by every store member; PIN is unsalted SHA-256 compared client-side.
3. **Paystack verification is not idempotent or store-bound**: `verifyFunding` uses the admin client, any signed-in user can verify any reference, and a race can credit twice. Withdrawal is not row-locked and picks "first" store, not the active one.
4. **Hard-coded privileged email** in `handle_new_user` (auto-grants admin).
5. **Invited users get an unrelated personal store** when the invite lookup misses (e.g. Google email casing/expired).
6. **Anon can execute 21 SECURITY DEFINER functions**, including `superadmin_delete_store`, `generate_payslips`, `mark_payroll_paid`, `receive_purchase_order_items`, `auto_assign_order`, trigger functions.
7. **user_roles**: any admin/manager can grant themselves or others `owner`; no self-escalation guard.
8. **WhatsApp access token** column readable by all store members.
9. Many policies target role `public` instead of `authenticated`.

## What I will build (Option B)
1. Permissions model: `role_permissions(role, permission)` seeded with wallet.view/fund/withdraw/manage, staff.manage, inventory.view/manage/receive/adjust/transfer, finance.view/manage, orders.view/manage, integrations.manage, sales_forms.view/manage. `has_permission(_store_id, _perm)` always uses `auth.uid()` (no user parameter, so it cannot inspect others).
2. `profiles.active_store_id` + `set_active_store(_store_id)` RPC that rejects non-member stores; trigger blocks direct changes.
3. Rewrite RLS on all business tables to `authenticated` + `has_permission(store_id, ...)`; reads via `.view`, writes via `.manage`.
4. Wallet: revoke direct writes; column-level revoke on `pin_hash`; RPCs `wallet_set_pin` (bcrypt via pgcrypto), `wallet_update_bank` (wallet.manage + PIN), `wallet_request_withdrawal` (`FOR UPDATE` lock, idempotency key, PIN check); `wallet_complete_funding` executable by service_role only, unique on reference, credits once. Server functions switched to these.
5. Staff RPCs: `staff_assign_role`, `staff_remove_role`, `staff_set_suspended` (staff.manage, no self-escalation to owner, last-owner protection). Fix `handle_new_user` (no email backdoor; invited users never get a personal store).
6. WhatsApp: move access token to a server-only table; RLS by integrations.manage.
7. Revoke EXECUTE from `anon`/`public` on all definer functions; grant only what clients need to `authenticated`; trigger/cron functions to nobody but owner.
8. Tests: SQL test script creating two stores/two users, running as each via `set local role authenticated` + JWT claims, asserting cross-store SELECT/INSERT/UPDATE/DELETE/RPC all fail, active-store spoof fails, double funding credits once, concurrent withdrawal cannot overdraw. Results reported with exact counts. Plus build/lint.
9. Frontend: wallet page, staff page, store switcher updated to use the RPCs.

## Risks
- Existing users' access will change to match permissions; owner/admin keep full access within their own store.
- Existing PINs (unsalted SHA-256) must be reset by users.
- Large change set (~1 big migration + ~10 files); done in stages with tests after each.
