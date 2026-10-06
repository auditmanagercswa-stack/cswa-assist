import { prisma } from "@/lib/db";
import { storage } from "@/server/storage";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

/** Public media (vehicle photos/videos). Immutable keys → long-lived caching; put a CDN in front. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const key = path.join("/");
  if (!/^[a-z0-9/_\-.]+$/i.test(key) || key.includes("..")) return new Response("Not found", { status: 404 });
  // Only objects registered as PUBLIC (or their generated thumbnails, or seed media) are served here.
  const baseKey = key.replace(/_t\.webp$/, ".webp");
  if (!key.startsWith("seed/")) {
    const file = await prisma.storedFile.findUnique({ where: { key: baseKey }, select: { visibility: true } });
    if (!file || file.visibility !== "PUBLIC") return new Response("Not found", { status: 404 });
  }
  const data = await storage.get(key);
  if (!data) return new Response("Not found", { status: 404 });
  const ext = key.split(".").pop()!.toLowerCase();
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
