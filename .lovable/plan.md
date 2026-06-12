## Super Admin AI Assistant — Plan

A chat surface on the Super Admin dashboard (`/admin`) powered by Lovable AI (`google/gemini-3-flash-preview`) that lets you query the platform, message store admins, and perform configuration changes via tool-calling.

### Mention system
- **`@`** — opens a popover listing **all stores** (name + owner email). Inserts `@store:<id>` token into the prompt; the AI receives the resolved store context.
- **`/`** — opens a popover listing **all app routes/functions** (Dashboard, Orders, Inventory, Staff, Finance, Settings, Admin pages, etc.) pulled from a curated registry. Inserts `/page:<path>` token.
- Both popovers are keyboard-navigable (↑/↓/Enter/Esc), filterable by typing.

### Admin inbox (in-app)
- New table `admin_messages` (sender_id, store_id, recipient_user_id, subject, body, parent_id, read_at, created_at).
- Store admins see a new "Messages from Platform" panel in their dashboard with unread badge and reply.
- Super Admin sees thread view per store.

### AI tools (server-side, `createServerFn` w/ super-admin guard)
The AI chat route exposes these tools — each verifies caller is a superadmin:
1. `list_stores` — search/filter stores
2. `get_store_details` — full store + owner + staff + recent orders + subscription
3. `list_store_staff` — staff of a store with status
4. `message_store_admin` — send message to a store's owner (inserts into `admin_messages`)
5. `list_recent_errors` — pull from `app_errors` for a store
6. `toggle_feature_flag` — flip feature flag for a store/global
7. `suspend_user` / `unsuspend_user` — toggle `user_roles.is_suspended`
8. `update_subscription_status` — change plan/status
9. `close_store` — wraps existing `superadmin_delete_store`
10. `list_recent_orders` — last N orders for a store
11. `broadcast_message` — create a platform broadcast

Each tool returns compact JSON. Mutating tools log to `platform_audit_log`.

### Files
- **Migration**: `admin_messages` table + RLS (superadmins write, recipient + superadmins read) + `mark_admin_message_read` RPC.
- **`src/lib/admin-ai.functions.ts`** — `superAdminChat` serverFn streaming via AI SDK with all tools; guards via `has_role('admin')` + `superadmins` table.
- **`src/components/admin/SuperAdminChat.tsx`** — floating chat panel with AI Elements (`Conversation`, `Message`, `MessageResponse`, `PromptInput`, `Tool`), mention popovers, markdown rendering.
- **`src/components/admin/MentionPopover.tsx`** — shared `@`/`/` popover.
- **`src/lib/page-registry.ts`** — curated list of app routes for `/` mentions.
- **`src/routes/admin.index.tsx`** — embed `<SuperAdminChat />`.
- **`src/components/AdminInbox.tsx`** + tile on store admin Dashboard for incoming messages.
- **`src/routes/api/admin-chat.ts`** — streaming route (`toUIMessageStreamResponse`) wired to Lovable AI Gateway helper.
- **`src/lib/ai-gateway.server.ts`** — gateway provider helper (if not present).

### Technical notes
- Streaming via AI SDK `streamText` + `stepCountIs(50)` for tool loops.
- Every tool re-verifies superadmin status server-side (defense in depth).
- Mention tokens are resolved server-side before being passed to the model so it sees structured context, not raw `@store:uuid`.
- Tool calls render with `<Tool>` accordion (collapsed by default) so you can audit what the AI did.
- Confirmation step for destructive tools (`close_store`, `suspend_user`) — AI proposes, you click "Confirm".

### Out of scope (would need follow-up)
- Editing source code / route layouts (only data/settings can be changed).
- Free-text search across customers (you said stores only on `@`).
- Voice input.

Proceed?