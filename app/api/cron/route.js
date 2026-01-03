import crypto from "crypto";

import { ensureSnapshotsTable, getLatestSnapshot, insertSnapshot, VERSION as DB_VERSION } from "@/lib/db";
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
export const VERSION = "1.0.82";

const CRON_SECRET = process.env.CRON_SECRET;
const CRON_EMAIL_MODE = process.env.CRON_EMAIL_MODE || "auto";

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

function buildNewItemsEmailContent(items) {
  const subject = `RappelConso new items: ${items.length}`;
  const formatList = (list) =>
    list.map((item) => `- ${item.title || item.id} (${item.link || "no link"})`).join("\n");
  const text = [
    `New items (${items.length}):`,
    formatList(items) || "- none"
  ].join("\n");
  const html = buildEmailHtml({
    title: "RappelConso new items",
    intro: "Latest new items detected in the RappelConso RSS feed.",
    sections: [{ title: "New items", items }],
    footer: "View the full feed in the RappelConso RSS dashboard."
  });
  return { subject, text, html };
}

function buildLatestItemsEmailContent(items, intro) {
  const subject = `RappelConso latest items: ${items.length}`;
  const formatList = (list) =>
    list.map((item) => `- ${item.title || item.id} (${item.link || "no link"})`).join("\n");
  const text = [
    intro || "Latest 10 items from the RSS feed.",
    "",
    formatList(items) || "- none"
  ].join("\n");
  const html = buildEmailHtml({
    title: "RappelConso latest items",
    intro: intro || "Latest 10 items from the RSS feed.",
    sections: [{ title: "Latest 10 items", items }],
    footer: "View the full feed in the RappelConso RSS dashboard."
  });
  return { subject, text, html };
}

function buildCombinedLatestItems({ newItems, latestItems }) {
  const seen = new Set();
  const merged = [];
  const pushUnique = (item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    merged.push(item);
  };
  newItems.forEach(pushUnique);
  latestItems.forEach(pushUnique);
  return merged;
}

async function buildEmailErrorDetails(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    emailConfig: await getEmailConfigSummary()
  };
}

function normalizeEmailMode(mode) {
  const normalized = String(mode || "")
    .trim()
    .toLowerCase();
  if (normalized === "diff") return "diff";
  if (normalized === "latest10") return "latest10";
  return "auto";
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

async function sendFilteredEmails({ recipientConfigs, buildContent }) {
  const emailMessages = [];
  for (const recipient of recipientConfigs) {
    const content = await buildContent(recipient);
    if (!content) continue;
    const emailMessageId = await sendAlertEmail({
      ...content,
      recipients: [recipient.email]
    });
    emailMessages.push({ email: recipient.email, messageId: emailMessageId });
  }
  return emailMessages;
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
    const desiredEmailMode = normalizeEmailMode(CRON_EMAIL_MODE);
    const shouldSendLatest10 = desiredEmailMode === "latest10" || !latestSnapshot;
    const latestItems = currentItems.slice(0, 10);
    const recipientConfigs = await getEmailRecipientConfigs();
    const hasRecipientOnlyNew = recipientConfigs.some((entry) => entry.onlyNewItems);
    if (recipientConfigs.length === 0) {
      return Response.json(
        {
          error: "No alert email recipients configured.",
          details: await buildEmailErrorDetails(
            new Error("No alert email recipients configured.")
          )
        },
        { status: 400 }
      );
    }

    if ((shouldSendLatest10 && currentItems.length) || hasRecipientOnlyNew) {
      let enrichedLatest = null;
      let enrichedNew = null;
      let enrichedCombined = null;
      const getEnrichedLatest = async () => {
        if (!enrichedLatest) {
          enrichedLatest = await enrichItemsWithDistributeurs(latestItems);
        }
        return enrichedLatest;
      };
      const getEnrichedNew = async () => {
        if (!enrichedNew) {
          enrichedNew = await enrichItemsWithDistributeurs(newItems);
        }
        return enrichedNew;
      };
      const getEnrichedCombined = async () => {
        if (!enrichedCombined) {
          const combined = buildCombinedLatestItems({
            newItems,
            latestItems
          });
          enrichedCombined = await enrichItemsWithDistributeurs(combined);
        }
        return enrichedCombined;
      };
      try {
        const emailMessages = await sendFilteredEmails({
          recipientConfigs,
          buildContent: async (recipient) => {
            if (recipient.onlyNewItems) {
              const filteredNew = filterItemsByDistributeurs(
                await getEnrichedNew(),
                recipient.distributeurs
              );
              if (filteredNew.length) {
                return buildNewItemsEmailContent(filteredNew);
              }
              return null;
            }
            const filteredCombined = filterItemsByDistributeurs(
              await getEnrichedCombined(),
              recipient.distributeurs
            );
            if (!filteredCombined.length) return null;
            return buildLatestItemsEmailContent(
              filteredCombined,
              "Latest 10 items, plus any new items (new first)."
            );
          }
        });
        emailMessageId = emailMessages[0]?.messageId || null;
        if (emailMessages.length) {
          emailMode = hasRecipientOnlyNew
            ? "recipient-config"
            : "latest-with-new";
        }
      } catch (error) {
        return Response.json(
          { error: "Email send failed", details: await buildEmailErrorDetails(error) },
          { status: 502 }
        );
      }
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
