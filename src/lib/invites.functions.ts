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
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      throw new Error("Gmail connector is not configured");
    }

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

    // Build RFC 2822 message and base64url-encode for Gmail API
    const fromName = data.inviter_name ? `${data.inviter_name} via Comart+` : "Comart+";
    const rfc2822 = [
      `From: ${fromName}`,
      `To: ${data.email}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="UTF-8"`,
      ``,
      html,
    ].join("\r\n");

    const raw = Buffer.from(rfc2822, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gmail send error", res.status, errText);
      let detail = errText;
      try {
        const j = JSON.parse(errText);
        detail = j?.error?.message || j?.message || errText;
      } catch {}
      throw new Error(`Failed to send invite email (${res.status}): ${detail}`);
    }
    const json = await res.json().catch(() => ({}));
    return { ok: true, id: (json as any)?.id ?? null };
  });


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
      let detail = errText;
      try {
        const j = JSON.parse(errText);
        detail = j?.message || j?.error || errText;
      } catch {}
      if (res.status === 403) {
        throw new Error(
          `Resend rejected the request (403): ${detail}. ` +
          `This usually means you're using the test sender 'onboarding@resend.dev' which can only deliver to the email address that owns the Resend account. ` +
          `Verify a domain in Resend (https://resend.com/domains) and update the 'from' address in src/lib/invites.functions.ts to use that domain.`
        );
      }
      throw new Error(`Failed to send invite email (${res.status}): ${detail}`);
    }
    const json = await res.json().catch(() => ({}));
    return { ok: true, id: (json as any)?.id ?? null };
  });
