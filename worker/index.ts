// Worker entry point. Static files are served by Workers Assets; this code only
// runs for /api/* (wrangler.jsonc → assets.run_worker_first). It handles
// POST /api/contact and sends the contact form by email.
//
// Env (bindings and secrets) is GENERATED: `npm run types` writes
// worker/worker-configuration.d.ts from wrangler.jsonc. Never write it by hand.
//
// Defences, in order, each one cheaper than the next:
//   method → same-origin check → JSON content type → body size cap → per-IP rate
//   limit → payload validation (honeypot first) → Cloudflare Turnstile → send.
// The recipient is always env.CONTACT_TO; nothing the visitor sends controls it.

const MAX_BODY_BYTES = 16 * 1024;
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

interface ContactBody {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown; // honeypot: real people leave it empty
  "cf-turnstile-response"?: unknown;
}

type Fetcher = typeof fetch;

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, ...extra } });

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ");

/** Log without personal data (no name, email or message), only what is needed to debug. */
const log = (level: "warn" | "error", event: string, detail: Record<string, unknown> = {}): void => {
  console[level](JSON.stringify({ event, ...detail }));
};

/** Read the body as text, giving up as soon as it passes `max` bytes. */
async function readLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function verifyTurnstile(token: string, secret: string, ip: string | null, doFetch: Fetcher): Promise<boolean> {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await doFetch(TURNSTILE_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    log("error", "turnstile_unreachable", { message: String(err) });
    return false; // fail closed: no verification, no email
  }
}

export async function handleContact(request: Request, env: Env, doFetch: Fetcher = fetch): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { Allow: "POST" });

  // Browsers send Origin on every POST; ours must be this very site (no cross-site posting).
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    log("warn", "contact_bad_origin");
    return json(403, { error: "forbidden_origin" });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { error: "unsupported_media_type" });
  }

  if (!env.EMAIL || !env.CONTACT_TO || !env.CONTACT_FROM || !env.TURNSTILE_SECRET || !env.CONTACT_LIMITER) {
    log("error", "contact_not_configured");
    return json(503, { error: "not_configured" });
  }

  const ip = request.headers.get("cf-connecting-ip");
  const { success: allowed } = await env.CONTACT_LIMITER.limit({ key: ip ?? "unknown" });
  if (!allowed) {
    log("warn", "contact_rate_limited");
    return json(429, { error: "rate_limited" }, { "Retry-After": "60" });
  }

  const text = await readLimited(request, MAX_BODY_BYTES);
  if (text === null) return json(413, { error: "payload_too_large" });
  let body: ContactBody;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as ContactBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (body.website) return json(200, { ok: true }); // bot: pretend success

  const name = oneLine(clean(body.name, 120));
  const email = oneLine(clean(body.email, 200));
  const subject = oneLine(clean(body.subject, 200));
  const message = clean(body.message, 5000);
  if (!name || !subject || !message || !EMAIL_RE.test(email)) return json(422, { error: "invalid_fields" });

  const token = clean(body["cf-turnstile-response"], 2048);
  if (!token || !(await verifyTurnstile(token, env.TURNSTILE_SECRET, ip, doFetch))) {
    log("warn", "contact_turnstile_failed");
    return json(403, { error: "challenge_failed" });
  }

  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.CONTACT_FROM, name: "Hyperborea (formulario)" },
      replyTo: email,
      subject: `[Contacto] ${subject}`,
      text: `De: ${name} <${email}>\n\n${message}\n`,
    });
  } catch (err) {
    log("error", "contact_send_failed", { message: String(err) });
    return json(502, { error: "send_failed" });
  }
  return json(200, { ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/contact") return handleContact(request, env);
    return json(404, { error: "not_found" });
  },
};
