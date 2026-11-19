/* Stockpile Strategist — story mode controller.
 * 13 short steps, one idea each. The supply chain is a live side panel that reacts to every
 * decision and, in 2023–26, plays the real shocks out on screen. */
(function () {
  const D = window.GAME_DATA, EXT = D.EXT || {}, { MINERALS, COUNTERPARTIES } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => `${Math.round(x * 100)}%`;
  const fmt$ = (m) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`);
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  const CLIFF = Date.UTC(2027, 0, 10);
  const daysToCliff = () => Math.max(0, Math.ceil((CLIFF - Date.now()) / 864e5));
  const INVESTIGATE_COST = 25; // $M per ownership check (assumed)
  const CV_NEW = 0.25;         // variability of a new supplier's deliveries (assumed)

  const G = (window.G = { stepIdx: -1, mission: null, model: null, net: null, netFor: null, threshold: 0.25, L: 25,
    guess: [], faults: [], a: null, guessHits: 0, stockDays: 0, signed: [], investigated: new Set(), investCost: 0, dStart: null, dNow: null, historyDone: false });

  // ---------- small UI helpers ----------
  function fx(make, ms = 1200) { if (!gsap || reduced()) return; const tw = make(); setTimeout(() => tw && tw.progress(1), ms); }
  function countUp(el, to, opts = {}) {
    const f = opts.format || ((v) => Math.round(v)), from = opts.from != null ? opts.from : 0;
    if (!el) return; if (!gsap || reduced()) { el.textContent = f(to); return; }
    const st = { v: from }; const tw = gsap.to(st, { v: to, duration: opts.duration || 0.9, ease: "power2.out", onUpdate: () => (el.textContent = f(st.v)) });
    setTimeout(() => { tw.progress(1); el.textContent = f(to); }, (opts.duration || 0.9) * 1000 + 120);
  }
  function toast(html, kind = "") {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const t = document.createElement("div"); t.className = `toast ${kind}`; t.setAttribute("role", "status"); t.innerHTML = html;
    document.body.appendChild(t); fx(() => gsap.from(t, { y: -12, opacity: 0, duration: 0.3 }), 400);
    setTimeout(() => t.remove(), 5000);
  }
  function drawer(html) { $("drawer-body").innerHTML = html; $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("drawer-close").focus(); }
  function closeDrawer() { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); }
  $("drawer-close").onclick = closeDrawer;
  const kpi = (k, v, s, cls = "") => `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`;
  const tile = (m, cls = "") => `<span class="tile ${cls}" style="--tile:${m.color}"><span class="z">${m.num}</span>${m.sym}</span>`;
  const shortName = (s) => String(s).split(" (")[0].split(" - ")[0].replace(/\s+direct\b.*$/i, "").replace(/\s*&\s*warehouse.*$/i, "").replace(/\s+(lots|metal)$/i, "").trim();
  window.UI = { $, esc, pct, fmt$, domain, countUp, toast, reduced, fx, drawer, kpi, shortName };

  // ---------- model maths (unchanged from the reverse-stress engine) ----------
  const isLinked = (cp) => cp.ownerChina || (cp.upstreamChina || 0) > 0;
  const cps = () => COUNTERPARTIES.filter((c) => c.mineral === G.mission.id).sort((a, b) => a.upfront / a.docPerQ - b.upfront / b.docPerQ);
  function effSigma(list = G.signed, naive = {}) {
    let S = G.model.stressS;
    for (const id of list) {
      const cp = COUNTERPARTIES.find((c) => c.id === id), linked = isLinked(cp) && !naive[id];
      S = RST.addSupplier(S, 100, Missions.volumeFromDocPerQ(cp.docPerQ), CV_NEW, (i) => (linked && i < G.model.nodes.length && G.model.nodes[i].chinaLinked ? 0.8 : 0));
    }
    return S;
  }
  const dist = (S, days) => RST.distance(S, G.L, Missions.bufferFromDays(days));
  const dNow = () => dist(effSigma(), G.stockDays);
  function stockCost(days) {
    const s = Sim.newState(), k = G.mission.id, p = MINERALS[k];
    let left = days, cost = 0, q = 0;
    while (left > 0 && q < 8) { const d = Math.min(left, Sim.maxBuy(s, k)); cost += Sim.quoteBuy(s, k, d); s.minerals[k].priceIdx *= 1 + (p.eta * d) / p.marketDepth; left -= d; q++; }
    return { cost, quarters: q };
  }
  function budgetLeft() {
    if (!G.mission) return D.CONFIG.budget;
    const up = G.signed.reduce((s, id) => s + COUNTERPARTIES.find((c) => c.id === id).upfront, 0);
    return D.CONFIG.budget - stockCost(G.stockDays).cost - up - G.investCost;
  }
  const zoneBar = (d, d0) => { const x = (v) => Math.min(98, (v / 5) * 100); return `<div class="zonebar">${d0 != null ? `<b style="left:${x(d0)}%" title="where you started"></b>` : ""}<i style="left:${x(d)}%"></i></div><div class="zonelabels"><span>Danger</span><span>At risk</span><span>Safe</span><span>Very safe</span></div>`; };

  // ---------- steps ----------
  const STEPS = [
    { id: "pick", title: "Choose a mineral", enter: stepPick, can: () => !!G.mission },
    { id: "limit", title: "Your factory's limit", enter: stepLimit },
    { id: "map", title: "The supply chain", enter: stepMap, live: true },
    { id: "quiz", title: "Quiz", enter: stepQuiz, live: true, can: () => G.guess.length === 2, next: "Check my answer" },
    { id: "answer", title: "The weak spots", enter: stepAnswer, live: true },
    { id: "hidden", title: "The hidden weak point", enter: stepHidden, live: true },
    { id: "store", title: "Build a stockpile", enter: stepStore, live: true },
    { id: "deals", title: "Supply deals", enter: stepDeals, live: true },
    { id: "check", title: "Check your plan", enter: stepCheck, live: true, next: "Start: July 2023 →" },
    { id: "history", title: "Live through 2023–26", enter: () => Replay.start(G), live: true, can: () => G.historyDone, next: "See the results", noBack: true },
    { id: "results", title: "Your results", enter: () => Replay.results(G), next: "Face 2027 →", noBack: true },
    { id: "futures", title: "The 2027 deadline", enter: () => Futures.start(G), next: "See my report", noBack: true },
    { id: "report", title: "Your report", enter: () => Futures.report(G), last: true, noBack: true },
  ];
  const idx = (id) => STEPS.findIndex((s) => s.id === id);

  function go(i) {
    i = Math.max(0, Math.min(STEPS.length - 1, i));
    const st = STEPS[i];
    G.stepIdx = i;
    $("front").classList.add("hidden"); $("app").classList.remove("hidden"); $("hud").classList.remove("hidden"); $("dock").classList.remove("hidden");
    $("stage").classList.add("dim"); Stage.setRotate(false);
    document.querySelectorAll(".step").forEach((s) => s.classList.toggle("on", s.dataset.step === st.id));
    $("app").classList.toggle("with-live", !!st.live);
    $("live").classList.toggle("hidden", !st.live);
    if (st.live) ensureNet();
    $("liveExtra").innerHTML = "";
    st.enter();
    hud(); nav();
    window.scrollTo(0, 0);
    const card = document.querySelector(".step.on .card");
    if (card) { fx(() => gsap.from(card, { opacity: 0, y: 10, duration: 0.35, clearProps: "all" }), 450); const h = card.querySelector("h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  }
  function nav() {
    const st = STEPS[G.stepIdx];
    $("btn-back").disabled = G.stepIdx <= 0 || !!st.noBack;
    $("btn-next").textContent = st.last ? "Play again" : st.next || "Next →";
    $("btn-next").disabled = st.can ? !st.can() : false;
    $("dock-hint").textContent = st.can && !st.can() ? ({ pick: "Pick a mineral to continue", quiz: "Tap two suppliers on the map", history: "Watch, or press Skip to the end" }[st.id] || "") : "";
  }
  window.UI.nav = nav;
  $("btn-next").onclick = () => {
    const st = STEPS[G.stepIdx];
    if (st.last) { location.hash = ""; location.reload(); return; }
    if (st.id === "check") Guide.log(9, "Started the clock", [{ k: "Safety margin", delta: dNow(), unit: "×", fmt: (v) => v.toFixed(1) }, { k: "Stored", delta: G.stockDays, unit: " days", fmt: (v) => Math.round(v) }], `${G.signed.length} deal(s)`);
    go(G.stepIdx + 1);
  };
  $("btn-back").onclick = () => go(G.stepIdx - 1);

  function hud() {
    const m = G.mission, st = STEPS[G.stepIdx];
    $("hud-mission").innerHTML = m ? `${tile(m, "sm")}<div><div class="t">${esc(m.name)}</div><div class="s">${esc(m.mustNot)}</div></div>` : "";
    $("hud-progress").innerHTML = `<div class="lab"><span>Step ${G.stepIdx + 1} of ${STEPS.length} · <b>${esc(st.title)}</b></span></div><div class="bar">${STEPS.map((s, i) => `<i class="${i < G.stepIdx ? "done" : i === G.stepIdx ? "on" : ""}" title="${esc(s.title)}"></i>`).join("")}</div>`;
    if (G.liveMoney == null) $("hud-money").textContent = fmt$(G.history ? G.history.state.budget : budgetLeft());
    $("hud-countdown").textContent = `${daysToCliff()} days`;
    Guide.render();
  }
  window.UI.hud = hud;

  // ---------- live panel ----------
  function ensureNet() {
    if (!G.mission) return;
    if (G.net && G.netFor === G.mission.id && $("liveGraph").querySelector("svg")) return;
    G.model = Missions.buildModel(G.mission.id);
    G.net = new NetView($("liveGraph"), G.model, { plantLabel: "Your US factory" });
    G.netFor = G.mission.id;
    G.net.onTap = (i) => (G.onTap ? G.onTap(i) : i < G.model.nodes.length && nodeInfo(G.model.nodes[i]));
    for (const id of G.signed) addDealNode(COUNTERPARTIES.find((c) => c.id === id), false);
    G.net.setTank(G.stockDays); G.net.setFactory("running", "running");
    $("liveBadge").classList.toggle("hidden", !G.model.synthetic);
    $("liveBadge").onclick = evidence;
  }
  function liveStatus(items) {
    $("liveStatus").innerHTML = items.map((x) => `<div class="ls ${x.cls || ""}"><div class="k">${esc(x.k)}</div><div class="v">${x.v}</div></div>`).join("");
  }
  window.UI.liveStatus = liveStatus;
  function legend(kind) {
    const L = {
      supply: `<span><i style="border-color:var(--mission)"></i>supplier · size = share of supply</span><span><i style="border-color:#c7cbd4"></i>China-linked</span><span><i style="border-color:rgba(148,163,184,.6)"></i>top row: their raw material</span>`,
      risk: `<span><i style="border-color:var(--danger)"></i>weak spot · size = share of a shortage</span><span><span class="dash"></span>fail together</span>`,
      live: `<span><i style="border-color:var(--mission)"></i>supplier</span><span>−x% = supply cut</span><span>tank = your stockpile</span><span><span class="dash"></span>fail together</span>`,
    };
    $("liveLegend").innerHTML = L[kind] || "";
  }
  window.UI.legend = legend;
  const baseStatus = () => liveStatus([{ k: "Imports arriving", v: "100%", cls: "good" }, { k: "Stockpile", v: `${G.stockDays} days`, cls: G.stockDays ? "ore" : "" }, { k: "Factory", v: "Running", cls: "good" }]);
  function riskMorph(animate = true) {
    const { a } = RST.solve(effSigma(), G.L);
    G.net.morph(a.map((v) => Math.max(0, v) / G.L), { mode: "risk", duration: animate ? 0.9 : 0.01, ease: "power2.out" });
  }
  function addDealNode(cp, animate = true) {
    const linkTo = isLinked(cp) ? G.model.nodes.map((n, i) => (n.chinaLinked ? i : -1)).filter((i) => i >= 0).slice(0, 1) : [];
    const k = G.net.addNode({ id: cp.id, label: cp.name, country: cp.country, share: Missions.volumeFromDocPerQ(cp.docPerQ) / 100, chinaLinked: isLinked(cp), sub: "your deal", linkReason: "tied to China" }, animate ? linkTo : []);
    if (!animate && linkTo.length) { G.net.extraLinks.push({ i: k, j: linkTo[0], on: true }); G.net.render(); }
    G.net.setTank(G.stockDays);
  }

  // ---------- Step 1: pick ----------
  function stepPick() {
    $("s-pick").innerHTML = `<div class="step-k">Step 1</div><h2>Which mineral will you protect?</h2>
      <p class="lead">You'll follow one mineral through real events from 2023 to 2027.</p>
      <div class="missions" role="list">${Missions.MISSIONS.map((m) => `<button class="mission" role="listitem" data-m="${m.id}" aria-pressed="${G.mission && G.mission.id === m.id}" style="--tile:${m.color}">
        ${tile(m)}<div class="nm">${esc(m.name)}</div><div class="use">${esc(m.mustNot)}</div>
        <div class="pips">${[1, 2, 3].map((p) => `<i class="${p <= m.difficulty ? "on" : ""}"></i>`).join("")}<span style="margin-left:5px">${["", "Easier", "Medium", "Harder"][m.difficulty]}</span></div></button>`).join("")}</div>
      <div class="pick-detail" id="pickDetail">${G.mission ? pickText(G.mission) : "Pick a card to see why it matters."}</div>`;
    $("s-pick").querySelectorAll(".mission").forEach((b, i, all) => {
      b.onclick = () => {
        const m = Missions.MISSIONS.find((x) => x.id === b.dataset.m);
        if (!G.mission || G.mission.id !== m.id) Object.assign(G, { mission: m, guess: [], faults: [], stockDays: 0, signed: [], investigated: new Set(), investCost: 0, net: null, netFor: null, _answered: false });
        document.documentElement.style.setProperty("--mission", m.color);
        all.forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
        $("pickDetail").innerHTML = pickText(m);
        Stage.focus(m.id, m.color); hud(); nav();
      };
      b.onkeydown = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length].focus(); } };
    });
  }
  const pickText = (m) => `<b>${esc(m.name)}</b>: ${esc(m.what || "")}<br><span class="faint">${esc(m.hook)}</span>`;

  // ---------- Step 2: limit ----------
  let factoryRAF = null;
  function stepLimit() {
    $("s-limit").innerHTML = `<div class="step-k">Step 2</div><h2>How big a shortage can your factory survive?</h2>
      <div class="factory-row"><div>
        <div class="slider-head"><span class="muted">It stops if supply falls by more than</span><span class="big num" id="thrv">${Math.round(G.threshold * 100)}%</span></div>
        <input type="range" id="thr" min="10" max="40" step="1" value="${Math.round(G.threshold * 100)}" aria-label="Shortage that stops the factory">
        <div class="faint">…for three months. 25% is a sensible default.</div>
        <div class="kpis" id="thrK"></div></div>
        <div class="factory" id="factory" aria-label="Factory demo"></div></div>`;
    const upd = () => {
      const d = RST.distance(Missions.buildModel(G.mission.id).stressS, G.L);
      $("thrK").innerHTML = kpi("Missing supply that stops it", `${Math.round(G.threshold * 91.25)} days`, "in a 3-month period") + kpi("Starting safety margin", `${Plain.margin(d)}`, `${Plain.zone(d).label}, with nothing stored`, d < 1.5 ? "bad" : "");
    };
    $("thr").oninput = (e) => { G.threshold = +e.target.value / 100; G.L = G.threshold * 100; $("thrv").textContent = `${e.target.value}%`; upd(); };
    $("thr").onchange = () => Guide.log(2, `Factory limit: ${Math.round(G.threshold * 100)}% shortage`, []);
    upd(); factoryDemo();
  }
  function factoryDemo() {
    $("factory").innerHTML = `<svg viewBox="0 0 170 116" role="img" aria-label="Factory">
      <path d="M12 106 V60 L48 42 V60 L84 42 V60 L120 42 V106 Z" fill="rgba(30,41,59,.9)" stroke="#AEB6C4" stroke-width="1.5"/><rect x="126" y="24" width="14" height="82" fill="rgba(30,41,59,.9)" stroke="#AEB6C4" stroke-width="1.5"/>
      <g id="gear" transform="translate(64 84)"><circle r="13" fill="none" stroke="#E08A52" stroke-width="4" stroke-dasharray="5 4"/><circle r="4" fill="#E08A52"/></g>
      <circle id="lamp" cx="100" cy="76" r="6" fill="#5fc08f"/><text id="sup" x="85" y="16" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#AEB6C4"></text></svg>`;
    cancelAnimationFrame(factoryRAF);
    let ang = 0; const t0 = performance.now();
    const loop = (t) => {
      if (STEPS[G.stepIdx].id !== "limit") return;
      const s = Math.max(0, 0.22 + 0.2 * Math.sin((t - t0) / 900) + 0.06 * Math.sin((t - t0) / 310)), stopped = s > G.threshold;
      if (!stopped && !reduced()) ang = (ang + 4) % 360;
      const g = $("gear"); if (!g) return;
      g.setAttribute("transform", `translate(64 84) rotate(${ang})`);
      $("lamp").setAttribute("fill", stopped ? "#FF5A4E" : "#5fc08f");
      $("sup").textContent = `supply −${Math.round(s * 100)}% · ${stopped ? "STOPPED" : "running"}`; $("sup").setAttribute("fill", stopped ? "#FF5A4E" : "#AEB6C4");
      factoryRAF = requestAnimationFrame(loop);
    };
    factoryRAF = requestAnimationFrame(loop);
  }

  // ---------- Step 3: map ----------
  function stepMap() {
    G.onTap = null;
    G.net.setFaults([]); G.net.showLinks(false); G.net.upstream({ flows: [], converged: {}, spof: null }, false); G.net.clearHalos();
    G.net.morph(G.model.nodes.map((n) => n.share), { mode: "supply", duration: 0.6, ease: "power2.out" });
    G.net.setFlows([]);
    legend("supply"); baseStatus();
    const top = [...G.model.nodes].sort((a, b) => b.share - a.share)[0];
    const cn = G.model.nodes.filter((n) => n.chinaLinked).reduce((s, n) => s + n.share, 0);
    $("s-map").innerHTML = `<div class="step-k">Step 3</div><h2>Where America's ${esc(G.mission.name.toLowerCase())} comes from</h2>
      <p class="lead">Each circle is a supplier. <b>Bigger = more supply.</b> Tap one for details.</p>
      <div class="kpis">${kpi("Biggest supplier", esc(shortName(top.label)), `${pct(top.share)} of supply`)}${kpi("China-linked", pct(cn), "of supply")}</div>
      <p class="faint">${G.model.synthetic ? "Supplier shares are real; some other figures are estimated." : `Measured from ${G.model.points} quarters of real shipping records.`} <button class="linkbtn" id="ev-map">Sources</button></p>`;
    $("ev-map").onclick = evidence;
  }

  // ---------- Step 4: quiz ----------
  function stepQuiz() {
    G.net.setFaults([]); G.net.showLinks(false);
    G.net.morph(G.model.nodes.map((n) => n.share), { mode: "supply", duration: 0.01 });
    legend("supply"); baseStatus();
    G.net.selected = new Set(G.guess); G.net.applyClasses();
    const render = () => {
      $("quizPicked").innerHTML = [0, 1].map((k) => kpi(`Pick ${k + 1}`, G.guess[k] != null ? esc(shortName(G.model.nodes[G.guess[k]].label)) : "—", "")).join("");
      nav();
    };
    $("s-quiz").innerHTML = `<div class="step-k">Step 4 · Quiz</div><h2>A shortage hits. Which 2 suppliers would cause most of it?</h2>
      <p class="lead"><b>Tap two circles</b> on the map.</p><div class="kpis" id="quizPicked"></div>`;
    G.onTap = (i) => { if (i >= G.model.nodes.length) return; G.guess = G.net.toggleSelect(i, 2); render(); };
    render();
  }

  // ---------- Step 5: answer ----------
  function stepAnswer() {
    G.onTap = null;
    const L = G.L, { a } = RST.solve(G.model.stressS, L);
    G.a = a;
    const share = a.map((v) => Math.max(0, v) / L), order = share.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
    G.faults = [order[0][1], order[1][1]];
    const sup = G.faults.reduce((s, i) => s + G.model.nodes[i].share, 0), risk = RST.lossShare(a, G.faults);
    const hits = G.guess.filter((i) => G.faults.includes(i)).length;
    const first = !G._answered; G.guessHits = hits; G._answered = true;
    G.dStart = RST.distance(G.model.stressS, L);
    G.net.selected = new Set(); G.net.setFaults(G.faults); G.net.applyClasses();
    G.net.morph(share, { mode: "risk" }); G.net.showLinks(true);
    legend("risk"); baseStatus();
    const names = G.faults.map((i) => shortName(G.model.nodes[i].label));
    const link = G.model.links.find((l) => G.faults.includes(l.i) || G.faults.includes(l.j));
    $("s-answer").innerHTML = `<div class="step-k">Step 5 · The answer</div><h2>${esc(names.join(" + "))}</h2>
      <div class="big-answer"><div class="side"><div class="v num" id="a-sup">0%</div><div class="k">of supply</div></div><div class="arrow">→</div><div class="side risk"><div class="v num" id="a-risk">0%</div><div class="k">of a shortage</div></div></div>
      <span class="verdict ${hits === 2 ? "good" : hits === 1 ? "mid" : "bad"}">${hits === 2 ? "✓ You got both" : `You got ${hits} of 2`}</span>
      <p class="why"><b>Why?</b> They tend to fail <b>at the same time</b>${link ? `: ${esc(String(link.reason || "").split(/[;:(]/)[0].slice(0, 90).toLowerCase())}` : "."}</p>
      <p class="faint">The map now shows each supplier's share of a shortage. Red dashes = suppliers that fail together. <button class="linkbtn" id="ev-ans">How is this worked out?</button></p>`;
    countUp($("a-sup"), sup * 100, { format: (v) => `${Math.round(v)}%` });
    countUp($("a-risk"), risk * 100, { format: (v) => `${Math.round(v)}%`, duration: 1.4 });
    $("ev-ans").onclick = evidence;
    if (first) Guide.log(5, `Quiz: found ${hits} of 2 weak spots`, [{ k: "Weak spots' share of a shortage", delta: risk * 100, unit: "%", fmt: (v) => Math.round(v) }], names.join(" + "));
  }

  // ---------- Step 6: hidden weak point ----------
  function stepHidden() {
    if (!G.a) stepAnswer();
    G.net.setFaults(G.faults); G.net.showLinks(true);
    const bp = RST.backprop(G.a, G.model.nodes.map((n) => n.id), G.model.tier2);
    G.net.upstream(bp, true);
    legend("risk"); baseStatus();
    const spof = bp.spof && G.model.tier2.find((t) => t.id === bp.spof.id);
    const alt = G.model.nodes.map((n, i) => i).filter((i) => !["CHN", "HKG"].includes(G.model.nodes[i].country) && !/china/i.test(G.model.nodes[i].label));
    const fl = bp.flows.filter((f) => alt.some((i) => G.model.nodes[i].id === f.from));
    const tot = fl.reduce((s, f) => s + f.loss, 0), to = spof ? fl.filter((f) => f.to === spof.id).reduce((s, f) => s + f.loss, 0) : 0;
    const share = tot > 0 ? to / tot : bp.spof ? bp.spof.share : 0;
    $("s-hidden").innerHTML = `<div class="step-k">Step 6</div><h2>The hidden weak point</h2>
      ${spof ? `<div class="kpis">${kpi(tot > 0 ? "Risk from 'non-Chinese' suppliers that traces here" : "Risk that traces here", `<span class="num">${pct(share)}</span>`, "", "bad")}</div>
      <p class="lead">It all flows back to <b>${esc(spof.label)}</b>. You never buy from it, but your suppliers do.</p>` : `<p class="lead">No single upstream source dominates for this mineral.</p>`}
      <p class="faint">Red lines on the map trace the risk up to where suppliers get their raw material. Some upstream shares are estimates. <button class="linkbtn" id="alt">How certain is this?</button></p>`;
    $("alt").onclick = () => { const q = RST.alternatives(G.model.stressS, G.L, G.model.nodes.map((n) => n.mean), { samples: 1000, seed: 42 }).map((x) => ({ p10: x.p10 / G.L, p90: x.p90 / G.L })); G.net.halos(q); toast("The faint rings show the range across 1,000 slightly different ways the same shortage could unfold. Bigger rings = less certain.", "good"); };
  }

  // ---------- Step 7: store ----------
  function stepStore() {
    G.net.upstream({ flows: [], converged: {}, spof: null }, false); G.net.setFaults(G.faults); G.net.showLinks(true); riskMorph(false);
    legend("risk");
    G._snap = snapshot();
    $("s-store").innerHTML = `<div class="step-k">Step 7</div><h2>Build your stockpile</h2>
      <p class="lead">Buy supply now and store it. Watch the tank on the map fill.</p>
      <div class="slider-head"><span class="muted">Days of normal use to store</span><span class="big num" id="sv">${G.stockDays}</span></div>
      <input type="range" id="stock" min="0" max="180" step="5" value="${G.stockDays}" aria-label="Days of supply to store">
      <div class="kpis" id="storeK"></div><div id="storeZ"></div>
      <p class="faint">Aim for <b>Safe</b>. Big purchases push prices up, so each extra day costs more.</p>`;
    const upd = () => {
      const sc = stockCost(G.stockDays), d = dNow();
      $("sv").textContent = G.stockDays;
      $("storeK").innerHTML = kpi("Cost", fmt$(sc.cost), sc.quarters > 1 ? `bought over ${sc.quarters} quarters` : "") + kpi("In a shortage, factory runs", `${Math.round(G.stockDays / G.threshold)} days`, "") + kpi("Safety margin", Plain.margin(d), Plain.zone(d).label, d < 1.5 ? "bad" : d >= 2.5 ? "good" : "ore");
      $("storeZ").innerHTML = zoneBar(d, G.dStart);
      G.net.setTank(G.stockDays);
      liveStatus([{ k: "Imports arriving", v: "100%", cls: "good" }, { k: "Stockpile", v: `${G.stockDays} days`, cls: G.stockDays ? "ore" : "" }, { k: "Safety margin", v: `${Plain.margin(d)}`, cls: d < 1.5 ? "bad" : d >= 2.5 ? "good" : "ore" }]);
      hud();
    };
    $("stock").oninput = (e) => { G.stockDays = +e.target.value; upd(); };
    $("stock").onchange = () => logChange(7, `Stockpile: ${G.stockDays} days`);
    upd();
  }
  function snapshot() { return { d: dNow(), budget: budgetLeft(), runtime: G.stockDays / G.threshold }; }
  function logChange(step, label, note) {
    const a = G._snap || snapshot(), b = snapshot();
    Guide.log(step, label, [{ k: "Safety", from: a.d, to: b.d, unit: "×", fmt: (v) => v.toFixed(1) }, { k: "Money", delta: b.budget - a.budget, unit: "M", fmt: (v) => `$${Math.round(v)}` }], note);
    G._snap = b;
  }

  // ---------- Step 8: deals ----------
  function stepDeals() {
    G.net.setFaults(G.faults); G.net.showLinks(true); legend("risk");
    if (!G._snap) G._snap = snapshot();
    const list = cps();
    $("s-deals").innerHTML = `<div class="step-k">Step 8 · Optional</div><h2>Sign a supply deal</h2>
      <p class="lead">Regular deliveries from outside China. <b>Check the owner first</b>: some are traps.</p>
      <div class="deals">${list.map(dealRow).join("") || `<p class="faint">No vetted producers for this mineral.</p>`}</div>
      <div class="kpis" id="dealK"></div>`;
    $("s-deals").querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => checkOwner(b.dataset.inv)));
    $("s-deals").querySelectorAll("[data-sign]").forEach((b) => (b.onclick = () => signDeal(b.dataset.sign)));
    const d = dNow();
    $("dealK").innerHTML = kpi("Safety margin", Plain.margin(d), Plain.zone(d).label, d < 1.5 ? "bad" : d >= 2.5 ? "good" : "ore") + kpi("Money left", fmt$(budgetLeft()), "");
    liveStatus([{ k: "Deals signed", v: `${G.signed.length}`, cls: G.signed.length ? "ore" : "" }, { k: "Stockpile", v: `${G.stockDays} days`, cls: G.stockDays ? "ore" : "" }, { k: "Safety margin", v: Plain.margin(d), cls: d < 1.5 ? "bad" : d >= 2.5 ? "good" : "ore" }]);
    hud();
  }
  function dealRow(cp) {
    const inv = G.investigated.has(cp.id), signed = G.signed.includes(cp.id), linked = isLinked(cp);
    const flag = inv || signed ? (linked ? `<div class="flag bad">✗ ${cp.ownerChina ? "Owned from China" : "Relies on Chinese raw material"}: fails when China cuts supply</div>` : `<div class="flag ok">✓ No ties to China found</div>`) : "";
    return `<div class="deal ${signed ? (linked ? "trap" : "signed") : ""}"><div><div class="nm">${esc(cp.name)} <span class="faint">· ${esc(cp.country)}</span></div>
      <div class="meta">${fmt$(cp.upfront)} · +${cp.docPerQ} days/quarter · starts in ${cp.lag[0]}–${cp.lag[1]} quarters</div>${flag}</div>
      <div class="btns"><button data-inv="${cp.id}" ${inv || signed ? "disabled" : ""}>${inv ? "Checked" : `Check owner · ${fmt$(INVESTIGATE_COST)}`}</button><button class="sign" data-sign="${cp.id}" ${signed || budgetLeft() < cp.upfront ? "disabled" : ""}>${signed ? "Signed" : "Sign"}</button></div></div>`;
  }
  function checkOwner(id) {
    const cp = COUNTERPARTIES.find((c) => c.id === id);
    G.investigated.add(id); G.investCost += INVESTIGATE_COST;
    toast(isLinked(cp) ? `<b style="color:var(--danger)">${esc(cp.name)} is tied to China.</b> ${cp.ownerChina ? "Records show a China-based owner." : "It relies on Chinese raw material."} It would fail at the same time as China.` : `<b>${esc(cp.name)}</b>: no ties to China found in Sayari's records.`, isLinked(cp) ? "" : "good");
    logChange(8, `Checked owner: ${cp.name}`, isLinked(cp) ? "Tied to China" : "No China ties");
    stepDeals();
  }
  function signDeal(id) {
    const cp = COUNTERPARTIES.find((c) => c.id === id), before = dNow();
    G.signed.push(id); addDealNode(cp, true);
    setTimeout(() => riskMorph(true), 600);
    const after = dNow();
    toast(isLinked(cp) ? `<b style="color:var(--danger)">That was a trap.</b> ${esc(cp.name)} is tied to China, so a red line now links it to China on the map. Safety ${Plain.margin(before)} → ${Plain.margin(after)}.` : `<b>Deal signed.</b> Deliveries start in ${cp.lag[0]}–${cp.lag[1]} quarters. Safety ${Plain.margin(before)} → ${Plain.margin(after)}.`, isLinked(cp) ? "" : "good");
    logChange(8, `Signed: ${cp.name}`, isLinked(cp) ? "Trap: tied to China" : `Starts in ${cp.lag[0]}–${cp.lag[1]} quarters`);
    stepDeals();
  }

  // ---------- Step 9: check ----------
  function stepCheck() {
    G.net.setFaults(G.faults); G.net.showLinks(true); riskMorph(false); G.net.setTank(G.stockDays); legend("risk");
    const d = dNow(); G.dNow = d;
    const signed = G.signed.map((id) => COUNTERPARTIES.find((c) => c.id === id));
    const clean = signed.filter((c) => !isLinked(c)).reduce((s, c) => s + c.docPerQ, 0), all = signed.reduce((s, c) => s + c.docPerQ, 0);
    const cn = Math.min(1, G.model.nodes.filter((n) => n.chinaLinked).reduce((s, n) => s + n.share, 0));
    const tests = [
      { k: `Supply drops ${Math.round(G.threshold * 100)}%`, need: G.threshold * 91.25, have: all },
      { k: `Supply drops ${Math.round(Math.min(1, 2 * G.threshold) * 100)}%`, need: Math.min(1, 2 * G.threshold) * 91.25, have: all },
      { k: "All China-linked supply stops", s: `${pct(cn)} of supply`, need: cn * 91.25, have: clean },
    ];
    $("s-check").innerHTML = `<div class="step-k">Step 9</div><h2>Is your plan ready?</h2>
      <div class="kpis">${kpi("Safety margin", Plain.margin(d), Plain.zone(d).label, d < 1.5 ? "bad" : d >= 2.5 ? "good" : "ore")}${kpi("Stored", `${G.stockDays} days`, "")}${kpi("Money left", fmt$(budgetLeft()), "")}</div>
      <h3 style="margin-top:14px">If this happened for a year, your factory would run…</h3>
      <div class="tests">${tests.map((t) => { const gap = Math.max(0, t.need - t.have) / 91.25, runs = gap <= 1e-9 ? Infinity : G.stockDays / gap, ok = runs >= 365;
        return `<div class="test"><div><div class="k">${esc(t.k)}</div>${t.s ? `<div class="s">${esc(t.s)}</div>` : ""}</div><div class="r ${ok ? "ok" : "bad"}">${runs === Infinity ? "never stops ✓" : ok ? "a year+ ✓" : `${Math.round(runs)} days`}</div></div>`; }).join("")}</div>
      <p class="faint" style="margin-top:12px">${d < 1.5 ? "You're still in Danger. Go back to store more, or start anyway and see what happens." : "Next: real events from July 2023 hit your plan."}</p>`;
    liveStatus([{ k: "Stockpile", v: `${G.stockDays} days`, cls: G.stockDays ? "ore" : "" }, { k: "Deals", v: `${G.signed.length}`, cls: "" }, { k: "Safety margin", v: Plain.margin(d), cls: d < 1.5 ? "bad" : d >= 2.5 ? "good" : "ore" }]);
  }

  // ---------- evidence + info ----------
  function evidence() {
    const M = G.model;
    drawer(`<h3>Sources and method</h3>
      <p>We look at how much each supplier's shipments normally swing, and how often they swing together. Then we ask: "if supply fell by ${Math.round(G.threshold * 100)}%, what's the most likely mix of suppliers behind it?"</p>
      <p>${M.synthetic ? `<span class="pill game">partly estimated</span> ${esc(M.caveats[0] || "")}` : `<span class="pill reported">measured</span> ${M.points} quarters of real shipping records (Sayari).`}</p>
      <h4>Suppliers</h4><ul>${M.nodes.map((x) => `<li><b>${esc(x.label)}</b>: ${pct(x.share)} · <span class="faint">${esc(String(x.source || "").slice(0, 160))}</span></li>`).join("")}</ul>
      <h4>Why they fail together</h4><ul>${M.links.map((l) => `<li>${esc(shortName(M.nodes[l.i].label))} ↔ ${esc(shortName(M.nodes[l.j].label))}: ${esc(String(l.reason || "").slice(0, 200))}</li>`).join("") || "<li>none recorded</li>"}</ul>
      <h4>For experts</h4><pre>a = L · Σ1 / (1ᵀΣ1)   safety margin d = (L + S) / √(1ᵀΣ1)</pre>
      <p class="faint">"If it happens" analysis, not a forecast; the safety margin isn't a probability. Crisis mode sets linked suppliers' correlation to 0.8 and China-linked volatility ×1.5 (assumed). Adapted from the <a href="https://ethical-tech-colab.github.io/reverse-stress/" target="_blank" rel="noopener">Ethical Tech CoLab Resilience Atlas</a> (teaching material).</p>`);
  }
  function nodeInfo(nd) {
    drawer(`<h3>${esc(nd.label)}</h3><p>${pct(nd.share)} of US supply · ${esc(nd.country)}${nd.chinaLinked ? " · <b>China-linked</b>" : ""}</p>
      ${nd.companies && nd.companies.length ? `<h4>Companies</h4><ul>${nd.companies.slice(0, 6).map((c) => `<li>${esc(c.name || c)}</li>`).join("")}</ul>` : ""}
      ${nd.owners && nd.owners.length ? `<h4>Owners</h4><ul>${nd.owners.slice(0, 5).map((o) => `<li>${esc(typeof o === "string" ? o : (o.name || "") + (o.country ? ` (${o.country})` : ""))}</li>`).join("")}</ul>` : ""}
      ${nd.flags && nd.flags.length ? `<h4>Records (Sayari findings, not accusations)</h4><ul>${nd.flags.slice(0, 5).map((f) => `<li>${esc(typeof f === "string" ? f : f.label || "")}</li>`).join("")}</ul>` : ""}
      <h4>Source</h4><p class="faint">${esc(nd.source || "")}</p>`);
  }

  const aboutHTML = () => `<h3>About</h3>
    <p>You run America's emergency mineral stockpile with $12B, the size of the real "Project Vault" (2026). The lesson: <b>your biggest supplier isn't always your biggest risk. Suppliers that fail at the same time are.</b></p>
    <h4>Real data</h4><ul><li><b>Tavily</b>: news before each quarter, real prices, what governments actually did.</li><li><b>Tradeverifyd</b>: US import figures (UN trade data).</li><li><b>Sayari</b>: shipping records, company owners and risk records (findings, not accusations).</li></ul>
    <p class="faint">Adapted from the Ethical Tech CoLab Resilience Atlas (teaching material, not a validated product).</p>
    <p><a href="../classic/">Analyst mode</a>: manage all six minerals, quarter by quarter.</p>`;
  $("btn-about").onclick = () => drawer(aboutHTML());
  $("btn-gloss").onclick = $("btn-gloss0").onclick = () => drawer(Plain.glossaryHTML());
  $("btn-ledger").onclick = () => Guide.showLedger();

  // ---------- front page ----------
  $("f-days").textContent = daysToCliff();
  $("btn-start").onclick = () => go(0);
  (function ticker() {
    const items = []; for (const q of Object.keys(EXT.intel || {}).sort().reverse()) for (const i of EXT.intel[q].items || []) if (items.length < 3) items.push(i);
    let k = 0; const t = () => { if (!$("front").classList.contains("hidden") && items.length) { const i = items[k++ % items.length]; $("ticker").innerHTML = `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.date)} · ${esc(i.source || domain(i.url))}: ${esc(i.title)}</a>`; } setTimeout(t, 4500); }; t();
  })();
  Stage.init($("stage")).then(({ arcs }) => {
    const tot = arcs.reduce((s, a) => s + a.value, 0), yr = arcs[0] && arcs[0].year;
    $("globe-caption").textContent = arcs.length ? `Glowing lines: real shipments of these minerals into the US in ${yr}, $${(tot / 1e6).toFixed(0)}M across ${arcs.length} routes (UN trade data via Tradeverifyd).` : "";
  });

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
    if (e.key !== "Enter" || e.target.closest("button, a, input, select, textarea, [role=button]")) return;
    const b = !$("front").classList.contains("hidden") ? $("btn-start") : $("btn-next");
    if (b && !b.disabled) { e.preventDefault(); b.click(); }
  });

  window.ACTS = { go, STEPS, idx, effSigma, dist, dNow, isLinked, budgetLeft, stockCost, ensureNet, liveStatus, legend };

  // Deep link: #step=answer&m=antimony
  const st = (location.hash.match(/step=([a-z]+)/) || [])[1], mm = (location.hash.match(/m=([a-z]+)/) || [])[1];
  if (mm) { G.mission = Missions.MISSIONS.find((x) => x.id === mm) || null; if (G.mission) document.documentElement.style.setProperty("--mission", G.mission.color); }
  if (st && idx(st) >= 0 && (G.mission || st === "pick")) {
    if (idx(st) > idx("quiz")) { G.model = Missions.buildModel(G.mission.id); G.guess = []; }
    if (idx(st) > idx("answer")) { const { a } = RST.solve(G.model.stressS, G.L); G.a = a; const o = a.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]); G.faults = [o[0][1], o[1][1]]; G.dStart = RST.distance(G.model.stressS, G.L); G._answered = true; }
    go(idx(st));
  }
})();
