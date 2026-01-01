import { sendAlertEmail, VERSION as EMAIL_VERSION } from "@/lib/email";
import { fetchRssItems, VERSION as RSS_VERSION } from "@/lib/rss";

export const runtime = "nodejs";
export const VERSION = "1.0.23";

const TEST_EMAIL_TOKEN = process.env.TEST_EMAIL_TOKEN;

function isAuthorized(token) {
  if (!TEST_EMAIL_TOKEN) {
    return process.env.NODE_ENV !== "production";
  }
  return token === TEST_EMAIL_TOKEN;
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

  const htmlList = (list) =>
    list.length
      ? `<ul>${list
          .map(
            (item) =>
              `<li><a href="${item.link || "#"}">${item.title || item.id}</a></li>`
          )
          .join("")}</ul>`
      : "<p>- none</p>";

  const html = `
    <p>Manual test email: latest 10 items from the RSS feed.</p>
    ${htmlList(items)}
  `;

  return { subject, text, html };
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => ({}));
    const token = payload?.token || "";
    if (!isAuthorized(token)) {
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

    const content = buildTestingEmailContent(items);
    const emailMessageId = await sendAlertEmail(content);

    return Response.json(
      {
        versions: {
          api: VERSION,
          rss: RSS_VERSION,
          email: EMAIL_VERSION
        },
        emailMessageId,
        emailMode: "manual-test"
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
