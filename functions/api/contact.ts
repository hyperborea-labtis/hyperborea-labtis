// Cloudflare Pages Function: POST /api/contact — sends the contact form by email.
// Needs (see README): a `send_email` binding named EMAIL, and the variables
// CONTACT_TO (journal inbox) and CONTACT_FROM (an address on a domain onboarded
// to Cloudflare Email Sending).
interface EmailMessage {
  to: string;
  from: { email: string; name: string };
  replyTo: string;
  subject: string;
  text: string;
}

interface Env {
  EMAIL?: { send(message: EmailMessage): Promise<unknown> };
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
}

interface ContactBody {
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  website?: unknown; // honeypot: real people leave it empty
}

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, " ");

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  let body: ContactBody;
  try {
    body = (await request.json()) as ContactBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  if (body.website) return json(200, { ok: true }); // bot: pretend success

  const name = oneLine(clean(body.name, 120));
  const email = oneLine(clean(body.email, 200));
  const subject = oneLine(clean(body.subject, 200));
  const message = clean(body.message, 5000);
  if (!name || !subject || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(422, { error: "invalid_fields" });
  }

  if (!env.EMAIL || !env.CONTACT_TO || !env.CONTACT_FROM) {
    return json(503, { error: "not_configured" });
  }
  try {
    await env.EMAIL.send({
      to: env.CONTACT_TO,
      from: { email: env.CONTACT_FROM, name: "Hyperborea (formulario)" },
      replyTo: email,
      subject: `[Contacto] ${subject}`,
      text: `De: ${name} <${email}>\n\n${message}\n`,
    });
  } catch {
    return json(502, { error: "send_failed" });
  }
  return json(200, { ok: true });
};
