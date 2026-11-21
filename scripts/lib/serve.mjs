// Test server shared by the browser checks: `wrangler dev --local` serves dist/ the way production does
// (_headers, _redirects, html_handling, 404 page). Pass --base=<url> to use a server that is already running
// (for example the real site: `npm run check:headers -- --base=https://hyperborea-labtis.org`).
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");

export const opt = (args, name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export async function startServer(args = process.argv.slice(2)) {
  if (opt(args, "base")) return { base: opt(args, "base"), stop: () => {} };
  if (!fs.existsSync(path.join(ROOT, "dist", "es.html"))) {
    console.error("dist/ is missing: run `npm run build` first.");
    process.exit(2);
  }
  const port = await freePort();
  const bin = path.join(ROOT, "node_modules", ".bin", "wrangler");
  const child = spawn(bin, ["dev", "--local", "--ip", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early:\n${log.slice(-2000)}`);
    if (Date.now() > deadline) {
      child.kill();
      throw new Error(`wrangler dev did not start in 90 s:\n${log.slice(-2000)}`);
    }
    try {
      if ((await fetch(`${base}/es`)).ok) break;
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { base, stop: () => child.kill("SIGTERM") };
}

