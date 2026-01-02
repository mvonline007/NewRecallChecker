import { getEmailConfig, upsertEmailConfig, VERSION as CONFIG_VERSION } from "@/lib/email-config";
import { getEmailConfigSummary, VERSION as EMAIL_VERSION } from "@/lib/email";

export const runtime = "nodejs";
export const VERSION = "1.0.33";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

function normalizeRecipients(raw) {
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [config, summary] = await Promise.all([getEmailConfig(), getEmailConfigSummary()]);

  return Response.json(
    {
      versions: {
        api: VERSION,
        config: CONFIG_VERSION,
        email: EMAIL_VERSION
      },
      config,
      summary
    },
    { status: 200 }
  );
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const alertEmailTo = typeof payload?.alertEmailTo === "string" ? payload.alertEmailTo : "";
  const recipients = normalizeRecipients(alertEmailTo);
  if (recipients.length === 0) {
    return Response.json(
      { error: "Provide at least one email address (comma separated)." },
      { status: 400 }
    );
  }

  const updatedConfig = await upsertEmailConfig(recipients.join(", "));
  const summary = await getEmailConfigSummary();

  return Response.json(
    {
      versions: {
        api: VERSION,
        config: CONFIG_VERSION,
        email: EMAIL_VERSION
      },
      config: updatedConfig,
      summary
    },
    { status: 200 }
  );
}
