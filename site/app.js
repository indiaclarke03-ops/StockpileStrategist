/* Stockpile Strategist — UI controller (spec §8). */
(function () {
  const { QUARTERS, MINERALS, EVENTS, BACKGROUND, COUNTERPARTIES, FORWARD, CONFIG } = window.GAME_DATA;
  const EXT = window.GAME_DATA.EXT || {}; // cached tool data (integrate.js)
  let mapMineral = "dysprosium";
  // Trade years a player could know about: full calendar years before the current quarter.
  const knownYears = (t) => {
    const y = state && !state.done ? +state.quarter.slice(0, 4) : 9999;
    return t.chinaByYear.filter((r) => +r.year < y);
  };
  const KEYS = Sim.KEYS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt$ = (m) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const qLabel = (q) => `Q${q.slice(5)} ${q.slice(0, 4)}`;
  const qStart = (q) => { const y = +q.slice(0, 4), n = +q.slice(5); return new Date(Date.UTC(y, (n - 1) * 3, 1)); };
  const STEP = 5;
  // Sayari risk-factor codes → readable labels (e.g. exports_ilab_forced_labor → "ILAB forced labor (exports)")
  const humanFlag = (code) => {
    const c = String(code);
    if (!/_/.test(c)) return c;
    const scope = /^psa_/.test(c) ? " (possibly same as)" : /^exports_/.test(c) ? " (exports)" : /^owner/.test(c) ? " (owner)" : "";
    const body = c.replace(/^(psa_|exports_|owner_of_|owned_by_)/, "").replace(/_/g, " ").replace(/\bilab\b/i, "ILAB").replace(/\buflpa\b/i, "UFLPA").replace(/\bofac\b/i, "OFAC").replace(/\bsdn\b/i, "SDN");
    return body.charAt(0).toUpperCase() + body.slice(1) + scope;
  };

  let state, orders, lastReport, reports, forwardResult, shadow;

  function reset(opts = {}) {
    state = Sim.newState();
    shadow = Sim.runStrategy(Sim.STRATEGIES.doNothing.fn); // "what if you'd done nothing" yardstick
    orders = { buy: {}, release: {}, offtakes: [] };
    lastReport = null; reports = []; forwardResult = null;
    $("game").classList.remove("hidden"); $("endscreen").classList.add("hidden");
    render();
    if (opts.intro !== false) showIntro();
  }

  function showIntro() {
    modal(`
      <div class="kicker">Your brief · 1 July 2023</div>
      <h3 style="font-size:24px;margin:4px 0 10px">You run America's critical-minerals reserve.</h3>
      <p class="muted" style="margin-top:0">You have <b>$12B</b>, the size of the real Project Vault (Feb 2026), and 14 quarters of real history ahead. Your job is to keep factories running through export bans, quotas and price shocks without wasting money or public trust.</p>
      <div class="howto">
        <div><span class="n">1</span><b>Read the intel.</b> Real headlines from the 90 days before each quarter. You don't get to see what happens next.</div>
        <div><span class="n">2</span><b>Place orders.</b> Buy days of cover, release reserve, or sign an offtake with a vetted producer. Thin markets move against your own buying.</div>
        <div><span class="n">3</span><b>Reality strikes.</b> The real event for that quarter fires, with its sources. Shortfalls your reserve can't cover idle factories.</div>
        <div><span class="n">4</span><b>Face 2027.</b> The campaign ends at the real 10 Jan 2027 cliff. 1,000 simulated futures test whether your reserve holds.</div>
      </div>
      <div class="banner info" style="margin-top:14px">Benchmark to beat: Japan's JOGMEC holds 60 days of cover. Score = cover (40) + downtime avoided (30) + efficiency (15) + political capital (15).</div>
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="primary" id="btn-start">Take office →</button></div>`);
    $("btn-start").onclick = closeModal;
  }

  function setBuyTo(k, target) {
    const m = state.minerals[k];
    const need = Math.max(0, Math.ceil((target - m.reserveDoC + (orders.release[k] || 0)) / STEP) * STEP);
    let d = Math.min(need, Sim.maxBuy(state, k));
    const budgetLeft = state.budget - orderCost() + Sim.quoteBuy(state, k, orders.buy[k] || 0);
    while (d > 0 && Sim.quoteBuy(state, k, d) > budgetLeft) d -= 1;
    orders.buy[k] = d;
    render();
  }

  // ---------- Orders ----------
  const orderCost = () => {
    let c = 0;
    for (const k of KEYS) c += Sim.quoteBuy(state, k, orders.buy[k] || 0);
    for (const id of orders.offtakes) c += COUNTERPARTIES.find((x) => x.id === id).upfront;
    return c;
  };
  function step(kind, k, dir) {
    const cur = orders[kind][k] || 0;
    let next = Math.max(0, cur + dir * STEP);
    if (kind === "buy") next = Math.min(next, Sim.maxBuy(state, k));
    if (kind === "release") next = Math.min(next, Math.floor(state.minerals[k].reserveDoC));
    orders[kind][k] = next;
    render();
  }

  // ---------- Render ----------
  function render() {
    renderStats(); renderIntel(); renderMinerals(); renderOrders(); renderMap(); renderLog();
  }

  function renderStats() {
    const cliff = new Date(Date.UTC(2027, 0, 10));
    const days = Math.max(0, Math.ceil((cliff - new Date()) / 864e5));
    $("stats").innerHTML = `
      <div class="stat"><div class="k">Quarter</div><div class="v">${state.done ? "Campaign over" : qLabel(state.quarter)}</div></div>
      <div class="stat"><div class="k">Budget</div><div class="v">${fmt$(state.budget)}</div></div>
      <div class="stat"><div class="k">Political capital</div><div class="v">${Math.round(state.politicalCapital)}</div>
        <div class="pcbar"><i style="width:${state.politicalCapital}%;background:${state.politicalCapital < 40 ? "var(--bad)" : state.politicalCapital < 70 ? "var(--warn)" : "var(--good)"}"></i></div></div>
      <div class="stat" title="Cumulative industry downtime. In brackets: what doing nothing would have cost by now."><div class="k">Industry downtime</div><div class="v">${Math.round(state.downtimeDays)} d</div><div class="faint">${Math.round(shadow.downtimeHist.slice(0, state.qi).reduce((a, b) => a + b, 0))} d if you'd done nothing</div></div>
      ${(() => { const c = EXT.copper; return c && c.value != null
        ? `<div class="stat" title="Tradeverifyd tia_commodity_price · cached ${esc(EXT.liveFetched || "")} · ${esc(c.date || "")}"><div class="k">Copper</div><div class="v small">${esc(Number(c.value).toFixed(2))} ${esc(c.unit || "")}</div><div class="faint">Tradeverifyd · ${esc(c.date || "?")}</div></div>`
        : `<div class="stat" title="Tradeverifyd tia_commodity_price returned no data"><div class="k">Copper</div><div class="v small">no data</div></div>`; })()}
      <div class="stat"><div class="k">Next cliff</div><div class="v small">10 Jan 2027 · ${days} days</div></div>`;
  }

  function renderIntel() {
    if (state.done) { $("intel").innerHTML = ""; return; }
    const start = qStart(state.quarter);
    const prior = EVENTS.filter((e) => new Date(e.date) < start).slice(-4).reverse();
    $("intel").innerHTML = `
      <h2>Intel briefing</h2>
      <div class="quarter-title">${qLabel(state.quarter)}</div>
      <div class="faint">Turn ${state.qi + 1} of ${QUARTERS.length} · only what was knowable before ${start.toISOString().slice(0, 10)}</div>
      ${intelNews(state.quarter)}
      ${prior.length ? `<h2 style="margin-top:16px">Timeline so far</h2>` : ""}
      ${prior.map((e) => `<div class="intel-item timeline"><div class="d">${e.date} · ${esc(e.actor)}</div>${esc(e.headline)}<div class="faint">${e.sources.map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(domain(s))}</a>`).join(" · ")}</div></div>`).join("")}
      ${prior.length < 3 ? BACKGROUND.map((b) => `<div class="intel-item"><div class="d">${b.date} · background</div>${esc(b.text)} <span class="faint">${esc(b.src)}</span></div>`).join("") : ""}
      ${lastReport ? `<button class="ghost" style="width:100%;margin-top:6px" id="btn-lastq">Review ${qLabel(lastReport.quarter)}: what actually happened</button>` : ""}`;
    const b = $("btn-lastq"); if (b) b.onclick = () => showReveal(lastReport);
  }

  function intelNews(q) {
    const brief = EXT.intel && EXT.intel[q];
    if (!brief || !brief.items || !brief.items.length) return `<div class="stub">No cached Tavily briefing for this quarter. Showing the cited timeline only.</div>`;
    return `<div class="faint" style="margin-top:8px">Tavily news, ${esc(brief.window ? brief.window.join(" → ") : "")}</div>
      ${brief.items.slice(0, 5).map((i) => `<div class="intel-item news"><div class="d">${esc(i.date)} · <a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.source || domain(i.url))}</a></div>
        <b>${esc(i.title)}</b>${i.summary ? `<div class="sum">${esc(i.summary)}</div>` : ""}
        ${i.minerals && i.minerals.length ? `<div class="chips" style="margin-top:4px">${i.minerals.map((m) => `<span class="chip">${esc(MINERALS[m] ? MINERALS[m].name : m)}</span>`).join("")}</div>` : ""}</div>`).join("")}
      ${brief.note ? `<div class="faint">${esc(brief.note)}</div>` : ""}`;
  }

  function sparkline(k) {
    const m = state.minerals[k], h = m.hist.price, src = m.hist.priceSrc;
    const W = 260, H = 46, pad = 4;
    const max = Math.max(150, ...h) * 1.05, min = 0;
    const n = QUARTERS.length;
    const x = (i) => pad + (i / n) * (W - 2 * pad);
    const y = (v) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
    let segs = "";
    for (let i = 1; i < h.length; i++) {
      const solid = src[i] === "reported";
      segs += `<line x1="${x(i - 1)}" y1="${y(h[i - 1])}" x2="${x(i)}" y2="${y(h[i])}" stroke="var(--accent)" stroke-width="2" ${solid ? "" : 'stroke-dasharray="3 3"'} stroke-linecap="round"/>`;
    }
    const dots = h.map((v, i) => i === 0 ? "" : `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${src[i] === "reported" ? "var(--accent)" : "var(--surface)"}" stroke="var(--accent)" stroke-width="1.4"><title>${QUARTERS[i - 1]}: ${v.toFixed(0)} (${src[i]})</title></circle>`).join("");
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Price index history">
      <line x1="${pad}" x2="${W - pad}" y1="${y(100)}" y2="${y(100)}" stroke="var(--line)" stroke-dasharray="2 3"/>
      ${segs}${dots}</svg>`;
  }

  function renderMinerals() {
    if (state.done) { $("minerals").innerHTML = ""; return; }
    const hitNext = new Set(lastReport ? lastReport.events.flatMap((e) => Object.keys(e.effects)) : []);
    $("minerals").innerHTML = KEYS.map((k) => {
      const p = MINERALS[k], m = state.minerals[k];
      const buy = orders.buy[k] || 0, rel = orders.release[k] || 0;
      const projected = m.reserveDoC + buy - rel;
      const max = Sim.maxBuy(state, k);
      const mtm = Sim.markToMarket(state, k);
      const prev = m.hist.price[m.hist.price.length - 2];
      const dP = prev ? (m.priceIdx / prev - 1) : 0;
      const scale = 200;
      const deals = state.offtakes.filter((o) => o.mineral === k);
      return `<article class="card ${hitNext.has(k) ? "hit" : ""}">
        <div class="card-head">
          <div style="display:flex;align-items:center"><span class="sym">${p.symbol}</span><div><h3>${p.name}</h3><div class="uses">${esc(p.uses)}</div></div></div>
          <div class="chips">${m.cutNet > 0.02 ? `<span class="chip bad">controls ${pct(m.cutNet)}</span>` : `<span class="chip good">open</span>`}</div>
        </div>
        <div>
          <div class="docrow"><div class="doc-big">${projected.toFixed(0)}<small>days of cover${buy || rel ? ` (now ${m.reserveDoC.toFixed(0)})` : ""}</small></div></div>
          <div class="docbar" style="margin-top:18px"><div class="fill" style="width:${Math.min(100, (projected / scale) * 100)}%"></div>
            <div class="tick" style="left:${(60 / scale) * 100}%"><span>60</span></div><div class="tick" style="left:${(180 / scale) * 100}%"><span>180</span></div></div>
        </div>
        <div class="metrics">
          <div><div class="k">${p.exChina ? "Ex-China price idx" : "Price index"}</div><div class="v">${m.priceIdx.toFixed(0)} <span class="${dP > 0.005 ? "up" : dP < -0.005 ? "down" : "muted"}">${dP ? (dP > 0 ? "▲" : "▼") + Math.abs(dP * 100).toFixed(0) + "%" : ""}</span></div></div>
          <div><div class="k">Import availability</div><div class="v ${m.importAvail < 0.85 ? "up" : ""}">${pct(m.importAvail)}</div></div>
          <div><div class="k">Reserve value</div><div class="v">${fmt$(mtm.value)}</div></div>
          <div><div class="k">Mark-to-market</div><div class="v ${mtm.pnl < -0.5 ? "up" : mtm.pnl > 0.5 ? "down" : ""}">${mtm.pnl >= 0 ? "+" : "−"}${fmt$(Math.abs(mtm.pnl))}</div></div>
        </div>
        ${(() => { const t = EXT.trade && EXT.trade[k]; if (!t) return ""; const ys = knownYears(t);
          if (!ys.length) return `<div class="faint" title="${esc(p.exposureSource || "")}">China share of US imports: 2023 Comtrade data not yet published.</div>`;
          return `<div class="faint" title="${esc(p.exposureSource || "")}${t.limitations ? " · " + esc(t.limitations.slice(0, 300)) : ""}">China share of US imports (Comtrade, HS ${esc((t.hs || []).join("/"))}): ${ys.map((y) => `${y.year} <b class="num">${pct(y.share)}</b>`).join(" → ")}</div>`; })()}
        <div>${sparkline(k)}<div class="spark-legend"><span>2023Q2 = 100</span><span>● reported · ○ modelled/assumed</span></div></div>
        <div class="ctrl"><span class="muted">Buy</span>
          <div class="stepper"><button data-a="buy" data-k="${k}" data-d="-1" ${buy ? "" : "disabled"}>−</button><span class="val">${buy}</span>
          <button data-a="buy" data-k="${k}" data-d="1" ${buy >= max ? "disabled" : ""}>+</button><button class="preset" data-to="60" data-k="${k}" title="Buy up to 60 days of cover">→60</button><button class="preset" data-to="90" data-k="${k}" title="Buy up to 90 days of cover">→90</button><span class="cost">${buy ? fmt$(Sim.quoteBuy(state, k, buy)) : `max ${max}`}</span></div></div>
        <div class="ctrl"><span class="muted">Release</span>
          <div class="stepper"><button data-a="release" data-k="${k}" data-d="-1" ${rel ? "" : "disabled"}>−</button><span class="val">${rel}</span>
          <button data-a="release" data-k="${k}" data-d="1" ${rel + STEP > m.reserveDoC ? "disabled" : ""}>+</button><span class="cost">to industry</span></div></div>
        ${deals.length ? `<div class="chips">${deals.map((o) => { const cp = COUNTERPARTIES.find((c) => c.id === o.id); const cls = o.status === "blocked" ? "bad" : o.status === "delivering" ? "good" : "info"; return `<span class="chip ${cls}" title="${esc(cp.name)}">${esc(cp.name.split(" ")[0])}: ${o.status}${o.status === "pending" ? ` (est. ${QUARTERS[o.startQi] || "after 2026"})` : ""}</span>`; }).join("")}</div>` : ""}
      </article>`;
    }).join("");
    $("minerals").querySelectorAll("button[data-a]").forEach((b) => (b.onclick = () => step(b.dataset.a, b.dataset.k, +b.dataset.d)));
    $("minerals").querySelectorAll("button[data-to]").forEach((b) => (b.onclick = () => setBuyTo(b.dataset.k, +b.dataset.to)));
  }

  function renderOrders() {
    if (state.done) { $("orders").innerHTML = ""; return; }
    const cost = orderCost();
    const lines = [];
    for (const k of KEYS) if (orders.buy[k]) lines.push([`Buy ${orders.buy[k]} DoC ${MINERALS[k].name}`, fmt$(Sim.quoteBuy(state, k, orders.buy[k]))]);
    for (const k of KEYS) if (orders.release[k]) lines.push([`Release ${orders.release[k]} DoC ${MINERALS[k].name}`, "—"]);
    for (const id of orders.offtakes) { const cp = COUNTERPARTIES.find((c) => c.id === id); lines.push([`Offtake: ${cp.name}`, fmt$(cp.upfront)]); }
    const over = cost > state.budget;
    const remaining = QUARTERS.slice(state.qi + 1);
    $("orders").innerHTML = `
      <h2>Your orders · ${qLabel(state.quarter)}</h2>
      ${lines.length ? lines.map(([a, b]) => `<div class="order-line"><span>${esc(a)}</span><span class="num">${b}</span></div>`).join("") : `<div class="muted">No orders — you'll hold and save budget.</div>`}
      <div class="order-line order-total"><span>Total</span><span class="num">${fmt$(cost)}</span></div>
      <div class="order-line"><span class="muted">Budget after</span><span class="num ${over ? "up" : ""}">${fmt$(state.budget - cost)}</span></div>
      <div class="faint">Storage costs 0.5% of reserve value per quarter. Your purchases push prices up in thin markets.</div>
      <label class="toggle"><input type="checkbox" id="auto" ${state.autoRelease ? "checked" : ""}/> Auto-release reserve to cover shortfalls</label>
      <div class="row"><button id="btn-offtake">Sign offtake deal…</button></div>
      <button class="primary" id="btn-commit" ${over ? "disabled" : ""}>Commit &amp; end quarter →</button>
      ${over ? `<div class="err">Orders exceed budget.</div>` : ""}
      <div class="row" style="margin-top:14px">
        <select id="ff">${remaining.map((q) => `<option value="${q}">${qLabel(q)}</option>`).join("")}<option value="END">End of campaign</option></select>
        <button id="btn-ff" title="Resolve quarters with no new orders">Fast-forward</button>
      </div>
      <div class="faint" style="margin-top:4px">Fast-forward plays empty quarters (useful for jumping to the Dec 2024 ban).</div>`;
    $("auto").onchange = (e) => { state.autoRelease = e.target.checked; };
    $("btn-offtake").onclick = showOfftakes;
    $("btn-commit").onclick = commit;
    $("btn-ff").onclick = () => fastForward($("ff").value);
  }

  function renderMap() {
    const el = $("mapwrap");
    if (state.done) { el.innerHTML = ""; return; }
    const t0 = EXT.trade && EXT.trade[mapMineral];
    let t = t0;
    if (t0) {
      const ys = knownYears(t0).map((r) => r.year);
      const yr = ys.length ? ys[ys.length - 1] : Object.keys(t0.sharesByYear || {}).sort()[0];
      t = { ...t0, year: ys.length ? yr : `${yr}, baseline`, shares: (t0.sharesByYear && t0.sharesByYear[yr]) || t0.shares };
    }
    const pins = COUNTERPARTIES.filter((c) => c.mineral === mapMineral).map((c) => ({ country: c.country, label: `${c.name} (${c.country})${c.flags.length || c.ownerChina ? " · flagged" : ""}`, bad: c.flags.length > 0 || c.ownerChina }));
    const dis = (EXT.disruptions || []).filter((d) => !d.mineral || d.mineral === mapMineral || true);
    el.innerHTML = `<div class="map-head"><h2 style="margin:0">Where US imports come from</h2>
        <div class="tabs">${KEYS.map((k) => `<button data-map="${k}" class="${k === mapMineral ? "on" : ""}">${MINERALS[k].name}</button>`).join("")}</div></div>
      <div id="mapsvg"></div>
      <div class="map-legend"><span><i style="background:var(--accent)"></i>share of US imports${t && t.year ? ` (${esc(t.year)})` : ""}</span><span><i style="background:transparent;border:2px solid var(--bad)"></i>China</span>
        <span><i style="background:var(--info)"></i>offtake candidate</span><span><i style="background:var(--warn)"></i>flagged candidate</span><span><i style="background:var(--bad);border-radius:50%"></i>live disruption (Tradeverifyd)</span></div>
      <div class="faint" style="margin-top:4px">${t ? esc(t.sourceLabel) : "No cached trade data for this mineral."}${t && t.hhi != null ? ` · supplier-country HHI ${Math.round(t.hhi)}` : ""}${t && t.riskFlags && t.riskFlags.length ? ` · Sayari supplier risk flags: ${t.riskFlags.slice(0, 4).map((f) => `${esc(humanFlag(f.label))} (${f.count})`).join(", ")}` : ""}</div>`;
    el.querySelectorAll("button[data-map]").forEach((b) => (b.onclick = () => { mapMineral = b.dataset.map; renderMap(); }));
    SupplyMap.render($("mapsvg"), { shares: t ? t.shares : [], pins, disruptions: dis });
  }

  function renderLog() {
    if (state.done) { $("log").innerHTML = ""; return; }
    const rows = [...state.log].reverse();
    $("log").innerHTML = `<h2>Consequences log</h2>
      <div class="log-list">${rows.length ? rows.map((r) => `<div class="log-row ${r.kind}"><span class="q">${r.q}</span><span class="t">${esc(r.text)}</span></div>`).join("") : `<div class="muted">Nothing has happened yet. It's July 2023, and you run America's mineral reserve.</div>`}</div>`;
  }

  // ---------- Turn resolution ----------
  function commit() {
    const res = Sim.applyOrders(state, orders);
    if (!res.ok) { alert(res.errs.join("\n")); return; }
    lastReport = Sim.resolveQuarter(state); reports.push(lastReport);
    orders = { buy: {}, release: {}, offtakes: [] };
    render();
    showReveal(lastReport);
  }

  function fastForward(target) {
    const stopQi = target === "END" ? QUARTERS.length : QUARTERS.indexOf(target);
    const firstRes = Sim.applyOrders(state, orders);
    if (!firstRes.ok) { alert(firstRes.errs.join("\n")); return; }
    orders = { buy: {}, release: {}, offtakes: [] };
    let first = true;
    while (!state.done && state.qi < stopQi) {
      if (!first) Sim.applyOrders(state, {});
      first = false;
      lastReport = Sim.resolveQuarter(state); reports.push(lastReport);
    }
    render();
    if (state.done) showEnd();
  }

  function effectTags(k, eff) {
    const t = [];
    const src = eff.priceSrc === "reported" ? "reported" : "assumed";
    if (eff.cut != null) t.push(`<span class="chip bad">cut ${pct(eff.cut)}${(eff.targetFactor ?? 1) < 1 ? " · licensing" : " · targets US"}</span>`);
    if (eff.setCut != null) t.push(`<span class="chip warn">regime → ${pct(eff.setCut)} cut</span>`);
    if (eff.relief != null) t.push(`<span class="chip good">relief ${pct(eff.relief)}</span>`);
    if (eff.priceMult != null) t.push(`<span class="chip ${src === "reported" ? "info" : ""}">price ×${eff.priceMult.toFixed(2)} · ${src}</span>`);
    if (eff.panic) t.push(`<span class="chip warn">panic buying +${pct(eff.panic)}</span>`);
    return `<div class="chips" style="margin:4px 0"><b style="font-size:12px;margin-right:4px">${MINERALS[k].name}</b>${t.join("")}</div>`;
  }

  function showReveal(rep) {
    const ev = rep.events.length ? rep.events.map((e) => `
      <div class="event-card">
        <div class="meta">${e.date} · ${esc(e.actor)}</div>
        <div class="headline">${esc(e.headline)}</div>
        ${Object.entries(e.effects).map(([k, eff]) => effectTags(k, eff)).join("")}
        ${Object.values(e.effects).filter((x) => x.downtimeNote).map((x) => `<div class="banner" style="margin:6px 0">${esc(x.downtimeNote)}</div>`).join("")}
        <div class="lesson">${esc(e.lesson)}</div>
        <div class="srcs">Sources: ${e.sources.map((s) => `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(domain(s))}</a>`).join(" · ")}</div>
      </div>`).join("") : `<div class="event-card" style="border-left-color:var(--line)"><div class="headline">No new controls this quarter.</div><div class="lesson">Existing controls still bite while rerouting slowly fills the gap, and prices drift back toward a floor.</div></div>`;
    const rows = KEYS.map((k) => {
      const r = rep.minerals[k], d = r.priceTo / r.priceFrom - 1;
      return `<tr><td>${MINERALS[k].name}</td><td>${r.priceFrom.toFixed(0)} → ${r.priceTo.toFixed(0)} <span class="${d > 0.005 ? "up" : d < -0.005 ? "down" : "muted"}">${d >= 0 ? "+" : ""}${(d * 100).toFixed(0)}%</span></td>
        <td>${pct(r.avail)}</td><td>${r.offtake ? r.offtake.toFixed(0) : "—"}</td><td>${r.drawn ? r.drawn.toFixed(0) : "—"}</td>
        <td class="${r.shortfallDays > 0.5 ? "up" : ""}">${r.shortfallDays > 0.5 ? r.shortfallDays.toFixed(0) : "—"}</td>
        <td class="${r.downtime > 0.5 ? "up" : ""}">${r.downtime > 0.5 ? r.downtime.toFixed(0) : "—"}</td><td>${r.reserve.toFixed(0)}</td></tr>`;
    }).join("");
    modal(`
      <div class="modal-head"><div><div class="kicker">Reality strikes · what actually happened</div><h3>${qLabel(rep.quarter)}</h3></div></div>
      ${ev}
      ${(() => {
        const qi = QUARTERS.indexOf(rep.quarter), idle = shadow.downtimeHist[qi] || 0, you = rep.downtime;
        const cls = you < idle - 0.5 ? "good" : you > 0.5 ? "bad" : "info";
        const msg = idle < 0.5 && you < 0.5 ? "No factory downtime this quarter, and none if you'd done nothing either."
          : you < idle - 0.5 ? `Your reserve spared industry <b>${Math.round(idle - you)} days</b> of downtime. Doing nothing would have cost ${Math.round(idle)} days; you lost ${Math.round(you)}.`
          : `Industry lost <b>${Math.round(you)} days</b> of output this quarter (doing nothing: ${Math.round(idle)}).`;
        return `<div class="verdict ${cls}">${msg}</div>`;
      })()}
      <h2 style="margin-top:16px">Consequences</h2>
      <table><thead><tr><th>Mineral</th><th>Price index</th><th>Imports</th><th>Offtake DoC</th><th>Drawn DoC</th><th>Unmet DoC</th><th>Downtime d</th><th>Reserve DoC</th></tr></thead><tbody>${rows}</tbody></table>
      ${rep.offtakeNotes.length ? `<div class="section">${rep.offtakeNotes.map((n) => `<div class="order-line">⇄ ${esc(n)}</div>`).join("")}</div>` : ""}
      <div class="section faint">Storage this quarter: ${fmt$(rep.storage)} · Downtime this quarter: ${rep.downtime.toFixed(0)} days · Political capital ${rep.pcDelta >= 0 ? "+" : ""}${rep.pcDelta.toFixed(0)}</div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="primary" id="btn-continue">${state.done && rep === reports[reports.length - 1] ? "See final results →" : `Continue to ${qLabel(state.quarter)} →`}</button></div>`);
    $("btn-continue").onclick = () => { closeModal(); if (state.done) showEnd(); };
  }

  function showOfftakes() {
    const signed = new Set([...state.offtakes.map((o) => o.id), ...orders.offtakes]);
    const list = [...COUNTERPARTIES].sort((a, b) => a.upfront / a.docPerQ - b.upfront / b.docPerQ);
    modal(`
      <div class="modal-head"><div><div class="kicker">Offtake deals</div><h3>Sign with a non-Chinese producer</h3></div><button class="ghost" id="btn-close">Close</button></div>
      ${EXT.vetted ? `<div class="banner info">Real producers, vetted with <b>Sayari</b> (beneficial owners, watchlist, risk factors) and <b>Tradeverifyd</b> (entity score), cached ${esc(EXT.vettedFetched || "")}. Flags are tool findings, not allegations. Deal terms (upfront, volume, lag) are game calibrations.</div>`
        : `<div class="banner"><b>Illustrative counterparties.</b> Names are fictional and the ownership, risk flags and scores are placeholders.</div>`}
      <div class="faint" style="margin-bottom:10px">Sorted cheapest per DoC first. Deliveries start after the lag and slip 20% per quarter. A Chinese-owned "alternative" is still subject to Chinese controls.</div>
      ${list.map((cp) => {
        const flagged = cp.flags.length > 0 || cp.ownerChina;
        const sc = cp.vetting ? cp.scoreNorm : cp.score; // vetted scores come without bounds → no colour verdict
        const scoreCls = sc == null ? "" : sc >= 75 ? "good" : sc >= 55 ? "warn" : "bad";
        const v = cp.vetting;
        const taken = signed.has(cp.id);
        return `<div class="cp ${flagged ? "flagged" : ""}">
          <div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(cp.name)}</b><span class="chip">${MINERALS[cp.mineral].name}</span><span class="chip">${esc(cp.country)}</span></div>
            <div class="facts"><span>Owner: ${esc(cp.owner)}</span><span>Upfront ${fmt$(cp.upfront)}</span><span>${cp.docPerQ} DoC/quarter</span><span>Lag ${cp.lag[0]}–${cp.lag[1]} quarters</span><span class="faint">${fmt$(cp.upfront / cp.docPerQ)} per DoC/q</span></div>
            <div class="chips" style="margin-top:6px">${cp.flags.length ? cp.flags.map((f) => `<span class="chip ${["owner", "labour", "sanctions"].includes(f.kind) ? "bad" : "warn"}" title="${esc(f.why || "")}${f.blockP ? ` · ${pct(f.blockP)}/quarter block risk` : ""}">${esc(f.label)}</span>`).join("") : `<span class="chip good">${v ? "No flags returned" : "No flags (placeholder)"}</span>`}${cp.usProducer ? `<span class="chip info" title="From Q2 2026, upstream Chinese inputs may be cut off">On China's Jun 2026 control list</span>` : ""}</div>
            ${v ? `<div class="vet">
              ${v.statusNote ? `<div>${esc(v.statusNote)}</div>` : ""}
              <div>Sayari: ${v.sayariId ? `<code>${esc(v.sayariId)}</code>` : "no entity matched"}${v.matchedName ? ` · ${esc(v.matchedName)}` : ""}${v.owners && v.owners.length ? ` · ultimate owners: ${v.owners.slice(0, 3).map((o) => esc(o.name + (o.country ? ` (${o.country})` : ""))).join("; ")}` : ""}</div>
              <div>Watchlist: ${v.watchlist && v.watchlist.length ? v.watchlist.map(esc).join("; ") : "no hits returned"}${v.riskFactors && v.riskFactors.length ? ` · Risk factors: ${v.riskFactors.slice(0, 5).map((f) => esc(humanFlag(f))).join(", ")}` : ""}</div>
              ${v.annotations && v.annotations.length ? `<div>Tradeverifyd: ${v.annotations.slice(0, 3).map(esc).join("; ")}</div>` : ""}
            </div>` : ""}
          </div>
          <div style="text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
            <span class="score-pill chip ${scoreCls}" title="Tradeverifyd entity score${cp.scoreScale ? ` (${esc(cp.scoreScale)})` : ""}">${cp.score == null ? "no score" : `score ${esc(cp.score)}`}</span>
            <button data-cp="${cp.id}" ${taken || cp.upfront > state.budget - orderCost() ? "disabled" : ""}>${taken ? "Signed" : "Add to orders"}</button>
          </div></div>`;
      }).join("")}`);
    $("btn-close").onclick = closeModal;
    $("modal").querySelectorAll("button[data-cp]").forEach((b) => (b.onclick = () => {
      const cp = COUNTERPARTIES.find((c) => c.id === b.dataset.cp);
      if (cp.flags.length || cp.ownerChina) {
        const risks = [
          cp.ownerChina ? "• Sayari shows a China-based owner: in this game, its deliveries are cut whenever Chinese controls bite, so it doesn't diversify you." : "",
          ...cp.flags.map((f) => `• ${f.label}${f.why ? ` (${f.why})` : ""}${f.blockP ? `: ${pct(f.blockP)} chance per quarter of deliveries being blocked (e.g. a UFLPA detention)` : ""}${f.pcPenalty ? `, −${f.pcPenalty} political capital on signing` : ""}.`),
        ].filter(Boolean).join("\n");
        if (!confirm(`${cp.name} carries risk flags:\n\n${risks}\n\nSign anyway?`)) return;
      }
      orders.offtakes.push(cp.id); closeModal(); render();
    }));
  }

  function showAbout() {
    const nIntel = EXT.intel ? Object.values(EXT.intel).reduce((a, b) => a + (b.items || []).length, 0) : 0;
    const cached = (ok, txt) => `<li><span class="chip ${ok ? "good" : ""}">${ok ? "cached" : "fallback"}</span> ${txt}</li>`;
    modal(`
      <div class="modal-head"><div><div class="kicker">About the data</div><h3>What's real, what's assumed, where it came from</h3></div><button class="ghost" id="btn-close">Close</button></div>
      <h2>Tool data in this build</h2>
      <p class="muted" style="margin-top:0">Tool calls ran ahead of time and are cached as JSON in <code>/data</code>, then bundled by <code>scripts/build_data.py</code>. No API keys are in the browser.</p>
      <ul>
        ${cached(!!EXT.intel, `<b>Tavily</b>: ${nIntel} dated news items across ${EXT.intel ? Object.keys(EXT.intel).length : 0} quarterly briefings, each from the 90 days before its quarter (no foresight). Fetched ${esc(EXT.intelFetched || "—")}.`)}
        ${cached(!!EXT.signal, `<b>Tavily</b>: forward-mode news signal ${EXT.signal ? (EXT.signal.value >= 0 ? "+" : "") + EXT.signal.value.toFixed(2) + ` from ${EXT.signal.items.length} headlines` : ""}, scored with a published keyword lexicon (expand it on the end screen).`)}
        ${cached(!!EXT.trade, `<b>Tradeverifyd</b> <code>tia_trade_flow</code> (UN Comtrade): China's share of US imports per mineral. The 2023 share sets each mineral's China exposure in the model. The cards and map only show years that had finished before the current quarter.`)}
        ${cached(!!EXT.trade, `<b>Sayari</b> <code>search_trade_facets</code>: supplier-country concentration (HHI over company counts) and supplier risk-flag counts per HS code, 2025 onward.`)}
        ${cached(!!EXT.copper, `<b>Tradeverifyd</b> <code>tia_commodity_price</code>: copper benchmark${EXT.copper ? `, ${esc(EXT.copper.value)} ${esc(EXT.copper.unit || "")} as of ${esc(EXT.copper.date || "?")}` : ""}.`)}
        ${cached(!!EXT.liveFetched, `<b>Tradeverifyd</b> <code>tia_get_disruptions</code>: ${EXT.disruptions && EXT.disruptions.length ? `${EXT.disruptions.length} active near producing regions` : "no active disruptions near DRC, Inner Mongolia, Jiangxi, Kachin or Sulawesi at fetch time (the feed covers natural hazards)"}. Toggles on the end screen test the effect.`)}
        ${cached(!!EXT.vetted, EXT.vetted ? `<b>Sayari + Tradeverifyd</b> counterparty vetting: ${COUNTERPARTIES.length} real producers. Beneficial owners, watchlist, risk factors and entity score. Flags are tool findings, not allegations.` : `Counterparty vetting not cached, so the offtake candidates are illustrative.`)}
      </ul>
      <h2>Real (cited reporting)</h2>
      <p>Every event's date, actor and direction of effect comes from cited reporting (see each card's sources). Where a size was reported (for example antimony +40% the day after the US ban, Dy ×3 in a month, Dy +150% in Q3 2026, graphite price flat), the game uses it and tags it <span class="chip info">reported</span>.</p>
      <h2>Normalised</h2>
      <p>Each mineral's national demand is 100 units per quarter, and reserves are measured in <b>days of cover</b>. Real tonnages (spec §9) aren't used yet.</p>
      <h2>Assumed (tunable in <code>site/data.js</code>)</h2>
      <p>DRC exposure, rerouting rates, criticality, market depth and price impact, cost per day of cover, storage rate, mean reversion, offtake slip rate and deal terms, block probabilities per risk flag, political-capital effects, the value of protected industrial output, and every multiplier tagged <span class="chip">assumed</span>.</p>
      <h2>Known data limits</h2>
      <ul>
        <li>For US imports, <code>tia_trade_flow</code> only returns China, Japan, Korea and Mexico. Shares are of imports from those four, so they overstate China's share of all US imports.</li>
        <li>Gallium and germanium share basket HS code 811292, so their shares are proxies. Cobalt's US–DRC corridor isn't loaded.</li>
        <li><code>tia_commodity_price</code> has no cobalt, gallium, antimony or nickel prices. Minor-metal prices are an index anchored to cited moves, and modelled points are drawn hollow and dashed.</li>
        <li>Sayari HHI counts supplier companies by country tag, not trade value, so one company can carry several country tags.</li>
        <li>Tavily dates are sometimes crawl dates. Where a URL carries a date, that date was used instead (<code>date_basis</code> in the JSON).</li>
      </ul>`);
    $("btn-close").onclick = closeModal;
  }

  // ---------- End screen + forward mode ----------
  function showEnd() {
    const bench = Sim.benchmarks();
    const you = Sim.score(state, bench.worst);
    $("game").classList.add("hidden");
    const end = $("endscreen"); end.classList.remove("hidden");
    const row = (label, st, sc, cls = "") => `<tr class="${cls}"><td>${label}</td><td>${sc.total.toFixed(1)}</td><td>${sc.parts.cover.toFixed(1)}</td><td>${sc.parts.downtime.toFixed(1)}</td><td>${sc.parts.efficiency.toFixed(1)}</td><td>${sc.parts.political.toFixed(1)}</td><td>${Math.round(st.downtimeDays)}</td><td>${fmt$(st.spent)}</td></tr>`;
    const all = [["You", state, you, "you"], ...Object.values(bench.scored).map((b) => [b.label, b.state, b.score])].sort((a, b) => b[2].total - a[2].total);
    const signal = EXT.signal ? EXT.signal.value : 0;
    end.innerHTML = `
      <div class="panel">
        <div class="kicker">Campaign complete · Q3 2023 → Q4 2026</div>
        <div class="hero" style="margin-top:8px">
          <div><div class="bigscore">${you.total.toFixed(0)}</div><div class="muted">out of 100</div></div>
          <div class="parts">
            <div class="part"><div class="k">Cover (40)</div><div class="v">${you.parts.cover.toFixed(1)}</div><div class="faint">avg weakest-mineral DoC ${you.avgMinDoc.toFixed(0)} / 60</div></div>
            <div class="part"><div class="k">Downtime avoided (30)</div><div class="v">${you.parts.downtime.toFixed(1)}</div><div class="faint">${Math.round(state.downtimeDays)} d vs ${Math.round(bench.worst)} d doing nothing</div></div>
            <div class="part"><div class="k">Efficiency (15)</div><div class="v">${you.parts.efficiency.toFixed(1)}</div><div class="faint">${fmt$(state.spent)} spent</div></div>
            <div class="part"><div class="k">Political capital (15)</div><div class="v">${you.parts.political.toFixed(1)}</div><div class="faint">${Math.round(state.politicalCapital)} / 100</div></div>
          </div>
        </div>
        <div class="section"><h2>Against benchmark strategies (same engine, same history)</h2>
          <table><thead><tr><th>Strategy</th><th>Score</th><th>Cover</th><th>Downtime</th><th>Efficiency</th><th>Pol. cap.</th><th>Downtime d</th><th>Spent</th></tr></thead>
          <tbody>${all.map((a) => row(...a)).join("")}</tbody></table>
          <div class="faint" style="margin-top:6px">The "perfect hindsight" benchmark is a heuristic upper-bound proxy: it knows which minerals get cut within two quarters.</div>
        </div>
      </div>

      <div class="panel section">
        <div class="kicker">Forward mode · 2027</div>
        <h3 style="font-size:20px;margin:4px 0 6px">The 10 January 2027 cliff</h3>
        <p class="muted" style="margin-top:0">China's suspension of its expanded rare-earth controls runs out on 10 Jan 2027, and the April 2025 heavy-REE controls are still in force. Your reserve and offtakes are frozen as they stand, and 1,000 futures run on base rates from 2023–26.</p>
        <div class="fwd-controls">
          <div><label for="sig">News signal (Tavily lexicon score) <b id="sigv">${signal.toFixed(2)}</b></label><input type="range" id="sig" min="-1" max="1" step="0.05" value="${signal}" style="width:220px"/>
            <div class="faint">−1 de-escalation · +1 escalation · ${EXT.signal ? `cached from ${EXT.signal.items.length} headlines, ${esc(EXT.signal.fetched)}. Drag to test sensitivity.` : "no cached signal"}</div></div>
          <div><label>Live disruptions (Tradeverifyd ${EXT.liveFetched ? `· cached ${esc(EXT.liveFetched)}` : ""})</label>
            <div class="chips">${FORWARD.disruptionRegions.map((d) => { const hit = (EXT.disruptions || []).some((x) => x.region === d.id || (d.id === "inner-mongolia" && x.region === "jiangxi")); return `<label class="chip ${hit ? "bad" : ""}"><input type="checkbox" data-dis="${d.id}" ${hit ? "checked" : ""}/> ${esc(d.label)}${hit ? " · active" : ""}</label>`; }).join("")}</div></div>
          <button class="primary" id="btn-run">Run 1,000 futures</button>
        </div>
        ${EXT.signal && EXT.signal.items.length ? `<details class="section"><summary class="muted" style="cursor:pointer">Why the signal is ${signal >= 0 ? "+" : ""}${signal.toFixed(2)}: ${EXT.signal.items.length} scored headlines</summary>
          <table style="margin-top:8px"><thead><tr><th>Headline</th><th>Matched terms</th><th>Score</th></tr></thead><tbody>
          ${EXT.signal.items.map((i) => `<tr><td><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a> <span class="faint">${esc(i.source || "")} ${esc(i.date || "")}</span></td><td style="font-size:11px">${esc((i.matched || []).join(", ") || "—")}</td><td>${i.score > 0 ? "+1" : i.score < 0 ? "−1" : "0"}</td></tr>`).join("")}
          </tbody></table></details>` : ""}
        <div id="fwd-out"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin:20px 0"><button id="btn-again">Play again</button></div>`;
    $("sig").oninput = (e) => ($("sigv").textContent = (+e.target.value).toFixed(2));
    $("btn-run").onclick = runForward;
    $("btn-again").onclick = reset;
    runForward();
    renderStats();
    window.scrollTo(0, 0);
  }

  function fanSVG(fan, start) {
    const W = 300, H = 150, L = 34, R = 18, T = 10, B = 22;
    const max = Math.max(90, ...fan.map((f) => f.p90), start) * 1.1;
    const x = (i) => L + (i / (fan.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - v / max) * (H - T - B);
    const band = fan.map((f, i) => `${x(i)},${y(f.p90)}`).join(" ") + " " + [...fan].reverse().map((f, i) => `${x(fan.length - 1 - i)},${y(f.p10)}`).join(" ");
    const labels = ["Q4 26", ...FORWARD.quarters.map((q) => q.slice(4) + " 27")];
    const ticks = [0, 60, Math.round(max / 60) * 60 > 60 ? Math.round(max / 60) * 60 - 60 : null].filter((v) => v != null && v < max);
    return `<svg viewBox="0 0 ${W} ${H}" aria-label="Fan chart of days of cover">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 60 ? "var(--bad)" : "var(--line)"}" ${t === 60 ? 'stroke-dasharray="4 3"' : ""}/><text x="${L - 4}" y="${y(t) + 3}" font-size="9" text-anchor="end" fill="var(--ink-3)">${t}</text>`).join("")}
      <polygon points="${band}" fill="var(--band)"/>
      <polyline points="${fan.map((f, i) => `${x(i)},${y(f.p50)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>
      ${labels.map((l, i) => `<text x="${x(i)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="var(--ink-3)">${l}</text>`).join("")}
    </svg>`;
  }

  function runForward() {
    const signal = +$("sig").value;
    const disruptions = [...document.querySelectorAll("input[data-dis]:checked")].map((i) => i.dataset.dis);
    const res = MonteCarlo.run(state, { paths: 1000, signal, disruptions });
    const rec = {}; for (const k of KEYS) rec[k] = MonteCarlo.recommend(state, k, { signal, disruptions });
    const cw = res.cliffWeights;
    $("fwd-out").innerHTML = `
      <div class="section chips">
        <span class="chip">Cliff branch: extend ${pct(cw.extend)} · lapse ${pct(cw.lapse)} · new deal ${pct(cw.deal)} <span class="faint">(assumed)</span></span>
        <span class="chip">P(China tightens)/q ${pct(res.pTighten)}</span><span class="chip">P(China eases)/q ${pct(res.pEase)}</span><span class="chip">P(DRC acts)/q ${pct(res.pDRC)}</span>
        <span class="chip ${res.expectedDowntime > 30 ? "bad" : "good"}">Expected downtime ${res.expectedDowntime.toFixed(0)} d (P90 ${res.downtimeP90.toFixed(0)} d)</span>
      </div>
      <div class="fans">${KEYS.map((k) => {
        const m = res.minerals[k], start = state.minerals[k].reserveDoC, r = rec[k];
        return `<div class="card fan">
          <div class="card-head"><div style="display:flex;align-items:center"><span class="sym">${MINERALS[k].symbol}</span><h3>${MINERALS[k].name}</h3></div><span class="faint">now ${start.toFixed(0)} DoC</span></div>
          ${fanSVG(m.fan, start)}
          <div class="metrics">
            <div><div class="k">P(falls below 30)</div><div class="v ${m.pBelow30 > 0.2 ? "up" : ""}">${pct(m.pBelow30)}</div></div>
            <div><div class="k">P(falls below 60)</div><div class="v ${m.pBelow60 > 0.2 ? "up" : ""}">${pct(m.pBelow60)}</div></div>
          </div>
          <div class="banner info" style="margin:0">To stay ≥ 60 DoC in 90% of futures, hold <b>${r == null ? "> 2000" : r} DoC</b>${r != null && r > start ? ` (+${Math.ceil(r - start)} on today)` : r != null ? " ✓ you're there" : ""}.</div>
        </div>`;
      }).join("")}</div>
      <div class="faint section">Band = P10–P90 of days of cover across 1,000 futures, line = median, red dashed = 60-day target. Base rates: China tightened in ~8 of 14 quarters, eased in ~2, DRC acted in ~4.</div>`;
  }

  // ---------- Modal plumbing ----------
  function modal(html) { $("modal").innerHTML = html; $("overlay").classList.remove("hidden"); $("modal").scrollTop = 0; }
  function closeModal() {
    $("overlay").classList.add("hidden");
    if (state.done && $("endscreen").classList.contains("hidden")) showEnd();
  }
  $("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (e.key === "Enter" && !e.target.closest("input, select, textarea")) {
      const btn = $("overlay").classList.contains("hidden") ? $("btn-commit") : ($("btn-continue") || $("btn-start"));
      if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    }
  });
  $("btn-about").onclick = showAbout;
  $("btn-reset").onclick = () => { if (confirm("Restart the campaign from Q3 2023?")) reset(); };

  reset();
  // Demo shortcut: index.html#ff=2024Q4 (or #ff=END) fast-forwards on load.
  const ff = (location.hash.match(/ff=([0-9Q]+|END)/) || [])[1];
  if (ff) { closeModal(); fastForward(ff); }
})();
