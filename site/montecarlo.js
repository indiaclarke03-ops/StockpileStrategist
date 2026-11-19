/* Stockpile Strategist — forward mode Monte Carlo (spec §7). */
(function (root) {
  const D = root.GAME_DATA || require("./data.js");
  const Sim = root.Sim || require("./sim.js");
  const { MINERALS, FORWARD, COUNTERPARTIES, CONFIG } = D;
  const KEYS = Object.keys(MINERALS);
  const U = Sim.UNITS_PER_DOC;
  const clamp = Sim.clamp;

  const pickWeighted = (r, weights) => {
    const tot = Object.values(weights).reduce((a, b) => a + b, 0);
    let x = r() * tot;
    for (const [k, w] of Object.entries(weights)) { if ((x -= w) <= 0) return k; }
    return Object.keys(weights)[0];
  };
  const uni = (r, [a, b]) => a + r() * (b - a);

  function cliffWeights(signal) {
    const c = FORWARD.cliff;
    const w = { extend: c.extend * (1 - 0.5 * signal), lapse: c.lapse * (1 + 0.5 * signal), deal: c.deal * (1 - 0.5 * signal) };
    const t = w.extend + w.lapse + w.deal;
    return { extend: w.extend / t, lapse: w.lapse / t, deal: w.deal / t };
  }

  /**
   * Run N futures from a frozen end-of-campaign state.
   * opts: { paths, signal ∈ [−1,1], disruptions: [regionId], seed, overrideStart: {k: DoC}, only: k }
   */
  function run(state, opts = {}) {
    const N = opts.paths || 1000, signal = clamp(opts.signal || 0, -1, 1);
    const r = Sim.rng(opts.seed || 2027);
    const adj = (p) => clamp(p * (1 + 0.5 * signal), 0.05, 0.95);
    const pT = adj(FORWARD.pChinaTighten), pD = adj(FORWARD.pDRC);
    const pE = clamp(FORWARD.pChinaEase * (1 - 0.5 * signal), 0.02, 0.95);
    const cw = cliffWeights(signal);
    const disrupted = (opts.disruptions || []).map((id) => FORWARD.disruptionRegions.find((d) => d.id === id)).filter(Boolean);
    const keys = opts.only ? [opts.only] : KEYS;
    const nQ = FORWARD.quarters.length;

    const docPaths = {}; for (const k of keys) docPaths[k] = [];
    const downtime = new Float64Array(N);
    const cliffCount = { extend: 0, lapse: 0, deal: 0 };

    for (let i = 0; i < N; i++) {
      const ms = {};
      for (const k of KEYS) {
        const m = state.minerals[k];
        ms[k] = { doc: opts.overrideStart && opts.overrideStart[k] != null ? opts.overrideStart[k] : m.reserveDoC, cut: m.cutNet, q: m.qSinceCut };
      }
      const offs = state.offtakes.filter((o) => o.status !== "blocked").map((o) => ({ ...o, cp: COUNTERPARTIES.find((c) => c.id === o.id) }));
      const traj = {}; for (const k of keys) traj[k] = [ms[k].doc];
      let dt = 0;

      for (let t = 0; t < nQ; t++) {
        const qi = state.qi + t;
        // Scheduled cliff: 10 Jan 2027 expiry of the suspension
        if (t === 0) {
          const x = r(); const branch = x < cw.extend ? "extend" : x < cw.extend + cw.lapse ? "lapse" : "deal";
          cliffCount[branch]++;
          if (branch === "lapse") {
            ms.dysprosium.cut = clamp(ms.dysprosium.cut + uni(r, [0.05, 0.2]), 0, 1);
            for (const k of ["gallium", "germanium", "antimony"]) { ms[k].cut = clamp(ms[k].cut * 2, 0, 1); ms[k].q = 0; }
          } else if (branch === "deal") {
            for (const k of KEYS) ms[k].cut *= 0.5;
          }
        }
        if (r() < pT) {
          const k = pickWeighted(r, FORWARD.tightenWeights);
          const c = uni(r, [0.2, 0.6]) * MINERALS[k].exposure.china;
          if (c > ms[k].cut) { ms[k].cut = c; ms[k].q = 0; }
        }
        if (r() < pE) { const k = pickWeighted(r, FORWARD.tightenWeights); ms[k].cut *= 0.5; }
        if (r() < pD) {
          if (r() < 0.6) { const c = uni(r, [0.2, 0.7]) * MINERALS.cobalt.exposure.drc; if (c > ms.cobalt.cut) { ms.cobalt.cut = c; ms.cobalt.q = 0; } }
          else ms.cobalt.cut *= 0.7;
        }
        const extraCut = {};
        for (const d of disrupted) extraCut[d.mineral] = (extraCut[d.mineral] || 0) + uni(r, [0.1, 0.3]);

        for (const k of KEYS) {
          const m = ms[k], p = MINERALS[k];
          const rerouted = m.cut * (1 - Math.exp(-p.rerouteRate * m.q));
          let supply = 100 * clamp(1 - m.cut + rerouted - (extraCut[k] || 0), 0, 1);
          for (const o of offs) {
            if (o.mineral !== k || qi < o.startQi) continue;
            let f = 1;
            if (o.cp.ownerChina) f = 1 - clamp(m.cut / p.exposure.china, 0, 1);
            const bp = o.cp.flags.reduce((s, fl) => s + (fl.blockP || 0), 0);
            if (bp && r() < bp) { o.startQi = Infinity; continue; }
            supply += o.cp.docPerQ * U * f;
          }
          if (supply > 100) { m.doc += (supply - 100) / U; supply = 100; }
          let short = 100 - supply;
          const drawn = Math.min(m.doc, short / U);
          m.doc -= drawn; short -= drawn * U;
          dt += Math.max(0, short) * p.criticality * 0.9;
          m.q++;
          if (traj[k]) traj[k].push(m.doc);
        }
      }
      for (const k of keys) docPaths[k].push(traj[k]);
      downtime[i] = dt;
    }

    const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
    const out = { N, signal, cliffWeights: cw, cliffCount, pTighten: pT, pDRC: pD, pEase: pE, minerals: {} };
    for (const k of keys) {
      const P = docPaths[k];
      const fan = [];
      for (let t = 0; t <= nQ; t++) {
        const col = P.map((p) => p[t]);
        fan.push({ p10: pct(col, 0.1), p50: pct(col, 0.5), p90: pct(col, 0.9) });
      }
      const minOf = P.map((p) => Math.min(...p.slice(1)));
      out.minerals[k] = {
        fan,
        pBelow30: minOf.filter((x) => x < 30).length / N,
        pBelow60: minOf.filter((x) => x < 60).length / N,
        minOf,
      };
    }
    const sorted = [...downtime].sort((a, b) => a - b);
    out.expectedDowntime = downtime.reduce((a, b) => a + b, 0) / N;
    out.downtimeP90 = sorted[Math.floor(0.9 * N)];
    return out;
  }

  // Minimum starting reserve so that DoC stays ≥ 60 in ≥ 90% of futures (bisection, common random numbers).
  function recommend(state, k, opts = {}) {
    const ok = (start) => run(state, { ...opts, paths: opts.paths || 300, only: k, overrideStart: { [k]: start } }).minerals[k].pBelow60 <= 0.10;
    let lo = 0, hi = 60;
    while (!ok(hi) && hi < 2000) hi *= 2;
    if (!ok(hi)) return null;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
    return Math.ceil(hi);
  }

  root.MonteCarlo = { run, recommend, cliffWeights };
  if (typeof module !== "undefined") module.exports = root.MonteCarlo;
})(typeof window !== "undefined" ? window : globalThis);
