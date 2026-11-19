/* Stockpile Strategist — simulation engine (spec §3–§4). Pure functions on a state object. */
(function (root) {
  const D = root.GAME_DATA || (typeof require !== "undefined" ? require("./data.js") : null);
  const { QUARTERS, MINERALS, EVENTS, COUNTERPARTIES, CONFIG } = D;
  const KEYS = Object.keys(MINERALS);
  const UNITS_PER_DOC = 100 / 91;

  // Park–Miller minimal standard RNG — seeded so runs are reproducible.
  function rng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function newState(opts = {}) {
    const minerals = {};
    for (const k of KEYS) {
      minerals[k] = {
        reserveDoC: 0, avgCost: 0, priceIdx: 100, importAvail: 1, cutNet: 0, qSinceCut: 0,
        panic: 0, buyQ: 0, releaseQ: 0,
        hist: { price: [100], doc: [0], avail: [1], priceSrc: ["anchor"] },
      };
    }
    return {
      qi: 0, quarter: QUARTERS[0], done: false,
      budget: CONFIG.budget, spent: 0, politicalCapital: CONFIG.politicalCapital,
      minerals, offtakes: [], autoRelease: opts.autoRelease !== false,
      downtimeDays: 0, downtimeHist: [], minDocByQ: [], log: [], seed: opts.seed || CONFIG.seed,
      rngState: opts.seed || CONFIG.seed, flagUSProducers: false,
    };
  }

  // RNG that persists in state (so cloning a state clones its random future).
  function draw(state) {
    state.rngState = (state.rngState * 16807) % 2147483647;
    return state.rngState / 2147483647;
  }

  const maxBuy = (state, k) => Math.floor(CONFIG.maxBuyPerQ * clamp(state.minerals[k].importAvail, 0, 1));

  function quoteBuy(state, k, doc) {
    if (doc <= 0) return 0;
    const m = state.minerals[k], p = MINERALS[k];
    const slippage = 1 + (p.eta * doc) / p.marketDepth / 2; // average of pre- and post-impact price
    return doc * p.baseCost * (m.priceIdx / 100) * slippage;
  }

  const reserveValue = (state, k) => state.minerals[k].reserveDoC * MINERALS[k].baseCost * state.minerals[k].priceIdx / 100;

  // orders: { buy: {k: doc}, release: {k: doc}, offtakes: [counterpartyId] }
  function applyOrders(state, orders = {}) {
    const errs = [];
    const buy = orders.buy || {}, release = orders.release || {};
    let total = 0;
    for (const k of KEYS) {
      const d = buy[k] || 0;
      if (d > maxBuy(state, k)) errs.push(`${MINERALS[k].name}: max ${maxBuy(state, k)} DoC this quarter`);
      total += quoteBuy(state, k, d);
    }
    for (const id of orders.offtakes || []) total += COUNTERPARTIES.find((c) => c.id === id).upfront;
    if (total > state.budget + 1e-9) errs.push("Over budget");
    if (errs.length) return { ok: false, errs };

    for (const k of KEYS) {
      const m = state.minerals[k], d = buy[k] || 0, r = Math.min(release[k] || 0, m.reserveDoC);
      if (d > 0) {
        const c = quoteBuy(state, k, d);
        m.avgCost = (m.avgCost * m.reserveDoC + c) / (m.reserveDoC + d);
        m.reserveDoC += d; state.budget -= c; state.spent += c;
      }
      m.buyQ = d; m.releaseQ = r; m.reserveDoC -= r;
    }
    for (const id of orders.offtakes || []) {
      const cp = COUNTERPARTIES.find((c) => c.id === id);
      const lag = cp.lag[0] + Math.floor(draw(state) * (cp.lag[1] - cp.lag[0] + 1));
      state.offtakes.push({ id, mineral: cp.mineral, startQi: state.qi + lag, signedQi: state.qi, status: "pending", delivered: 0, slips: 0 });
      state.budget -= cp.upfront; state.spent += cp.upfront;
      const pen = cp.flags.reduce((s, f) => s + (f.pcPenalty || 0), 0) + (cp.ownerChina ? 5 : 0);
      if (pen) {
        state.politicalCapital -= pen;
        state.log.push({ q: state.quarter, kind: "deal", text: `Signed ${cp.name} despite risk flags: −${pen} political capital.` });
      } else state.log.push({ q: state.quarter, kind: "deal", text: `Signed offtake with ${cp.name} (${cp.country}).` });
    }
    return { ok: true };
  }

  function resolveQuarter(state) {
    const q = state.quarter;
    const fired = EVENTS.filter((e) => e.quarter === q);
    const report = { quarter: q, events: fired, minerals: {}, offtakeNotes: [], downtimeBefore: state.downtimeDays, pcBefore: state.politicalCapital };

    // 1. Event effects on cut levels, prices, panic
    const priceMult = {}, touched = {};
    for (const k of KEYS) priceMult[k] = 1;
    for (const e of fired) {
      for (const [k, eff] of Object.entries(e.effects)) {
        const m = state.minerals[k], p = MINERALS[k];
        if (eff.cut != null) {
          const c = eff.cut * (p.exposure[eff.actor] || 0) * (eff.targetFactor ?? 1);
          if (c > m.cutNet) { m.cutNet = c; m.qSinceCut = 0; }
        }
        if (eff.setCut != null) { m.cutNet = eff.setCut * (p.exposure[eff.actor] || 0); m.qSinceCut = 0; }
        if (eff.relief != null) m.cutNet *= 1 - eff.relief;
        if (eff.priceMult != null) { priceMult[k] *= eff.priceMult; touched[k] = eff.priceSrc || "assumed"; }
        if (eff.panic) { m.panic += eff.panic; touched[k] = touched[k] || "assumed"; }
        if (eff.flagsUSProducers) state.flagUSProducers = true;
      }
    }

    // 2. Offtake deliveries (units), slips and blocks
    const offUnits = {};
    for (const k of KEYS) offUnits[k] = 0;
    for (const o of state.offtakes) {
      if (o.status === "blocked") continue;
      const cp = COUNTERPARTIES.find((c) => c.id === o.id);
      if (state.qi < o.startQi) continue;
      if (o.status === "pending") {
        if (draw(state) < CONFIG.slipP) { o.startQi++; o.slips++; report.offtakeNotes.push(`${cp.name} slipped another quarter.`); continue; }
        o.status = "delivering"; report.offtakeNotes.push(`${cp.name} began deliveries.`);
      }
      let blockP = cp.flags.reduce((s, f) => s + (f.blockP || 0), 0);
      if (cp.usProducer && state.flagUSProducers) blockP += 0.08;
      if (blockP && draw(state) < blockP) {
        o.status = "blocked"; state.politicalCapital -= 5;
        report.offtakeNotes.push(`${cp.name} deliveries BLOCKED (${cp.flags.map((f) => f.label).join(", ") || "upstream listing"}): −5 political capital.`);
        continue;
      }
      const m = state.minerals[o.mineral];
      let factor = 1;
      if (cp.ownerChina) factor = 1 - clamp(m.cutNet / (MINERALS[o.mineral].exposure.china || 1), 0, 1);
      if (cp.upstreamChina) factor *= 1 - cp.upstreamChina * clamp(m.cutNet / (MINERALS[o.mineral].exposure.china || 1), 0, 1);
      const u = cp.docPerQ * UNITS_PER_DOC * factor;
      offUnits[o.mineral] += u; o.delivered += u / UNITS_PER_DOC;
      if (factor < 0.99) report.offtakeNotes.push(`${cp.name} delivered only ${Math.round(factor * 100)}% — Chinese controls reach it.`);
    }

    // 3. Supply, shortfall, reserve draw, damage, price
    let spentStorage = 0;
    for (const k of KEYS) {
      const m = state.minerals[k], p = MINERALS[k];
      const rerouted = m.cutNet * (1 - Math.exp(-p.rerouteRate * m.qSinceCut));
      m.importAvail = clamp(1 - m.cutNet + rerouted, 0, 1);
      let supply = 100 * m.importAvail + offUnits[k] + m.releaseQ * UNITS_PER_DOC;
      if (supply > 100 && offUnits[k] > 0) {
        const surplus = Math.min(supply - 100, offUnits[k]);
        m.reserveDoC += surplus / UNITS_PER_DOC; supply -= surplus;
      }
      let shortfall = Math.max(0, 100 - supply);
      let drawn = 0;
      if (shortfall > 0 && state.autoRelease && m.reserveDoC > 0) {
        drawn = Math.min(m.reserveDoC, shortfall / UNITS_PER_DOC);
        m.reserveDoC -= drawn; shortfall -= drawn * UNITS_PER_DOC;
      }
      shortfall = Math.max(0, shortfall);
      const downtime = shortfall * p.criticality * 0.9;
      state.downtimeDays += downtime;
      // Spec §4.2 uses shortfall × 0.2; v2 weights it by criticality so a graphite gap
      // costs less public trust than idle car plants (assumed).
      state.politicalCapital -= shortfall * 0.2 * p.criticality;

      const prevPrice = m.priceIdx;
      // Real-price mode: history follows cited real prices (Fastmarkets via Tavily, data/prices);
      // the player's own buying/selling still moves the price on top and decays (assumed).
      const real = D.REAL_PRICE && CONFIG.realPrices !== false ? D.REAL_PRICE[k] : null;
      if (real) {
        m.impact = (m.impact || 1) * (1 + (p.eta * m.buyQ) / p.marketDepth) * (1 - (p.eta * m.releaseQ) / p.marketDepth / 2);
        const target = real.path[state.qi + 1];
        m.priceIdx = Math.max(5, target * m.impact);
        m.impact = 1 + (m.impact - 1) * (1 - CONFIG.meanReversion * 2);
        touched[k] = real.flag[state.qi + 1] === "reported" ? "reported" : "interpolated";
      }
      let price = m.priceIdx * priceMult[k]
        * (1 + (p.eta * m.buyQ) / p.marketDepth)
        * (1 - (p.eta * m.releaseQ) / p.marketDepth / 2)
        * (1 + m.panic);
      if (!real) {
        if (!touched[k]) {
          const floor = 100 * (1 + m.cutNet);
          price += CONFIG.meanReversion * (floor - price);
        }
        m.priceIdx = Math.max(20, price);
      }
      m.panic *= 0.5; if (m.panic < 0.005) m.panic = 0;

      const storage = CONFIG.storageRate * reserveValue(state, k);
      spentStorage += storage;

      report.minerals[k] = {
        priceFrom: prevPrice, priceTo: m.priceIdx, avail: m.importAvail, offtake: offUnits[k] / UNITS_PER_DOC,
        shortfallDays: shortfall / UNITS_PER_DOC, drawn, downtime, reserve: m.reserveDoC, src: touched[k] || (m.buyQ ? "player" : "model"),
      };
      m.hist.price.push(m.priceIdx); m.hist.doc.push(m.reserveDoC); m.hist.avail.push(m.importAvail);
      m.hist.priceSrc.push(touched[k] || "model");
      m.qSinceCut++; m.buyQ = 0; m.releaseQ = 0;
    }
    // Storage is paid from budget; if the budget can't cover it, the unpaid bill costs political capital.
    const paid = Math.min(spentStorage, Math.max(0, state.budget));
    state.budget -= paid; state.spent += paid;
    if (spentStorage - paid > 0.5) { state.politicalCapital -= 3; state.log.push({ q, kind: "damage", text: "Storage bill unpaid — budget exhausted: −3 political capital." }); }
    report.storage = spentStorage;
    // Quiet competence slowly rebuilds trust: +2 in a quarter with no downtime (assumed).
    if (state.downtimeDays - report.downtimeBefore < 0.5) state.politicalCapital += 2;
    // Stranded inventory: a reserve marked down >25% after prices fall draws criticism (assumed).
    for (const k of KEYS) {
      const m = state.minerals[k];
      const cost = m.avgCost * m.reserveDoC, val = reserveValue(state, k);
      if (cost > 50 && val < 0.75 * cost && !m.strandedFlagged) {
        m.strandedFlagged = true; state.politicalCapital -= 3;
        state.log.push({ q, kind: "damage", text: `${MINERALS[k].name} reserve marked down ${Math.round((1 - val / cost) * 100)}% — "stranded inventory" headlines: −3 political capital.` });
      }
    }
    state.politicalCapital = clamp(state.politicalCapital, 0, 100);
    state.minDocByQ.push(Math.min(...KEYS.map((k) => state.minerals[k].reserveDoC)));
    report.downtime = state.downtimeDays - report.downtimeBefore;
    state.downtimeHist.push(report.downtime);
    report.pcDelta = state.politicalCapital - report.pcBefore;

    for (const e of fired) state.log.push({ q, kind: "event", text: e.headline });
    for (const n of report.offtakeNotes) state.log.push({ q, kind: "deal", text: n });
    if (report.downtime > 0.5) state.log.push({ q, kind: "damage", text: `${report.downtime.toFixed(0)} days of industry downtime this quarter.` });

    state.qi++;
    if (state.qi >= QUARTERS.length) state.done = true; else state.quarter = QUARTERS[state.qi];
    return report;
  }

  // ---------- Benchmark strategies (§4.6) ----------
  const topUp = (state, target, keys = KEYS) => {
    const buy = {}; let budget = state.budget;
    for (const k of keys) {
      const need = Math.max(0, Math.ceil(target - state.minerals[k].reserveDoC));
      let d = Math.min(need, maxBuy(state, k));
      while (d > 0 && quoteBuy(state, k, d) > budget) d--;
      if (d > 0) { buy[k] = d; budget -= quoteBuy(state, k, d); }
    }
    return { buy };
  };

  const STRATEGIES = {
    doNothing: { label: "Do nothing", fn: () => ({}) },
    jogmec: { label: "Japan's rule: always hold 60 days", fn: (s) => topUp(s, 60) },
    panic: {
      label: "Panic buyer: only buy after bad news",
      fn: (s, last) => {
        if (!last) return {};
        // Buys only after it sees an announcement hit a mineral: +40 DoC on each one hit.
        const buy = {}; let budget = s.budget;
        for (const e of last.events) for (const [k, eff] of Object.entries(e.effects)) {
          if (!(eff.cut || eff.setCut || (eff.priceMult || 1) > 1.05) || buy[k]) continue;
          let d = Math.min(40, maxBuy(s, k));
          while (d > 0 && quoteBuy(s, k, d) > budget) d--;
          if (d > 0) { buy[k] = d; budget -= quoteBuy(s, k, d); }
        }
        return { buy };
      },
    },
    hindsight: {
      label: "Cheater: knows the future",
      fn: (s) => {
        // Knows the future: builds 90 DoC on minerals cut within the next two quarters,
        // and keeps topping up while a cut is still biting. Buys nothing else.
        const soon = new Set();
        for (const e of EVENTS) {
          const d = QUARTERS.indexOf(e.quarter) - s.qi;
          if (d >= 0 && d <= 2) for (const [k, eff] of Object.entries(e.effects)) if (eff.cut || eff.setCut) soon.add(k);
        }
        for (const k of KEYS) if (s.minerals[k].cutNet > 0.1 && s.minerals[k].importAvail < 0.9) soon.add(k);
        return topUp(s, 90, [...soon]);
      },
    },
  };

  function runStrategy(fn, opts = {}) {
    const s = newState(opts);
    let last = null;
    while (!s.done) {
      const res = applyOrders(s, fn(s, last));
      if (!res.ok) applyOrders(s, {});
      last = resolveQuarter(s);
    }
    return s;
  }

  // ---------- Scoring (§4.6) ----------
  function score(state, worstDowntime) {
    const avgMinDoc = state.minDocByQ.reduce((a, b) => a + b, 0) / Math.max(1, state.minDocByQ.length);
    const cover = Math.min(1, avgMinDoc / 60);
    const downtimeScore = clamp(1 - state.downtimeDays / Math.max(1, worstDowntime), 0, 1);
    const avoided = Math.max(0, worstDowntime - state.downtimeDays);
    const efficiency = state.spent > 1 ? clamp((avoided * CONFIG.valuePerDowntimeDay) / state.spent, 0, 1) : 0;
    const pc = state.politicalCapital / 100;
    const parts = { cover: 40 * cover, downtime: 30 * downtimeScore, efficiency: 15 * efficiency, political: 15 * pc };
    return { total: parts.cover + parts.downtime + parts.efficiency + parts.political, parts, avgMinDoc, avoided };
  }

  function benchmarks(seed) {
    const out = {};
    for (const [id, s] of Object.entries(STRATEGIES)) out[id] = runStrategy(s.fn, { seed });
    const worst = out.doNothing.downtimeDays;
    const scored = {};
    for (const [id, st] of Object.entries(out)) scored[id] = { label: STRATEGIES[id].label, state: st, score: score(st, worst) };
    return { scored, worst };
  }

  function markToMarket(state, k) {
    const m = state.minerals[k];
    const value = reserveValue(state, k), cost = m.avgCost * m.reserveDoC;
    return { value, cost, pnl: value - cost };
  }

  const Sim = { KEYS, UNITS_PER_DOC, rng, clamp, clone, newState, maxBuy, quoteBuy, applyOrders, resolveQuarter, STRATEGIES, runStrategy, score, benchmarks, markToMarket, reserveValue };
  root.Sim = Sim;
  if (typeof module !== "undefined") module.exports = Sim;
})(typeof window !== "undefined" ? window : globalThis);
