/* Stockpile Strategist — Analyst mode controller.
 * All six minerals, quarter by quarter, with a coach bar, live impact previews, real prices,
 * real-world counterparts and a decision ledger. Engines: ../sim.js, ../montecarlo.js, ../v4/rst.js. */
(function () {
  const D = window.GAME_DATA, { QUARTERS, MINERALS, EVENTS, BACKGROUND, FORWARD, CONFIG } = D;
  const COUNTERPARTIES = D.COUNTERPARTIES, EXT = D.EXT || {};
  const KEYS = Sim.KEYS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt$ = (m) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const qLabel = (q) => `Q${q.slice(5)} ${q.slice(0, 4)}`;
  const qStart = (q) => new Date(Date.UTC(+q.slice(0, 4), (+q.slice(5) - 1) * 3, 1));
  const TILE = { gallium: "#3987e5", germanium: "#0ca30c", antimony: "#199e70", graphite: "#c98500", dysprosium: "#9085e9", cobalt: "#d55181" };
  const THR = 0.25; // analyst mode: line stops at a 25% shortfall (distance-to-disaster readout)

  let state, orders, lastReport, reports, shadowReps, sel, mapMineral, models, ledger, intelTab, coachDone;

  // ---------- setup ----------
  function reset(intro = true) {
    state = Sim.newState();
    orders = { buy: {}, release: {}, offtakes: [] };
    lastReport = null; reports = []; ledger = []; coachDone = new Set();
    sel = sel || "dysprosium"; mapMineral = sel; intelTab = "news";
    // "If you'd done nothing" yardstick, quarter by quarter (same engine, same history).
    const s = Sim.newState(); shadowReps = [];
    while (!s.done) { Sim.applyOrders(s, {}); shadowReps.push(Sim.resolveQuarter(s)); }
    models = {}; for (const k of KEYS) models[k] = Missions.buildModel(k);
    $("game").classList.remove("hidden"); $("endscreen").classList.add("hidden");
    render();
    if (intro) showIntro();
  }

  // ---------- derived numbers ----------
  const projected = (k) => state.minerals[k].reserveDoC + (orders.buy[k] || 0) - (orders.release[k] || 0);
  const distOf = (k, days) => RST.distance(models[k].stressS, THR * 100, Missions.bufferFromDays(days));
  const orderCost = () => KEYS.reduce((c, k) => c + Sim.quoteBuy(state, k, orders.buy[k] || 0), 0) + orders.offtakes.reduce((c, id) => c + COUNTERPARTIES.find((x) => x.id === id).upfront, 0);
  const knownYears = (k) => { const t = EXT.trade && EXT.trade[k]; if (!t) return []; const y = state.done ? 9999 : +state.quarter.slice(0, 4); return t.chinaByYear.filter((r) => +r.year < y); };
  const chips = (cs) => `<span class="impacts">${cs.filter(Boolean).map((c) => {
    const d = c.delta != null ? c.delta : c.to - c.from, good = c.goodIfDown ? d < 0 : d > 0, f = c.fmt || ((v) => (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)));
    const txt = c.from != null ? `${f(c.from)}${c.unit || ""} → ${f(c.to)}${c.unit || ""}` : `${d >= 0 ? "+" : "−"}${f(Math.abs(d))}${c.unit || ""}`;
    return `<span class="impact ${Math.abs(d) < 1e-9 ? "" : good ? "up" : "down"}"><span class="ik">${esc(c.k)}</span> ${esc(txt)}</span>`;
  }).join("")}</span>`;
  const tile = (k, small) => `<span class="tile" style="--tile:${TILE[k]}${small ? ";width:30px;height:30px;font-size:12px" : ""}">${small ? "" : `<small>${MINERALS[k].symbol === "C" ? 6 : ""}</small>`}${MINERALS[k].symbol}</span>`;

  // ---------- render ----------
  function render() { renderStats(); renderCoach(); renderStrip(); renderIntel(); renderTable(); renderDetail(); renderOrders(); renderMap(); }

  function renderStats() {
    const days = Math.max(0, Math.ceil((Date.UTC(2027, 0, 10) - Date.now()) / 864e5));
    const idle = shadowReps.slice(0, state.qi).reduce((a, r) => a + r.downtime, 0);
    const c = EXT.copper;
    $("stats").innerHTML = `
      <div class="stat"><div class="k">Quarter</div><div class="v">${state.done ? "Done" : qLabel(state.quarter)}</div><div class="s">turn ${Math.min(state.qi + 1, 14)} of 14</div></div>
      <div class="stat"><div class="k">Budget</div><div class="v">${fmt$(state.budget)}</div><div class="s">of $12.00B</div></div>
      <div class="stat"><div class="k">Political capital</div><div class="v">${Math.round(state.politicalCapital)}</div><div class="pcbar"><i style="width:${state.politicalCapital}%;background:${state.politicalCapital < 40 ? "var(--danger)" : state.politicalCapital < 70 ? "var(--warn)" : "var(--ok)"}"></i></div></div>
      <div class="stat"><div class="k">Industry downtime</div><div class="v">${Math.round(state.downtimeDays)} d</div><div class="s">${Math.round(idle)} d if you'd done nothing</div></div>
      ${c && c.value != null ? `<div class="stat" title="Tradeverifyd tia_commodity_price"><div class="k">Copper</div><div class="v" style="font-size:13px">${esc(Number(c.value).toFixed(2))} ${esc(c.unit || "")}</div><div class="s">Tradeverifyd · ${esc(c.date || "")}</div></div>` : ""}
      <div class="stat"><div class="k">Cliff</div><div class="v" style="font-size:13px">10 Jan 2027</div><div class="s">${days} days away</div></div>`;
    $("ledger-n").textContent = ledger.length;
  }

  function renderCoach() {
    if (state.done) { $("coach").innerHTML = ""; return; }
    const any = KEYS.some((k) => orders.buy[k] || orders.release[k]) || orders.offtakes.length;
    if (any) coachDone.add("orders");
    const steps = [
      { id: "read", label: "Read the intel", hint: "Skim what was knowable before this quarter: Tavily news, what governments were doing, and the timeline so far." },
      { id: "pick", label: "Inspect a mineral", hint: "Click a mineral row. The detail panel shows real prices against the model, its supply risk, and your order controls." },
      { id: "orders", label: "Set orders", hint: "Drag Buy or Release. The preview shows the cost, the price your buying causes, and the change in distance to disaster before you commit." },
      { id: "commit", label: "Commit the quarter", hint: "Press Commit (or Enter). The real event for this quarter fires, and you'll see what it did to each mineral and what the real world did." },
    ];
    const cur = steps.find((s) => !coachDone.has(s.id)) || steps[3];
    $("coach").innerHTML = `<div><div class="k">${qLabel(state.quarter)} · decide, then reality strikes</div><div class="hint"><b>Step ${steps.indexOf(cur) + 1}/4:</b> ${esc(cur.hint)}</div></div>
      <ol>${steps.map((s) => `<li class="${coachDone.has(s.id) ? "done" : s === cur ? "cur" : ""}">${coachDone.has(s.id) ? "✓ " : ""}${esc(s.label)}</li>`).join("")}</ol>`;
  }
  const tick = (id) => { if (!coachDone.has(id)) { coachDone.add(id); renderCoach(); } };

  function renderStrip() {
    $("tstrip").innerHTML = QUARTERS.map((q, i) => {
      const past = i < state.qi, r = reports[i];
      const cls = past ? `past ${r && r.downtime > 0.5 ? "hit" : "ok"}` : i === state.qi && !state.done ? "cur" : "";
      const ev = past && EVENTS.some((e) => e.quarter === q && !e.narrativeOnly);
      return `<button class="${cls}" data-q="${i}" ${past ? "" : "disabled"} title="${past ? `${qLabel(q)}: ${Math.round(r.downtime)} days of downtime · click to review` : qLabel(q)}">${ev ? '<span class="ev"></span>' : ""}${q.slice(2, 4)}Q${q.slice(5)}${past ? `<br>${r.downtime > 0.5 ? Math.round(r.downtime) + "d" : "✓"}` : ""}</button>`;
    }).join("");
    $("tstrip").querySelectorAll("button[data-q]").forEach((b) => { if (!b.disabled) b.onclick = () => showReveal(reports[+b.dataset.q]); });
  }

  function renderIntel() {
    if (state.done) { $("intel").innerHTML = ""; return; }
    const start = qStart(state.quarter), q = state.quarter;
    const brief = (EXT.intel || {})[q];
    const world = (EXT.responses || []).filter((r) => QUARTERS.indexOf(r.quarter) >= 0 && QUARTERS.indexOf(r.quarter) < state.qi).slice(-8).reverse();
    const prior = EVENTS.filter((e) => new Date(e.date) < start).slice(-6).reverse();
    const body = {
      news: brief && brief.items && brief.items.length ? brief.items.map((i) => `<div class="intel-item news"><div class="d">${esc(i.date)} · <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.source || domain(i.url))}</a></div><b>${esc(i.title)}</b>${i.summary ? `<div class="sum">${esc(i.summary)}</div>` : ""}</div>`).join("") : `<div class="faint">No cached Tavily briefing for this quarter.</div>`,
      world: world.length ? world.map((r) => `<div class="intel-item world"><div class="d">${esc(r.date)} · ${esc(r.actor)}</div>${esc(r.summary)} ${r.amountUSD ? `<span class="chip">${fmt$(r.amountUSD / 1e6)}</span>` : ""} <a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(domain(r.source))}</a></div>`).join("") : `<div class="faint">Nothing yet. Early on, Western responses were rules and grants rather than purchases.</div>`,
      timeline: (prior.length ? prior : []).map((e) => `<div class="intel-item timeline"><div class="d">${e.date} · ${esc(e.actor)}</div>${esc(e.headline)}</div>`).join("") + (prior.length < 2 ? BACKGROUND.map((b) => `<div class="intel-item"><div class="d">${b.date} · background</div>${esc(b.text)}</div>`).join("") : ""),
    };
    $("intel").innerHTML = `<h2>Intel briefing</h2><p class="qtitle">${qLabel(q)}</p>
      <div class="faint">Only what was knowable before ${start.toISOString().slice(0, 10)}.</div>
      <div class="tabs" role="tablist">${[["news", `News (${brief && brief.items ? brief.items.length : 0})`], ["world", `Real world (${world.length})`], ["timeline", "Timeline"]].map(([id, l]) => `<button role="tab" aria-pressed="${intelTab === id}" data-tab="${id}">${l}</button>`).join("")}</div>
      ${intelTab === "news" ? `<div class="faint">Tavily, ${esc(brief && brief.window ? brief.window.join(" → ") : "")}</div>` : intelTab === "world" ? `<div class="faint">What governments and industry had already done (Tavily-sourced). Compare your moves.</div>` : ""}
      ${body[intelTab]}
      <button class="ghost" style="width:100%;margin-top:8px" id="btn-read">✓ Got it, on to orders</button>
      ${lastReport ? `<button class="ghost" style="width:100%;margin-top:6px" id="btn-lastq">Review ${qLabel(lastReport.quarter)}</button>` : ""}`;
    $("intel").querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { intelTab = b.dataset.tab; tick("read"); renderIntel(); }));
    $("btn-read").onclick = () => { tick("read"); document.querySelector(".mtable tr.row") && document.querySelector(".mtable tr.row").focus(); };
    if ($("btn-lastq")) $("btn-lastq").onclick = () => showReveal(lastReport);
  }

  function renderTable() {
    if (state.done) { $("table").innerHTML = ""; return; }
    const hit = new Set(lastReport ? lastReport.events.flatMap((e) => Object.keys(e.effects)) : []);
    $("table").innerHTML = `<h2>Your reserve · click a mineral</h2>
      <table class="mtable"><thead><tr><th>Mineral</th><th>Days of cover</th><th>Price</th><th>Imports</th><th>China share</th><th title="Distance to disaster for a 25% shortfall, using your stockpile as the buffer (not a probability)">Distance</th><th>Orders</th></tr></thead><tbody>
      ${KEYS.map((k) => {
        const m = state.minerals[k], p = MINERALS[k], proj = projected(k), d = distOf(k, proj), d0 = distOf(k, m.reserveDoC);
        const prev = m.hist.price[m.hist.price.length - 2], dp = prev ? m.priceIdx / prev - 1 : 0;
        const ys = knownYears(k), cs = ys.length ? ys[ys.length - 1] : null;
        const o = [orders.buy[k] ? `<span class="chip warn">+${orders.buy[k]} d</span>` : "", orders.release[k] ? `<span class="chip info">−${orders.release[k]} d</span>` : "", ...orders.offtakes.filter((id) => COUNTERPARTIES.find((c) => c.id === id).mineral === k).map(() => `<span class="chip good">deal</span>`)].join(" ");
        return `<tr class="row ${k === sel ? "sel" : ""} ${hit.has(k) ? "hit" : ""}" data-k="${k}" tabindex="0" aria-label="${p.name}">
          <td><div class="mname">${tile(k)}<div><b>${p.name}</b><span>${esc(p.uses.split(",")[0])}</span></div></div></td>
          <td><div class="cell-big">${proj.toFixed(0)}${proj !== m.reserveDoC ? ` <span class="faint">(now ${m.reserveDoC.toFixed(0)})</span>` : ""}</div><div class="docbar"><i class="${proj !== m.reserveDoC ? "proj" : ""}" style="width:${Math.min(100, (proj / 120) * 100)}%"></i><b style="left:50%" title="60 days"></b></div></td>
          <td><span class="cell-big">${m.priceIdx.toFixed(0)}</span> <span class="${dp > 0.005 ? "up" : dp < -0.005 ? "down" : "faint"}">${dp ? (dp > 0 ? "▲" : "▼") + Math.abs(dp * 100).toFixed(0) + "%" : ""}</span></td>
          <td class="${m.importAvail < 0.85 ? "up" : ""}"><span class="cell-big">${pct(m.importAvail)}</span>${m.cutNet > 0.02 ? `<div class="faint">controls ${pct(m.cutNet)}</div>` : ""}</td>
          <td>${cs ? `<span class="cell-big">${pct(cs.share)}</span><div class="faint">${cs.year} Comtrade</div>` : `<span class="faint">—</span>`}</td>
          <td><span class="cell-big">${d.toFixed(1)}σ</span> <span class="band band-${RST.band(d)}">${RST.band(d)}</span>${Math.abs(d - d0) > 0.01 ? `<div class="faint">${d > d0 ? "+" : ""}${(d - d0).toFixed(2)}σ from orders</div>` : ""}</td>
          <td>${o || '<span class="faint">—</span>'}</td></tr>`;
      }).join("")}</tbody></table>`;
    $("table").querySelectorAll("tr.row").forEach((tr) => {
      const go = () => { sel = tr.dataset.k; mapMineral = sel; tick("pick"); renderTable(); renderDetail(); renderMap(); };
      tr.onclick = go; tr.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
  }

  // ---------- detail panel: charts + order controls + live preview ----------
  function priceChart(k) {
    const m = state.minerals[k], h = m.hist.price, src = m.hist.priceSrc;
    const W = 560, H = 170, L = 36, R = 10, T = 14, B = 22, n = QUARTERS.length;
    const real = ((EXT.prices || {})[k] || {}).index || [];
    const realKnown = real.filter((p) => { const i = QUARTERS.indexOf(p.quarter); return (i >= 0 && i < state.qi) || p.quarter === "2023Q2"; });
    const max = Math.max(160, ...h, ...realKnown.map((p) => p.value)) * 1.08;
    const X = (i) => L + (i / n) * (W - L - R), Y = (v) => T + (1 - v / max) * (H - T - B);
    const xr = (q) => (q === "2023Q2" ? X(0) : X(QUARTERS.indexOf(q) + 1));
    let segs = ""; for (let i = 1; i < h.length; i++) segs += `<line x1="${X(i - 1)}" y1="${Y(h[i - 1])}" x2="${X(i)}" y2="${Y(h[i])}" stroke="#AEB6C4" stroke-width="2" ${src[i] === "reported" ? "" : 'stroke-dasharray="4 3"'}/>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${MINERALS[k].name} price: model vs real">
      <line x1="${L}" x2="${W - R}" y1="${Y(100)}" y2="${Y(100)}" stroke="rgba(148,163,184,.25)" stroke-dasharray="2 4"/><text x="${L - 4}" y="${Y(100) + 3}" text-anchor="end">100</text>
      ${segs}${h.map((v, i) => (i ? `<circle cx="${X(i)}" cy="${Y(v)}" r="3" fill="${src[i] === "reported" ? "#AEB6C4" : "#0B0F17"}" stroke="#AEB6C4" stroke-width="1.3"><title>${QUARTERS[i - 1]} model ${v.toFixed(0)} (${src[i]})</title></circle>` : "")).join("")}
      ${realKnown.map((p) => `<circle cx="${xr(p.quarter)}" cy="${Y(p.value)}" r="5" fill="#E08A52" stroke="#0B0F17" stroke-width="1.5"><title>${p.quarter} real price index ${Math.round(p.value)}</title></circle>`).join("")}
      <text x="${L}" y="${H - 6}">23Q2</text><text x="${W - R}" y="${H - 6}" text-anchor="end">26Q4</text></svg>
      <div class="chart-cap">Grey line: the price you pay. It follows the real cited price path (solid = a reported quarter, dashed = interpolated between reports) plus the push from your own buying. Orange dots: real cited prices${EXT.prices && EXT.prices[k] ? ` <span title="${esc(EXT.prices[k].series || "")}">(${esc(String(EXT.prices[k].series || "").split(" (")[0].slice(0, 70))}${String(EXT.prices[k].series || "").length > 70 ? "…" : ""}, ${esc(EXT.prices[k].unit || "")})</span>` : ""}, indexed to the first point, shown only once they'd been reported.</div>`;
  }
  function reserveChart(k) {
    const m = state.minerals[k], W = 560, H = 120, L = 36, R = 10, T = 10, B = 20, n = QUARTERS.length;
    const doc = m.hist.doc, av = m.hist.avail, proj = projected(k);
    const max = Math.max(90, ...doc, proj) * 1.1;
    const X = (i) => L + (i / n) * (W - L - R), Y = (v) => T + (1 - v / max) * (H - T - B), YA = (v) => T + (1 - v) * (H - T - B);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Reserve and imports history">
      <line x1="${L}" x2="${W - R}" y1="${Y(60)}" y2="${Y(60)}" stroke="rgba(148,163,184,.3)" stroke-dasharray="3 4"/><text x="${L - 4}" y="${Y(60) + 3}" text-anchor="end">60d</text>
      <polyline points="${av.map((v, i) => `${X(i)},${YA(v)}`).join(" ")}" fill="none" stroke="#3987e5" stroke-width="1.6"/>
      <polyline points="${doc.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}" fill="none" stroke="#E08A52" stroke-width="2.4"/>
      ${proj !== m.reserveDoC ? `<line x1="${X(doc.length - 1)}" y1="${Y(m.reserveDoC)}" x2="${X(doc.length)}" y2="${Y(proj)}" stroke="#E08A52" stroke-width="2.4" stroke-dasharray="5 4"/><circle cx="${X(doc.length)}" cy="${Y(proj)}" r="4" fill="#E08A52"/>` : ""}
    </svg><div class="chart-cap"><span style="color:#E08A52">■</span> your reserve (days of cover; dashed = after this quarter's orders) · <span style="color:#3987e5">■</span> import availability (0–100%)</div>`;
  }
  function renderDetail() {
    if (state.done) { $("detail").innerHTML = ""; return; }
    const k = sel, m = state.minerals[k], p = MINERALS[k];
    const buy = orders.buy[k] || 0, rel = orders.release[k] || 0, max = Sim.maxBuy(state, k);
    const cost = Sim.quoteBuy(state, k, buy), proj = projected(k);
    const d0 = distOf(k, m.reserveDoC), d1 = distOf(k, proj);
    const priceImpact = ((p.eta * buy) / p.marketDepth) * 100 - ((p.eta * rel) / p.marketDepth / 2) * 100;
    const ys = knownYears(k);
    const deals = state.offtakes.filter((o) => o.mineral === k);
    const pending = orders.offtakes.filter((id) => COUNTERPARTIES.find((c) => c.id === id).mineral === k);
    const spread = (D.DY_SPREAD || []).filter((x) => QUARTERS.indexOf(x.knownFrom) <= state.qi);
    const latest = spread.filter((x) => x.ratio).pop();
    const model = models[k];
    $("detail").innerHTML = `<div class="detail-head"><div class="mname">${tile(k)}<div><h3>${p.name}</h3><span>${esc(p.uses)}</span></div></div>
        <div class="chips">${m.cutNet > 0.02 ? `<span class="chip bad">export controls ${pct(m.cutNet)}</span>` : `<span class="chip good">no controls</span>`}<span class="chip">imports ${pct(m.importAvail)}</span>${ys.length ? `<span class="chip">China share ${ys.map((y) => `${y.year} ${pct(y.share)}`).join(" → ")}</span>` : ""}<span class="chip ${model.synthetic ? "warn" : "info"}" title="${esc(model.caveats[0] || "")}">${model.synthetic ? "risk network: illustrative" : "risk network: measured (Sayari)"}</span></div></div>
      <div class="detail-grid">
        <div>${priceChart(k)}${reserveChart(k)}
          ${k === "dysprosium" && spread.length ? `<div class="spread"><b>Ex-China vs China price ${latest ? `<span class="up">${latest.ratio}×</span>` : ""}</b>${latest ? `<div class="r"><span>You pay</span><i style="width:100%"></i><b class="num">${m.priceIdx.toFixed(0)}</b></div><div class="r"><span>China pays</span><i style="width:${Math.max(2, 100 / latest.ratio)}%"></i><b class="num">≈${(m.priceIdx / latest.ratio).toFixed(0)}</b></div>` : ""}${spread.map((x) => `<div class="faint">${esc(x.label)} · <a href="${esc(x.source)}" target="_blank" rel="noopener">${esc(x.outlet)}</a></div>`).join("")}</div>` : ""}
        </div>
        <div>
          <div class="ctrl"><label for="buy">Buy this quarter <b>${buy} days</b></label><input type="range" id="buy" min="0" max="${max}" step="1" value="${buy}" ${max ? "" : "disabled"}>
            <div class="presets"><button data-to="60">→ 60 days</button><button data-to="90">→ 90 days</button><button data-to="max">Max (${max})</button><button data-to="0">Clear</button></div>
            <div class="faint">Cap this quarter: ${max} days (45 × import availability). Thin market: depth ${p.marketDepth}.</div></div>
          <div class="ctrl"><label for="rel">Release to industry <b>${rel} days</b></label><input type="range" id="rel" min="0" max="${Math.floor(m.reserveDoC)}" step="1" value="${rel}" ${m.reserveDoC >= 1 ? "" : "disabled"}></div>
          <div class="preview" aria-live="polite"><div class="hud-k faint">Live preview: before you commit</div>
            <div class="row"><span>Cost</span><b>${fmt$(cost)}</b></div>
            <div class="row"><span>Your buying moves next quarter's price</span><b class="${priceImpact > 0.5 ? "up" : priceImpact < -0.5 ? "down" : ""}">${priceImpact >= 0 ? "+" : ""}${priceImpact.toFixed(1)}%</b></div>
            <div class="row"><span>Days of cover</span><b>${m.reserveDoC.toFixed(0)} → ${proj.toFixed(0)}</b></div>
            <div class="row"><span>Line keeps running at a 25% shortfall</span><b>${Math.round(proj / THR)} days</b></div>
            <div class="row"><span>Distance to disaster</span><b>${d0.toFixed(2)}σ → ${d1.toFixed(2)}σ <span class="band band-${RST.band(d1)}">${RST.band(d1)}</span></b></div>
            <div class="row"><span>Budget after all orders</span><b class="${orderCost() > state.budget ? "up" : ""}">${fmt$(state.budget - orderCost())}</b></div>
            <div class="row"><span>Storage per quarter</span><b>≈${fmt$(CONFIG.storageRate * proj * p.baseCost * m.priceIdx / 100)}</b></div>
            ${buy ? `<div class="row"><span>Marginal: next 5 days</span><b>${fmt$(Sim.quoteBuy(state, k, Math.min(max, buy + 5)) - cost)}</b></div>` : ""}
          </div>
          <div style="margin-top:10px"><div class="faint">Offtakes for ${esc(p.name)}: ${deals.length ? deals.map((o) => `${esc(COUNTERPARTIES.find((c) => c.id === o.id).name)} (${o.status})`).join(", ") : "none signed"}${pending.length ? ` · ${pending.length} pending this quarter` : ""}</div>
            <button class="ghost" style="margin-top:6px;width:100%" id="btn-off-k">Sign an offtake for ${esc(p.name)}…</button></div>
        </div>
      </div>`;
    const setBuy = (v) => { orders.buy[k] = Math.max(0, Math.min(max, v)); tick("orders"); refreshLive(); };
    $("buy").oninput = (e) => setBuy(+e.target.value);
    $("rel").oninput = (e) => { orders.release[k] = +e.target.value; tick("orders"); refreshLive(); };
    $("detail").querySelectorAll("[data-to]").forEach((b) => (b.onclick = () => {
      const t = b.dataset.to;
      if (t === "max") setBuy(max); else if (t === "0") setBuy(0);
      else { let d = Math.max(0, Math.ceil(+t - m.reserveDoC + (orders.release[k] || 0))); d = Math.min(d, max); while (d > 0 && Sim.quoteBuy(state, k, d) > state.budget - orderCost() + Sim.quoteBuy(state, k, orders.buy[k] || 0)) d--; setBuy(d); }
    }));
    $("btn-off-k").onclick = () => showOfftakes(k);
  }
  /** Re-render the parts that depend on orders without rebuilding the active slider (keeps drag smooth). */
  function refreshLive() {
    const focusId = document.activeElement && document.activeElement.id;
    renderTable(); renderOrders(); renderDetail(); renderStats();
    if (focusId && $(focusId)) $(focusId).focus();
  }

  // ---------- orders panel ----------
  function renderOrders() {
    if (state.done) { $("orders").innerHTML = ""; return; }
    const cost = orderCost(), over = cost > state.budget;
    const lines = [];
    for (const k of KEYS) if (orders.buy[k]) lines.push([`Buy ${orders.buy[k]} d ${MINERALS[k].name}`, fmt$(Sim.quoteBuy(state, k, orders.buy[k]))]);
    for (const k of KEYS) if (orders.release[k]) lines.push([`Release ${orders.release[k]} d ${MINERALS[k].name}`, "—"]);
    for (const id of orders.offtakes) { const cp = COUNTERPARTIES.find((c) => c.id === id); lines.push([`Offtake: ${cp.name}`, fmt$(cp.upfront)]); }
    const dSum = KEYS.map((k) => distOf(k, projected(k)) - distOf(k, state.minerals[k].reserveDoC));
    const weakest = KEYS.map((k) => [distOf(k, projected(k)), k]).sort((a, b) => a[0] - b[0])[0];
    $("orders").innerHTML = `<h2>Orders · ${qLabel(state.quarter)}</h2>
      ${lines.length ? lines.map(([a, b]) => `<div class="order-line"><span>${esc(a)}</span><span class="num">${b}</span></div>`).join("") : `<div class="muted">No orders yet. You'll hold and save budget.</div>`}
      <div class="order-line order-total"><span>Total</span><span class="num">${fmt$(cost)}</span></div>
      <div class="order-line"><span class="muted">Budget after</span><span class="num ${over ? "up" : ""}">${fmt$(state.budget - cost)}</span></div>
      <div style="margin:8px 0">${chips([{ k: "Total σ gained", delta: dSum.reduce((a, b) => a + b, 0), unit: "σ", fmt: (v) => v.toFixed(2) }, { k: "Weakest", delta: weakest[0], unit: `σ ${MINERALS[weakest[1]].symbol}`, fmt: (v) => v.toFixed(2) }])}</div>
      <label class="toggle"><input type="checkbox" id="auto" ${state.autoRelease ? "checked" : ""}/> Auto-release reserve to cover shortfalls</label>
      <div class="row2"><button class="ghost" id="btn-off">Sign an offtake…</button></div>
      <button class="primary" id="btn-commit" ${over ? "disabled" : ""}>Commit &amp; end quarter →</button>
      ${over ? `<div class="err">Orders exceed budget.</div>` : ""}
      <div class="row2" style="margin-top:12px"><select id="ff" aria-label="Fast-forward to">${QUARTERS.slice(state.qi + 1).map((q) => `<option value="${q}">${qLabel(q)}</option>`).join("")}<option value="END">End of campaign</option></select><button class="ghost" id="btn-ff">Fast-forward</button></div>
      <div class="faint">Fast-forward plays quarters with no new orders.</div>
      ${readinessPanel()}`;
    $("auto").onchange = (e) => { state.autoRelease = e.target.checked; };
    $("btn-off").onclick = () => showOfftakes(null);
    $("btn-commit").onclick = commit;
    $("btn-ff").onclick = () => fastForward($("ff").value);
    $("orders").querySelectorAll("[data-ready]").forEach((b) => (b.onclick = () => { const k = b.dataset.ready, need = +b.dataset.need; const d = Math.min(Sim.maxBuy(state, k), Math.max(0, Math.ceil(need - state.minerals[k].reserveDoC))); orders.buy[k] = d; sel = k; tick("orders"); refreshLive(); }));
  }
  let readyCache = { key: null, rec: null };
  function readinessPanel() {
    if (state.qi < QUARTERS.indexOf("2026Q2")) return "";
    const key = state.qi + "|" + state.offtakes.map((o) => o.id + o.status).join(",");
    if (readyCache.key !== key) { const probe = Sim.clone(state); probe.qi = QUARTERS.length; const rec = {}; for (const k of KEYS) rec[k] = MonteCarlo.recommend(probe, k, { signal: 0, paths: 200 }); readyCache = { key, rec }; }
    const rec = readyCache.rec;
    return `<div class="ready"><h2>Prepare for 2027</h2><div class="faint">${QUARTERS.length - state.qi} turn(s) left. Target: ≥ 60 days in 90% of simulated 2027 futures (neutral news).</div>
      <table><thead><tr><th>Mineral</th><th>Have</th><th>Need</th><th></th></tr></thead><tbody>
      ${KEYS.map((k) => { const have = projected(k), need = rec[k]; return `<tr><td>${MINERALS[k].name}</td><td class="num">${have.toFixed(0)}</td><td class="num">${need == null ? ">2000" : need}</td><td>${need != null && have >= need ? '<span class="chip good">ready</span>' : need != null ? `<button data-ready="${k}" data-need="${need}">+${Math.ceil(need - have)}</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`;
  }

  // ---------- map ----------
  function renderMap() {
    const el = $("mapwrap");
    if (state.done) { el.innerHTML = ""; return; }
    const t0 = EXT.trade && EXT.trade[mapMineral];
    let shares = [], year = null;
    if (t0) { const ys = knownYears(mapMineral).map((r) => r.year); year = ys.length ? ys[ys.length - 1] : Object.keys(t0.sharesByYear || {}).sort()[0]; shares = (t0.sharesByYear && t0.sharesByYear[year]) || t0.shares; }
    const pins = COUNTERPARTIES.filter((c) => c.mineral === mapMineral).map((c) => ({ country: c.country, label: `${c.name} (${c.country})`, bad: (c.flags || []).length > 0 || c.ownerChina }));
    el.innerHTML = `<div class="map-head"><h2 style="margin:0">Where US imports come from</h2><div class="tabs">${KEYS.map((k) => `<button data-map="${k}" class="${k === mapMineral ? "on" : ""}">${MINERALS[k].name}</button>`).join("")}</div></div>
      <div id="mapsvg"></div>
      <div class="map-legend"><span><i style="background:var(--ore)"></i>share of US imports (${esc(year || "—")}${year && knownYears(mapMineral).length ? "" : ", baseline"})</span><span><i style="border:2px solid var(--danger)"></i>China</span><span><i style="background:var(--info)"></i>offtake candidate</span><span><i style="background:var(--warn)"></i>flagged candidate</span></div>
      <div class="faint">${t0 ? esc(t0.sourceLabel) : "No cached trade data."}</div>`;
    el.querySelectorAll("[data-map]").forEach((b) => (b.onclick = () => { mapMineral = b.dataset.map; renderMap(); }));
    SupplyMap.render($("mapsvg"), { shares, pins, disruptions: EXT.disruptions || [] });
  }

  // ---------- turn resolution ----------
  function snapshot() { return { budget: state.budget, d: Object.fromEntries(KEYS.map((k) => [k, distOf(k, state.minerals[k].reserveDoC)])), down: state.downtimeDays, pc: state.politicalCapital }; }
  function commit() {
    const before = snapshot(), q = state.quarter;
    const summary = [...KEYS.filter((k) => orders.buy[k]).map((k) => `+${orders.buy[k]}d ${MINERALS[k].symbol}`), ...KEYS.filter((k) => orders.release[k]).map((k) => `−${orders.release[k]}d ${MINERALS[k].symbol}`), ...orders.offtakes.map((id) => COUNTERPARTIES.find((c) => c.id === id).name)].join(", ") || "Hold";
    const res = Sim.applyOrders(state, orders);
    if (!res.ok) { alert(res.errs.join("\n")); return; }
    lastReport = Sim.resolveQuarter(state); reports.push(lastReport);
    const after = snapshot(), idle = shadowReps[QUARTERS.indexOf(q)];
    ledger.push({ q, label: summary, changes: [{ k: "Downtime", delta: lastReport.downtime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "Doing nothing", delta: idle.downtime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "Budget", delta: after.budget - before.budget, unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Political capital", delta: after.pc - before.pc, unit: "", fmt: (v) => Math.round(v) }] });
    orders = { buy: {}, release: {}, offtakes: [] };
    coachDone = new Set();
    render();
    showReveal(lastReport);
  }
  function fastForward(target) {
    const stop = target === "END" ? QUARTERS.length : QUARTERS.indexOf(target);
    let first = true;
    while (!state.done && state.qi < stop) {
      if (first) { const r = Sim.applyOrders(state, orders); if (!r.ok) { alert(r.errs.join("\n")); return; } } else Sim.applyOrders(state, {});
      const q = state.quarter;
      lastReport = Sim.resolveQuarter(state); reports.push(lastReport);
      ledger.push({ q, label: first ? "Orders, then fast-forward" : "Fast-forward (hold)", changes: [{ k: "Downtime", delta: lastReport.downtime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }] });
      orders = { buy: {}, release: {}, offtakes: [] }; first = false;
    }
    coachDone = new Set();
    render();
    if (state.done) showEnd();
  }

  function showReveal(rep) {
    const qi = QUARTERS.indexOf(rep.quarter), idle = shadowReps[qi];
    const world = (EXT.responses || []).filter((r) => r.quarter === rep.quarter).slice(0, 4);
    const verdict = idle.downtime < 0.5 && rep.downtime < 0.5 ? ["info", "No downtime this quarter, and none if you'd done nothing either."]
      : rep.downtime < idle.downtime - 0.5 ? ["good", `Your reserve spared industry <b>${Math.round(idle.downtime - rep.downtime)} days</b> of downtime (doing nothing: ${Math.round(idle.downtime)}; you: ${Math.round(rep.downtime)}).`]
      : ["bad", `Industry lost <b>${Math.round(rep.downtime)} days</b> this quarter (doing nothing: ${Math.round(idle.downtime)}).`];
    const Q = 91.25;
    modal(`<div class="modal-head"><div><div class="kicker">Reality strikes · what actually happened</div><h3>${qLabel(rep.quarter)}</h3></div><button class="ghost" id="btn-x">Close</button></div>
      ${rep.events.length ? rep.events.map((e) => `<div class="event-card"><div class="meta">${e.date} · ${esc(e.actor)}</div><div class="headline">${esc(e.headline)}</div>
        <div class="chips">${Object.entries(e.effects).map(([k, f]) => `<span class="chip">${MINERALS[k].name}</span>${f.cut != null ? `<span class="chip bad">cut ${pct(f.cut)}${(f.targetFactor ?? 1) < 1 ? " · licensing" : " · targets US"}</span>` : ""}${f.setCut != null ? `<span class="chip warn">regime → ${pct(f.setCut)}</span>` : ""}${f.relief != null ? `<span class="chip good">relief ${pct(f.relief)}</span>` : ""}${D.REAL_PRICE && D.REAL_PRICE[k] ? `<span class="chip info" title="Prices follow cited real prices; this event's assumed multiplier is not used">price: real ${esc((EXT.prices[k] || {}).series ? "Fastmarkets" : "")} path</span>` : f.priceMult != null ? `<span class="chip ${f.priceSrc === "reported" ? "info" : ""}">price ×${f.priceMult.toFixed(2)} · ${f.priceSrc === "reported" ? "reported" : "assumed"}</span>` : ""}`).join("")}</div>
        <div class="lesson">${esc(e.lesson)}</div><div class="faint">Sources: ${e.sources.map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(domain(s))}</a>`).join(" · ")}</div></div>`).join("") : `<div class="event-card" style="border-left-color:var(--line-2);background:transparent"><div class="headline">No new controls this quarter.</div><div class="lesson">Existing controls still bite while rerouting fills part of the gap.</div></div>`}
      ${world.length ? `<div class="world-card"><h4>What the real world did this quarter</h4>${world.map((r) => `<div><b>${esc(r.actor)}</b> · ${esc(r.date)}: ${esc(r.summary)} ${r.amountUSD ? `<span class="chip">${fmt$(r.amountUSD / 1e6)}</span>` : ""} <a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(domain(r.source))}</a></div>`).join("")}</div>` : ""}
      <div class="verdict ${verdict[0]}">${verdict[1]}</div>
      <h2 style="margin-top:14px">Where each mineral's supply came from this quarter</h2>
      <table class="data"><thead><tr><th>Mineral</th><th>Supply mix</th><th>Price</th><th>Imports</th><th>Drawn</th><th>Unmet</th><th>Downtime</th><th>Reserve</th></tr></thead><tbody>
      ${KEYS.map((k) => { const r = rep.minerals[k], d = r.priceTo / r.priceFrom - 1, imp = Math.min(Q, r.avail * Q), off = Math.min(Q - imp, r.offtake || 0), dr = Math.min(Q - imp - off, r.drawn || 0), gap = Math.max(0, Q - imp - off - dr);
        const seg = (v, c) => (v > 0.3 ? `<span style="width:${(v / Q) * 100}%;background:${c}"></span>` : "");
        return `<tr><td>${MINERALS[k].name}</td><td><div class="wf" title="blue imports · green offtakes · orange reserve · red unmet">${seg(imp, "#3987e5")}${seg(off, "#5fc08f")}${seg(dr, "#E08A52")}${seg(gap, "#FF5A4E")}</div></td>
          <td>${r.priceFrom.toFixed(0)}→${r.priceTo.toFixed(0)} <span class="${d > 0.005 ? "up" : d < -0.005 ? "down" : "faint"}">${d >= 0 ? "+" : ""}${(d * 100).toFixed(0)}%</span></td><td>${pct(r.avail)}</td><td>${r.drawn ? r.drawn.toFixed(0) : "—"}</td>
          <td class="${r.shortfallDays > 0.5 ? "up" : ""}">${r.shortfallDays > 0.5 ? r.shortfallDays.toFixed(0) : "—"}</td><td class="${r.downtime > 0.5 ? "up" : ""}">${r.downtime > 0.5 ? r.downtime.toFixed(0) : "—"}</td><td>${r.reserve.toFixed(0)}</td></tr>`; }).join("")}
      </tbody></table>
      <div class="faint" style="margin-top:6px">Supply mix bar: <span style="color:#3987e5">imports</span> · <span style="color:#5fc08f">offtakes</span> · <span style="color:#E08A52">drawn from your reserve</span> · <span style="color:#FF5A4E">unmet (idles factories)</span>. Storage ${fmt$(rep.storage)} · political capital ${rep.pcDelta >= 0 ? "+" : ""}${rep.pcDelta.toFixed(0)}.</div>
      ${rep.offtakeNotes.length ? `<div class="section">${rep.offtakeNotes.map((n) => `<div class="order-line">⇄ ${esc(n)}</div>`).join("")}</div>` : ""}
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="primary" id="btn-continue">${state.done && rep === reports[reports.length - 1] ? "See final results →" : rep === lastReport ? `Continue to ${qLabel(state.quarter)} →` : "Close"}</button></div>`);
    $("btn-continue").onclick = closeModal; $("btn-x").onclick = closeModal;
  }

  function showOfftakes(only) {
    const signed = new Set([...state.offtakes.map((o) => o.id), ...orders.offtakes]);
    const list = COUNTERPARTIES.filter((c) => !only || c.mineral === only).sort((a, b) => a.upfront / a.docPerQ - b.upfront / b.docPerQ);
    modal(`<div class="modal-head"><div><div class="kicker">Offtake deals${only ? ` · ${MINERALS[only].name}` : ""}</div><h3>Sign with a real producer</h3></div><button class="ghost" id="btn-x">Close</button></div>
      <div class="banner">${EXT.vetted ? `Vetted with <b>Sayari</b> (owners, watchlist, risk factors) and <b>Tradeverifyd</b> (entity score), cached ${esc(EXT.vettedFetched || "")}. Flags are findings, not allegations. Deal terms are game calibrations.` : "Illustrative counterparties."}</div>
      <div class="faint" style="margin-bottom:10px">Cheapest per day of supply first. China-owned "alternatives" stay exposed to Chinese controls. Deliveries start after the lag and slip 20% per quarter.</div>
      ${list.map((cp) => { const flagged = (cp.flags || []).length || cp.ownerChina, v = cp.vetting, taken = signed.has(cp.id);
        const gainDays = cp.docPerQ, dNow = distOf(cp.mineral, projected(cp.mineral));
        return `<div class="cp ${flagged ? "flagged" : ""}"><div>
          <div class="chips" style="align-items:center"><b style="font-size:14px">${esc(cp.name)}</b><span class="chip">${MINERALS[cp.mineral].name}</span><span class="chip">${esc(cp.country)}</span></div>
          <div class="facts"><span>Owner: ${esc(cp.owner)}</span><span>Upfront ${fmt$(cp.upfront)}</span><span>${gainDays} d/quarter</span><span>Lag ${cp.lag[0]}–${cp.lag[1]}q</span><span>${fmt$(cp.upfront / cp.docPerQ)} per d/q</span></div>
          <div class="chips" style="margin-top:6px">${(cp.flags || []).map((f) => `<span class="chip ${["owner", "labour", "sanctions"].includes(f.kind) ? "bad" : "warn"}" title="${esc(f.why || "")}">${esc(f.label)}</span>`).join("") || `<span class="chip good">no flags returned</span>`}</div>
          ${v ? `<div class="vet">Sayari ${v.sayariId ? `<code>${esc(v.sayariId)}</code>` : "—"} · Tradeverifyd score ${cp.score != null ? esc(cp.score) : "—"}${v.statusNote ? ` · ${esc(v.statusNote)}` : ""}${v.linkCaveat ? ` · Caveat: ${esc(v.linkCaveat)}` : ""}</div>` : ""}
          <div class="faint" style="margin-top:4px">${cp.ownerChina || cp.upstreamChina ? "Under a China-led shock this deal delivers little or nothing." : `Once delivering, adds ${gainDays} days of supply each quarter (≈ ${Math.round((gainDays / 91.25) * 100)}% of demand). ${MINERALS[cp.mineral].name} is at ${dNow.toFixed(1)}σ today.`}</div></div>
          <div><button data-cp="${cp.id}" ${taken || cp.upfront > state.budget - orderCost() ? "disabled" : ""}>${taken ? "Signed" : "Add to orders"}</button></div></div>`; }).join("")}`);
    $("btn-x").onclick = closeModal;
    $("modal").querySelectorAll("[data-cp]").forEach((b) => (b.onclick = () => {
      const cp = COUNTERPARTIES.find((c) => c.id === b.dataset.cp);
      if ((cp.flags || []).length || cp.ownerChina) {
        const why = [cp.ownerChina ? "• Sayari shows a China-based owner: deliveries are cut when Chinese controls bite." : "", ...(cp.flags || []).map((f) => `• ${f.label}${f.why ? ` (${f.why})` : ""}${f.blockP ? `: ${pct(f.blockP)}/quarter block risk` : ""}${f.pcPenalty ? `, −${f.pcPenalty} political capital` : ""}`)].filter(Boolean).join("\n");
        if (!confirm(`${cp.name}\n\n${why}\n\nSign anyway?`)) return;
      }
      orders.offtakes.push(cp.id); tick("orders"); closeModal(); refreshLive();
    }));
  }

  function showLedger() {
    modal(`<div class="modal-head"><div><div class="kicker">Decision ledger</div><h3>What each decision did</h3></div><button class="ghost" id="btn-x">Close</button></div>
      <p class="faint">Each committed quarter: what you ordered, and the measured effect against the same quarter with no defences.</p>
      ${ledger.length ? `<ul class="ledger">${ledger.map((e) => `<li><b>${qLabel(e.q)} · ${esc(e.label)}</b> ${chips(e.changes)}</li>`).join("")}</ul>` : "<p>No decisions yet.</p>"}
      <h2 class="section">Consequences log</h2><div style="max-height:260px;overflow:auto">${[...state.log].reverse().map((r) => `<div class="order-line"><span class="faint num">${r.q}</span><span style="flex:1;margin-left:8px">${esc(r.text)}</span></div>`).join("") || '<div class="faint">Nothing yet.</div>'}</div>`);
    $("btn-x").onclick = closeModal;
  }

  function showIntro() {
    modal(`<div class="kicker">Analyst mode · 1 July 2023</div><h3 style="font-size:26px;margin:6px 0 10px">Run all six minerals, quarter by quarter.</h3>
      <p class="muted">$12B (the size of Project Vault), 14 quarters of real history, then 1,000 simulated futures past the 10 Jan 2027 cliff.</p>
      <ol class="muted" style="line-height:1.8"><li><b>Read the intel</b>: real Tavily news from before each quarter, plus what governments had already done.</li>
        <li><b>Click a mineral</b>: real prices vs the model, China's share, and your distance to disaster.</li>
        <li><b>Drag Buy / Release</b>: the live preview shows the cost, the price you move, and the σ gained, before you commit.</li>
        <li><b>Commit</b>: the real event fires. See where every mineral's supply came from, and what the real world did.</li></ol>
      <div class="banner">The strip under the coach bar is your history. Click any past quarter to review it. Your decisions and their effects build up in <b>Decisions</b>.</div>
      <div style="display:flex;justify-content:flex-end;gap:8px"><a class="ghost" href="../v4/" style="text-decoration:none">Story mode instead</a><button class="primary" id="btn-start">Start →</button></div>`);
    $("btn-start").onclick = closeModal;
  }

  function showAbout() {
    const nIntel = EXT.intel ? Object.values(EXT.intel).reduce((a, b) => a + (b.items || []).length, 0) : 0;
    const li = (ok, t) => `<li><span class="chip ${ok ? "good" : ""}">${ok ? "cached" : "missing"}</span> ${t}</li>`;
    modal(`<div class="modal-head"><div><div class="kicker">About the data</div><h3>What's real, what's assumed</h3></div><button class="ghost" id="btn-x">Close</button></div>
      <ul style="line-height:1.7">
        ${li(!!EXT.intel, `<b>Tavily</b>: ${nIntel} dated news items, from the 90 days before each quarter.`)}
        ${li(!!EXT.responses, `<b>Tavily</b>: ${(EXT.responses || []).length} real government and industry actions, 2023–26 (DLA buys, DoD price floors, JOGMEC, EU), shown only once they'd happened.`)}
        ${li(!!EXT.prices, `<b>Tavily</b>: ${Object.values(EXT.prices || {}).reduce((a, p) => a + (p.points || []).length, 0)} cited real price points (Fastmarkets, Argus, Benchmark). <b>History prices follow these real paths</b> (gaps interpolated and flagged); your own buying still moves the price on top. Dysprosium uses the ex-China price a Western reserve pays.`)}
        ${li(!!EXT.trade, `<b>Tradeverifyd</b>: UN Comtrade US imports (China share, map); <b>Sayari</b> supplier facets.`)}
        ${li(!!EXT.vetted, `<b>Sayari + Tradeverifyd</b>: ${COUNTERPARTIES.length} real producers vetted for ownership and risk flags.`)}
        ${li(!!(window.CACHE && window.CACHE.network), `<b>Sayari</b> supply networks: ${Object.keys((window.CACHE || {}).network || {}).join(", ")}. These drive each mineral's distance to disaster; non-antimony networks are illustrative.`)}
      </ul>
      <p class="faint">Distance to disaster = (25% shortfall + your stockpile buffer) / √(1ᵀΣ1) under the export-control regime, as in story mode. It's not a probability. Engine assumptions are tunable in <code>site/data.js</code>. Event sizes are tagged reported or assumed.</p>`);
    $("btn-x").onclick = closeModal;
  }

  // ---------- end screen + live forward mode ----------
  function showEnd() {
    const bench = Sim.benchmarks(), you = Sim.score(state, bench.worst);
    $("game").classList.add("hidden");
    const el = $("endscreen"); el.classList.remove("hidden");
    const rows = [["You", state, you, "you"], ...Object.values(bench.scored).map((b) => [b.label, b.state, b.score])].sort((a, b) => b[2].total - a[2].total);
    const sig0 = EXT.signal ? EXT.signal.value : 0;
    el.innerHTML = `<div class="panel"><div class="kicker">Campaign complete · Q3 2023 → Q4 2026</div>
      <div class="hero" style="margin-top:8px"><div><div class="bigscore">${you.total.toFixed(0)}</div><div class="muted">out of 100</div></div>
        <div class="parts"><div class="part"><div class="k">Cover (40)</div><div class="v">${you.parts.cover.toFixed(1)}</div><div class="faint">avg weakest-mineral ${you.avgMinDoc.toFixed(0)}/60 d</div></div>
          <div class="part"><div class="k">Downtime avoided (30)</div><div class="v">${you.parts.downtime.toFixed(1)}</div><div class="faint">${Math.round(state.downtimeDays)} d vs ${Math.round(bench.worst)} d idle</div></div>
          <div class="part"><div class="k">Efficiency (15)</div><div class="v">${you.parts.efficiency.toFixed(1)}</div><div class="faint">${fmt$(state.spent)} spent</div></div>
          <div class="part"><div class="k">Political capital (15)</div><div class="v">${you.parts.political.toFixed(1)}</div><div class="faint">${Math.round(state.politicalCapital)}/100</div></div></div></div>
      <h2 class="section">Against benchmark strategies (same engine, same history)</h2>
      <table class="data"><thead><tr><th>Strategy</th><th>Score</th><th>Cover</th><th>Downtime</th><th>Efficiency</th><th>Pol. cap.</th><th>Days lost</th><th>Spent</th></tr></thead><tbody>
      ${rows.map(([l, st, sc, cls]) => `<tr class="${cls || ""}"><td>${l}</td><td>${sc.total.toFixed(1)}</td><td>${sc.parts.cover.toFixed(1)}</td><td>${sc.parts.downtime.toFixed(1)}</td><td>${sc.parts.efficiency.toFixed(1)}</td><td>${sc.parts.political.toFixed(1)}</td><td>${Math.round(st.downtimeDays)}</td><td>${fmt$(st.spent)}</td></tr>`).join("")}</tbody></table>
      <div class="section"><button class="ghost" id="btn-led2">Review your decisions</button></div></div>
      <div class="panel section"><div class="kicker">Forward mode · 2027</div><h3 style="font-size:22px;margin:4px 0">The 10 January 2027 cliff, live</h3>
        <p class="muted" style="margin-top:0">Every slider re-runs 1,000 futures from your final reserve.</p>
        <div class="fwd-controls">
          <label>News signal (Tavily lexicon) <b id="f-sig-v">${sig0.toFixed(2)}</b><input type="range" id="f-sig" min="-1" max="1" step="0.05" value="${sig0}"></label>
          <label>What if you'd held more of every mineral? <b id="f-extra-v">+0 d</b><input type="range" id="f-extra" min="0" max="120" step="5" value="0"></label>
          <div><div class="faint">Disruptions (Tradeverifyd: none active at fetch time; toggle to test)</div><div class="chips">${FORWARD.disruptionRegions.map((d) => `<label class="chip"><input type="checkbox" data-dis="${d.id}"> ${esc(d.label)}</label>`).join("")}</div></div>
        </div><div id="fwd-out"></div></div>
      <div style="display:flex;gap:8px;justify-content:center;margin:20px 0"><button class="ghost" id="btn-again">Play again</button><a class="ghost" href="../v4/" style="text-decoration:none">Story mode</a></div>`;
    $("btn-again").onclick = () => reset(false); $("btn-led2").onclick = showLedger;
    let t = null; const go = () => { clearTimeout(t); t = setTimeout(runForward, 120); };
    $("f-sig").oninput = (e) => { $("f-sig-v").textContent = (+e.target.value).toFixed(2); go(); };
    $("f-extra").oninput = (e) => { $("f-extra-v").textContent = `+${e.target.value} d`; go(); };
    el.querySelectorAll("[data-dis]").forEach((c) => (c.onchange = go));
    runForward(); renderStats(); $("coach").innerHTML = ""; renderStrip(); window.scrollTo(0, 0);
  }
  let baseFwd = null;
  function runForward() {
    const signal = +$("f-sig").value, extra = +$("f-extra").value;
    const disruptions = [...document.querySelectorAll("[data-dis]:checked")].map((i) => i.dataset.dis);
    const over = extra ? Object.fromEntries(KEYS.map((k) => [k, state.minerals[k].reserveDoC + extra])) : null;
    const res = MonteCarlo.run(state, { paths: 1000, signal, disruptions, overrideStart: over });
    if (!baseFwd) baseFwd = res;
    const rec = {}; for (const k of KEYS) rec[k] = MonteCarlo.recommend(state, k, { signal, disruptions, paths: 200 });
    const cw = res.cliffWeights;
    $("fwd-out").innerHTML = `<div class="chips"><span class="chip">Cliff: extend ${pct(cw.extend)} · lapse ${pct(cw.lapse)} · new deal ${pct(cw.deal)}</span><span class="chip">P(China tightens)/q ${pct(res.pTighten)}</span>
        ${chips([{ k: "Expected downtime", delta: res.expectedDowntime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "vs your plan", delta: res.expectedDowntime - baseFwd.expectedDowntime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }])}</div>
      <div class="fans">${KEYS.map((k) => { const m = res.minerals[k], start = (over ? over[k] : state.minerals[k].reserveDoC), r = rec[k];
        return `<div class="fan"><div class="mname">${tile(k, true)}<b>${MINERALS[k].name}</b><span class="faint" style="margin-left:auto">start ${start.toFixed(0)} d</span></div>${fanSVG(m.fan)}
          <div class="faint">P(falls below 60) <b class="${m.pBelow60 > 0.2 ? "up" : ""}">${pct(m.pBelow60)}</b> · below 30 <b>${pct(m.pBelow30)}</b></div>
          <div class="faint">To stay ≥ 60 d in 90% of futures: hold <b>${r == null ? ">2000" : r} d</b>${r != null && r > start ? ` (+${Math.ceil(r - start)})` : r != null ? " ✓" : ""}</div></div>`; }).join("")}</div>
      <div class="faint section">Band = P10–P90 of 1,000 simulated futures, line = median, red dashed = 60 days. Counts are of simulated paths, not probabilities.</div>`;
  }
  function fanSVG(fan) {
    const W = 300, H = 140, L = 30, R = 10, T = 8, B = 18, max = Math.max(90, ...fan.map((f) => f.p90)) * 1.1;
    const x = (i) => L + (i / (fan.length - 1)) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
    const band = fan.map((f, i) => `${x(i)},${y(f.p90)}`).join(" ") + " " + [...fan].reverse().map((f, i) => `${x(fan.length - 1 - i)},${y(f.p10)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Fan chart"><line x1="${L}" x2="${W - R}" y1="${y(60)}" y2="${y(60)}" stroke="#FF5A4E" stroke-dasharray="4 3"/><text x="${L - 3}" y="${y(60) + 3}" text-anchor="end">60</text>
      <polygon points="${band}" fill="rgba(224,138,82,.22)"/><polyline points="${fan.map((f, i) => `${x(i)},${y(f.p50)}`).join(" ")}" fill="none" stroke="#E08A52" stroke-width="2.2"/>
      ${["Q4 26", "Q1", "Q2", "Q3", "Q4 27"].map((l, i) => `<text x="${x(i)}" y="${H - 4}" text-anchor="middle">${l}</text>`).join("")}</svg>`;
  }

  // ---------- modal plumbing + keys ----------
  function modal(html) { $("modal").innerHTML = html; $("overlay").classList.remove("hidden"); $("modal").scrollTop = 0; const f = $("modal").querySelector(".primary, button"); if (f) f.focus(); }
  function closeModal() { $("overlay").classList.add("hidden"); if (state.done && $("endscreen").classList.contains("hidden")) showEnd(); }
  $("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    const inField = e.target.closest("input, select, textarea");
    if (e.key === "Enter" && !inField && !e.target.closest("button, a, tr")) {
      const btn = $("overlay").classList.contains("hidden") ? $("btn-commit") : ($("btn-continue") || $("btn-start"));
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && e.target.closest("tr.row")) {
      e.preventDefault(); const i = KEYS.indexOf(sel) + (e.key === "ArrowDown" ? 1 : -1); sel = KEYS[(i + KEYS.length) % KEYS.length]; mapMineral = sel; renderTable(); renderDetail(); renderMap();
      const tr = document.querySelector(`tr.row[data-k="${sel}"]`); if (tr) tr.focus();
    }
  });
  $("btn-about").onclick = showAbout;
  $("btn-ledger").onclick = showLedger;
  $("btn-reset").onclick = () => { if (confirm("Restart the campaign from Q3 2023?")) { baseFwd = null; reset(false); } };

  reset(!/ff=/.test(location.hash));
  const ff = (location.hash.match(/ff=([0-9Q]+|END)/) || [])[1];
  if (ff) fastForward(ff);
})();
