import {
  filterItemsByDistributeurs,
  getEmailConfigSummary,
  getEmailRecipientConfigs,
  sendAlertEmail,
  VERSION as EMAIL_VERSION
} from "@/lib/email";
import { fetchDistributeurInfo } from "@/lib/distributeurs";
import { buildEmailHtml } from "@/lib/email-template";
import { fetchRssItems, VERSION as RSS_VERSION } from "@/lib/rss";

export const runtime = "nodejs";
export const VERSION = "1.0.79";

const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

function buildTestingEmailContent(items) {
  const subject = "Rappel Conso RSS test: latest 10 items";
  const formatList = (list) =>
    list.map((item) => `- ${item.title || item.id} (${item.link || "no link"})`).join("\n");

  const text = [
    "Manual test email: latest 10 items from the RSS feed.",
    "",
    formatList(items) || "- none"
  ].join("\n");

  const html = buildEmailHtml({
    title: "RappelConso latest items",
    intro: "Manual test email: latest 10 items from the RSS feed.",
    sections: [{ title: "Latest 10 items", items }],
    footer: "View the full feed in the RappelConso RSS dashboard."
  });

  return { subject, text, html };
}

async function enrichItemsWithDistributeurs(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const results = await Promise.all(
    items.map(async (item) => {
      if (!item?.link) return item;
      try {
        const info = await fetchDistributeurInfo(item.link);
        return { ...item, ...info };
      } catch {
        return item;
      }
    })
  );
  return results;
}

export async function POST(req) {
  try {
    if (!isAuthorized(req)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await fetchRssItems();
    if (result.error) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    const items = Array.isArray(result.items) ? result.items.slice(0, 10) : [];
    if (!items.length) {
      return Response.json({ error: "No RSS items available" }, { status: 404 });
    }

    const enrichedItems = await enrichItemsWithDistributeurs(items);
    const recipientConfigs = await getEmailRecipientConfigs();
    if (recipientConfigs.length === 0) {
      return Response.json(
        {
          error: "No alert email recipients configured.",
          details: {
            emailConfig: await getEmailConfigSummary()
          }
        },
        { status: 400 }
      );
    }
    const emailMessages = [];
    for (const recipient of recipientConfigs) {
      const filteredItems = filterItemsByDistributeurs(
        enrichedItems,
        recipient.distributeurs
      );
      if (!filteredItems.length) continue;
      const content = buildTestingEmailContent(filteredItems);
      try {
        const emailMessageId = await sendAlertEmail({
          ...content,
          recipients: [recipient.email]
        });
        emailMessages.push({ email: recipient.email, messageId: emailMessageId });
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Email send failed",
            details: {
              emailConfig: await getEmailConfigSummary()
            }
          },
          { status: 502 }
        );
      }
    }

    return Response.json(
      {
        versions: {
          api: VERSION,
          rss: RSS_VERSION,
          email: EMAIL_VERSION
        },
        emailMessageId: emailMessages[0]?.messageId || null,
        emailMessages,
        emailMode: "manual-test"
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
