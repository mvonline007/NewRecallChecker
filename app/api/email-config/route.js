import {
  getEmailConfig,
  normalizeRecipientConfigs,
  upsertEmailConfig,
  VERSION as CONFIG_VERSION
} from "@/lib/email-config";
import { getEmailConfigSummary, VERSION as EMAIL_VERSION } from "@/lib/email";

export const runtime = "nodejs";
export const VERSION = "1.0.67";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

function formatRecipientConfigEntry(entry) {
  if (!entry) return null;
  if (!Array.isArray(entry.distributeurs)) {
    return { email: entry.email, distributeurs: [] };
  }
  return {
    email: entry.email,
    distributeurs: entry.distributeurs
  };
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [config, summary] = await Promise.all([getEmailConfig(), getEmailConfigSummary()]);
  const normalizedConfig = config
    ? {
        ...config,
        recipients: Array.isArray(config.recipients)
          ? config.recipients.map(formatRecipientConfigEntry)
          : []
      }
    : null;

  return Response.json(
    {
      versions: {
        api: VERSION,
        config: CONFIG_VERSION,
        email: EMAIL_VERSION
      },
      config: normalizedConfig,
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

  const rawRecipientConfigs =
    payload?.recipients ??
    (typeof payload?.alertEmailTo === "string" ? payload.alertEmailTo : null);
  const recipients = normalizeRecipientConfigs(rawRecipientConfigs);
  if (recipients.length === 0) {
    return Response.json(
      { error: "Provide at least one email address." },
      { status: 400 }
    );
  }

  const updatedConfig = await upsertEmailConfig(recipients);
  const summary = await getEmailConfigSummary();

  return Response.json(
    {
      versions: {
        api: VERSION,
        config: CONFIG_VERSION,
        email: EMAIL_VERSION
      },
      config: {
        ...updatedConfig,
        recipients: Array.isArray(updatedConfig?.recipients)
          ? updatedConfig.recipients.map(formatRecipientConfigEntry)
          : []
      },
      summary
    },
    { status: 200 }
  );
}
