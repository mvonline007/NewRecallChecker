import React, { useEffect, useMemo, useRef, useState } from "react";

const DOMAIN = "https://data.economie.gouv.fr";
const API_BASE = `${DOMAIN}/api/explore/v2.1/catalog/datasets`;

const DATASETS = {
  trie: {
    id: "rappelconso-v2-gtin-trie",
    label: "V2 (trié par GTIN)",
    hint: "1 GTIN par ligne (indexé) — meilleur pour une recherche exacte",
  },
  espaces: {
    id: "rappelconso-v2-gtin-espaces",
    label: "V2 (GTIN espacés)",
    hint: "Plusieurs GTIN possibles dans un même champ (séparés par espace)",
  },
};

function normalizeGtinInput(raw) {
  // Keep digits only, but allow multi-entries separated by comma/space/newline.
  const parts = String(raw)
    .split(/[^0-9]+/g)
    .map((p) => p.trim())
    .filter(Boolean);
  // Deduplicate, keep order.
  const seen = new Set();
  const uniq = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      uniq.push(p);
    }
  }
  return uniq;
}

function buildWhereExactGtins(fieldName, gtins) {
  if (!gtins.length) return "";
  if (gtins.length === 1) return `${fieldName} = \"${gtins[0]}\"`;
  // ODSQL supports boolean ops; avoid IN for maximal compatibility.
  return `(${gtins.map((g) => `${fieldName} = \"${g}\"`).join(" OR ")})`;
}

function buildWhereContainsGtin(fieldName, gtin) {
  // Fallback for datasets where multiple GTIN are stored in one string.
  // ODSQL LIKE uses % wildcard on Opendatasoft.
  return `${fieldName} like \"%${gtin}%\"`;
}

function getFirst(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function toArray(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    // Try split on common separators
    const parts = v
      .split(/\s*[,;\n\r]+\s*/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [v];
  }
  return [v];
}

function prettyDate(v) {
  if (!v) return "";
  // v can be ISO string
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildRecordsUrl(datasetId, params) {
  const url = new URL(`${API_BASE}/${datasetId}/records`);
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    sp.set(k, String(v));
  });
  url.search = sp.toString();
  return url.toString();
}

export default function App() {
  const [mode, setMode] = useState("auto"); // auto | trie | espaces
  const [gtinRaw, setGtinRaw] = useState("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hits, setHits] = useState(0);
  const [datasetUsed, setDatasetUsed] = useState(null);
  const [records, setRecords] = useState([]);
  const [lastUrl, setLastUrl] = useState("");
  const abortRef = useRef(null);

  const gtins = useMemo(() => normalizeGtinInput(gtinRaw), [gtinRaw]);

  async function fetchRecords(datasetId, whereClause) {
    const url = buildRecordsUrl(datasetId, {
      limit,
      where: whereClause,
      order_by: "date_publication desc",
    });

    setLastUrl(url);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const res = await fetch(url, {
      signal: abortRef.current.signal,
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? ` — ${txt.slice(0, 200)}` : ""}`);
    }

    const data = await res.json();
    // Opendatasoft v2.1: { total_count, results: [...] }
    const total = data?.total_count ?? data?.nhits ?? 0;
    const results = data?.results ?? data?.records ?? [];
    return { total, results };
  }

  async function search() {
    setError("");
    setRecords([]);
    setHits(0);
    setDatasetUsed(null);

    if (!gtins.length) {
      setError("GTIN requis (ex: 3250391234567)");
      return;
    }

    setLoading(true);

    try {
      // Primary: trie dataset (exact match)
      const tryTrie = async () => {
        const where = buildWhereExactGtins("gtin", gtins);
        const out = await fetchRecords(DATASETS.trie.id, where);
        setDatasetUsed("trie");
        return out;
      };

      // Secondary: espaces dataset (contains match, because field may contain multiple GTIN)
      const tryEspaces = async () => {
        if (gtins.length === 1) {
          const where = buildWhereContainsGtin("gtin", gtins[0]);
          const out = await fetchRecords(DATASETS.espaces.id, where);
          setDatasetUsed("espaces");
          return out;
        }
        // multi-gtin fallback: OR of LIKE
        const where = `(${gtins.map((g) => buildWhereContainsGtin("gtin", g)).join(" OR ")})`;
        const out = await fetchRecords(DATASETS.espaces.id, where);
        setDatasetUsed("espaces");
        return out;
      };

      let out;
      if (mode === "trie") out = await tryTrie();
      else if (mode === "espaces") out = await tryEspaces();
      else {
        out = await tryTrie();
        if (!out.total) {
          out = await tryEspaces();
        }
      }

      setHits(out.total);
      setRecords(out.results);
    } catch (e) {
      if (String(e?.name) === "AbortError") return;
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Auto-search on first mount if URL has ?gtin=
    try {
      const u = new URL(window.location.href);
      const g = u.searchParams.get("gtin");
      if (g) setGtinRaw(g);
    } catch {}
  }, []);

  function renderCard(r, idx) {
    const title =
      getFirst(r, [
        "titre_de_la_fiche",
        "titre",
        "title",
        "nom_du_produit",
        "nom_produit",
        "produit",
      ]) || `Résultat #${idx + 1}`;

    const brand = getFirst(r, ["marque", "brand"]) || "";
    const pubDate = getFirst(r, ["date_publication", "date_de_publication", "date"]) || "";

    const ficheUrl = getFirst(r, [
      "lien_vers_la_fiche_rappelconso",
      "lien_vers_la_fiche",
      "url_fiche",
      "lien_vers_la_fiche_rappelconso_2",
    ]);

    const images = toArray(getFirst(r, ["liens_vers_les_images", "liens_images", "images", "enclosure_url"]));
    const refs = toArray(getFirst(r, ["modeles_ou_references", "modeles_ou_reference", "references", "modele_reference"]));

    const category = getFirst(r, ["categorie_de_produit", "categorie", "category"]);
    const subcat = getFirst(r, ["sous_categorie_produit", "sous_categorie", "subcategory"]);
    const risk = getFirst(r, ["risques_encourus", "risque", "risk"]);
    const motif = getFirst(r, ["motif_du_rappel", "motif", "reason"]);
    const consigne = getFirst(r, ["conduites_a_tenir_par_le_consommateur", "conduite_a_tenir", "action"]);

    return (
      <div key={idx} className="rounded-2xl border border-neutral-200 p-4 shadow-sm bg-white">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold leading-tight break-words">{title}</div>
              <div className="text-sm text-neutral-600">
                {brand ? <span className="mr-2">{brand}</span> : null}
                {pubDate ? <span>• {prettyDate(pubDate)}</span> : null}
              </div>
            </div>
            {ficheUrl ? (
              <a
                href={ficheUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-xl border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-50"
              >
                Ouvrir fiche
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {category ? (
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <div className="text-xs text-neutral-500">Catégorie</div>
                <div className="break-words">{category}</div>
              </div>
            ) : null}
            {subcat ? (
              <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <div className="text-xs text-neutral-500">Sous-catégorie</div>
                <div className="break-words">{subcat}</div>
              </div>
            ) : null}
            {risk ? (
              <div className="rounded-xl bg-neutral-50 px-3 py-2 md:col-span-2">
                <div className="text-xs text-neutral-500">Risque(s)</div>
                <div className="break-words">{String(risk)}</div>
              </div>
            ) : null}
            {motif ? (
              <div className="rounded-xl bg-neutral-50 px-3 py-2 md:col-span-2">
                <div className="text-xs text-neutral-500">Motif</div>
                <div className="break-words whitespace-pre-wrap">{String(motif)}</div>
              </div>
            ) : null}
            {consigne ? (
              <div className="rounded-xl bg-neutral-50 px-3 py-2 md:col-span-2">
                <div className="text-xs text-neutral-500">Conduite à tenir</div>
                <div className="break-words whitespace-pre-wrap">{String(consigne)}</div>
              </div>
            ) : null}
          </div>

          {refs.length ? (
            <div className="rounded-xl bg-neutral-50 px-3 py-2 text-sm">
              <div className="text-xs text-neutral-500">Modèles / Références</div>
              <ul className="list-disc pl-5">
                {refs.slice(0, 10).map((x, i) => (
                  <li key={i} className="break-words">{String(x)}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {images.length ? (
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
              <div className="text-xs text-neutral-500 mb-2">Images</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {images.slice(0, 8).map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="block">
                    <img
                      src={u}
                      alt={`img-${i}`}
                      className="h-24 w-full object-cover rounded-xl border border-neutral-200"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <details className="rounded-xl border border-neutral-200 bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-sm">JSON (brut)</summary>
            <pre className="overflow-auto p-3 text-xs leading-relaxed">{JSON.stringify(r, null, 2)}</pre>
          </details>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="text-2xl font-semibold">RappelConso — Recherche GTIN</div>
              <div className="text-sm text-neutral-600">
                Source: {DATASETS.trie.id} / {DATASETS.espaces.id} (Explore API v2.1)
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <label className="text-xs text-neutral-600">GTIN / EAN (un ou plusieurs)</label>
                <input
                  value={gtinRaw}
                  onChange={(e) => setGtinRaw(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") search();
                  }}
                  placeholder="ex: 3250391234567 (ou plusieurs séparés par espace/virgule)"
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-neutral-200"
                />
                <div className="mt-1 text-xs text-neutral-500">Normalisé: {gtins.length ? gtins.join(", ") : "—"}</div>
              </div>

              <div className="md:col-span-3">
                <label className="text-xs text-neutral-600">Dataset</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                >
                  <option value="auto">Auto (trie → fallback espaces)</option>
                  <option value="trie">{DATASETS.trie.label}</option>
                  <option value="espaces">{DATASETS.espaces.label}</option>
                </select>
                <div className="mt-1 text-xs text-neutral-500">
                  {mode === "trie" ? DATASETS.trie.hint : mode === "espaces" ? DATASETS.espaces.hint : "Recherche exacte puis fallback"}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-neutral-600">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(100, Number(e.target.value || 50))))}
                  className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
                />
                <div className="mt-1 text-xs text-neutral-500">1–100</div>
              </div>

              <div className="md:col-span-1 flex items-end">
                <button
                  onClick={search}
                  disabled={loading}
                  className="w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading ? "…" : "Search"}
                </button>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="text-neutral-700">
                {datasetUsed ? (
                  <>
                    Dataset: <span className="font-medium">{DATASETS[datasetUsed].id}</span> • Résultats: <span className="font-medium">{hits}</span>
                  </>
                ) : (
                  <>Prêt</>
                )}
              </div>
              {lastUrl ? (
                <a href={lastUrl} target="_blank" rel="noreferrer" className="text-neutral-600 underline">
                  Ouvrir requête JSON
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4">
          {records.map((r, i) => renderCard(r, i))}
          {!loading && datasetUsed && !records.length && !error ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700">
              Aucun résultat.
              <div className="mt-2 text-neutral-500">
                Tips: vérifier le GTIN (13 chiffres), ou passer sur “V2 (GTIN espacés)”.
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-8 text-xs text-neutral-500">
          Endpoint: {API_BASE}/&lt;dataset&gt;/records
        </div>
      </div>
    </div>
  );
}
