/* Stockpile Strategist v4 — Act 4: History strikes (forward test via the unchanged sim.js engine). */
(function (root) {
  const D = root.GAME_DATA, EXT = D.EXT || {}, { QUARTERS, EVENTS, COUNTERPARTIES } = D;
  const PAUSES = { "2023Q3": "Aug 2023", "2024Q4": "Dec 2024", "2025Q2": "Apr 2025", "2025Q4": "Nov 2025" };
  const PAUSE_COPY = {
    "2023Q3": { h: "China licenses gallium and germanium.", q: "Controls are spreading. Do you build up now?" },
    "2024Q4": { h: "China bans gallium, germanium and antimony exports to the US.", q: "Retaliation was immediate. What now?" },
    "2025Q2": { h: "Heavy rare-earth controls. Ford and Suzuki stop lines.", q: "Magnets are where shortages become idle factories." },
    "2025Q4": { h: "US–China truce: a one-year suspension.", q: "Prices are easing. Sell, hold, or keep buying?" },
  };
  const qLabel = (q) => { const m = ["Jan", "Apr", "Jul", "Oct"][+q.slice(5) - 1]; return `${m} ${q.slice(0, 4)}`; };
  let ctx = null;

  function start(G) {
    const U = root.UI, k = G.mission.id;
    ctx = { G, k, qi: 0, speed: 1, skip: false, target: G.stockDays, pendingRelease: 0, pendingOff: [...G.signed], decisions: [], rows: [], ghostRows: [], timer: null };
    U.$("btn-a4").classList.add("hidden");
    U.$("validation").classList.add("hidden");
    U.$("news").innerHTML = ""; U.$("why-q").innerHTML = ""; U.$("realworld").innerHTML = "";
    U.$("pause").classList.add("hidden");
    // Player run + do-nothing ghost, same history.
    ctx.s = Sim.newState();
    ctx.s.budget -= G.investCost; ctx.s.spent += G.investCost;
    ctx.ghost = Sim.newState();
    ctx.net = new NetView(U.$("net4"), G.model, { plantLabel: `US ${G.mission.mustNot.split(" and ")[0].toLowerCase()} line` });
    ctx.net.setFaults(G.faults);
    ctx.net.morph(G.model.nodes.map((n) => n.share), { mode: "supply", duration: 0.01 });
    U.$("btn-speed").onclick = () => { ctx.speed = ctx.speed === 1 ? 2.5 : 1; U.$("btn-speed").textContent = ctx.speed === 1 ? "2× speed" : "Normal speed"; };
    U.$("btn-skip").onclick = () => { ctx.skip = true; U.$("pause").classList.add("hidden"); clearTimeout(ctx.timer); loop(); };
    drawTimeline();
    ctx.timer = setTimeout(loop, 700);
  }

  function ordersFor(s) {
    const k = ctx.k, m = s.minerals[k];
    const want = Math.max(0, Math.ceil(ctx.target - m.reserveDoC));
    let d = Math.min(want, Sim.maxBuy(s, k));
    const offCost = ctx.pendingOff.reduce((a, id) => a + COUNTERPARTIES.find((c) => c.id === id).upfront, 0);
    while (d > 0 && Sim.quoteBuy(s, k, d) + offCost > s.budget) d--;
    const o = { buy: d ? { [k]: d } : {}, release: ctx.pendingRelease ? { [k]: ctx.pendingRelease } : {}, offtakes: ctx.pendingOff.filter((id) => COUNTERPARTIES.find((c) => c.id === id).upfront <= s.budget - Sim.quoteBuy(s, k, d)) };
    ctx.pendingRelease = 0; ctx.pendingOff = [];
    return o;
  }

  function loop() {
    const U = root.UI;
    while (ctx.qi < QUARTERS.length) {
      const q = QUARTERS[ctx.qi];
      const res = Sim.applyOrders(ctx.s, ordersFor(ctx.s));
      if (!res.ok) Sim.applyOrders(ctx.s, {});
      const rep = Sim.resolveQuarter(ctx.s);
      Sim.applyOrders(ctx.ghost, {});
      const ghostRep = Sim.resolveQuarter(ctx.ghost);
      const mr = rep.minerals[ctx.k], gr = ghostRep.minerals[ctx.k];
      ctx.rows.push({ q, reserve: mr.reserve, downtime: mr.downtime, avail: mr.avail, price: mr.priceTo });
      ctx.G.liveReserve = mr.reserve; UI.hud(); UI.$("hud-budget").textContent = UI.fmt$(ctx.s.budget);
      ctx.ghostRows.push({ q, downtime: gr.downtime });
      ctx.qi++;
      const hits = rep.events.filter((e) => e.effects[ctx.k]);
      ctx.lastRep = rep;
      if (!ctx.skip) {
        Guide.tick("watch");
        whyQuarter(q, rep, ghostRep, hits);
        realWorld(q);
        U.$("a4-title").innerHTML = `${qLabel(q)} · ${mr.downtime > 0.5 ? `<span style="color:var(--danger)">line stopped ${Math.round(mr.downtime)} days</span>` : `<span style="color:var(--ok)">line running</span>`}`;
        news(q, rep.events, hits);
        if (hits.length) shock(hits);
        else ctx.net.undim();
        drawTimeline(); priceMini();
        if (PAUSES[q]) { pause(q); return; }
        ctx.timer = setTimeout(loop, (UI.reduced() ? 2200 : 4200) / ctx.speed);
        return;
      }
      if (PAUSES[q]) ctx.decisions.push({ q, choice: "hold (skipped)" });
    }
    finish();
  }

  function news(q, events, hits) {
    const U = root.UI, el = U.$("news");
    const cards = events.length ? events.map((e) => `<div class="news-card breaking ${e.effects[ctx.k] ? "hit" : ""}"><div class="when">${U.esc(e.date)} · ${U.esc(e.actor)}</div><div class="h">${U.esc(e.headline)}</div>
        <div class="faint">${U.esc(e.lesson)}</div><div class="src">${e.sources.slice(0, 2).map((s) => `<a href="${U.esc(s)}" target="_blank" rel="noopener">${U.esc(U.domain(s))}</a>`).join(" · ")}</div></div>`).join("")
      : `<div class="news-card"><div class="when">${qLabel(q)}</div><div class="h">No new controls this quarter.</div><div class="faint">Existing controls still bite while rerouting slowly fills the gap.</div></div>`;
    el.insertAdjacentHTML("afterbegin", cards);
    if (root.gsap && !U.reduced()) { const tw = root.gsap.from(el.firstElementChild, { x: -20, opacity: 0, duration: 0.5 }); setTimeout(() => tw.progress(1), 620); }
  }

  /** Which suppliers a historical event hits: direct (actor's country) and via structural link (inferred). */
  function hitSets(events) {
    const M = ctx.G.model, direct = new Set(), linked = new Set();
    for (const e of events) {
      const eff = e.effects[ctx.k]; if (!eff) continue;
      const actor = eff.actor || (/DRC/i.test(e.actor) ? "drc" : /China/i.test(e.actor) ? "china" : null);
      if (!(eff.cut || eff.setCut || (eff.priceMult || 1) > 1.05)) continue;
      M.nodes.forEach((n, i) => {
        const cn = ["CHN", "HKG"].includes(n.country) || /^china/i.test(n.label);
        if (actor === "china" && cn) direct.add(i);
        if (actor === "drc" && n.country === "COD") direct.add(i);
      });
      M.nodes.forEach((n, i) => {
        if (direct.has(i)) return;
        if (actor === "china" && n.chinaLinked) linked.add(i);
        if (M.links.some((l) => (l.i === i && direct.has(l.j)) || (l.j === i && direct.has(l.i)))) linked.add(i);
        // upstream feed from the actor's country (≥40% of input)
        for (const t of M.tier2) if (((actor === "china" && t.country === "CHN") || (actor === "drc" && t.country === "COD")) && (t.share || {})[n.id] >= 0.4) linked.add(i);
      });
    }
    return { direct, linked };
  }

  /** Why this quarter went the way it did, for the mission mineral: where a quarter's supply came from. */
  function whyQuarter(q, rep, ghostRep, hits) {
    const U = root.UI, m = rep.minerals[ctx.k], g = ghostRep.minerals[ctx.k], Q = 91.25;
    const imports = Math.min(Q, m.avail * Q), off = Math.min(Q - imports, m.offtake || 0), drawn = Math.min(Q - imports - off, m.drawn || 0), gap = Math.max(0, Q - imports - off - drawn);
    const seg = (v, c, l) => (v > 0.3 ? `<span style="width:${(v / Q) * 100}%;background:${c}" title="${l}: ${Math.round(v)} days"></span>` : "");
    const cause = hits.length ? `${U.esc(hits[0].actor)}: ${U.esc(hits[0].headline)}` : m.avail < 0.98 ? "Earlier controls are still in force; rerouting fills part of the gap." : "Imports flowed normally.";
    const dp = m.priceTo / m.priceFrom - 1;
    U.$("why-q").innerHTML = `<h4>Why ${qLabel(q)} went this way · ${U.esc(ctx.G.mission.name)}</h4>
      <div class="faint">${cause}</div>
      <div class="wf" role="img" aria-label="Where this quarter's supply came from">${seg(imports, "#3987e5", "Imports")}${seg(off, "#5fc08f", "Offtake deliveries")}${seg(drawn, "#E08A52", "From your reserve")}${seg(gap, "#FF5A4E", "Unmet")}</div>
      <div class="wf-legend"><span><i style="background:#3987e5"></i>Imports ${Math.round((imports / Q) * 100)}%</span>${off > 0.3 ? `<span><i style="background:#5fc08f"></i>Offtakes ${Math.round(off)} d</span>` : ""}<span><i style="background:#E08A52"></i>Reserve drawn ${Math.round(drawn)} d</span><span><i style="background:#FF5A4E"></i>Unmet ${Math.round(gap)} d</span></div>
      <div style="margin-top:6px">${Guide.chips([{ k: "Line stopped", delta: m.downtime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "If you'd done nothing", delta: g.downtime, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "Price", delta: dp * 100, unit: "%", goodIfDown: true, fmt: (v) => Math.round(v) }])}</div>`;
  }

  /** What governments and industry actually did this quarter (Tavily-sourced, data/responses.json). */
  function realWorld(q) {
    const U = root.UI;
    const items = (EXT.responses || []).filter((it) => it.quarter === q && (!it.minerals || !it.minerals.length || it.minerals.includes(ctx.k) || it.minerals.includes("all")));
    const score = (it) => ((it.minerals || []).includes(ctx.k) ? 1 : 0);
    const chosen = items.sort((a, b) => score(b) - score(a)).slice(0, 3);
    U.$("realworld").innerHTML = chosen.length ? `<h4>What the real world did · ${qLabel(q)}</h4>${chosen.map((it) => `<div class="item"><b>${U.esc(it.actor)}</b> · ${U.esc(it.date)} — ${U.esc(it.summary)}${it.amountUSD ? ` <span class="mini">${U.fmt$(it.amountUSD / 1e6)}</span>` : ""} <a href="${U.esc(it.source)}" target="_blank" rel="noopener">${U.esc(U.domain(it.source))}</a></div>`).join("")}` : "";
  }

  /** Model price index vs real, cited price anchors (indexed), revealed up to the current quarter. */
  function priceMini() {
    const U = root.UI, host = U.$("timeline").parentElement;
    let svg = host.querySelector(".price-mini");
    if (!svg) { host.insertAdjacentHTML("beforeend", `<svg class="price-mini" viewBox="0 0 900 90" role="img" aria-label="Model price vs real prices"></svg><div class="faint price-note"></div>`); svg = host.querySelector(".price-mini"); }
    const hist = ctx.s.minerals[ctx.k].hist.price.slice(1), n = QUARTERS.length;
    const real = ((EXT.prices || {})[ctx.k] || {}).index || [];
    const realKnown = real.filter((p) => QUARTERS.indexOf(p.quarter) >= 0 && QUARTERS.indexOf(p.quarter) < ctx.qi);
    const max = Math.max(150, ...hist, ...realKnown.map((p) => p.value)) * 1.1;
    const X = (i) => 46 + ((i + 0.5) / n) * (900 - 60), Y = (v) => 82 - (v / max) * 70;
    svg.innerHTML = `<text x="46" y="10">${U.esc(ctx.G.mission.name)} price you pay (line: real path + your buying impact) vs cited real prices (dots), first point = 100</text>
      <line x1="46" x2="886" y1="${Y(100)}" y2="${Y(100)}" stroke="rgba(148,163,184,.25)" stroke-dasharray="3 4"/>
      ${hist.length > 1 ? `<polyline points="${hist.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}" fill="none" stroke="#AEB6C4" stroke-width="1.8"/>` : ""}
      ${realKnown.map((p) => `<circle cx="${X(QUARTERS.indexOf(p.quarter))}" cy="${Y(p.value)}" r="4.5" fill="#E08A52"><title>${p.quarter}: real ${Math.round(p.value)} (index)</title></circle>`).join("")}`;
    const meta = (EXT.prices || {})[ctx.k];
    host.querySelector(".price-note").textContent = meta ? `Real prices: ${meta.series || ""} (${meta.unit || ""}), ${real.length} cited points from Tavily-sourced reporting. ${meta.notes ? String(meta.notes).slice(0, 200) : ""}` : "No cited price series cached for this mineral.";
  }

  function shock(hits) {
    const { direct, linked } = hitSets(hits);
    ctx.net.undim();
    ctx.net.pulse([...direct]);
    setTimeout(() => ctx.net.pulse([...linked], { duration: 1.4 }), 450);
  }

  function pause(q) {
    const U = root.UI, el = U.$("pause"), copy = PAUSE_COPY[q];
    const nextQ = QUARTERS[ctx.qi];
    const intel = ((EXT.intel || {})[nextQ] || {}).items || [];
    const s = ctx.s, m = s.minerals[ctx.k];
    const clean = COUNTERPARTIES.filter((c) => c.mineral === ctx.k && !ctx.G.signed.includes(c.id) && !ctx.decisions.some((d) => d.cp === c.id) && !ACTS.isLinked(c) && c.upfront <= s.budget).sort((a, b) => a.upfront - b.upfront)[0];
    const choices = q === "2025Q4"
      ? [{ id: "sell", b: "Sell half", s: `Recover ≈${U.fmt$(0.5 * Sim.reserveValue(s, ctx.k) * 0.9)} at today's price` }, { id: "hold", b: "Hold", s: "Keep the reserve as it is" }, { id: "buy", b: "Keep buying +30 days", s: "Prices are lower now" }]
      : [{ id: "buy", b: "Buy 30 more days", s: `Target ${Math.round(ctx.target + 30)} days of cover` }, { id: "hold", b: "Hold course", s: `Stay at ${Math.round(ctx.target)} days` }, clean ? { id: "deal", b: `Sign ${clean.name}`, s: `${U.fmt$(clean.upfront)} · ${clean.docPerQ} d/qtr · lag ${clean.lag[0]}–${clean.lag[1]}q`, cp: clean.id } : null].filter(Boolean);
    // Preview the consequence of each choice before committing (sim.js cost + price-impact model).
    const P = D.MINERALS[ctx.k], d30 = Math.min(30, Sim.maxBuy(s, ctx.k));
    const preview = {
      buy: [{ k: "Cost now", delta: -Sim.quoteBuy(s, ctx.k, d30), unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Price", delta: ((P.eta * d30) / P.marketDepth) * 100, unit: "%", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "Runtime", delta: 30 / ctx.G.threshold, unit: " d", fmt: (v) => Math.round(v) }],
      hold: [{ k: "Budget", delta: 0, unit: "", fmt: () => "kept" }],
      sell: [{ k: "Cash", delta: 0.5 * Sim.reserveValue(s, ctx.k) * 0.9, unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Reserve", delta: -Math.floor(m.reserveDoC / 2), unit: " d", fmt: (v) => Math.round(v) }],
      deal: clean ? [{ k: "Upfront", delta: -clean.upfront, unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Supply", delta: clean.docPerQ, unit: " d/qtr", fmt: (v) => v }] : [],
    };
    el.innerHTML = `<div class="eyebrow" style="margin-bottom:6px">Decision · ${PAUSES[q]}</div><h3>${U.esc(copy.h)}</h3><div class="faint">${U.esc(copy.q)} Reserve: <b class="num">${Math.round(m.reserveDoC)} days</b> · Budget <b class="num">${U.fmt$(s.budget)}</b></div>
      ${intel.length ? `<div class="intel">${intel.slice(0, 2).map((i) => `<div>📰 <a href="${U.esc(i.url)}" target="_blank" rel="noopener">${U.esc(i.title)}</a> <span class="faint">${U.esc(i.source)} · ${U.esc(i.date)}</span></div>`).join("")}</div>` : ""}
      <div class="choices" role="group" aria-label="Choices">${choices.map((c) => `<button data-c="${c.id}" ${c.cp ? `data-cp="${c.cp}"` : ""}><b>${U.esc(c.b)}</b><span>${U.esc(c.s)}</span>${Guide.chips(preview[c.id] || [])}</button>`).join("")}</div>`;
    el.classList.remove("hidden");
    const btns = [...el.querySelectorAll("button")];
    btns[0].focus();
    btns.forEach((b, i) => {
      b.onkeydown = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); btns[(i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length].focus(); } };
      b.onclick = () => {
        const c = b.dataset.c;
        if (c === "buy") ctx.target += 30;
        if (c === "sell") { const half = Math.floor(m.reserveDoC / 2); const val = (half / Math.max(1, m.reserveDoC)) * Sim.reserveValue(s, ctx.k) * 0.9; m.reserveDoC -= half; s.budget += val; ctx.target = Math.max(0, m.reserveDoC); }
        if (c === "deal") ctx.pendingOff.push(b.dataset.cp);
        ctx.decisions.push({ q, choice: b.querySelector("b").textContent, cp: b.dataset.cp });
        const st = Guide.STEPS[4].steps.find((x) => x.id === "decide");
        if (st) st.label = `Make 4 decisions (${Math.min(4, ctx.decisions.length)}/4)`;
        if (ctx.decisions.length >= 4) Guide.tick("decide");
        Guide.log(4, `${PAUSES[q]}: ${b.querySelector("b").textContent}`, preview[c] || [], PAUSE_COPY[q].h);
        el.classList.add("hidden");
        ctx.timer = setTimeout(loop, 600);
      };
    });
  }

  function drawTimeline() {
    const U = root.UI, svg = U.$("timeline");
    const W = 900, H = 240, L = 46, R = 14, T = 16, B = 34;
    const n = QUARTERS.length, x = (i) => L + ((i + 0.5) / n) * (W - L - R);
    const maxDoc = Math.max(60, ctx.target, ...ctx.rows.map((r) => r.reserve)) * 1.15;
    const yTop = T, yMid = 150, yDoc = (v) => yMid - (v / maxDoc) * (yMid - yTop);
    const barH = (d) => Math.min(60, (d / 91) * 60);
    const pts = ctx.rows.map((r, i) => `${x(i)},${yDoc(r.reserve)}`).join(" ");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <text x="${L - 8}" y="${yDoc(0) + 4}" text-anchor="end">0</text><text x="${L - 8}" y="${yDoc(maxDoc / 1.15) + 4}" text-anchor="end">${Math.round(maxDoc / 1.15)}</text>
      <text x="${L}" y="${T - 4}">Your reserve (days of cover)</text>
      <line x1="${L}" x2="${W - R}" y1="${yMid}" y2="${yMid}" stroke="rgba(148,163,184,.25)"/>
      <text x="${L}" y="${yMid + 16}">Factory days lost per quarter: yours (solid) vs doing nothing (outline)</text>
      ${ctx.ghostRows.map((r, i) => r.downtime > 0.5 ? `<rect x="${x(i) - 13}" y="${yMid + 22}" width="26" height="${barH(r.downtime)}" fill="none" stroke="#FF5A4E" stroke-dasharray="3 3" rx="3"><title>${r.q}: doing nothing loses ${Math.round(r.downtime)} days</title></rect>` : "").join("")}
      ${ctx.rows.map((r, i) => r.downtime > 0.5 ? `<rect x="${x(i) - 9}" y="${yMid + 22}" width="18" height="${barH(r.downtime)}" fill="#FF5A4E" rx="3"><title>${r.q}: you lose ${Math.round(r.downtime)} days</title></rect>` : `<rect x="${x(i) - 9}" y="${yMid + 22}" width="18" height="3" fill="#5fc08f" rx="1.5"><title>${r.q}: line running</title></rect>`).join("")}
      ${ctx.rows.length > 1 ? `<polyline points="${pts}" fill="none" stroke="#E08A52" stroke-width="2.5" stroke-linejoin="round"/>` : ""}
      ${ctx.rows.map((r, i) => `<circle cx="${x(i)}" cy="${yDoc(r.reserve)}" r="4" fill="#E08A52"><title>${r.q}: ${Math.round(r.reserve)} days in reserve</title></circle>`).join("")}
      ${QUARTERS.map((q, i) => (i % 2 === 0 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${q.slice(2, 4)}Q${q.slice(5)}</text>` : "")).join("")}`;
  }

  function finish() {
    const U = root.UI, G = ctx.G;
    drawTimeline();
    const yours = ctx.rows.reduce((s, r) => s + r.downtime, 0), ghost = ctx.ghostRows.reduce((s, r) => s + r.downtime, 0);
    const histEvents = EVENTS.filter((e) => e.effects[ctx.k]);
    const { direct, linked } = hitSets(histEvents);
    const hit = new Set([...direct, ...linked]);
    const faultsHit = G.faults.filter((i) => hit.has(i));
    const verdict = faultsHit.length === 2 ? "match" : faultsHit.length === 1 ? "partial" : "miss";
    const names = (idx) => [...idx].map((i) => G.model.nodes[i].label.split(" (")[0]).join(", ") || "none";
    const inSample = !G.model.synthetic && (G.model.periods || []).some((p) => p >= "2023Q3");
    G.history = { yours, ghost, verdict, decisions: ctx.decisions, state: ctx.s };
    U.$("a4-title").innerHTML = yours < ghost - 0.5 ? `Your line lost <span class="num">${Math.round(yours)}</span> days. Doing nothing: <span class="num" style="color:var(--danger)">${Math.round(ghost)}</span>.` : `Your line lost <span class="num" style="color:var(--danger)">${Math.round(yours)}</span> days (doing nothing: ${Math.round(ghost)}).`;
    const v = U.$("validation");
    v.classList.remove("hidden");
    v.innerHTML = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="tag ${verdict}">${verdict === "match" ? "Match" : verdict === "partial" ? "Partial match" : "Miss"}</span><b>Your reverse stress test flagged ${U.esc(names(G.faults))}.</b></div>
      <p style="margin:8px 0 4px">${histEvents.length} ${U.esc(G.mission.name.toLowerCase())} events, 2023–26. Hit directly: <b>${direct.size ? U.esc(names(direct)) : "no supplier node (the shock landed upstream)"}</b>.${linked.size ? ` Hit through structural links or shared feedstock: <b>${U.esc(names(linked))}</b>.` : ""}</p>
      <p class="faint" style="margin:0">${inSample ? "Honesty note: this network's Σ was estimated from 2023–26 shipments, so this is an in-sample check, not a held-out test." : "The network's correlations are assumed structure, not fit to this history. Links count as \"hit\" only by inference."} ${verdict === "miss" ? "A miss is still a lesson: the model ranks how a loss is most likely to happen, not which shock history chose." : ""}</p>`;
    ctx.net.undim();
    Guide.tick("watch"); Guide.tick("decide"); Guide.tick("validate");
    priceMini();
    Guide.log(4, "History replayed", [{ k: "Days lost", delta: yours, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }, { k: "Doing nothing", delta: ghost, unit: " d", goodIfDown: true, fmt: (v) => Math.round(v) }], `Validation: ${verdict}`);
    U.$("btn-a4").classList.remove("hidden");
    U.$("btn-a4").onclick = () => { Guide.tick("go4"); Router.show(5); };
    U.$("btn-a4").focus();
  }

  root.Replay = { start };
})(window);
