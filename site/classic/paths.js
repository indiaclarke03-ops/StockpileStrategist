/* Stockpile Strategist — casebook path engine. Pure logic on top of sim.js (no DOM).
 * A "path" is a sim state plus a standing policy (stock targets, pending deals). Paths are
 * stepped quarter by quarter through the same real events; options are compared by cloning a
 * path, applying the option, and running it to the end of 2026 with no further decisions. */
(function (root) {
  const D = root.GAME_DATA, Sim = root.Sim, { QUARTERS, MINERALS, COUNTERPARTIES, CONFIG } = D;
  const KEYS = Sim.KEYS;
  // $M of output lost per full factory-day without the mineral, by dependent industry (assumed,
  // order-of-magnitude: US auto output ≈ $1.5B/day; one Ford plant-week ≈ hundreds of $M).
  // `scale` lets analysts test how the best strategy changes with this value.
  const VALUE = { gallium: 120, germanium: 40, antimony: 60, graphite: 80, dysprosium: 150, cobalt: 80 };
  const opt = { scale: 1 };
  const lostValue = (p, from) => p.down.slice(from).reduce((a, d) => a + KEYS.reduce((b, k) => b + d[k] * VALUE[k] * opt.scale, 0), 0);

  function newPath(name) { return { name, s: Sim.newState(), targets: {}, pending: [], down: [], spentAt: [], choices: [] }; }
  const clonePath = (p) => ({ name: p.name, s: Sim.clone(p.s), targets: { ...p.targets }, pending: [...p.pending], down: p.down.map((d) => ({ ...d })), spentAt: [...p.spentAt], choices: [...p.choices] });

  function applyEffect(p, eff = {}) {
    const s = p.s;
    if (eff.spend) { const x = Math.min(eff.spend, Math.max(0, s.budget)); s.budget -= x; s.spent += x; }
    for (const [k, v] of Object.entries(eff.target || {})) p.targets[k] = Math.max(p.targets[k] || 0, v);
    for (const [k, v] of Object.entries(eff.add || {})) p.targets[k] = Math.max(p.targets[k] || 0, s.minerals[k].reserveDoC) + v;
    if (eff.addAll) for (const k of KEYS) if ((p.targets[k] || 0) > 0 || s.minerals[k].reserveDoC > 1) p.targets[k] = Math.max(p.targets[k] || 0, s.minerals[k].reserveDoC) + eff.addAll;
    for (const [k, usd] of Object.entries(eff.buyUSD || {})) {
      let d = Sim.maxBuy(s, k);
      while (d > 0 && Sim.quoteBuy(s, k, d) > usd) d--;
      p.targets[k] = Math.max(p.targets[k] || 0, s.minerals[k].reserveDoC) + d;
    }
    for (const id of eff.sign || []) if (!p.pending.includes(id) && !s.offtakes.some((o) => o.id === id)) p.pending.push(id);
    if (eff.sell) {
      for (const k of KEYS) {
        const f = eff.sell.all != null ? eff.sell.all : eff.sell[k]; if (!f) continue;
        const m = s.minerals[k], q = m.reserveDoC * f; if (q < 0.5) continue;
        const val = (q / m.reserveDoC) * Sim.reserveValue(s, k) * 0.9;
        m.reserveDoC -= q; s.budget += val; p.targets[k] = m.reserveDoC;
      }
    }
    if (eff.rule) { if (eff.rule.priority) s.priority = eff.rule.priority; if (eff.rule.trigger != null) s.releaseTrigger = eff.rule.trigger; }
  }

  /** Resolve one quarter: top stock up toward targets (capped, budget-limited), sign pending deals. */
  function step(p) {
    const s = p.s; if (s.done) return null;
    let budget = s.budget;
    const offtakes = [];
    for (const id of p.pending) { const c = COUNTERPARTIES.find((x) => x.id === id); if (c && c.upfront <= budget) { offtakes.push(id); budget -= c.upfront; } }
    p.pending = p.pending.filter((id) => !offtakes.includes(id));
    const buy = {};
    for (const k of KEYS) {
      const need = Math.ceil((p.targets[k] || 0) - s.minerals[k].reserveDoC); if (need <= 0) continue;
      let d = Math.min(need, Sim.maxBuy(s, k));
      while (d > 0 && Sim.quoteBuy(s, k, d) > budget) d--;
      if (d > 0) { buy[k] = d; budget -= Sim.quoteBuy(s, k, d); }
    }
    if (!Sim.applyOrders(s, { buy, offtakes }).ok) Sim.applyOrders(s, {});
    const rep = Sim.resolveQuarter(s);
    p.down.push(Object.fromEntries(KEYS.map((k) => [k, rep.minerals[k].downtime])));
    p.spentAt.push(s.spent);
    return rep;
  }
  function advanceTo(p, qi) { const reps = []; while (!p.s.done && p.s.qi < qi) reps.push(step(p)); return reps; }

  const sumDown = (p, keys = KEYS, from = 0) => p.down.slice(from).reduce((a, d) => a + keys.reduce((b, k) => b + d[k], 0), 0);
  /** Run a copy to the end of 2026 (no further decisions) and measure from now. */
  function project(p, eff, keys) {
    const c = clonePath(p), from = c.down.length, spent0 = c.s.spent;
    if (eff) applyEffect(c, eff);
    advanceTo(c, QUARTERS.length);
    const lost = sumDown(c, keys, from), lostAll = sumDown(c, KEYS, from), spent = c.s.spent - spent0;
    return { lost, lostAll, spent, lostUSD: lostValue(c, from), cost: spent + lostValue(c, from), end: Object.fromEntries(KEYS.map((k) => [k, c.s.minerals[k].reserveDoC])), path: c };
  }

  /** Best option = lowest total cost: money spent + value of lost output, all minerals. */
  function compare(p, kase) {
    const res = kase.options.map((o) => ({ o, ...project(p, o.eff, kase.minerals) }));
    const best = res.reduce((a, b) => (b.cost < a.cost - 1e-6 ? b : a), res[0]);
    return { res, best };
  }

  /** Play a whole path through all cases with a chooser (case, path) → option. */
  function playAll(cases, choose, name) {
    const p = newPath(name);
    for (const c of cases) { advanceTo(p, QUARTERS.indexOf(c.q)); const o = choose(c, p); p.choices.push({ case: c.id, option: o.id, tag: o.tag }); applyEffect(p, o.eff); }
    advanceTo(p, QUARTERS.length);
    return p;
  }
  const realChooser = (c) => c.options.find((o) => o.real) || c.options[c.options.length - 1];
  const bestChooser = (c, p) => compare(p, c).best.o;

  root.Paths = { newPath, clonePath, applyEffect, step, advanceTo, project, compare, playAll, realChooser, bestChooser, sumDown, lostValue, VALUE, opt };
  if (typeof module !== "undefined") module.exports = root.Paths;
})(typeof window !== "undefined" ? window : globalThis);
