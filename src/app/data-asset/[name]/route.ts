import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/store";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// Serves images from data/assets (your CV photo) without putting them in the public repo.
export async function GET(_: Request, ctx: RouteContext<"/data-asset/[name]">) {
  const { name } = await ctx.params;
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type || name.includes("/") || name.includes("..")) return new Response("Not found", { status: 404 });
  try {
    const file = await fs.readFile(path.join(DATA_DIR, "assets", name));
    return new Response(file, { headers: { "content-type": type, "cache-control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
