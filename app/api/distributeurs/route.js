import { listDistributeurs, VERSION as DISTRIBUTEUR_VERSION } from "@/lib/distributeurs";

export const runtime = "nodejs";
export const VERSION = "1.0.81";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const distributeurs = await listDistributeurs();
  return Response.json(
    {
      versions: {
        api: VERSION,
        distributeur: DISTRIBUTEUR_VERSION
      },
      distributeurs
    },
    { status: 200 }
  );
}
