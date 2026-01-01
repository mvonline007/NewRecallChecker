import { fetchRssItems, VERSION } from "@/lib/rss";

export const runtime = "nodejs";
export { VERSION };

export async function GET() {
  const result = await fetchRssItems();
  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ items: result.items }, { status: 200 });
}
