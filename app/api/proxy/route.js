export const runtime = "nodejs";

function isAllowedUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "rappel.conso.gouv.fr";
  } catch {
    return false;
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  if (!isAllowedUrl(url)) {
    return new Response("Invalid or disallowed url", { status: 400 });
  }

  const res = await fetch(url, {
    headers: { Accept: "text/html, */*" },
    cache: "no-store"
  });

  if (!res.ok) {
    return new Response(`Upstream HTTP ${res.status}`, { status: 502 });
  }

  const html = await res.text();
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}
