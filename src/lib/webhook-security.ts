// Pure helpers shared by public webhook routes. No database access here so the
// logic is unit-testable (see webhook-security.test.ts).
import { createHash, createHmac, timingSafeEqual } from "crypto";

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super("Payload too large");
  }
}

/** Read a request body as text, aborting as soon as `maxBytes` is exceeded. */
export async function readBodyLimited(request: Request, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<string> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/** Constant-time compare of two hex digests. Returns false on any malformed input. */
export function safeHexEqual(given: string, expected: string): boolean {
  if (!given || !expected || !/^[0-9a-f]+$/i.test(given) || given.length !== expected.length) return false;
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function hmacHex(algo: "sha256" | "sha512", secret: string, body: string): string {
  return createHmac(algo, secret).update(body, "utf8").digest("hex");
}

/** Paystack: x-paystack-signature = hex(HMAC-SHA512(secret, rawBody)). */
export function verifyPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  return safeHexEqual((signature || "").trim(), hmacHex("sha512", secret, rawBody));
}

/** Meta: X-Hub-Signature-256 = "sha256=" + hex(HMAC-SHA256(appSecret, rawBody)). */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  const h = (header || "").trim();
  if (!h.startsWith("sha256=")) return false;
  return safeHexEqual(h.slice(7), hmacHex("sha256", appSecret, rawBody));
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Stable dedupe key for a webhook delivery: provider entry id when present, else body hash. */
export function deliveryDedupeKey(payload: any, rawBody: string): string {
  const entry = payload?.entry_id ?? payload?.entryId ?? payload?.id;
  if (entry != null && /^[\w-]{1,64}$/.test(String(entry))) return `entry:${entry}`;
  return `body:${sha256Hex(rawBody)}`;
}

/** Mask PII for logs: keep first char + last 2 for phones/emails/names. */
export function maskPii(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.length <= 3) return "***";
  return `${s[0]}***${s.slice(-2)}`;
}

export function safeJsonParse(body: string): { ok: true; value: any } | { ok: false } {
  try {
    const value = body ? JSON.parse(body) : {};
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

/** Paystack fund settlement decision from webhook payload + stored tx. Pure for tests. */
export function checkPaystackCharge(
  data: { amount?: unknown; currency?: unknown; status?: unknown },
  expected: { amount: number; currency?: string },
): { ok: true; paid: number } | { ok: false; reason: string } {
  const currency = String(data?.currency || "").toUpperCase();
  if ((expected.currency || "NGN") !== currency) return { ok: false, reason: "currency_mismatch" };
  const kobo = Number(data?.amount);
  if (!Number.isFinite(kobo) || kobo <= 0) return { ok: false, reason: "invalid_amount" };
  const paid = kobo / 100;
  if (Math.round(paid * 100) !== Math.round(expected.amount * 100)) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, paid };
}
