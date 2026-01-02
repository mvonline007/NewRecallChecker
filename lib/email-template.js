export const VERSION = "1.0.48";

const DEFAULT_DESCRIPTION_LIMIT = 220;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, limit = DEFAULT_DESCRIPTION_LIMIT) {
  const text = String(value ?? "");
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function formatDate(item) {
  return item?.pubDate || item?.pubDateISO || "";
}

function formatDistributeur(item) {
  if (Array.isArray(item?.distributeursList) && item.distributeursList.length > 0) {
    return item.distributeursList.join(", ");
  }
  return item?.distributeursRaw || "";
}

function formatMotif(item) {
  return item?.motifRaw || "";
}

function buildItemCard(item) {
  const title = escapeHtml(item?.title || item?.id || "Untitled");
  const link = item?.link ? escapeHtml(item.link) : "";
  const imageUrl = item?.enclosureUrl ? escapeHtml(item.enclosureUrl) : "";
  const dateLabel = escapeHtml(formatDate(item));
  const distributeur = truncateText(formatDistributeur(item), 80);
  const distributeurHtml = distributeur ? escapeHtml(distributeur) : "";
  const motif = truncateText(formatMotif(item), 140);
  const motifHtml = motif ? escapeHtml(motif) : "";

  const imageBlock = imageUrl
    ? `<img src="${imageUrl}" alt="${title}" style="display:block;width:100%;height:auto;border-radius:10px;margin:0 0 12px;" />`
    : `<div style="width:100%;padding:24px;background:#f1f5f9;border-radius:10px;text-align:center;color:#64748b;font-size:13px;margin:0 0 12px;">No image</div>`;

  const dateBlock = dateLabel
    ? `<div style="font-size:12px;color:#64748b;margin:0 0 8px;">${dateLabel}</div>`
    : "";

  const motifBlock = motifHtml
    ? `<div style="font-size:13px;line-height:1.5;color:#475569;margin:0 0 12px;">${motifHtml}</div>`
    : "";

  const distributeurBlock = distributeurHtml
    ? `<span style="display:inline-block;padding:8px 12px;background:#0f172a;color:#ffffff;border-radius:8px;font-size:13px;">${distributeurHtml}</span>`
    : "";

  const linkBlock = link
    ? `<a href="${link}" style="display:inline-block;padding:8px 12px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;">Open fiche</a>`
    : "";

  const actionRow = distributeurBlock || linkBlock
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${distributeurBlock}${linkBlock}</div>`
    : "";

  return `
    <table role="presentation" width="100%" style="border:1px solid #e2e8f0;border-radius:12px;margin:0 0 16px;background:#ffffff;">
      <tr>
        <td style="padding:16px;">
          ${imageBlock}
          <div style="font-size:16px;font-weight:600;color:#0f172a;margin:0 0 6px;">${title}</div>
          ${dateBlock}
          ${motifBlock}
          ${actionRow}
        </td>
      </tr>
    </table>
  `;
}

function buildSection(section) {
  const heading = escapeHtml(section.title || "");
  const items = Array.isArray(section.items) ? section.items : [];
  const itemMarkup = items.length ? items.map(buildItemCard).join("") : "";
  const emptyMarkup = items.length
    ? ""
    : `<div style="font-size:14px;color:#64748b;margin:0 0 16px;">- none</div>`;

  return `
    <div style="margin:24px 0 8px;font-size:18px;font-weight:600;color:#0f172a;">${heading} (${items.length})</div>
    ${itemMarkup || emptyMarkup}
  `;
}

export function buildEmailHtml({ title, intro, sections, footer }) {
  const sectionMarkup = Array.isArray(sections) ? sections.map(buildSection).join("") : "";
  const safeTitle = escapeHtml(title || "RappelConso updates");
  const safeIntro = intro ? escapeHtml(intro) : "";
  const introMarkup = safeIntro
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5;">${safeIntro}</p>`
    : "";
  const footerMarkup = footer
    ? `<p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">${escapeHtml(
        footer
      )}</p>`
    : "";

  return `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial, Helvetica, sans-serif;">
        <table role="presentation" width="100%" style="background:#f8fafc;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;">
                <tr>
                  <td style="padding:24px;">
                    <div style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px;">${safeTitle}</div>
                    ${introMarkup}
                    ${sectionMarkup}
                    ${footerMarkup}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
