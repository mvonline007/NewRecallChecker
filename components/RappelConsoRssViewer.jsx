"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts";

const LS_SEEN_IDS = "rappelconso_seen_ids_v1";
const LS_LAST_REFRESH = "rappelconso_last_refresh_v1";
const LS_LAST_NEW_IDS = "rappelconso_last_new_ids_v1";
const APP_VERSION = "1.0.28";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtDateDMY(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

function fmtISODateDMY(iso) {
  if (!iso) return "";
  const parts = String(iso).split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return String(iso);
}

function toISODate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const da = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function readJsonLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function stripHtml(html) {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").replace(/\s+/g, " ").trim();
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
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

function openExternal(url) {
  if (!url) return false;
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return true;
  } catch {}
  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      window.prompt("Copy this link:", text);
      return true;
    } catch {
      return false;
    }
  }
}

function pickShortDistributorLabel(list, raw) {
  if (Array.isArray(list) && list.length === 1) return list[0];
  if (Array.isArray(list) && list.length > 1) return `${list[0]} +${list.length - 1}`;
  if (raw && raw.length > 40) return `${raw.slice(0, 37)}…`;
  return raw || "";
}

async function fetchFeed(signal) {
  const res = await fetch("/api/rss", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const items = Array.isArray(j?.items) ? j.items : [];
  return items.map((x) => ({
    ...x,
    descriptionText: stripHtml(x.descriptionHtml),
    pubDateISO: x.pubDateISO || toISODate(x.pubDate),
    pubDateTs: x.pubDateTs ?? (new Date(x.pubDate).getTime() || 0)
  }));
}

function readDetailCache() {
  try {
    const raw = localStorage.getItem("rappelconso_detail_cache_v1");
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j;
  } catch {}
  return {};
}

function writeDetailCache(cacheObj) {
  try {
    localStorage.setItem("rappelconso_detail_cache_v1", JSON.stringify(cacheObj));
  } catch {}
}

async function fetchDetail(link, signal) {
  const res = await fetch(`/api/detail?url=${encodeURIComponent(link)}`, {
    signal,
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`detail HTTP ${res.status}`);
  return await res.json();
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-neutral-700/60 bg-neutral-900/40 px-2 py-0.5 text-xs text-neutral-200">
      {children}
    </span>
  );
}

function NewPill() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
      NEW
    </span>
  );
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

function ImageWithFallback({ src, alt }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-900/60 text-xs text-neutral-400">
        No image
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setBad(true)}
    />
  );
}

function useOnClickOutside(ref, handler) {
  useEffect(() => {
    function onDown(e) {
      const el = ref?.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      handler?.(e);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [ref, handler]);
}

function MultiSelectDropdown({ label, options, selected, onChange, hint }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef(null);
  useOnClickOutside(wrapRef, () => setOpen(false));

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((x) => x.toLowerCase().includes(q));
  }, [options, filter]);

  function toggle(val) {
    const has = selected.includes(val);
    if (has) onChange(selected.filter((x) => x !== val));
    else onChange([...selected, val]);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        className={classNames(
          "rounded-xl border px-3 py-2 text-sm",
          open
            ? "border-neutral-200 bg-neutral-100 text-neutral-950"
            : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {label}: {selected.length ? `${selected.length} selected` : "All"}
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-[min(520px,90vw)] rounded-2xl border border-neutral-700 bg-neutral-950 p-3 shadow-2xl">
          <div className="flex items-center gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
            <button
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
              onClick={() => onChange([])}
              disabled={!selected.length}
              title="Clear"
            >
              Clear
            </button>
          </div>

          {hint && <div className="mt-2 text-xs text-neutral-500">{hint}</div>}

          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-neutral-800">
            {shown.length ? (
              <div className="divide-y divide-neutral-800">
                {shown.map((opt) => {
                  const checked = selected.includes(opt);
                  return (
                    <label
                      key={opt}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(opt)}
                        className="h-4 w-4 accent-neutral-200"
                      />
                      <span className="min-w-0 flex-1 truncate">{opt}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-xs text-neutral-500">No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RappelConsoRssViewer() {
  const abortRef = useRef(null);
  const detailsAbortRef = useRef(null);
  const modalAbortRef = useRef(null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [prevRefreshTs, setPrevRefreshTs] = useState(null);
  const [newIds, setNewIds] = useState([]);

  const [detailsMap, setDetailsMap] = useState({});
  const [detailsProgress, setDetailsProgress] = useState({ loaded: 0, total: 0, errors: 0 });

  const [mode, setMode] = useState("gallery");
  const [q, setQ] = useState("");
  const [onlyWithImages, setOnlyWithImages] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedDistributeurs, setSelectedDistributeurs] = useState([]);

  const [selected, setSelected] = useState(null);
  const [ficheOpen, setFicheOpen] = useState(false);
  const [ficheUrl, setFicheUrl] = useState("");
  const [toast, setToast] = useState(null);
  const [pageSize, setPageSize] = useState(30);
  const [cronSecret, setCronSecret] = useState("");
  const [testEmailStatus, setTestEmailStatus] = useState(null);
  const [testEmailSending, setTestEmailSending] = useState(false);

  const distributeurOptions = useMemo(() => {
    const set = new Set();
    Object.values(detailsMap).forEach((d) => (d?.distributeursList || []).forEach((x) => set.add(x)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [detailsMap]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((it) => {
      if (onlyWithImages && !it.enclosureUrl) return false;

      if (fromDate) {
        const d = it.pubDateISO;
        if (!d || d < fromDate) return false;
      }
      if (toDate) {
        const d = it.pubDateISO;
        if (!d || d > toDate) return false;
      }

      if (selectedDistributeurs.length) {
        const dlist = detailsMap[it.id]?.distributeursList || [];
        if (!dlist.some((x) => selectedDistributeurs.includes(x))) return false;
      }

      if (!qq) return true;
      const dist = detailsMap[it.id]?.distributeursRaw || "";
      const hay = `${it.title} ${it.descriptionText} ${dist}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, q, onlyWithImages, fromDate, toDate, selectedDistributeurs, detailsMap]);

  const visible = useMemo(() => filtered.slice(0, pageSize), [filtered, pageSize]);

  const stats = useMemo(() => {
    const counts = new Map();
    for (const it of filtered) {
      const d = it.pubDateISO;
      if (!d) continue;
      counts.set(d, (counts.get(d) || 0) + 1);
    }
    const days = Array.from(counts.keys()).sort();
    const tail = days.slice(-14);
    return tail.map((d) => ({ date: d, count: counts.get(d) || 0 }));
  }, [filtered]);

  async function refresh() {
    setErr("");
    setLoading(true);

    abortRef.current?.abort?.();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const parsed = await fetchFeed(ctrl.signal);

      const prevSeen = readJsonLS(LS_SEEN_IDS, null);
      const prevRefresh = readJsonLS(LS_LAST_REFRESH, null);

      let computedNewIds = [];
      if (Array.isArray(prevSeen) && prevSeen.length) {
        const seenSet = new Set(prevSeen);
        computedNewIds = parsed.filter((x) => x?.id && !seenSet.has(x.id)).map((x) => x.id);
      }

      const seenSet2 = new Set(Array.isArray(prevSeen) ? prevSeen : []);
      parsed.forEach((x) => {
        if (x?.id) seenSet2.add(x.id);
      });

      writeJsonLS(LS_SEEN_IDS, Array.from(seenSet2));
      writeJsonLS(LS_LAST_REFRESH, Date.now());
      writeJsonLS(LS_LAST_NEW_IDS, computedNewIds);

      setPrevRefreshTs(prevRefresh);
      setNewIds(computedNewIds);

      const withNewFlag = parsed.map((x) => ({ ...x, isNew: computedNewIds.includes(x.id) }));

      setItems(withNewFlag);
      setLastUpdated(new Date().toISOString());
      setPageSize(30);

      try {
        localStorage.setItem("rappelconso_rss_cache_v1", JSON.stringify({ t: Date.now(), items: parsed }));
      } catch {}
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function ensureDetailForItem(it, signal) {
    if (!it?.id || !it?.link) return;
    if (detailsMap[it.id]) return;

    const cache = readDetailCache();
    const cached = cache?.[it.link];
    if (cached?.data?.distributeursRaw !== undefined) {
      setDetailsMap((prev) => ({ ...prev, [it.id]: cached.data }));
      return;
    }

    const data = await fetchDetail(it.link, signal);
    setDetailsMap((prev) => ({ ...prev, [it.id]: data }));

    cache[it.link] = { t: Date.now(), data };
    writeDetailCache(cache);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("rappelconso_rss_cache_v1");
      if (raw) {
        const j = JSON.parse(raw);
        if (Array.isArray(j?.items)) {
          const lastNew = readJsonLS(LS_LAST_NEW_IDS, []);
          const lastNewArr = Array.isArray(lastNew) ? lastNew : [];
          setNewIds(lastNewArr);
          setPrevRefreshTs(readJsonLS(LS_LAST_REFRESH, null));
          const withNewFlag = j.items.map((x) => ({ ...x, isNew: lastNewArr.includes(x.id) }));
          setItems(withNewFlag);
          setLastUpdated(new Date(j?.t || Date.now()).toISOString());
        }
      }
    } catch {}

    refresh();

    return () => {
      abortRef.current?.abort?.();
      detailsAbortRef.current?.abort?.();
      modalAbortRef.current?.abort?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    detailsAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    detailsAbortRef.current = ctrl;

    const N = Math.min(items.length, 120);
    const targets = items.slice(0, N).filter((it) => it.link);

    let cancelled = false;
    setDetailsProgress({ loaded: 0, total: targets.length, errors: 0 });

    const CONC = 4;
    let idx = 0;
    let active = 0;
    let loaded = 0;
    let errors = 0;

    const pump = () => {
      if (cancelled) return;
      while (active < CONC && idx < targets.length) {
        const it = targets[idx++];
        if (detailsMap[it.id]) {
          loaded++;
          setDetailsProgress({ loaded, total: targets.length, errors });
          continue;
        }
        active++;
        ensureDetailForItem(it, ctrl.signal)
          .catch(() => {
            errors++;
          })
          .finally(() => {
            active--;
            loaded++;
            setDetailsProgress({ loaded, total: targets.length, errors });
            pump();
          });
      }
    };

    const t = setTimeout(pump, 200);

    return () => {
      cancelled = true;
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    modalAbortRef.current?.abort?.();
    const ctrl = new AbortController();
    modalAbortRef.current = ctrl;

    if (selected?.id && selected?.link && !detailsMap[selected.id]) {
      ensureDetailForItem(selected, ctrl.signal).catch(() => {});
    }
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const withImagesCount = useMemo(() => items.filter((x) => x.enclosureUrl).length, [items]);

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
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <div className="text-xl font-semibold">Rappel Conso RSS — Categorie 01</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              {lastUpdated && <Pill>Updated: {fmtDateDMY(lastUpdated)}</Pill>}
              {prevRefreshTs && <Pill>Prev refresh: {fmtDateDMY(prevRefreshTs)}</Pill>}
              <Pill>Total: {items.length}</Pill>
              <Pill>New: {newIds.length}</Pill>
              <Pill>Filtered: {filtered.length}</Pill>
              <Pill>With images: {withImagesCount}</Pill>
              <Pill>v{APP_VERSION}</Pill>
              <Pill>
                Distributeurs: {detailsProgress.loaded}/{detailsProgress.total}
                {detailsProgress.errors ? ` (err ${detailsProgress.errors})` : ""}
              </Pill>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={classNames(
                "rounded-xl border px-3 py-2 text-sm",
                mode === "gallery"
                  ? "border-neutral-200 bg-neutral-100 text-neutral-950"
                  : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
              )}
              onClick={() => setMode("gallery")}
            >
              Gallery
            </button>

            <button
              className={classNames(
                "rounded-xl border px-3 py-2 text-sm",
                mode === "list"
                  ? "border-neutral-200 bg-neutral-100 text-neutral-950"
                  : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
              )}
              onClick={() => setMode("list")}
            >
              List
            </button>

            <button
              className={classNames(
                "rounded-xl border px-3 py-2 text-sm",
                mode === "stats"
                  ? "border-neutral-200 bg-neutral-100 text-neutral-950"
                  : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
              )}
              onClick={() => setMode("stats")}
            >
              Stats
            </button>

            <button
              className={classNames(
                "rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900",
                loading && "opacity-60"
              )}
              onClick={refresh}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2">
              <label className="text-xs text-neutral-400" htmlFor="cron-secret">
                Cron secret
              </label>
              <input
                id="cron-secret"
                type="password"
                className="w-40 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                placeholder="Optional"
                value={cronSecret}
                onChange={(event) => setCronSecret(event.target.value)}
              />
              <button
                className={classNames(
                  "rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-900",
                  testEmailSending && "opacity-60"
                )}
                onClick={sendTestEmail}
                disabled={testEmailSending}
              >
                {testEmailSending ? "Sending…" : "Send test email"}
              </button>
              {testEmailStatus && (
                <span className="flex flex-col text-xs">
                  <span
                    className={classNames(
                      testEmailStatus.type === "success" ? "text-emerald-300" : "text-rose-300"
                    )}
                  >
                    {testEmailStatus.message}
                  </span>
                  {testEmailStatus.details && (
                    <span className="text-neutral-400">{testEmailStatus.details}</span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-12">
          <div className="md:col-span-5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title/description/distributeur…"
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            />
          </div>
          <div className="md:col-span-3">
            <label className="flex items-center gap-2 text-sm text-neutral-200">
              <input
                type="checkbox"
                checked={onlyWithImages}
                onChange={(e) => setOnlyWithImages(e.target.checked)}
                className="h-4 w-4 accent-neutral-200"
              />
              Only with images
            </label>
          </div>
          <div className="md:col-span-2">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-300"
              title="From date"
            />
          </div>
          <div className="md:col-span-2">
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-300"
              title="To date"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MultiSelectDropdown
            label="Distributeurs"
            options={distributeurOptions}
            selected={selectedDistributeurs}
            onChange={setSelectedDistributeurs}
            hint="Values parsed from each item page (field: Distributeurs)."
          />
          {selectedDistributeurs.length ? (
            <Pill>Active: {selectedDistributeurs.join(" | ")}</Pill>
          ) : (
            <Pill>Active: All</Pill>
          )}
        </div>

        {err && (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="font-semibold">Fetch error</div>
            <div className="mt-1 text-red-200/90">{err}</div>
          </div>
        )}

        {mode === "stats" && (
          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Items per day (last 14 days in filtered set)</div>
              <Pill>Points: {stats.length}</Pill>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => fmtISODateDMY(v)}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(v) => fmtISODateDMY(v)} />
                  <Bar dataKey="count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {mode !== "stats" && (
          <>
            <div className="mt-6">
              {mode === "gallery" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((it) => {
                    const det = detailsMap[it.id];
                    const distLabel = pickShortDistributorLabel(det?.distributeursList, det?.distributeursRaw);
                    const showNew = it.isNew;
                    return (
                      <div
                        key={it.id}
                        role="button"
                        tabIndex={0}
                        className="group overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 text-left shadow-sm transition hover:border-neutral-600"
                        onClick={() => setSelected(it)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(it);
                          }
                        }}
                      >
                        <div className="relative aspect-[16/10] w-full overflow-hidden">
                          <ImageWithFallback src={it.enclosureUrl} alt={it.title} />
                          {(showNew || it.link) && (
                            <div className="absolute right-2 top-2 flex items-center gap-2">
                              {showNew && <NewPill />}
                              {it.link && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFicheUrl(it.link);
                                    setFicheOpen(true);
                                  }}
                                  className="rounded-xl border border-neutral-700 bg-neutral-950/80 px-3 py-1 text-xs text-neutral-100 hover:bg-neutral-900"
                                  title="Open fiche inside app"
                                >
                                  Fiche
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 p-4">
                          <div className="text-sm font-semibold text-neutral-100 line-clamp-2">
                            {it.title || "(no title)"}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                            {it.pubDate && <Pill>{fmtDateDMY(it.pubDate)}</Pill>}
                            {it.enclosureUrl && <Pill>image</Pill>}
                            {distLabel && <Pill>{distLabel}</Pill>}
                          </div>
                          <div className="text-xs text-neutral-300/80 line-clamp-3">{it.descriptionText}</div>

                          {it.link && (
                            <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFicheUrl(it.link);
                                  setFicheOpen(true);
                                }}
                                className="inline-flex items-center gap-2 text-neutral-200 underline decoration-neutral-700 hover:decoration-neutral-300"
                              >
                                Open fiche
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyText(it.link).then(() => setToast("Link copied"));
                                }}
                                className="inline-flex items-center gap-2 text-neutral-300 underline decoration-neutral-800 hover:decoration-neutral-400"
                              >
                                Copy link
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {visible.map((it) => {
                    const det = detailsMap[it.id];
                    const distLabel = pickShortDistributorLabel(det?.distributeursList, det?.distributeursRaw);
                    return (
                      <div key={it.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-neutral-100">{it.title || "(no title)"}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                              {it.pubDate && <Pill>{fmtDateDMY(it.pubDate)}</Pill>}
                              {it.enclosureUrl && <Pill>image</Pill>}
                              {distLabel && <Pill>{distLabel}</Pill>}
                            </div>
                            <div className="mt-2 text-sm text-neutral-300/90 line-clamp-3">{it.descriptionText}</div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                              onClick={() => setSelected(it)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFicheUrl(it.link);
                                setFicheOpen(true);
                              }}
                              className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                            >
                              Open fiche
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-center">
              {pageSize < filtered.length ? (
                <button
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                  onClick={() => setPageSize((n) => Math.min(n + 30, filtered.length))}
                >
                  Load more ({Math.max(0, filtered.length - pageSize)} remaining)
                </button>
              ) : (
                <div className="text-xs text-neutral-500">End of results</div>
              )}
            </div>
          </>
        )}
      </div>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title || "Details"}>
        {selected && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-neutral-800">
              <div className="aspect-[16/9]">
                <ImageWithFallback src={selected.enclosureUrl} alt={selected.title} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              {selected.pubDate && <Pill>{fmtDateDMY(selected.pubDate)}</Pill>}
              {selected.pubDateISO && <Pill>{fmtISODateDMY(selected.pubDateISO)}</Pill>}
              {selected.enclosureUrl && <Pill>image</Pill>}
              {detailsMap[selected.id]?.distributeursRaw && (
                <Pill>
                  Distributeur: {pickShortDistributorLabel(detailsMap[selected.id]?.distributeursList, detailsMap[selected.id]?.distributeursRaw)}
                </Pill>
              )}
            </div>

            {selected.link && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-200">
                <div className="text-xs text-neutral-500">RappelConso page</div>
                <button
                  type="button"
                  onClick={() => {
                    copyText(selected.link).then(() => setToast("Link copied"));
                  }}
                  className="break-all text-left text-neutral-100 underline decoration-neutral-600 hover:decoration-neutral-300"
                  title="Copy link"
                >
                  {selected.link}
                </button>
              </div>
            )}

            {detailsMap[selected.id] ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="text-sm font-semibold text-neutral-100">Parsed fields</div>
                <div className="mt-2 space-y-2 text-sm text-neutral-200">
                  <div>
                    <span className="text-neutral-400">Distributeurs:</span> {detailsMap[selected.id].distributeursRaw || "(not found)"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
                Loading Distributeurs from item page…
              </div>
            )}

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="text-sm font-semibold text-neutral-100">RSS description</div>
              <div className="mt-2 text-sm text-neutral-200 whitespace-pre-wrap">{selected.descriptionText || "(no description)"}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selected.link && (
                <button
                  type="button"
                  onClick={() => {
                    setFicheUrl(selected.link);
                    setFicheOpen(true);
                  }}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                >
                  Open fiche
                </button>
              )}
              {selected.enclosureUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const ok = openExternal(selected.enclosureUrl);
                    if (!ok) setToast("Navigation blocked");
                  }}
                  className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                >
                  Open image
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={ficheOpen}
        onClose={() => {
          setFicheOpen(false);
          setFicheUrl("");
        }}
        title={ficheUrl ? "RappelConso fiche" : "Fiche"}
      >
        <div className="space-y-3">
          {ficheUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                onClick={() => copyText(ficheUrl).then(() => setToast("Link copied"))}
              >
                Copy link
              </button>
              <button
                type="button"
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
                onClick={() => {
                  const ok = openExternal(ficheUrl);
                  if (!ok) setToast("Navigation blocked");
                }}
              >
                Try new tab
              </button>
              <div className="text-xs text-neutral-500 break-all">{ficheUrl}</div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-neutral-800">
            {ficheUrl ? (
              <iframe
                title="rappelconso-fiche"
                src={`/api/proxy?url=${encodeURIComponent(ficheUrl)}`}
                className="h-[75vh] w-full bg-neutral-950"
              />
            ) : (
              <div className="p-6 text-sm text-neutral-400">No fiche URL</div>
            )}
          </div>
        </div>
      </Modal>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-neutral-700 bg-neutral-950/90 px-4 py-2 text-xs text-neutral-200 shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
