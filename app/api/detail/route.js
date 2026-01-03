import { fetchDistributeurInfo, VERSION as DISTRIBUTEUR_VERSION } from "@/lib/distributeurs";

export const runtime = "nodejs";
export const VERSION = "1.0.58";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "";

  try {
    const { distributeursRaw, distributeursList, motifRaw } = await fetchDistributeurInfo(url);
    return Response.json(
      {
        distributeursRaw,
        distributeursList,
        motifRaw,
        versions: { api: VERSION, distributeur: DISTRIBUTEUR_VERSION }
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid or disallowed url";
    const status = message.startsWith("Invalid or disallowed url") ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
