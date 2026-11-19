/* Stockpile Strategist — merge cached tool data (window.CACHE, built by scripts/build_data.py)
 * into GAME_DATA. Runs before sim.js. Every override records its source so the UI can cite it.
 * Without data_cache.js the game falls back to the built-in assumed values.
 */
(function (root) {
  const D = root.GAME_DATA;
  const C = root.CACHE || {};
  const EXT = (D.EXT = {});

  // ---- Trade: China exposure per mineral (Tradeverifyd Comtrade, Sayari facets) ----
  if (C.trade && C.trade.minerals) {
    EXT.trade = {};
    EXT.tradeFetched = C.trade.fetched;
    for (const [k, t] of Object.entries(C.trade.minerals)) {
      if (!D.MINERALS[k]) continue;
      const ct = t.comtrade || {};
      const years = Object.keys(ct.years || {}).sort();
      // Exposure = China's share in the EARLIEST cached year (2023): the pre-control baseline.
      // Later years already reflect controls biting, so they'd understate dependence.
      const base = years.length ? ct.years[years[0]] : null;
      if (base && typeof base.chinaShare === "number" && base.total > 0) {
        D.MINERALS[k].exposure.china = base.chinaShare;
        D.MINERALS[k].exposureSource = `Tradeverifyd Comtrade ${years[0]}, China share of US imports via covered corridors (CHN/JPN/KOR/MEX)`;
      }
      const s = t.sayari || {};
      EXT.trade[k] = {
        year: ct.latestYear,
        chinaByYear: years.map((y) => ({ year: y, share: ct.years[y].chinaShare, china: ct.years[y].china, total: ct.years[y].total })),
        shares: (ct.topPartners || []).map((p) => ({ country: p.country, share: p.share, value: p.value })),
        // Per-year partner shares, so historical mode only shows years already complete (no foresight).
        sharesByYear: (() => {
          const out = {};
          for (const byYear of Object.values(ct.importsByHsYearPartner || {})) {
            for (const [y, partners] of Object.entries(byYear)) {
              out[y] = out[y] || {};
              for (const [c, v] of Object.entries(partners)) out[y][c] = (out[y][c] || 0) + v;
            }
          }
          const res = {};
          for (const [y, partners] of Object.entries(out)) {
            const tot = Object.values(partners).reduce((a, b) => a + b, 0) || 1;
            res[y] = Object.entries(partners).map(([country, value]) => ({ country, value, share: value / tot })).sort((a, b) => b.value - a.value);
          }
          return res;
        })(),
        hhi: s.hhi,
        riskFlags: s.riskFlags || [],
        supplierBuckets: s.countryBuckets || [],
        totalSuppliers: s.totalSuppliers,
        hs: t.hs,
        sourceLabel: `Shares: Tradeverifyd tia_trade_flow (UN Comtrade, HS ${(t.hs || []).join("/")}), US imports from covered partners only · Supplier HHI & flags: Sayari search_trade_facets (company counts, 2025+)`,
        limitations: ct.limitations,
        notes: t.notes,
      };
    }
  }

  // ---- Live: copper benchmark + disruptions (Tradeverifyd) ----
  if (C.live) {
    EXT.liveFetched = C.live.fetched;
    EXT.copper = C.live.copper || null;
    EXT.disruptions = C.live.disruptions || [];
    EXT.disruptionCalls = C.live.disruptionCalls || [];
  }

  // ---- Intel: Tavily briefings per quarter ----
  if (C.intel && C.intel.quarters) {
    EXT.intel = C.intel.quarters;
    EXT.intelFetched = C.intel.fetched;
    // Defensive no-foresight filter: drop anything dated on/after the quarter start.
    for (const [q, b] of Object.entries(EXT.intel)) {
      const start = `${q.slice(0, 4)}-${String((+q.slice(5) - 1) * 3 + 1).padStart(2, "0")}-01`;
      b.items = (b.items || []).filter((i) => i.date && i.date < start);
    }
  }

  // ---- Forward signal: Tavily lexicon score ----
  if (C.signals && typeof C.signals.signal === "number") {
    EXT.signal = { value: Math.max(-1, Math.min(1, C.signals.signal)), items: C.signals.items || [], fetched: C.signals.fetched, lexicon: C.signals.lexicon };
  }

  // ---- Counterparties: Sayari + Tradeverifyd vetting ----
  // Game effects per flag class (assumed). Classes are derived from what Sayari actually returned,
  // kept proportionate: a trade link to a listed party is adjacency, not a listing; a sub-tier
  // forced-labour flag is a detention risk, not Chinese export-control exposure.
  const RISK = {
    labour: { blockP: 0.08, pcPenalty: 6, why: "forced-labour flags: risk of a UFLPA detention blocking deliveries" },
    "labour-subtier": { blockP: 0.04, pcPenalty: 3, why: "sub-tier forced-labour flags: some UFLPA detention risk" },
    sanctions: { blockP: 0.08, pcPenalty: 6, why: "sanctions exposure" },
    adjacency: { blockP: 0.02, pcPenalty: 2, why: "trade link to a sanctioned party: compliance review risk" },
    "cn-list": { blockP: 0.0, pcPenalty: 0, usList: true, why: "on a Chinese control/sanctions list: upstream Chinese inputs may be cut off" },
    "owner-minority": { blockP: 0, pcPenalty: 2, why: "China-linked minority holder (stake size not returned): disclosure, not control" },
    owner: { blockP: 0, pcPenalty: 0, why: "Chinese owner: deliveries are subject to Chinese controls" },
    soe: { blockP: 0.01, pcPenalty: 1, why: "Chinese SOE-adjacent trade" },
    env: { blockP: 0.03, pcPenalty: 3, why: "environmental flags" },
    other: { blockP: 0.02, pcPenalty: 2, why: "other risk flags" },
  };
  const classify = (f) => {
    const l = (f.label || "").toLowerCase();
    if (/china sanctions research|sanctioned_other/.test(l)) return "cn-list";
    if (/trade link/.test(l)) return "adjacency";
    if (/forced.labou?r|child.labou?r|uflpa|xinjiang/.test(l)) return /sub-tier|subsidiary/.test(l) && f.kind !== "labour" ? "labour-subtier" : "labour";
    if (f.kind === "owner") return /minority|stake size|size not returned|partial/.test(l) ? "owner-minority" : "owner";
    if (/soe/.test(l)) return "soe";
    if (/law-enforcement|regulatory/.test(l)) return "other";
    return RISK[f.kind] ? f.kind : "other";
  };
  if (C.counterparties && Array.isArray(C.counterparties.counterparties) && C.counterparties.counterparties.length) {
    const list = C.counterparties.counterparties.filter((c) => D.MINERALS[c.mineral] && c.game);
    if (list.length) {
      EXT.vetted = true;
      EXT.vettedFetched = C.counterparties.fetched;
      D.COUNTERPARTIES = list.map((c) => {
        const sy = c.sayari || {}, tv = c.tradeverifyd || {};
        const flags = (c.flags || []).map((f) => { const kind = classify(f); return { label: f.label.replace(/^Sayari:\s*/, ""), kind, source: f.source, ...RISK[kind] }; });
        const controlled = flags.some((f) => f.kind === "owner");
        const level = (String(tv.scale || "").match(/level '([^']+)'/) || [])[1];
        return {
          id: c.id, name: c.name, country: String(c.country || "").replace(/\s*\(.*\)$/, ""), site: c.country, mineral: c.mineral,
          upfront: c.game.upfront, docPerQ: c.game.docPerQ, lag: c.game.lag,
          owner: (sy.ultimateOwners || []).length ? sy.ultimateOwners.slice(0, 2).map((o) => String(o.name).replace(/\s*\(.*$/, "")).join("; ") : "No owners returned",
          ownerChina: controlled,
          upstreamChina: 0,
          usProducer: flags.some((f) => f.usList), // exposed to China's June 2026 listing of US firms
          flags, score: typeof tv.score === "number" ? tv.score : null, scoreNorm: null,
          scoreScale: `Tradeverifyd Score v1${level ? `, level ${level}` : ""}; bounds not returned`,
          vetting: {
            // Status notes are the vetting agent's assumptions; strip any hint that gives the puzzle away.
            statusNote: String(c.statusNote || "").replace(/^Assumed from general knowledge:\s*/i, "Status (assumed): ").split(/;\s*|\s+-\s+/).filter((x) => !/\btrap\b/i.test(x)).join("; ").replace(/[,;\s-]+$/, "").replace(/(?<!\.)$/, "."),
            sayariId: sy.entityId, matchedName: sy.matchedName,
            owners: (sy.ultimateOwners || []).map((o) => ({ name: String(o.name).replace(/\s*\(.*$/, ""), country: o.country })),
            watchlist: (sy.watchlistHits || []).map((h) => (typeof h === "string" ? h : h.label || h.name || h.list || JSON.stringify(h))),
            riskFactors: (sy.riskFactors || []).map((r) => (typeof r === "string" ? r : r.label || r.name || r.id || JSON.stringify(r)).replace(/^Sayari risk factor:\s*/i, "")),
            annotations: (tv.annotations || []).map((a) => (typeof a === "string" ? a : a.label || a.title || a.category || JSON.stringify(a))),
          },
        };
      });
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
