import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const sendInviteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().email().max(255),
      invite_link: z.string().url().max(2048),
      store_name: z.string().min(1).max(255),
      role_label: z.string().min(1).max(64),
      inviter_name: z.string().max(255).optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");

    const subject = `You're invited to join ${data.store_name} on Comart+`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
        <h2 style="margin:0 0 12px">Join ${data.store_name} on Comart+</h2>
        <p>${data.inviter_name ? `${data.inviter_name} has` : "You have been"} invited you to join <strong>${data.store_name}</strong> as <strong>${data.role_label}</strong>.</p>
        <p>Click the button below to accept and create your account. You must sign in with this email address (<strong>${data.email}</strong>).</p>
        <p style="margin:24px 0">
          <a href="${data.invite_link}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block">Accept invitation</a>
        </p>
        <p style="font-size:12px;color:#555">Or paste this link into your browser:<br/><span style="word-break:break-all">${data.invite_link}</span></p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
        <p style="font-size:12px;color:#888">If you did not expect this invitation, you can safely ignore this email.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Comart+ <onboarding@resend.dev>",
        to: [data.email],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error", res.status, errText);
      throw new Error(`Failed to send invite email (${res.status})`);
    }
    const json = await res.json().catch(() => ({}));
    return { ok: true, id: (json as any)?.id ?? null };
  });
