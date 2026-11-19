/* Stockpile Strategist v4 — missions + supply-network models (brief §3 Act 1, §5). */
(function (root) {
  const D = root.GAME_DATA, EXT = D.EXT || {}, CACHE = root.CACHE || {};

  // Mission colour is only ever shown one-at-a-time (single series), never side by side.
  const MISSIONS = [
    { id: "dysprosium", sym: "Dy", num: 66, mass: "162.50", name: "Dysprosium", color: "#9085e9",
      mustNot: "EV motors and fighter-jet magnets", hook: "In May 2025, Ford's Chicago plant stopped for a week.",
      hookSrc: "https://amp.claimsjournal.com/news/national/2025/06/13/331185.htm", difficulty: 3 },
    { id: "antimony", sym: "Sb", num: 51, mass: "121.76", name: "Antimony", color: "#199e70",
      mustNot: "Artillery shells", hook: "Antimony jumped 40% the day after China's ban.",
      hookSrc: "https://www.kitco.com/news/off-the-wire/2024-12-03/china-bans-export-critical-minerals-us-trade-tensions-escalate", difficulty: 2 },
    { id: "gallium", sym: "Ga", num: 31, mass: "69.723", name: "Gallium", color: "#3987e5",
      mustNot: "Radar and chips", hook: "China ended direct gallium exports to the US in 2024.",
      hookSrc: "https://2024.minexeurasia.com/?p=2060", difficulty: 2 },
    { id: "cobalt", sym: "Co", num: 27, mass: "58.933", name: "Cobalt", color: "#d55181",
      mustNot: "Batteries and jet engines", hook: "The DRC banned cobalt exports in February 2025.",
      hookSrc: "https://www.mining.com/web/column-can-the-congo-tame-the-wild-cobalt-market", difficulty: 1 },
  ];

  // Teaching-network upstream structure (assumed, general knowledge): who refines what.
  const TEACHING_TIER2 = {
    dysprosium: [
      { id: "cn-hree", label: "Chinese heavy-REE separation", country: "CHN", share: { China: 0.95, Japan: 0.6, "Rep. of Korea": 0.7, Mexico: 0.5 } },
      { id: "my-feed", label: "Myanmar ionic-clay feed", country: "MMR", share: {} },
    ],
    antimony: [
      { id: "cn-smelt", label: "Chinese smelters & concentrate", country: "CHN", share: { China: 0.9, "Rep. of Korea": 0.4, Japan: 0.5, Mexico: 0.2 } },
      { id: "ru-tj", label: "Russian / Tajik concentrate", country: "RUS", share: { "Rep. of Korea": 0.3, China: 0.05 } },
    ],
    gallium: [
      { id: "cn-alumina", label: "Chinese alumina-refinery gallium", country: "CHN", share: { China: 0.98, Japan: 0.5, "Rep. of Korea": 0.6, Mexico: 0.4 } },
    ],
    cobalt: [
      { id: "drc-mines", label: "DRC copper-cobalt mines", country: "COD", share: { Japan: 0.6, China: 0.8, "Rep. of Korea": 0.6, Mexico: 0.5 } },
      { id: "id-hpal", label: "Indonesian HPAL (nickel-cobalt)", country: "IDN", share: { China: 0.15, Japan: 0.2 } },
    ],
  };

  const ISO = { China: "CHN", Japan: "JPN", "Rep. of Korea": "KOR", Mexico: "MEX" };
  const LABEL = { China: "China", Japan: "Japan", "Rep. of Korea": "South Korea", Mexico: "Mexico" };

  /** Build the model the acts use: nodes, calm Σ, stress Σ, links, tier-2, provenance. */
  function buildModel(mid) {
    const net = CACHE.network && CACHE.network[mid];
    if (net && !net.synthetic && Array.isArray(net.tier1) && net.tier1.length >= 2 && (net.periods || []).length >= 6) return fromNetwork(mid, net);
    if (net && Array.isArray(net.tier1) && net.tier1.some((n) => n.meanVolume > 0)) return structured(mid, net);
    return teaching(mid, net);
  }

  /** Synthetic-but-structured network file: real node list, shares, owners and links; no time
   *  series, so σ is illustrative (CV 0.30 China-linked, 0.20 others; assumed). */
  function structured(mid, net) {
    const tot = net.tier1.reduce((a, n) => a + (n.meanVolume || 0), 0) || 1;
    const nodes = net.tier1.map((n) => ({
      id: n.id, label: n.label, country: n.country, mean: (100 * (n.meanVolume || 0)) / tot, share: (n.meanVolume || 0) / tot,
      chinaLinked: !!n.chinaLinked, companies: n.companies || [], owners: n.owners || [], flags: n.flags || [],
      source: n.shareEvidence || n.source, evidence: /assumed/i.test(n.shareEvidence || "") ? "assumed share" : "reported share", raw: n.raw,
    }));
    const sdv = nodes.map((n) => n.mean * (n.chinaLinked ? 0.3 : 0.2));
    const calm = RST.sigmaFrom(sdv, () => 0);
    const idx = (id) => nodes.findIndex((n) => n.id === id);
    const links = (net.links || []).map((l) => ({ ...l, i: idx(l.a), j: idx(l.b), rho: l.rhoStress != null ? l.rhoStress : 0.8 })).filter((l) => l.i >= 0 && l.j >= 0);
    const chinaIdx = nodes.map((n, i) => (n.chinaLinked ? i : -1)).filter((i) => i >= 0);
    return {
      mission: mid, synthetic: true, structured: true, granularity: "illustrative", measure: net.measure, units: net.units,
      nodes, calm, stressS: RST.stress(calm, links, chinaIdx), links, chinaIdx, lambda: null, points: null,
      tier2: mergeTier2(net.tier2 || []), method: net.method || [], comparison: net.comparison, fetched: net.fetched,
      caveats: ["Illustrative network — not measured. Node list, shares and links come from Sayari, Comtrade and cited reports; variances are assumed because no dated shipment series could be built.", net.syntheticReason, ...(net.caveats || [])].filter(Boolean),
    };
  }

  /** Merge upstream nodes in the same country into one (e.g. two Chinese separation routes),
   *  so "hidden single point of failure" names the place, not an accounting split. */
  function mergeTier2(tier2) {
    const out = [];
    for (let t of tier2) {
      const inChina = t.country === "CHN" || /(separated|processed|refined) in China/i.test(t.label || "");
      if (inChina) t = { ...t, country: "CHN" };
      const hit = inChina ? out.find((o) => o.country === "CHN") : null;
      if (!hit) { out.push({ ...t, share: { ...(t.share || {}) }, feeds: [...(t.feeds || Object.keys(t.share || {}))], parts: [t.label] }); continue; }
      for (const [k, v] of Object.entries(t.share || {})) hit.share[k] = Math.min(1, (hit.share[k] || 0) + v);
      hit.feeds = [...new Set([...hit.feeds, ...Object.keys(t.share || {})])];
      hit.parts.push(t.label);
      hit.label = "Chinese heavy-REE separation (all routes)";
      hit.id = "cn-separation";
    }
    return out;
  }

  function fromNetwork(mid, net) {
    // The loss threshold is "for a quarter", so estimate Σ on quarterly totals: monthly bills of
    // lading are lumpy (a ship arrives or it doesn't), which would overstate quarter-scale risk.
    let periods = net.periods;
    let series = net.tier1.map((n) => periods.map((p) => Number((n.volumes || {})[p]) || 0));
    let granularity = net.granularity || "monthly";
    if (granularity === "monthly") {
      const qOf = (p) => `${p.slice(0, 4)}Q${Math.floor((+p.slice(5, 7) - 1) / 3) + 1}`;
      const qs = [...new Set(periods.map(qOf))].filter((q) => periods.filter((p) => qOf(p) === q).length === 3); // full quarters only
      series = series.map((y) => qs.map((q) => periods.reduce((acc, p, t) => acc + (qOf(p) === q ? y[t] : 0), 0)));
      const tot = qs.map((_, t) => series.reduce((acc, y) => acc + y[t], 0));
      const meanTot = tot.reduce((a, b) => a + b, 0) / (tot.length || 1) || 1;
      series = series.map((y) => y.map((v) => (v * 100) / meanTot));
      periods = qs; granularity = "quarterly (aggregated from monthly)";
    }
    const est = RST.estimateSigma(series);
    const tot = est.means.reduce((a, b) => a + b, 0) || 1;
    const nodes = net.tier1.map((n, i) => ({
      id: n.id, label: n.label, country: n.country, mean: est.means[i], share: est.means[i] / tot,
      chinaLinked: !!n.chinaLinked || n.country === "CHN", companies: n.companies || [], owners: n.owners || [], flags: n.flags || [],
      source: n.source, evidence: n.evidence || "reported", series: series[i],
    }));
    const idx = (id) => nodes.findIndex((n) => n.id === id);
    const links = (net.links || []).map((l) => ({ ...l, i: idx(l.a), j: idx(l.b), rho: l.rhoStress != null ? l.rhoStress : 0.8 })).filter((l) => l.i >= 0 && l.j >= 0);
    const chinaIdx = nodes.map((n, i) => (n.chinaLinked ? i : -1)).filter((i) => i >= 0);
    return {
      mission: mid, synthetic: false, granularity, sourceGranularity: net.granularity, measure: net.measure, periods, units: net.units,
      nodes, calm: est.sigma, stressS: RST.stress(est.sigma, links, chinaIdx), links, chinaIdx, lambda: est.lambda, points: est.points,
      tier2: (net.tier2 || []).map((t) => ({ ...t })), method: net.method || [], caveats: net.caveats || [], comparison: net.comparison, fetched: net.fetched,
    };
  }

  function teaching(mid, net) {
    const tr = EXT.trade && EXT.trade[mid];
    const year = tr && tr.sharesByYear ? Object.keys(tr.sharesByYear).sort()[0] : null; // 2023 baseline: what mid-2023 looked like
    const shares = year ? tr.sharesByYear[year] : [{ country: "China", share: 0.7 }, { country: "Japan", share: 0.15 }, { country: "Rep. of Korea", share: 0.1 }, { country: "Mexico", share: 0.05 }];
    const keep = shares.filter((s) => s.share >= 0.01);
    const tot = keep.reduce((a, s) => a + s.share, 0) || 1;
    const nodes = keep.map((s) => ({
      id: (ISO[s.country] || s.country).toLowerCase(), label: LABEL[s.country] || s.country, country: ISO[s.country] || s.country,
      mean: (100 * s.share) / tot, share: s.share / tot, chinaLinked: s.country === "China", tradeName: s.country,
      companies: [], owners: [], flags: [], evidence: "reported share, illustrative variance",
      source: tr ? `Tradeverifyd tia_trade_flow (Comtrade ${year}), HS ${(tr.hs || []).join("/")}` : "built-in default",
    }));
    // Illustrative calm Σ: σ ∝ flow (CV 0.30 China, 0.20 others), independent (assumed).
    const sdv = nodes.map((n) => n.mean * (n.chinaLinked ? 0.3 : 0.2));
    const calm = RST.sigmaFrom(sdv, () => 0);
    const tier2 = (TEACHING_TIER2[mid] || []).map((t) => {
      const share = {};
      for (const n of nodes) if (t.share[n.tradeName] != null) share[n.id] = t.share[n.tradeName];
      return { id: t.id, label: t.label, country: t.country, feeds: Object.keys(share), share, evidence: "assumed" };
    });
    // Structural links (assumed): suppliers that draw >40% of their input from the same upstream node.
    const links = [];
    for (const t of tier2) {
      const fed = Object.entries(t.share).filter(([, v]) => v >= 0.4).map(([id]) => id);
      for (let a = 0; a < fed.length; a++) for (let b = a + 1; b < fed.length; b++) {
        const i = nodes.findIndex((n) => n.id === fed[a]), j = nodes.findIndex((n) => n.id === fed[b]);
        if (!links.some((l) => (l.i === i && l.j === j) || (l.i === j && l.j === i))) links.push({ a: fed[a], b: fed[b], i, j, rho: 0.8, reason: `Both rely on ${t.label} (assumed)`, evidence: [] });
      }
    }
    const chinaIdx = nodes.map((n, i) => (n.chinaLinked ? i : -1)).filter((i) => i >= 0);
    return {
      mission: mid, synthetic: true, granularity: "illustrative", measure: "share of US import value", units: "normalised (100 = US imports per period)",
      nodes, calm, stressS: RST.stress(calm, links, chinaIdx), links, chinaIdx, lambda: null, points: null, tier2,
      method: [tr ? tr.sourceLabel : "built-in"], caveats: ["Illustrative network — not measured. Shares are real (Comtrade, covered corridors only); variances, correlations and upstream shares are assumed.", ...(net && net.caveats ? net.caveats : [])],
      fetched: EXT.tradeFetched,
    };
  }

  /** Stockpile of D days → per-period buffer against a quarter-long shortfall (100 = demand/period). */
  const bufferFromDays = (days) => (days * 100) / 91.25;
  /** Offtake of docPerQ days/quarter → per-period volume in model units. */
  const volumeFromDocPerQ = (docPerQ) => (docPerQ / 91.25) * 100;

  root.Missions = { MISSIONS, buildModel, bufferFromDays, volumeFromDocPerQ };
})(window);
