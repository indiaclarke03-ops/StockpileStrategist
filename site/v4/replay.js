/* Stockpile Strategist — 2023–26 replay (unchanged sim.js engine) played out on the live supply chain. */
(function (root) {
  const D = root.GAME_DATA, EXT = D.EXT || {}, { QUARTERS, EVENTS, COUNTERPARTIES } = D;
  const PAUSES = {
    "2023Q3": { when: "Aug 2023", h: "China now requires licences to export gallium and germanium.", q: "Restrictions are starting. Store more now?" },
    "2024Q4": { when: "Dec 2024", h: "China bans gallium, germanium and antimony exports to the US.", q: "It's now an outright ban. What do you do?" },
    "2025Q2": { when: "Apr 2025", h: "China restricts rare earths. Ford and Suzuki halt production lines.", q: "Factories are stopping. What do you do?" },
    "2025Q4": { when: "Nov 2025", h: "US–China truce: restrictions paused for a year.", q: "Things are calming. Sell, hold or keep buying?" },
  };
  const months = (q) => ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][+q.slice(5) - 1] + " " + q.slice(0, 4);
  let ctx = null;

  function exposure(G) {
    // Which suppliers a shortage of this mineral lands on: China-linked ones, or for cobalt the DRC-fed ones.
    const M = G.model, drc = G.mission.id === "cobalt";
    let set = M.nodes.map((n, i) => i).filter((i) => (drc ? M.tier2.some((t) => t.country === "COD" && (t.share || {})[M.nodes[i].id] >= 0.3) : M.nodes[i].chinaLinked));
    if (!set.length) set = M.nodes.map((n, i) => i);
    return set;
  }

  function start(G) {
    const U = root.UI, k = G.mission.id;
    ctx = { G, k, qi: 0, speed: 1, playing: true, skip: false, target: G.stockDays, pendingOff: [...G.signed], decisions: [], rows: [], ghostRows: [], timer: null, drawn: 0 };
    G.historyDone = false; G.liveMoney = true;
    ctx.s = Sim.newState(); ctx.s.budget -= G.investCost; ctx.s.spent += G.investCost;
    ctx.ghost = Sim.newState();
    ctx.exposed = exposure(G);
    const net = G.net;
    net.clearHalos(); net.upstream({ flows: [], converged: {}, spof: null }, false); net.setFaults(G.faults); net.showLinks(true);
    net.morph(net.nodes.map((n) => n.share), { mode: "supply", duration: 0.5, ease: "power2.out" });
    net.setTank(0); net.setFactory("running", "running");
    U.legend("live");
    render(null);
    strip();
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
    const q = QUARTERS[ctx.qi];
    if (!Sim.applyOrders(ctx.s, ordersFor(ctx.s)).ok) Sim.applyOrders(ctx.s, {});
    const rep = Sim.resolveQuarter(ctx.s);
    Sim.applyOrders(ctx.ghost, {});
    const g = Sim.resolveQuarter(ctx.ghost);
    const mr = rep.minerals[ctx.k], gr = g.minerals[ctx.k];
    ctx.rows.push({ q, reserve: mr.reserve, downtime: mr.downtime, avail: mr.avail, drawn: mr.drawn || 0, offtake: mr.offtake || 0 });
    ctx.ghostRows.push({ q, downtime: gr.downtime });
    ctx.drawn += mr.drawn || 0;
    ctx.qi++;
    return { q, rep, mr, hits: rep.events.filter((e) => e.effects[ctx.k]) };
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

  /** Update the live supply chain + card for one quarter. */
  function show({ q, rep, mr, hits }) {
    const U = root.UI, net = ctx.G.net, M = ctx.G.model;
    const lost = Math.max(0, 1 - mr.avail), exShare = ctx.exposed.reduce((s, i) => s + M.nodes[i].share, 0) || 1;
    const f = Math.max(0, Math.min(1, 1 - lost / exShare));
    const factors = net.nodes.map((n, i) => {
      if (i >= M.nodes.length) { const o = ctx.s.offtakes.find((x) => x.id === n.id); return o && o.status === "delivering" ? 1 : 0.15; }
      return ctx.exposed.includes(i) ? f : 1;
    });
    const labels = net.nodes.map((n, i) => { if (i < M.nodes.length) return null; const o = ctx.s.offtakes.find((x) => x.id === n.id); return !o ? "" : o.status === "delivering" ? "delivering" : o.status === "blocked" ? "blocked" : "not started"; });
    net.setFlows(factors, labels);
    if (hits.length) net.pulse(ctx.exposed.filter((i) => factors[i] < 0.95));
    else net.undim();
    const stopped = mr.downtime > 0.5;
    net.setTank(mr.reserve, { drawing: (mr.drawn || 0) > 0.5 });
    net.setFactory(stopped ? "stopped" : (mr.drawn || 0) > 0.5 ? "strained" : "running", stopped ? `stopped ${Math.round(mr.downtime)} days` : (mr.drawn || 0) > 0.5 ? "running on stockpile" : "running");
    U.liveStatus([
      { k: "Imports arriving", v: `${Math.round(mr.avail * 100)}%`, cls: mr.avail < 0.85 ? "bad" : "good" },
      { k: "Stockpile", v: `${Math.round(mr.reserve)} days`, cls: (mr.drawn || 0) > 0.5 ? "ore" : "" },
      { k: "Factory", v: stopped ? "Stopped" : "Running", cls: stopped ? "bad" : "good" },
    ]);
    document.getElementById("hud-money").textContent = U.fmt$(ctx.s.budget);
    render({ q, rep, mr, hits });
    strip();
  }

  function render(r) {
    const U = root.UI, el = U.$("s-history");
    if (!r) {
      el.innerHTML = `<div class="step-k">Step 10</div><h2>Real events, 2023 to 2026</h2>
        <p class="lead">Watch the map: supply lines thin when restrictions hit, and your <b>stockpile tank</b> drains to keep the factory running.</p>${controls()}`;
      bind(); return;
    }
    const { q, mr, hits } = r;
    const head = hits.length ? hits[0].headline : r.rep.events.length ? r.rep.events[0].headline : "No new restrictions this quarter.";
    const sub = hits.length ? (mr.avail < 0.98 ? `Imports of ${ctx.G.mission.name.toLowerCase()} fall to ${Math.round(mr.avail * 100)}% of normal.` : "No effect on your supply yet.") : mr.avail < 0.98 ? "Earlier restrictions still bite. Some supply finds other routes." : "Supply is normal.";
    const used = mr.drawn || 0;
    const world = (EXT.responses || []).filter((x) => x.quarter === q && (x.minerals || []).includes(ctx.k))[0] || (EXT.responses || []).filter((x) => x.quarter === q)[0];
    el.innerHTML = `<div class="step-k">Step 10 · ${ctx.qi} of ${QUARTERS.length}</div>
      <div class="q-date">${months(q)}</div><div class="q-head">${U.esc(head)}</div><div class="q-sub">${U.esc(sub)}</div>
      <div class="kpis">${U.kpi("Used from stockpile", `${Math.round(used)} days`, used > 0.5 ? "kept the line going" : "not needed", used > 0.5 ? "ore" : "")}${U.kpi("Factory", mr.downtime > 0.5 ? `Stopped ${Math.round(mr.downtime)}d` : "Running", "", mr.downtime > 0.5 ? "bad" : "good")}</div>
      <div id="decisionSlot"></div>
      ${controls()}
      ${world ? `<div class="world-line"><b>Meanwhile, for real:</b> ${U.esc(world.actor)}: ${U.esc(String(world.summary).slice(0, 150))}${String(world.summary).length > 150 ? "…" : ""} <a href="${U.esc(world.source)}" target="_blank" rel="noopener">source</a></div>` : ""}`;
    bind();
  }
  const controls = () => `<div class="hist-controls"><button class="ghost small" id="h-play">${ctx.playing ? "❚❚ Pause" : "▶ Play"}</button><button class="ghost small" id="h-fast">${ctx.speed === 1 ? "Faster" : "Normal speed"}</button><button class="ghost small" id="h-skip">Skip to the end</button></div>`;
  function bind() {
    const U = root.UI;
    const p = U.$("h-play"), f = U.$("h-fast"), s = U.$("h-skip");
    if (p) p.onclick = () => { if (U.$("decisionSlot") && U.$("decisionSlot").innerHTML) return; ctx.playing = !ctx.playing; p.textContent = ctx.playing ? "❚❚ Pause" : "▶ Play"; if (ctx.playing) loop(); else clearTimeout(ctx.timer); };
    if (f) f.onclick = () => { ctx.speed = ctx.speed === 1 ? 2.5 : 1; f.textContent = ctx.speed === 1 ? "Faster" : "Normal speed"; };
    if (s) s.onclick = () => { clearTimeout(ctx.timer); ctx.skip = true; ctx.playing = true; loop(); };
  }

  function decide(q) {
    const U = root.UI, P = PAUSES[q], s = ctx.s, m = s.minerals[ctx.k], MP = D.MINERALS[ctx.k];
    const clean = COUNTERPARTIES.filter((c) => c.mineral === ctx.k && !ctx.G.signed.includes(c.id) && !ctx.decisions.some((d) => d.cp === c.id) && !ACTS.isLinked(c) && c.upfront <= s.budget).sort((a, b) => a.upfront - b.upfront)[0];
    const d30 = Math.min(30, Sim.maxBuy(s, ctx.k));
    const opts = q === "2025Q4"
      ? [{ id: "sell", b: "Sell half the stockpile", ch: [{ k: "Money back", delta: 0.45 * Sim.reserveValue(s, ctx.k), unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Stockpile", delta: -Math.floor(m.reserveDoC / 2), unit: " days", fmt: (v) => Math.round(v) }] },
         { id: "hold", b: "Keep what you have", ch: [] },
         { id: "buy", b: "Buy 30 more days", ch: [{ k: "Cost", delta: -Sim.quoteBuy(s, ctx.k, d30), unit: "M", fmt: (v) => `$${Math.round(v)}` }] }]
      : [{ id: "buy", b: "Buy 30 more days", ch: [{ k: "Cost", delta: -Sim.quoteBuy(s, ctx.k, d30), unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Price", delta: ((MP.eta * d30) / MP.marketDepth) * 100, unit: "%", goodIfDown: true, fmt: (v) => Math.round(v) }] },
         { id: "hold", b: "Keep your plan", ch: [] },
         clean ? { id: "deal", b: `Sign ${clean.name}`, cp: clean.id, ch: [{ k: "Cost", delta: -clean.upfront, unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Supply", delta: clean.docPerQ, unit: " days/qtr", fmt: (v) => v }] } : null].filter(Boolean);
    U.$("decisionSlot").innerHTML = `<div class="decision" role="group" aria-label="Decision"><div class="dk">Decision ${ctx.decisions.length + 1} of 4 · ${P.when}</div><h3>${U.esc(P.q)}</h3>
      <div class="choices">${opts.map((o) => `<button data-c="${o.id}" ${o.cp ? `data-cp="${o.cp}"` : ""}><b>${U.esc(o.b)}</b>${Guide.chips(o.ch)}</button>`).join("")}</div></div>`;
    const p = U.$("h-play"); if (p) p.textContent = "▶ Play";
    const btns = [...U.$("decisionSlot").querySelectorAll("button")];
    btns[0].focus();
    btns.forEach((b, i) => {
      b.onkeydown = (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); btns[(i + (e.key === "ArrowDown" ? 1 : btns.length - 1)) % btns.length].focus(); } };
      b.onclick = () => {
        const c = b.dataset.c, o = opts.find((x) => x.id === c);
        if (c === "buy") ctx.target += 30;
        if (c === "sell") { const half = Math.floor(m.reserveDoC / 2), val = (half / Math.max(1, m.reserveDoC)) * Sim.reserveValue(s, ctx.k) * 0.9; m.reserveDoC -= half; s.budget += val; ctx.target = Math.max(0, m.reserveDoC); ctx.G.net.setTank(m.reserveDoC); }
        if (c === "deal") ctx.pendingOff.push(b.dataset.cp);
        ctx.decisions.push({ q, choice: o.b, cp: b.dataset.cp });
        Guide.log(10, `${P.when}: ${o.b}`, o.ch, P.h);
        U.$("decisionSlot").innerHTML = "";
        ctx.playing = true; const pb = U.$("h-play"); if (pb) pb.textContent = "❚❚ Pause";
        ctx.timer = setTimeout(loop, 500);
      };
    });
  }

  function strip() {
    const U = root.UI, cell = (r, i) => `<span class="c ${r ? (r.downtime > 0.5 ? "bad" : "ok") : ""} ${i === ctx.qi - 1 ? "cur" : ""}" title="${QUARTERS[i]}${r ? `: ${Math.round(r.downtime)} days stopped` : ""}"></span>`;
    U.$("liveExtra").innerHTML = `<div class="qstrip"><span>You</span>${QUARTERS.map((q, i) => cell(ctx.rows[i], i)).join("")}</div>
      <div class="qstrip" style="margin-top:3px"><span>No stockpile</span>${QUARTERS.map((q, i) => cell(ctx.ghostRows[i], i)).join("")}</div>
      <div class="faint" style="margin-top:4px">Each box = 3 months, mid-2023 to 2026. Red = factory stopped.</div>`;
  }

  function finish() {
    const U = root.UI, G = ctx.G;
    const yours = ctx.rows.reduce((s, r) => s + r.downtime, 0), ghost = ctx.ghostRows.reduce((s, r) => s + r.downtime, 0);
    const histEvents = EVENTS.filter((e) => e.effects[ctx.k] && (e.effects[ctx.k].cut || e.effects[ctx.k].setCut));
    const hitSet = new Set(ctx.exposed);
    const fh = G.faults.filter((i) => hitSet.has(i)).length;
    G.history = { yours, ghost, verdict: fh === 2 ? "match" : fh === 1 ? "partial" : "miss", decisions: ctx.decisions, state: ctx.s, rows: ctx.rows, ghostRows: ctx.ghostRows, drawn: ctx.drawn, events: histEvents.length };
    G.historyDone = true; G.liveMoney = null;
    const last = ctx.rows[ctx.rows.length - 1];
    if (last) show({ q: last.q, rep: { events: [] }, mr: { avail: last.avail, reserve: last.reserve, downtime: last.downtime, drawn: 0 }, hits: [] });
    U.$("s-history").innerHTML = `<div class="step-k">Step 10 · done</div><h2>Through 2023–26, your factory stopped for ${Math.round(yours)} days.</h2>
      <div class="kpis">${U.kpi("You", `${Math.round(yours)} days`, "factory stopped", yours < ghost ? "good" : "bad")}${U.kpi("No stockpile", `${Math.round(ghost)} days`, "factory stopped", "bad")}</div>
      <p class="lead">Your stockpile supplied <b>${Math.round(ctx.drawn)} days</b> of material when imports fell short.</p>`;
    Guide.log(10, "History replayed", [{ k: "Days stopped", delta: yours, unit: "", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "With no stockpile", delta: ghost, unit: "", goodIfDown: true, fmt: (v) => Math.round(v) }]);
    U.nav(); U.hud();
    document.getElementById("hud-money").textContent = U.fmt$(ctx.s.budget);
  }

  /** Results step: what happened, did the analysis predict it, and what the real US did. */
  function results(G) {
    const U = root.UI, h = G.history, k = G.mission.id;
    const names = G.faults.map((i) => U.shortName(G.model.nodes[i].label)).join(" + ");
    const real = (EXT.responses || []).filter((x) => (x.minerals || []).includes(k) && /stockpile|offtake|price-floor|equity|loan|deal/.test(x.type || "")).slice(0, 3);
    U.$("s-results").innerHTML = `<div class="step-k">Step 11</div><h2>How your plan held up, 2023–26</h2>
      <div class="kpis">${U.kpi("Factory stopped", `${Math.round(h.yours)} days`, "with your plan", h.yours < h.ghost ? "good" : "bad")}${U.kpi("Without a stockpile", `${Math.round(h.ghost)} days`, "same events", "bad")}${U.kpi("Stockpile used", `${Math.round(h.drawn)} days`, "of material", "ore")}${U.kpi("Money spent", U.fmt$(h.state.spent), "")}</div>
      <svg class="timeline" id="tl" role="img" aria-label="Stockpile and stoppages over time"></svg>
      <p style="margin-top:12px"><span class="verdict ${h.verdict === "match" ? "good" : h.verdict === "partial" ? "mid" : "bad"}">${h.verdict === "match" ? "✓ Your weak spots were the ones history hit" : h.verdict === "partial" ? "Your weak spots partly matched history" : "History hit different suppliers"}</span> <span class="faint">Weak spots you found: ${U.esc(names)}.</span></p>
      ${real.length ? `<h3 style="margin-top:16px">What the real US did for ${U.esc(G.mission.name.toLowerCase())}</h3><ul class="faint" style="margin-top:4px">${real.map((x) => `<li><b style="color:var(--ink-2)">${U.esc(x.date)} · ${U.esc(x.actor)}</b>: ${U.esc(String(x.summary).slice(0, 170))} <a href="${U.esc(x.source)}" target="_blank" rel="noopener">source</a></li>`).join("")}</ul>` : ""}`;
    timeline(U.$("tl"), h);
  }

  function timeline(svg, h) {
    const W = 900, H = 200, L = 46, R = 12, T = 18, B = 26, n = QUARTERS.length, x = (i) => L + ((i + 0.5) / n) * (W - L - R);
    const max = Math.max(60, ...h.rows.map((r) => r.reserve)) * 1.15, yMid = 120, y = (v) => yMid - (v / max) * (yMid - T), bh = (d) => Math.min(48, (d / 91) * 48);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `<text x="${L}" y="${T - 6}">Days of supply in your stockpile</text>
      <polyline points="${h.rows.map((r, i) => `${x(i)},${y(r.reserve)}`).join(" ")}" fill="none" stroke="#E08A52" stroke-width="2.5"/>
      ${h.rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.reserve)}" r="4" fill="#E08A52"><title>${r.q}: ${Math.round(r.reserve)} days stored</title></circle>`).join("")}
      <line x1="${L}" x2="${W - R}" y1="${yMid}" y2="${yMid}" stroke="rgba(148,163,184,.25)"/>
      <text x="${L}" y="${yMid + 14}">Days the factory stopped: you (solid) vs no stockpile (dashed)</text>
      ${h.ghostRows.map((r, i) => (r.downtime > 0.5 ? `<rect x="${x(i) - 12}" y="${yMid + 20}" width="24" height="${bh(r.downtime)}" fill="none" stroke="#FF5A4E" stroke-dasharray="3 3" rx="3"/>` : "")).join("")}
      ${h.rows.map((r, i) => (r.downtime > 0.5 ? `<rect x="${x(i) - 8}" y="${yMid + 20}" width="16" height="${bh(r.downtime)}" fill="#FF5A4E" rx="3"/>` : "")).join("")}
      ${QUARTERS.map((q, i) => (i % 2 === 0 ? `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${q.slice(2, 4)}Q${q.slice(5)}</text>` : "")).join("")}`;
  }

  root.Replay = { start, results };
})(window);
