import crypto from "crypto";

import { ensureSnapshotsTable, getLatestSnapshot, insertSnapshot, VERSION as DB_VERSION } from "@/lib/db";
import { sendAlertEmail, VERSION as EMAIL_VERSION } from "@/lib/email";
import { fetchRssItems, VERSION as RSS_VERSION } from "@/lib/rss";

export const runtime = "nodejs";
export const VERSION = "1.0.12";

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

function buildTestingEmailContent(items) {
  const subject = "RappelConso cron test: latest 10 items";
  const formatList = (list) =>
    list.map((item) => `- ${item.title || item.id} (${item.link || "no link"})`).join("\n");

  const text = [
    "Cron test email: latest 10 items from the RSS feed.",
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
    <p>Cron test email: latest 10 items from the RSS feed.</p>
    ${htmlList(items)}
  `;

  return { subject, text, html };
}

function isAuthorized(req) {
  if (!CRON_SECRET) return true;
  const authHeader = req.headers.get("authorization") || "";
  return authHeader === `Bearer ${CRON_SECRET}`;
}

export async function GET(req) {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  console.info(`[cron] run started`, { runId, startedAt });
  if (!isAuthorized(req)) {
    console.warn(`[cron] unauthorized request`, { runId });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensureSnapshotsTable();

    const latestSnapshot = await getLatestSnapshot();
    const previousItems = normalizeSnapshotItems(latestSnapshot);

    const result = await fetchRssItems();
    if (result.error) {
      console.error(`[cron] rss fetch failed`, { runId, error: result.error });
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
    let emailMode = "none";
    const hasDiff = newItems.length || changedItems.length || removedItems.length;
    if (latestSnapshot && hasDiff) {
      const content = buildEmailContent({ newItems, changedItems, removedItems });
      emailMessageId = await sendAlertEmail(content);
      emailMode = "diff";
    } else if (currentItems.length) {
      const testingItems = currentItems.slice(0, 10);
      const content = buildTestingEmailContent(testingItems);
      emailMessageId = await sendAlertEmail(content);
      emailMode = "test";
    }

    console.info(`[cron] run succeeded`, {
      runId,
      emailMode,
      counts: {
        previous: previousItems.length,
        current: currentItems.length,
        new: newItems.length,
        changed: changedItems.length,
        removed: removedItems.length
      }
    });

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
        emailMessageId,
        emailMode
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(`[cron] run failed`, {
      runId,
      error: error instanceof Error ? error.message : String(error)
    });
    return Response.json({ error: "Cron run failed" }, { status: 500 });
  }
}
