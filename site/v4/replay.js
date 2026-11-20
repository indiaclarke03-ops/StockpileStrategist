/* Stockpile Strategist — 2023–26 replay (sim.js engine) played out on the live supply chain.
 * Factories run, ration, or stop; a no-stockpile twin shows what you avoided; every quarter gets
 * one line of cause → effect. */
(function (root) {
  const D = root.GAME_DATA, EXT = D.EXT || {}, { QUARTERS, EVENTS, COUNTERPARTIES } = D;
  const PAUSES = {
    "2023Q3": { when: "Aug 2023", h: "China now requires licences to export gallium and germanium.", q: "Restrictions are starting. Store more now?" },
    "2024Q4": { when: "Dec 2024", h: "China bans gallium, germanium and antimony exports to the US.", q: "It's now an outright ban. What do you do?" },
    "2025Q2": { when: "Apr 2025", h: "China restricts rare earths. Ford and Suzuki halt production lines.", q: "Factories are stopping. What do you do?" },
    "2025Q4": { when: "Nov 2025", h: "US–China truce: restrictions paused for a year.", q: "Things are calming. Sell, hold or keep buying?" },
  };
  const months = (q) => ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][+q.slice(5) - 1] + " " + q.slice(0, 4);
  const STATE_LABEL = { running: "Running", rationing: "Rationing", stopped: "Stopped" };
  let ctx = null;

  /** Running / rationing (reduced output) / stopped, from the gap left after substitution and the stockpile. */
  function stateOf(mr, thr) { const f = mr.shortFrac || 0; return f < 0.01 ? "running" : f <= thr ? "rationing" : "stopped"; }
  function exposure(G) {
    // Which suppliers a shortage lands on: China-linked ones, or for cobalt the DRC-fed ones.
    const M = G.model, drc = G.mission.id === "cobalt";
    let set = M.nodes.map((n, i) => i).filter((i) => (drc ? M.tier2.some((t) => t.country === "COD" && (t.share || {})[M.nodes[i].id] >= 0.3) : M.nodes[i].chinaLinked));
    if (!set.length) set = M.nodes.map((n, i) => i);
    return set;
  }
  function factorsFor(G, avail, offtakes, exposed) {
    const M = G.model, net = G.net, lost = Math.max(0, 1 - avail), exShare = exposed.reduce((s, i) => s + M.nodes[i].share, 0) || 1;
    const f = Math.max(0, Math.min(1, 1 - lost / exShare));
    const factors = net.nodes.map((n, i) => { if (i >= M.nodes.length) { const o = (offtakes || []).find((x) => x.id === n.id); return o && o.status === "delivering" ? 1 : 0.15; } return exposed.includes(i) ? f : 1; });
    const labels = net.nodes.map((n, i) => { if (i < M.nodes.length) return null; const o = (offtakes || []).find((x) => x.id === n.id); return !o ? "" : o.status === "delivering" ? "delivering" : o.status === "blocked" ? "blocked" : "not started"; });
    return { factors, labels };
  }

  function start(G) {
    const U = root.UI, k = G.mission.id;
    ctx = { G, k, qi: 0, speed: 1, playing: true, skip: false, target: G.stockDays, pendingOff: [...G.signed], decisions: [], rows: [], ghostRows: [], timer: null, drawn: 0, subst: 0 };
    G.historyDone = false; G.liveMoney = true;
    ctx.s = Sim.newState({ releaseTrigger: G.releaseTrigger, priority: G.priority }); ctx.s.budget -= G.investCost; ctx.s.spent += G.investCost;
    ctx.ghost = Sim.newState({ priority: G.priority });
    ctx.exposed = exposure(G);
    const net = G.net;
    net.clearHalos(); net.upstream({ flows: [], converged: {}, spof: null }, false); net.setFaults(G.faults); net.showLinks(true);
    net.morph(net.nodes.map((n) => n.share), { mode: "supply", duration: 0.5, ease: "power2.out" });
    net.setTank(0); net.setFactory("running", "running"); net.setGhost("running", "running");
    U.legend("live");
    render(null); strip();
    ctx.timer = setTimeout(loop, 600);
  }

  function ordersFor(s) {
    const k = ctx.k, m = s.minerals[k];
    let d = Math.min(Math.max(0, Math.ceil(ctx.target - m.reserveDoC)), Sim.maxBuy(s, k));
    const off = ctx.pendingOff.reduce((a, id) => a + COUNTERPARTIES.find((c) => c.id === id).upfront, 0);
    while (d > 0 && Sim.quoteBuy(s, k, d) + off > s.budget) d--;
    const o = { buy: d ? { [k]: d } : {}, offtakes: ctx.pendingOff.filter((id) => COUNTERPARTIES.find((c) => c.id === id).upfront <= s.budget - Sim.quoteBuy(s, k, d)) };
    ctx.pendingOff = [];
    return o;
  }

  function step() {
    const q = QUARTERS[ctx.qi], thr = ctx.G.threshold;
    const alliedBefore = Sim.alliedCount(ctx.s, ctx.k);
    if (!Sim.applyOrders(ctx.s, ordersFor(ctx.s)).ok) Sim.applyOrders(ctx.s, {});
    const rep = Sim.resolveQuarter(ctx.s);
    Sim.applyOrders(ctx.ghost, {});
    const g = Sim.resolveQuarter(ctx.ghost);
    const mr = rep.minerals[ctx.k], gr = g.minerals[ctx.k];
    const row = { q, reserve: mr.reserve, downtime: mr.downtime, avail: mr.avail, drawn: mr.drawn || 0, subst: mr.substituted || 0, shortFrac: mr.shortFrac || 0,
      state: stateOf(mr, thr), defShort: mr.defShortFrac || 0, civShort: mr.civShortFrac || 0, offtakes: JSON.parse(JSON.stringify(ctx.s.offtakes)) };
    ctx.rows.push(row);
    ctx.ghostRows.push({ q, downtime: gr.downtime, state: stateOf(gr, thr), shortFrac: gr.shortFrac || 0 });
    ctx.drawn += row.drawn; ctx.subst += row.subst;
    ctx.qi++;
    return { q, rep, mr, row, ghost: ctx.ghostRows[ctx.ghostRows.length - 1], hits: rep.events.filter((e) => e.effects[ctx.k]), allied: alliedBefore };
  }

  function loop() {
    if (!ctx || !ctx.playing) return;
    if (ctx.qi >= QUARTERS.length) return finish();
    const r = step();
    if (!ctx.skip) {
      show(r);
      if (PAUSES[r.q]) { ctx.playing = false; decide(r.q); return; }
      ctx.timer = setTimeout(loop, (root.UI.reduced() ? 1800 : 3800) / ctx.speed);
    } else {
      if (PAUSES[r.q]) ctx.decisions.push({ q: r.q, choice: "Keep the plan (skipped)" });
      loop();
    }
  }

  /** Paint one quarter onto the live supply chain. */
  function paint(row, ghost) {
    const U = root.UI, net = ctx.G.net;
    const { factors, labels } = factorsFor(ctx.G, row.avail, row.offtakes, ctx.exposed);
    net.setFlows(factors, labels);
    net.setTank(row.reserve, { drawing: row.drawn > 0.5 });
    const lab = row.state === "stopped" ? `stopped · −${Math.round(row.shortFrac * 100)}% supply` : row.state === "rationing" ? `rationing · −${Math.round(row.shortFrac * 100)}% output` : row.drawn > 0.5 ? "running on stockpile" : "running";
    net.setFactory(row.state === "running" ? (row.drawn > 0.5 ? "strained" : "running") : row.state, lab);
    net.setGhost(ghost.state, ghost.state === "running" ? "running" : `${ghost.state} · −${Math.round(ghost.shortFrac * 100)}%`);
    U.liveStatus([
      { k: "Imports arriving", v: `${Math.round(row.avail * 100)}%`, cls: row.avail < 0.85 ? "bad" : "good" },
      { k: "Stockpile", v: `${Math.round(row.reserve)} days`, cls: row.drawn > 0.5 ? "ore" : "" },
      { k: "Your factory", v: STATE_LABEL[row.state], cls: row.state === "running" ? "good" : row.state === "rationing" ? "ore" : "bad" },
    ]);
  }

  function show({ q, rep, mr, row, ghost, hits, allied }) {
    const U = root.UI, net = ctx.G.net;
    paint(row, ghost);
    if (hits.length) net.pulse(ctx.exposed.filter((i) => row.avail < 0.98)); else net.undim();
    document.getElementById("hud-money").textContent = U.fmt$(ctx.s.budget);
    // One line: cause → effect (+ money / allies / deal news)
    const m = ctx.G.mission.name.toLowerCase();
    const cause = hits.length ? `${U.esc(hits[0].actor)} acted: imports of ${m} fell to <b>${Math.round(row.avail * 100)}%</b>.` : row.avail < 0.98 ? `Earlier restrictions still bite: imports at <b>${Math.round(row.avail * 100)}%</b>.` : `Imports normal.`;
    const effect = row.avail >= 0.98 ? "" : [row.subst > 0.5 ? `substitutes covered ${Math.round(row.subst)} days` : "", row.drawn > 0.5 ? `your stockpile covered ${Math.round(row.drawn)} days` : "", row.state === "running" ? "factory kept running" : row.state === "rationing" ? `factory <b>rationed</b> (−${Math.round(row.shortFrac * 100)}%)` : `factory <b>stopped</b>`].filter(Boolean).join(", ");
    const extras = [rep.tranche ? `New fiscal year: +${U.fmt$(rep.tranche)} arrived.` : "", rep.lapsed ? `${U.fmt$(rep.lapsed)} unspent money lapsed.` : "", allied ? `Allies were buying ${m} too: you could buy ${Math.round(Math.min(45, allied * 15))}% less.` : "", ...(rep.offtakeNotes || []).slice(0, 1)].filter(Boolean).join(" ");
    Tour.why(`<span class="wk">${months(q)}</span>${cause}${effect ? " → " + effect + "." : ""} ${extras}`, row.state === "stopped" ? "bad" : row.state === "rationing" || row.drawn > 0.5 ? "ore" : "good");
    render({ q, rep, row, hits });
    strip();
  }

  function render(r) {
    const U = root.UI, el = U.$("s-history");
    if (!r) {
      el.innerHTML = `<div class="step-k">Step 11</div><h2>Real events, 2023 to 2026</h2>
        <p class="lead">Watch the map. Supply lines thin when restrictions hit, your <b>stockpile tank</b> drains to keep the factory running, and a factory <b>without a stockpile</b> runs alongside for comparison.</p>${controls()}`;
      bind(); return;
    }
    const { q, row, hits } = r;
    const head = hits.length ? hits[0].headline : r.rep.events.length ? r.rep.events[0].headline : "No new restrictions this quarter.";
    const sector = (f) => (f < 0.01 ? `<span class="state-chip running">Running</span>` : f <= ctx.G.threshold ? `<span class="state-chip rationing">Rationing −${Math.round(f * 100)}%</span>` : `<span class="state-chip stopped">Stopped</span>`);
    const world = (EXT.responses || []).filter((x) => x.quarter === q && (x.minerals || []).includes(ctx.k))[0] || (EXT.responses || []).filter((x) => x.quarter === q)[0];
    el.innerHTML = `<div class="step-k">Step 11 · ${ctx.qi} of ${QUARTERS.length}</div>
      <div class="q-date">${months(q)}</div><div class="q-head">${U.esc(head)}</div>
      <div class="sectors" style="margin-top:12px"><div class="sector"><span>Defence lines</span><span></span><span class="r">${sector(row.defShort)}</span></div><div class="sector"><span>Commercial lines</span><span></span><span class="r">${sector(row.civShort)}</span></div></div>
      <div class="kpis">${U.kpi("From your stockpile", `${Math.round(row.drawn)} days`, row.drawn > 0.5 ? "released to factories" : "not needed", row.drawn > 0.5 ? "ore" : "")}${U.kpi("Substitutes", `${Math.round(row.subst)} days`, row.subst > 0.5 ? "alternative materials" : "not needed")}</div>
      <div id="decisionSlot"></div>
      ${controls()}
      ${world ? `<div class="world-line"><b>Meanwhile, for real:</b> ${U.esc(world.actor)}: ${U.esc(String(world.summary).slice(0, 140))}${String(world.summary).length > 140 ? "…" : ""} <a href="${U.esc(world.source)}" target="_blank" rel="noopener">source</a></div>` : ""}`;
    bind();
  }
  const controls = () => `<div class="hist-controls"><button class="ghost small" id="h-play">${ctx.playing ? "❚❚ Pause" : "▶ Play"}</button><button class="ghost small" id="h-fast">${ctx.speed === 1 ? "Faster" : "Normal speed"}</button><button class="ghost small" id="h-skip">Skip to the end</button></div>`;
  function bind() {
    const U = root.UI, p = U.$("h-play"), f = U.$("h-fast"), s = U.$("h-skip");
    if (p) p.onclick = () => { if (U.$("decisionSlot") && U.$("decisionSlot").innerHTML) return; ctx.playing = !ctx.playing; p.textContent = ctx.playing ? "❚❚ Pause" : "▶ Play"; if (ctx.playing) loop(); else clearTimeout(ctx.timer); };
    if (f) f.onclick = () => { ctx.speed = ctx.speed === 1 ? 2.5 : 1; f.textContent = ctx.speed === 1 ? "Faster" : "Normal speed"; };
    if (s) s.onclick = () => { clearTimeout(ctx.timer); ctx.skip = true; ctx.playing = true; loop(); };
  }

  /** Decision: the three numbers a real official would look at first, then 2–3 options with their cost. */
  function decide(q) {
    const U = root.UI, P = PAUSES[q], s = ctx.s, m = s.minerals[ctx.k], MP = D.MINERALS[ctx.k], M = ctx.G.model;
    const clean = COUNTERPARTIES.filter((c) => c.mineral === ctx.k && !ctx.G.signed.includes(c.id) && !ctx.decisions.some((d) => d.cp === c.id) && !ACTS.isLinked(c) && c.upfront <= s.budget).sort((a, b) => a.upfront - b.upfront)[0];
    const d30 = Math.min(30, Sim.maxBuy(s, ctx.k));
    const h = m.hist.price, trend = h.length > 2 ? h[h.length - 1] / h[h.length - 3] - 1 : 0;
    const alt = M.nodes.filter((n) => !n.chinaLinked).length + s.offtakes.filter((o) => o.mineral === ctx.k && o.status === "delivering" && !ACTS.isLinked(COUNTERPARTIES.find((c) => c.id === o.id))).length;
    const opts = q === "2025Q4"
      ? [{ id: "sell", b: "Sell half the stockpile", ch: [{ k: "Money back", delta: 0.45 * Sim.reserveValue(s, ctx.k), unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Stockpile", delta: -Math.floor(m.reserveDoC / 2), unit: " days", fmt: (v) => Math.round(v) }] },
         { id: "hold", b: "Keep what you have", ch: [] },
         { id: "buy", b: `Buy ${d30} more days`, ch: [{ k: "Cost", delta: -Sim.quoteBuy(s, ctx.k, d30), unit: "M", fmt: (v) => `$${Math.round(v)}` }] }]
      : [{ id: "buy", b: `Buy ${d30} more days`, ch: [{ k: "Cost", delta: -Sim.quoteBuy(s, ctx.k, d30), unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Price", delta: ((MP.eta * d30) / MP.marketDepth) * 100, unit: "%", goodIfDown: true, fmt: (v) => Math.round(v) }] },
         { id: "hold", b: "Keep your plan", ch: [] },
         clean ? { id: "deal", b: `Sign ${clean.name}`, cp: clean.id, ch: [{ k: "Cost", delta: -clean.upfront, unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Supply", delta: clean.docPerQ, unit: " days/qtr", fmt: (v) => v }] } : null].filter(Boolean);
    U.$("decisionSlot").innerHTML = `<div class="decision" role="group" aria-label="Decision"><div class="dk">Decision ${ctx.decisions.length + 1} of 4 · ${P.when}</div><h3>${U.esc(P.q)}</h3>
      <div class="kpis" style="margin:0 0 10px">${U.kpi("Imports stored", `${(m.reserveDoC / 30.4).toFixed(1)} months`, "")}${U.kpi("Price, last 6 months", `${trend >= 0 ? "+" : ""}${Math.round(trend * 100)}%`, "", trend > 0.1 ? "bad" : "")}${U.kpi("Non-China suppliers", `${alt}`, "producing now")}</div>
      ${d30 < 30 ? `<div class="faint" style="margin-bottom:8px">You can only buy ${d30} days this quarter${Sim.alliedCount(s, ctx.k) ? ": allies are buying the same supply" : ": imports are restricted"}.</div>` : ""}
      <div class="choices">${opts.map((o) => `<button data-c="${o.id}" ${o.cp ? `data-cp="${o.cp}"` : ""}><b>${U.esc(o.b)}</b>${Guide.chips(o.ch)}</button>`).join("")}</div></div>`;
    const p = U.$("h-play"); if (p) p.textContent = "▶ Play";
    const btns = [...U.$("decisionSlot").querySelectorAll("button")];
    btns[0].focus();
    btns.forEach((b, i) => {
      b.onkeydown = (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); btns[(i + (e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length].focus(); } };
      b.onclick = () => {
        const c = b.dataset.c, o = opts.find((x) => x.id === c);
        if (c === "buy") ctx.target = Math.max(ctx.target, m.reserveDoC) + d30;
        if (c === "sell") { const half = Math.floor(m.reserveDoC / 2), val = (half / Math.max(1, m.reserveDoC)) * Sim.reserveValue(s, ctx.k) * 0.9; m.reserveDoC -= half; s.budget += val; ctx.target = Math.max(0, m.reserveDoC); ctx.G.net.setTank(m.reserveDoC); }
        if (c === "deal") ctx.pendingOff.push(b.dataset.cp);
        ctx.decisions.push({ q, choice: o.b, cp: b.dataset.cp });
        Guide.log(11, `${P.when}: ${o.b}`, o.ch, P.h);
        Tour.why(`<span class="wk">Decided</span>${U.esc(o.b)}. ${c === "buy" ? "More stock for the next shock, but it pushes the price up." : c === "sell" ? "Money back, but less cover if restrictions return." : c === "deal" ? "A new supplier, once it starts delivering." : "No change to your plan."}`, "ore");
        U.$("decisionSlot").innerHTML = "";
        ctx.playing = true; const pb = U.$("h-play"); if (pb) pb.textContent = "❚❚ Pause";
        ctx.timer = setTimeout(loop, 500);
      };
    });
  }

  function strip(rows = ctx.rows, ghostRows = ctx.ghostRows, cur = ctx.qi - 1) {
    const U = root.UI, cls = (r) => (!r ? "" : r.state === "stopped" ? "bad" : r.state === "rationing" ? "mid" : "ok");
    const cell = (r, i) => `<span class="c ${cls(r)} ${i === cur ? "cur" : ""}" title="${QUARTERS[i]}${r ? `: ${STATE_LABEL[r.state]}` : ""}"></span>`;
    U.$("liveExtra").innerHTML = `<div class="qstrip"><span>You</span>${QUARTERS.map((q, i) => cell(rows[i], i)).join("")}</div>
      <div class="qstrip" style="margin-top:3px"><span>No stockpile</span>${QUARTERS.map((q, i) => cell(ghostRows[i], i)).join("")}</div>
      <div class="faint" style="margin-top:4px">Each box = 3 months. Green running · amber rationing · red stopped.</div>`;
  }

  function finish() {
    const U = root.UI, G = ctx.G;
    const yours = ctx.rows.reduce((s, r) => s + r.downtime, 0), ghost = ctx.ghostRows.reduce((s, r) => s + r.downtime, 0);
    const count = (rows, st) => rows.filter((r) => r.state === st).length;
    const fh = G.faults.filter((i) => ctx.exposed.includes(i)).length;
    G.history = { yours, ghost, verdict: fh === 2 ? "match" : fh === 1 ? "partial" : "miss", decisions: ctx.decisions, state: ctx.s, rows: ctx.rows, ghostRows: ctx.ghostRows, drawn: ctx.drawn, subst: ctx.subst,
      stopped: count(ctx.rows, "stopped"), rationed: count(ctx.rows, "rationing"), ghostStopped: count(ctx.ghostRows, "stopped"), exposed: ctx.exposed };
    G.historyDone = true; G.liveMoney = null;
    const last = ctx.rows[ctx.rows.length - 1];
    if (last) paint(last, ctx.ghostRows[ctx.ghostRows.length - 1]);
    U.$("s-history").innerHTML = `<div class="step-k">Step 11 · done</div><h2>2023–26 is over.</h2>
      <div class="kpis">${U.kpi("Your factory", `${G.history.stopped} stopped · ${G.history.rationed} rationing`, "quarters, out of 14", G.history.stopped ? "bad" : "good")}${U.kpi("Without a stockpile", `${G.history.ghostStopped} stopped`, "quarters", "bad")}</div>
      <p class="lead">Your stockpile supplied <b>${Math.round(ctx.drawn)} days</b> of material when imports fell short.</p>`;
    Tour.why(`<span class="wk">Done</span>Output lost: <b>${Math.round(yours)} days</b> with your plan vs <b>${Math.round(ghost)}</b> without a stockpile.`, yours < ghost ? "good" : "bad");
    Guide.log(11, "History replayed", [{ k: "Output days lost", delta: yours, unit: "", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "With no stockpile", delta: ghost, unit: "", goodIfDown: true, fmt: (v) => Math.round(v) }]);
    U.nav(); U.hud();
  }

  /** Results: the headline numbers, a 20-second animated recap on the live graph, and what the real US did. */
  function results(G) {
    const U = root.UI, h = G.history, k = G.mission.id;
    const names = G.faults.map((i) => U.shortName(G.model.nodes[i].label)).join(" + ");
    const isUS = (x) => /^(USA|US)$/i.test(x.country || "") || /^US\b/.test(x.actor || "");
    const real = (EXT.responses || []).filter((x) => isUS(x) && (x.minerals || []).includes(k) && /stockpile|offtake|price-floor|equity|loan|deal/.test(x.type || "")).slice(0, 2);
    ctx = ctx || { G, exposed: h.exposed, rows: h.rows, ghostRows: h.ghostRows };
    U.$("s-results").innerHTML = `<div class="step-k">Step 12</div><h2>How your plan held up</h2>
      <div class="kpis">${U.kpi("Output lost", `${Math.round(h.yours)} days`, "with your plan", h.yours < h.ghost ? "good" : "bad")}${U.kpi("Without a stockpile", `${Math.round(h.ghost)} days`, "same events", "bad")}${U.kpi("Stockpile used", `${Math.round(h.drawn)} days`, "", "ore")}${U.kpi("Money left", U.fmt$(h.state.budget), h.state.lapsed > 0.5 ? `${U.fmt$(h.state.lapsed)} lapsed unspent` : "")}</div>
      <p style="margin:10px 0"><span class="verdict ${h.verdict === "match" ? "good" : h.verdict === "partial" ? "mid" : "bad"}">${h.verdict === "match" ? "✓ Your weak spots were the ones history hit" : h.verdict === "partial" ? "Your weak spots partly matched history" : "History hit different suppliers"}</span></p>
      <div class="faint">Weak spots you found: ${U.esc(names)}.</div>
      <div class="hist-controls"><button class="ghost small" id="recap">▶ Replay the recap</button><span class="recap-label" id="recapQ"></span></div>
      ${real.length ? `<h3 style="margin-top:16px">What the real US did</h3><ul class="faint" style="margin-top:4px;padding-left:18px">${real.map((x) => `<li><b style="color:var(--ink-2)">${U.esc(x.date)} · ${U.esc(x.actor)}</b>: ${U.esc(String(x.summary).slice(0, 130))}… <a href="${U.esc(x.source)}" target="_blank" rel="noopener">source</a></li>`).join("")}</ul>` : ""}`;
    U.legend("live");
    U.$("recap").onclick = () => recap(G);
    recap(G);
  }
  function recap(G) {
    const U = root.UI, h = G.history; let i = 0;
    clearInterval(G._recap);
    const tick = () => {
      if (i >= h.rows.length || !U.$("recapQ")) { clearInterval(G._recap); if (U.$("recapQ")) U.$("recapQ").textContent = "2023–26 in 20 seconds"; return; }
      ctx.exposed = h.exposed; paint(h.rows[i], h.ghostRows[i]); strip(h.rows, h.ghostRows, i);
      U.$("recapQ").textContent = months(h.rows[i].q); i++;
    };
    tick(); G._recap = setInterval(tick, U.reduced() ? 600 : 1400);
  }

  root.Replay = { start, results };
})(window);
