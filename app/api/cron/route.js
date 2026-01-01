import crypto from "crypto";

import { ensureSnapshotsTable, getLatestSnapshot, insertSnapshot, VERSION as DB_VERSION } from "@/lib/db";
import { sendAlertEmail, VERSION as EMAIL_VERSION } from "@/lib/email";
import { fetchRssItems, VERSION as RSS_VERSION } from "@/lib/rss";

export const runtime = "nodejs";
export const VERSION = "1.0.5";

const CRON_SECRET = process.env.CRON_SECRET;

function normalizeSnapshotItems(snapshot) {
  if (!snapshot?.items) return [];
  if (Array.isArray(snapshot.items)) return snapshot.items;
  if (typeof snapshot.items === "string") {
    try {
      const parsed = JSON.parse(snapshot.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hashItem(item) {
  const payload = {
    id: item.id,
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    descriptionHtml: item.descriptionHtml,
    enclosureUrl: item.enclosureUrl
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildHashMap(items) {
  return new Map(items.map((item) => [item.id, hashItem(item)]));
}

function buildEmailContent({ newItems, changedItems, removedItems }) {
  const totalChanges = newItems.length + changedItems.length + removedItems.length;
  const subject = `RappelConso updates: ${totalChanges} change${totalChanges === 1 ? "" : "s"}`;

  const formatList = (items) =>
    items.map((item) => `- ${item.title || item.id} (${item.link || "no link"})`).join("\n");

  const text = [
    `New items (${newItems.length}):`,
    formatList(newItems) || "- none",
    "",
    `Changed items (${changedItems.length}):`,
    formatList(changedItems) || "- none",
    "",
    `Removed items (${removedItems.length}):`,
    formatList(removedItems) || "- none"
  ].join("\n");

  const htmlList = (items) =>
    items.length
      ? `<ul>${items
          .map(
            (item) =>
              `<li><a href="${item.link || "#"}">${item.title || item.id}</a></li>`
          )
          .join("")}</ul>`
      : "<p>- none</p>";

  const html = `
    <p>New items (${newItems.length}):</p>
    ${htmlList(newItems)}
    <p>Changed items (${changedItems.length}):</p>
    ${htmlList(changedItems)}
    <p>Removed items (${removedItems.length}):</p>
    ${htmlList(removedItems)}
  `;

  return { subject, text, html };
}

function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

export async function GET(req) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureSnapshotsTable();

  const latestSnapshot = await getLatestSnapshot();
  const previousItems = normalizeSnapshotItems(latestSnapshot);

  const result = await fetchRssItems();
  if (result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  const currentItems = result.items;
  const previousMap = buildHashMap(previousItems);
  const currentMap = buildHashMap(currentItems);

  const newItems = currentItems.filter((item) => !previousMap.has(item.id));
  const changedItems = currentItems.filter(
    (item) => previousMap.has(item.id) && previousMap.get(item.id) !== currentMap.get(item.id)
  );
  const removedItems = previousItems.filter((item) => !currentMap.has(item.id));

  await insertSnapshot({ id: crypto.randomUUID(), items: currentItems });

  let emailMessageId = null;
  if (latestSnapshot && (newItems.length || changedItems.length || removedItems.length)) {
    const content = buildEmailContent({ newItems, changedItems, removedItems });
    emailMessageId = await sendAlertEmail(content);
  }

  return Response.json(
    {
      versions: {
        cron: VERSION,
        rss: RSS_VERSION,
        db: DB_VERSION,
        email: EMAIL_VERSION
      },
      counts: {
        previous: previousItems.length,
        current: currentItems.length,
        new: newItems.length,
        changed: changedItems.length,
        removed: removedItems.length
      },
      emailMessageId
    },
    { status: 200 }
  );
}
