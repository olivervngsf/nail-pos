import "server-only";
// The internet address the request came from, as Vercel saw it (a phone can't fake this the way it could fake a field it sends).
export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
}
