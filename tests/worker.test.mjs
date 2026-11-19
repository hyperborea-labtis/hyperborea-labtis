import { test } from "node:test";
import assert from "node:assert/strict";
import { handleContact } from "../worker/index.ts";

const ORIGIN = "https://hyperborea.example";
const VALID = { name: "Ana", email: "ana@example.org", subject: "Hola", message: "Un mensaje.", "cf-turnstile-response": "tok" };

function makeEnv(over = {}) {
  const sent = [];
  const limiterCalls = [];
  const env = {
    EMAIL: { send: async (m) => { sent.push(m); } },
    CONTACT_TO: "revista@example.org",
    CONTACT_FROM: "no-reply@example.org",
    TURNSTILE_SECRET: "secret",
    CONTACT_LIMITER: { limit: async (o) => { limiterCalls.push(o); return { success: true }; } },
    ...over,
  };
  return { env, sent, limiterCalls };
}

function turnstile(result = { success: true }) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, form: Object.fromEntries(init.body) }); return Response.json(result); };
  return { fn, calls };
}

const req = (body, { origin = ORIGIN, type = "application/json", method = "POST", headers = {} } = {}) =>
  new Request(`${ORIGIN}/api/contact`, {
    method,
    headers: { ...(origin ? { origin } : {}), ...(type ? { "content-type": type } : {}), "cf-connecting-ip": "1.2.3.4", ...headers },
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

test("only POST is accepted", async () => {
  const { env } = makeEnv();
  const res = await handleContact(req(null, { method: "GET" }), env, turnstile().fn);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
});

test("rejects a missing or foreign Origin", async () => {
  const { env, sent } = makeEnv();
  for (const origin of [null, "https://evil.example", "http://hyperborea.example"]) {
    const res = await handleContact(req(VALID, { origin }), env, turnstile().fn);
    assert.equal(res.status, 403, String(origin));
  }
  assert.equal(sent.length, 0);
});

test("rejects non-JSON content types", async () => {
  const { env } = makeEnv();
  assert.equal((await handleContact(req("a=b", { type: "text/plain" }), env, turnstile().fn)).status, 415);
  assert.equal((await handleContact(req("a=b", { type: null }), env, turnstile().fn)).status, 415);
});

test("fails closed (503) when a binding or secret is missing", async () => {
  for (const key of ["EMAIL", "CONTACT_TO", "CONTACT_FROM", "TURNSTILE_SECRET", "CONTACT_LIMITER"]) {
    const { env } = makeEnv({ [key]: undefined });
    assert.equal((await handleContact(req(VALID), env, turnstile().fn)).status, 503, key);
  }
});

test("rate limit: 429 with Retry-After, before Turnstile is called and keyed by IP", async () => {
  const { env, sent, limiterCalls } = makeEnv({ CONTACT_LIMITER: { limit: async (o) => { limiterCalls.push(o); return { success: false }; } } });
  const ts = turnstile();
  const res = await handleContact(req(VALID), env, ts.fn);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "60");
  assert.equal(ts.calls.length, 0);
  assert.equal(sent.length, 0);
  assert.deepEqual(limiterCalls, [{ key: "1.2.3.4" }]);
});

test("body cap: declared and streamed sizes over 16 KB are refused (413)", async () => {
  const { env } = makeEnv();
  const big = JSON.stringify({ ...VALID, message: "x".repeat(20000) });
  assert.equal((await handleContact(req(big, { headers: { "content-length": String(big.length) } }), env, turnstile().fn)).status, 413);
  // no content-length header (chunked): the stream itself is capped
  const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
  const r = new Request(`${ORIGIN}/api/contact`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: stream, duplex: "half" });
  assert.equal((await handleContact(r, env, turnstile().fn)).status, 413);
});

test("invalid JSON or a non-object body gives 400", async () => {
  const { env } = makeEnv();
  assert.equal((await handleContact(req("{nope"), env, turnstile().fn)).status, 400);
  assert.equal((await handleContact(req("[1,2]"), env, turnstile().fn)).status, 400);
  assert.equal((await handleContact(req("null"), env, turnstile().fn)).status, 400);
});

test("honeypot: pretends success, sends nothing and never calls Turnstile", async () => {
  const { env, sent } = makeEnv();
  const ts = turnstile();
  const res = await handleContact(req({ ...VALID, website: "http://spam.example" }), env, ts.fn);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 0);
  assert.equal(ts.calls.length, 0);
});

test("validation: 422 for missing fields and addresses with <, > , or ;", async () => {
  const { env } = makeEnv();
  for (const bad of [{ ...VALID, name: "" }, { ...VALID, subject: " " }, { ...VALID, message: "" }, { ...VALID, email: "nope" }, { ...VALID, email: "a@b.co>x" }, { ...VALID, email: "a@b.co,c@d.co" }, { ...VALID, email: "a<b@c.co" }, { ...VALID, email: "a,b@c.co" }, { ...VALID, email: "a;b@c.co" }]) {
    assert.equal((await handleContact(req(bad), env, turnstile().fn)).status, 422, JSON.stringify(bad.email));
  }
});

test("Turnstile: failure, an unreachable service and a missing token all block the email", async () => {
  const { env, sent } = makeEnv();
  assert.equal((await handleContact(req(VALID), env, turnstile({ success: false }).fn)).status, 403);
  assert.equal((await handleContact(req(VALID), env, async () => { throw new Error("network"); })).status, 403);
  assert.equal((await handleContact(req(VALID), env, async () => new Response("boom", { status: 500 }))).status, 403);
  const { "cf-turnstile-response": _t, ...noToken } = VALID;
  assert.equal((await handleContact(req(noToken), env, turnstile().fn)).status, 403);
  assert.equal(sent.length, 0);
});

test("happy path: verifies the token, sends to CONTACT_TO only, one-line subject", async () => {
  const { env, sent } = makeEnv();
  const ts = turnstile();
  const res = await handleContact(req({ ...VALID, to: "victim@example.net", subject: "Hola\r\nBcc: x@y.z" }), env, ts.fn);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(ts.calls.length, 1);
  assert.deepEqual(ts.calls[0].form, { secret: "secret", response: "tok", remoteip: "1.2.3.4" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "revista@example.org");
  assert.equal(sent[0].replyTo, "ana@example.org");
  assert.equal(sent[0].subject, "[Contacto] Hola Bcc: x@y.z");
  assert.ok(!sent[0].subject.includes("\n"));
});

test("send failure: 502, and the log carries no personal data", async (t) => {
  const { env } = makeEnv({ EMAIL: { send: async () => { throw new Error("smtp down"); } } });
  const lines = [];
  t.mock.method(console, "error", (l) => lines.push(l));
  const res = await handleContact(req(VALID), env, turnstile().fn);
  assert.equal(res.status, 502);
  const logged = lines.join("\n");
  assert.ok(logged.includes("contact_send_failed"));
  for (const pii of ["ana@example.org", "Un mensaje", "Ana"]) assert.ok(!logged.includes(pii), pii);
});

test("every response is JSON, uncacheable and nosniff", async () => {
  const { env } = makeEnv();
  const res = await handleContact(req(VALID), env, turnstile().fn);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
});
