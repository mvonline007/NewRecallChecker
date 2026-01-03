"use client";

import { useEffect, useMemo, useState } from "react";

export const VERSION = "1.0.80";

const emptyStatus = { type: "", message: "" };
const CRON_SCHEDULE = "0 6 * * *";

function formatRecipients(list) {
  if (!Array.isArray(list) || list.length === 0) return "None";
  return list.join(", ");
}

function formatRecipientConfig(entry) {
  if (!entry?.email) return "";
  const distributeurs = Array.isArray(entry.distributeurs) ? entry.distributeurs : [];
  const modeSuffix = entry.onlyNewItems ? " · new only" : " · latest 10 + new first";
  if (!distributeurs.length) return `${entry.email} (all distributeurs)${modeSuffix}`;
  return `${entry.email} (${distributeurs.join(", ")})${modeSuffix}`;
}

function formatDate(value) {
  if (!value) return "Unknown";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString();
}

function formatEmailConfig(config) {
  if (!config) return "";
  const recipients = Array.isArray(config.recipients) ? config.recipients.join(", ") : "";
  return [
    config.user ? `user=${config.user}` : "user=missing",
    `recipients=${recipients || "missing"}`,
    `appPasswordConfigured=${config.appPasswordConfigured ? "yes" : "no"}`,
    `appPasswordLength=${config.appPasswordLength ?? 0}`,
    config.service ? `service=${config.service}` : null
  ]
    .filter(Boolean)
    .join(" · ");
}

function filterDistributeurOptions(options, query) {
  if (!query) return options;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => option.toLowerCase().includes(normalized));
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        role="button"
        tabIndex={0}
      />
      <div className="relative z-10 w-[min(900px,92vw)] max-h-[88vh] overflow-auto rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-4 border-b border-neutral-800 bg-neutral-950/90 px-4 py-3 backdrop-blur">
          <div className="text-sm font-semibold text-neutral-100 line-clamp-1">{title}</div>
          <button
            className="rounded-lg border border-neutral-700 px-3 py-1 text-sm text-neutral-200 hover:bg-neutral-900"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function ConfigPage() {
  const [recipientConfigs, setRecipientConfigs] = useState([
    { email: "", distributeurs: [], filter: "", onlyNewItems: false }
  ]);
  const [distributeurOptions, setDistributeurOptions] = useState([]);
  const [cronSecret, setCronSecret] = useState("");
  const [status, setStatus] = useState(emptyStatus);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [summary, setSummary] = useState(null);
  const [testEmailStatus, setTestEmailStatus] = useState(null);
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const loadDistributeurs = async (headers) => {
    try {
      const res = await fetch("/api/distributeurs", { headers, cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(payload?.distributeurs)) {
        setDistributeurOptions(payload.distributeurs);
      }
    } catch {}
  };

  const loadConfig = async () => {
    setLoading(true);
    setStatus(emptyStatus);
    try {
      const headers = {};
      if (cronSecret.trim()) {
        headers.Authorization = `Bearer ${cronSecret.trim()}`;
      }
      const [res] = await Promise.all([
        fetch("/api/email-config", { headers, cache: "no-store" }),
        loadDistributeurs(headers)
      ]);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          type: "error",
          message: payload?.error || `Unable to load config (${res.status}).`
        });
        return;
      }
      setConfig(payload?.config || null);
      setSummary(payload?.summary || null);
      const loadedRecipients = Array.isArray(payload?.config?.recipients)
        ? payload.config.recipients.map((entry) => ({
            email: entry.email || "",
            distributeurs: Array.isArray(entry.distributeurs) ? entry.distributeurs : [],
            filter: "",
            onlyNewItems: Boolean(entry.onlyNewItems)
          }))
        : [];
      setRecipientConfigs(
        loadedRecipients.length
          ? loadedRecipients
          : [{ email: "", distributeurs: [], filter: "", onlyNewItems: false }]
      );
      setStatus({ type: "success", message: "Configuration loaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setStatus(emptyStatus);
    try {
      const headers = { "Content-Type": "application/json" };
      if (cronSecret.trim()) {
        headers.Authorization = `Bearer ${cronSecret.trim()}`;
      }
      const recipientsPayload = recipientConfigs
        .map((entry) => ({
          email: entry.email.trim(),
          distributeurs: Array.isArray(entry.distributeurs) ? entry.distributeurs : [],
          onlyNewItems: Boolean(entry.onlyNewItems)
        }))
        .filter((entry) => entry.email);
      const res = await fetch("/api/email-config", {
        method: "POST",
        headers,
        body: JSON.stringify({ recipients: recipientsPayload })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          type: "error",
          message: payload?.error || `Save failed (${res.status}).`
        });
        return;
      }
      setConfig(payload?.config || null);
      setSummary(payload?.summary || null);
      const savedRecipients = Array.isArray(payload?.config?.recipients)
        ? payload.config.recipients.map((entry) => ({
            email: entry.email || "",
            distributeurs: Array.isArray(entry.distributeurs) ? entry.distributeurs : [],
            filter: "",
            onlyNewItems: Boolean(entry.onlyNewItems)
          }))
        : [];
      setRecipientConfigs(savedRecipients.length ? savedRecipients : recipientConfigs);
      setStatus({ type: "success", message: "Configuration saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setStatus({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewUrl = useMemo(() => {
    const secret = cronSecret.trim();
    const params = new URLSearchParams();
    if (secret) params.set("secret", secret);
    const query = params.toString();
    return query ? `/api/email-preview?${query}` : "/api/email-preview";
  }, [cronSecret]);

  const sendTestEmail = async () => {
    if (testEmailSending) return;
    setTestEmailSending(true);
    setTestEmailStatus(null);
    try {
      const headers = {};
      if (cronSecret.trim()) {
        headers.Authorization = `Bearer ${cronSecret.trim()}`;
      }
      const res = await fetch("/api/test-email", {
        method: "POST",
        headers
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = payload?.error || `Request failed (${res.status})`;
        const details = formatEmailConfig(payload?.details?.emailConfig);
        setTestEmailStatus({
          type: "error",
          message,
          details
        });
        return;
      }
      setTestEmailStatus({
        type: "success",
        message: `Test email sent (${payload?.emailMode || "ok"})`,
        details: ""
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setTestEmailStatus({ type: "error", message });
    } finally {
      setTestEmailSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-2xl font-semibold">Email configuration</div>
            <p className="text-sm text-neutral-400">
              Configure which email address(es) receive cron alerts and which Distributeurs should
              trigger them. Leave Distributeurs blank to receive all alerts. The cron job will use this
              configuration before falling back to the ALERT_EMAIL_TO environment variable.
            </p>
          </div>
          <a
            href="/"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 text-neutral-200 hover:bg-neutral-900"
            aria-label="Close and return to dashboard"
            title="Close"
          >
            ×
          </a>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-col gap-4">
            <div className="space-y-3">
              <div className="text-sm text-neutral-200">Alert recipients</div>
              {recipientConfigs.map((entry, index) => {
                const filteredOptions = filterDistributeurOptions(
                  distributeurOptions,
                  entry.filter
                );
                return (
                  <div
                    key={`${entry.email}-${index}`}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                  >
                    <label className="text-xs text-neutral-400">Recipient email</label>
                    <input
                      value={entry.email}
                      onChange={(event) => {
                        const next = [...recipientConfigs];
                        next[index] = { ...next[index], email: event.target.value };
                        setRecipientConfigs(next);
                      }}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                      placeholder="alerts@example.com"
                    />
                    <label className="text-xs text-neutral-400">Distributeurs filter (optional)</label>
                    <input
                      value={entry.filter || ""}
                      onChange={(event) => {
                        const next = [...recipientConfigs];
                        next[index] = { ...next[index], filter: event.target.value };
                        setRecipientConfigs(next);
                      }}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                      placeholder="Search distributeurs…"
                    />
                    <select
                      multiple
                      value={entry.distributeurs}
                      onChange={(event) => {
                        const selected = Array.from(event.target.selectedOptions).map(
                          (option) => option.value
                        );
                        const next = [...recipientConfigs];
                        next[index] = { ...next[index], distributeurs: selected };
                        setRecipientConfigs(next);
                      }}
                      className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    >
                      {filteredOptions.length === 0 ? (
                        <option disabled value="">
                          {distributeurOptions.length === 0
                            ? "No distributeurs available"
                            : "No distributeurs match your search"}
                        </option>
                      ) : (
                        filteredOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="text-xs text-neutral-500">
                      Select one or more distributeurs (leave empty for all).
                    </div>
                    <label className="flex items-center gap-2 text-xs text-neutral-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-neutral-200"
                        checked={Boolean(entry.onlyNewItems)}
                        onChange={(event) => {
                          const next = [...recipientConfigs];
                          next[index] = { ...next[index], onlyNewItems: event.target.checked };
                          setRecipientConfigs(next);
                        }}
                      />
                      Only new items
                    </label>
                    {!entry.onlyNewItems && (
                      <div className="text-xs text-neutral-500">
                        Default: latest 10 items plus any new items (new first).
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                        onClick={() => {
                          const next = [...recipientConfigs];
                          next[index] = { ...next[index], distributeurs: [] };
                          setRecipientConfigs(next);
                        }}
                      >
                        Clear selection
                      </button>
                      <button
                        type="button"
                        className="rounded-xl border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
                        onClick={() => {
                          const next = recipientConfigs.filter((_, i) => i !== index);
                          setRecipientConfigs(
                            next.length
                              ? next
                              : [{ email: "", distributeurs: [], filter: "", onlyNewItems: false }]
                          );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                onClick={() =>
                  setRecipientConfigs([
                    ...recipientConfigs,
                    { email: "", distributeurs: [], filter: "", onlyNewItems: false }
                  ])
                }
              >
                Add recipient
              </button>
            </div>

            <label className="text-sm text-neutral-200">
              Cron secret (optional)
              <input
                value={cronSecret}
                onChange={(event) => setCronSecret(event.target.value)}
                type="password"
                className="mt-2 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Bearer token used to secure /api/email-config"
              />
            </label>
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
              <div className="text-neutral-200">Cron schedule</div>
              <div className="mt-1">
                Current schedule: <span className="text-neutral-100">{CRON_SCHEDULE}</span> (UTC).
                Update the Vercel cron schedule in <code className="text-neutral-200">vercel.json</code>{" "}
                and redeploy to change the run time.
              </div>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <div className="text-sm text-neutral-200">Email tests</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                  onClick={sendTestEmail}
                  disabled={testEmailSending}
                >
                  {testEmailSending ? "Sending…" : "Send test email"}
                </button>
                <button
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                  onClick={() => {
                    setPreviewKey((val) => val + 1);
                    setPreviewOpen(true);
                  }}
                  type="button"
                >
                  Preview email
                </button>
              </div>
              {testEmailStatus && (
                <div className="mt-3 text-xs">
                  <div
                    className={
                      testEmailStatus.type === "success" ? "text-emerald-300" : "text-rose-300"
                    }
                  >
                    {testEmailStatus.message}
                  </div>
                  {testEmailStatus.details && (
                    <div className="text-neutral-400">{testEmailStatus.details}</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                onClick={loadConfig}
                disabled={loading}
              >
                {loading ? "Loading…" : "Reload"}
              </button>
              <button
                className="rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-2 text-sm text-neutral-950 hover:bg-neutral-200"
                onClick={saveConfig}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save configuration"}
              </button>
            </div>

            {status.message && (
              <div
                className={
                  status.type === "error"
                    ? "rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200"
                    : "rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-200"
                }
              >
                {status.message}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-200">
          <div className="text-sm font-semibold text-neutral-100">Current configuration</div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <div className="text-xs uppercase text-neutral-500">Stored recipients</div>
              <div className="space-y-1">
                {Array.isArray(config?.recipients) && config.recipients.length ? (
                  config.recipients.map((entry) => (
                    <div key={`${entry.email}-${entry.distributeurs?.join("|") || "all"}`}>
                      {formatRecipientConfig(entry)}
                    </div>
                  ))
                ) : (
                  <div>Not set</div>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Last updated</div>
              <div>{formatDate(config?.updatedAt)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Effective recipients</div>
              <div>{formatRecipients(summary?.recipients)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">Source</div>
              <div>{summary?.configSource || "Unknown"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">SMTP user</div>
              <div>{summary?.user || "Not configured"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-neutral-500">App password configured</div>
              <div>{summary?.appPasswordConfigured ? "Yes" : "No"}</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-neutral-500">Version {VERSION}</div>
        </div>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Email preview">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
            <span>Preview is rendered from the email template.</span>
            <button
              type="button"
              className="rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900"
              onClick={() => setPreviewKey((val) => val + 1)}
            >
              Reload preview
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-neutral-800">
            <iframe
              key={previewKey}
              title="email-preview"
              src={previewUrl}
              className="h-[75vh] w-full bg-white"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
