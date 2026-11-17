// Fetch a page someone typed in, without letting it reach our own network (SSRF):
// every hop's host name is looked up and refused if any address is private, loopback, link-local or shared;
// redirects are followed by hand (max 4) so each new host is checked too.
import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function v4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return v4Private(ip);
  const x = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Private(mapped[1]);
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("64:ff9b") || x.startsWith("2001:db8");
}

export async function assertPublicHost(host: string) {
  const h = host.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i.test(h)) throw new Error("private");
  const addrs = isIP(h) ? [{ address: h }] : await lookup(h, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("private");
}

export async function safeFetch(start: URL, init: RequestInit & { maxBytes?: number } = {}): Promise<Response> {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error("private");
    await assertPublicHost(url.hostname);
    const r = await fetch(url, { ...init, redirect: "manual" });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location")!, url);
      continue;
    }
    return r;
  }
  throw new Error("too many redirects");
}
