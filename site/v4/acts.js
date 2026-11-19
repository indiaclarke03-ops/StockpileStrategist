/* Stockpile Strategist v4 — act router, HUD, drawer, Acts 0–3 (brief §3). */
(function () {
  const D = window.GAME_DATA, EXT = D.EXT || {}, { MINERALS, COUNTERPARTIES } = D;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
  const fmt$ = (m) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(2)}B` : `$${Math.round(m)}M`);
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  const CLIFF = new Date(Date.UTC(2027, 0, 10));
  const daysToCliff = () => Math.max(0, Math.ceil((CLIFF - new Date()) / 864e5));
  const INVESTIGATE_COST = 25; // $M per Sayari ownership pull (assumed)
  const CV_NEW = 0.25;         // offtake volume variability (assumed)

  // ---------- shared game context ----------
  const G = (window.G = {
    act: 0, mission: null, model: null, threshold: 0.25, L: 25, regime: "stress",
    guess: [], faults: [], a: null, bp: null, stockDays: 0, signed: [], investigated: new Set(), investCost: 0, dStart: null, dNow: null,
  });

  // ---------- helpers ----------
  function countUp(el, to, opts = {}) {
    const from = opts.from != null ? opts.from : 0, f = opts.format || ((v) => Math.round(v));
    if (!gsap || reduced()) { el.textContent = f(to); return; }
    const st = { v: from };
    const tw = gsap.to(st, { v: to, duration: opts.duration || 1.1, ease: "power2.out", onUpdate: () => (el.textContent = f(st.v)) });
    setTimeout(() => { tw.progress(1); el.textContent = f(to); }, (opts.duration || 1.1) * 1000 + 150);
  }
  /** Run an intro tween but guarantee its end state (rAF can be throttled in background tabs). */
  function fx(make, ms = 1400) { if (!gsap || reduced()) return; const tw = make(); setTimeout(() => tw && tw.progress(1), ms); }
  function toast(html, kind = "") {
    const t = document.createElement("div"); t.className = `toast ${kind}`; t.setAttribute("role", "status"); t.innerHTML = html;
    document.body.appendChild(t);
    fx(() => gsap.from(t, { y: -16, opacity: 0, duration: 0.35 }), 500);
    setTimeout(() => t.remove(), 5200);
  }
  window.UI = { $, esc, pct, fmt$, domain, countUp, toast, reduced, fx };

  // ---------- drawer ----------
  function drawer(html) { $("drawer-body").innerHTML = html; $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false"); $("drawer-close").focus(); }
  function closeDrawer() { $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true"); }
  $("drawer-close").onclick = closeDrawer;
  window.UI.drawer = drawer;

  // ---------- router ----------
  function show(n) {
    const cur = document.querySelector(".act.on"), next = document.querySelector(`.act[data-act="${n}"]`);
    G.act = n;
    if (n <= 3) G.liveReserve = null;
    const swap = () => {
      if (cur) cur.classList.remove("on");
      next.classList.add("on");
      window.scrollTo(0, 0);
      if (gsap && !reduced()) { const tw = gsap.fromTo(next, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out", clearProps: "transform,opacity" }); setTimeout(() => { tw.progress(1); next.style.transform = ""; next.style.opacity = ""; }, 700); }
      if (cur) { cur.style.opacity = ""; cur.style.transform = ""; }
      ENTER[n] && ENTER[n]();
      if (n > 0) hud();
      const h = next.querySelector("h1, h2"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    };
    // Tweens are force-completed on a timer so the router never stalls when rAF is throttled.
    if (cur && gsap && !reduced()) { let done = false; const once = () => { if (!done) { done = true; swap(); } }; const tw = gsap.to(cur, { opacity: 0, y: -10, duration: 0.3, onComplete: once }); setTimeout(() => { tw.progress(1); once(); }, 380); } else swap();
    $("hud").classList.toggle("hidden", n === 0);
    $("stage").classList.toggle("dim", n >= 2 && n <= 3);
    $("stage").classList.toggle("gone", n >= 4);
    Stage.setRotate(n <= 1);
  }
  window.Router = { show };

  // ---------- HUD ----------
  function hud() {
    const m = G.mission;
    $("hud-mission").innerHTML = m ? `${tile(m, "sm")}<div><div class="hud-k">Mission</div><div class="hud-v" style="font-size:15px">${esc(m.mustNot)}</div></div>` : "";
    if (G.liveReserve == null) $("hud-budget").textContent = fmt$(budgetLeft());
    const runtime = (G.liveReserve != null ? G.liveReserve : G.stockDays) / G.threshold;
    $("hud-runtime").textContent = `${Math.round(runtime)} days`;
    $("hud-runtime-bar").style.width = `${Math.min(100, (runtime / 365) * 100)}%`;
    $("hud-countdown").textContent = `${daysToCliff()} days`;
  }
  window.UI.hud = hud;
  const tile = (m, cls = "") => `<span class="tile ${cls}" style="--tile:${m.color}"><span class="z">${m.num}</span><span class="s">${m.sym}</span><span class="m">${m.mass}</span></span>`;

  // ---------- Act 0: cold open ----------
  function act0() {
    $("a0-days").textContent = daysToCliff();
    $("hud-countdown").textContent = `${daysToCliff()} days`;
    const items = [];
    const qs = Object.keys(EXT.intel || {}).sort().reverse();
    for (const q of qs) for (const i of EXT.intel[q].items || []) if (items.length < 3) items.push(i);
    let k = 0;
    const tick = () => {
      if (G.act !== 0 || !items.length) return;
      const i = items[k++ % items.length];
      const t = $("ticker");
      t.innerHTML = `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.date)} · ${esc(i.source || domain(i.url))} — ${esc(i.title)}</a>`;
      fx(() => gsap.fromTo(t, { opacity: 0 }, { opacity: 1, duration: 0.8 }), 1000);
      setTimeout(tick, 4200);
    };
    tick();
    fx(() => gsap.from("#a0-title", { opacity: 0, y: 24, duration: 1.1, ease: "power3.out", delay: 0.2 }), 1500);
  }
  $("btn-take").onclick = () => show(1);
  $("btn-how").onclick = () => drawer(`<h3>How this works</h3>
    <p><b>1 · Mission.</b> Pick one mineral and the shortfall your factory can't survive.</p>
    <p><b>2 · Fault lines.</b> Guess which suppliers would cause that loss. Then the model works backward from the loss to the most likely way it happens. It's often not the biggest supplier, but the ones that fail <i>together</i>.</p>
    <p><b>3 · Defences.</b> Stockpile, sign offtakes with real producers and pull their ownership files (Sayari). Watch your distance from disaster move.</p>
    <p><b>4 · History strikes.</b> The real 2023–26 export bans replay against your defences, pausing at four decisions.</p>
    <p><b>5 · The cliff.</b> 1,000 simulated futures past 10 January 2027, when China's rare-earth pause expires.</p>
    <p class="faint">Real data: Tavily news, Tradeverifyd trade flows, Sayari ownership and shipments. Every number has an evidence drawer.</p>`);

  // ---------- Act 1: mission ----------
  let factoryRAF = null;
  function act1() {
    const M = Missions.MISSIONS;
    $("missions").innerHTML = M.map((m, i) => {
      const model = Missions.buildModel(m.id);
      return `<button class="mission" role="listitem" data-m="${m.id}" aria-pressed="${G.mission && G.mission.id === m.id}" style="--tile:${m.color}">
        ${tile(m)}<h3>${esc(m.mustNot)}</h3><div class="hook">${esc(m.hook)}</div>
        <div class="pips">${[1, 2, 3].map((p) => `<i class="${p <= m.difficulty ? "on" : ""}"></i>`).join("")}<span style="margin-left:6px">${["", "Easy", "Medium", "Hard"][m.difficulty]}</span></div>
        <span class="badge-teach">${model.synthetic ? (model.structured ? "Real structure · illustrative variance" : "Teaching network") : "Measured network"}</span></button>`;
    }).join("");
    $("missions").querySelectorAll(".mission").forEach((b, i, all) => {
      b.onclick = () => pick(b.dataset.m);
      b.onkeydown = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length].focus(); } };
    });
    if (G.mission) pick(G.mission.id, true);
  }
  function pick(id, silent) {
    G.mission = Missions.MISSIONS.find((m) => m.id === id);
    document.documentElement.style.setProperty("--mission", G.mission.color);
    $("missions").querySelectorAll(".mission").forEach((b) => b.setAttribute("aria-pressed", b.dataset.m === id ? "true" : "false"));
    $("threshold").classList.remove("hidden");
    $("btn-a1").disabled = false; $("btn-a1").textContent = `Map the ${G.mission.name.toLowerCase()} network →`;
    Stage.focus(id, G.mission.color);
    hud(); factory();
    if (!silent) fx(() => gsap.from("#threshold", { opacity: 0, y: 12, duration: 0.4 }), 600);
  }
  $("thr").oninput = (e) => { G.threshold = +e.target.value / 100; G.L = G.threshold * 100; $("thr-v").textContent = `${e.target.value}%`; hud(); };
  function factory() {
    const el = $("factory");
    el.innerHTML = `<svg viewBox="0 0 160 110" role="img" aria-label="Factory">
      <path d="M10 100 V55 L45 38 V55 L80 38 V55 L115 38 V100 Z" fill="rgba(30,41,59,.9)" stroke="#AEB6C4" stroke-width="1.5"/>
      <rect x="120" y="20" width="14" height="80" fill="rgba(30,41,59,.9)" stroke="#AEB6C4" stroke-width="1.5"/>
      <g id="gear" transform="translate(62 78)"><circle r="13" fill="none" stroke="#E08A52" stroke-width="4" stroke-dasharray="5 4"/><circle r="4" fill="#E08A52"/></g>
      <circle id="lamp" cx="96" cy="70" r="6" fill="#5fc08f"/>
      <text id="sup" x="80" y="16" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="#AEB6C4">supply −0%</text></svg>`;
    cancelAnimationFrame(factoryRAF);
    let ang = 0, t0 = performance.now();
    const loop = (t) => {
      if (G.act !== 1) return;
      const s = Math.max(0, 0.22 + 0.2 * Math.sin((t - t0) / 900) + 0.06 * Math.sin((t - t0) / 310)); // demo shortfall wave
      const stopped = s > G.threshold;
      if (!stopped && !reduced()) ang = (ang + 4) % 360;
      const g = document.getElementById("gear"), lamp = document.getElementById("lamp"), sup = document.getElementById("sup");
      if (!g) return;
      g.setAttribute("transform", `translate(62 78) rotate(${ang})`);
      lamp.setAttribute("fill", stopped ? "#FF5A4E" : "#5fc08f");
      sup.textContent = `supply −${Math.round(s * 100)}%${stopped ? " · STOPPED" : ""}`;
      sup.setAttribute("fill", stopped ? "#FF5A4E" : "#AEB6C4");
      factoryRAF = requestAnimationFrame(loop);
    };
    factoryRAF = requestAnimationFrame(loop);
  }
  $("btn-a1").onclick = () => { if (G.mission) show(2); };

  // ---------- Act 2: network → fault lines ----------
  let net2 = null, step2 = "map";
  const regimeS = () => (G.regime === "stress" ? G.model.stressS : G.model.calm);
  function act2() {
    G.model = Missions.buildModel(G.mission.id);
    G.guess = []; G.faults = []; step2 = "map";
    $("a2-badge").classList.toggle("hidden", !G.model.synthetic);
    $("a2-badge").onclick = evidence;
    $("a2-badge").title = "Why illustrative? Open the evidence";
    $("a2-stats").classList.add("hidden"); $("a2-tools").innerHTML = ""; $("a2-fine").textContent = "";
    $("a2-title").textContent = `This is where your ${G.mission.name.toLowerCase()} comes from.`;
    $("a2-lede").innerHTML = `Node size is each supplier's share of US imports. ${G.model.synthetic ? "Shares are real; how much each one wobbles is illustrative." : `Measured from ${G.model.points} quarters of Sayari shipment records.`} <button class="evidence-btn" id="ev2">ⓘ evidence</button>`;
    $("ev2").onclick = evidence;
    net2 = new NetView($("net"), G.model, { plantLabel: `US ${G.mission.mustNot.split(" and ")[0].toLowerCase()} line` });
    net2.onTap = (i) => {
      if (step2 !== "guess") { nodeEvidence(G.model.nodes[i]); return; }
      G.guess = net2.toggleSelect(i, 2);
      $("btn-a2").disabled = G.guess.length !== 2;
      $("btn-a2").textContent = G.guess.length === 2 ? "Reveal the fault lines" : `Tap ${2 - G.guess.length} more`;
    };
    if (gsap && !reduced()) { const tw = gsap.from("#net .n-node, #net .n-t2", { opacity: 0, scale: 0.3, transformOrigin: "center", stagger: 0.12, duration: 0.6, ease: "back.out(1.8)" }); setTimeout(() => tw.progress(1), 2600); }
    $("btn-a2").disabled = true; $("btn-a2").textContent = "Mapping…";
    setTimeout(() => {
      if (G.act !== 2) return;
      step2 = "guess";
      $("a2-title").textContent = `A ${Math.round(G.threshold * 100)}% shortfall hits. Tap the 2 suppliers you think will cause most of it.`;
      $("btn-a2").textContent = "Tap 2 suppliers";
    }, reduced() ? 300 : 3200);
  }
  function reveal() {
    step2 = "reveal";
    const S = regimeS(), L = G.L;
    const { a } = RST.solve(S, L);
    G.a = a;
    const share = a.map((v) => Math.max(0, v) / L);
    const order = share.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
    G.faults = [order[0][1], order[1][1]];
    const supplyShare = G.faults.reduce((s, i) => s + G.model.nodes[i].share, 0);
    const riskShare = RST.lossShare(a, G.faults);
    const bySupply = G.model.nodes.map((n, i) => [n.share, i]).sort((x, y) => y[0] - x[0]).slice(0, 2).map((x) => x[1]);
    const sameAsBiggest = G.faults.every((i) => bySupply.includes(i));
    const hits = G.guess.filter((i) => G.faults.includes(i)).length;
    G.guessHits = hits;
    G.dStart = RST.distance(G.model.stressS, L);
    net2.setFaults(G.faults);
    net2.morph(share, { mode: "risk" });
    net2.showLinks(true);
    const names = G.faults.map((i) => shortName(G.model.nodes[i].label)).join(" and ");
    $("a2-title").innerHTML = sameAsBiggest
      ? `Your two biggest suppliers carry <span class="num">${pct(supplyShare)}</span> of supply — and <span class="num" style="color:var(--danger)">${pct(riskShare)}</span> of the risk.`
      : `${esc(names)} carry <span class="num">${pct(supplyShare)}</span> of your supply — but <span class="num" style="color:var(--danger)">${pct(riskShare)}</span> of the risk.`;
    $("a2-lede").innerHTML = `${hits === 2 ? "You spotted both fault lines." : hits === 1 ? "You spotted 1 of 2 fault lines." : "You spotted 0 of 2 fault lines. Most people tap the biggest nodes."} Node size is now each supplier's share of the <b>inferred loss</b>. Red links are suppliers that fail together. <button class="evidence-btn" id="ev2">ⓘ evidence</button>`;
    $("ev2").onclick = evidence;
    $("a2-stats").classList.remove("hidden");
    $("a2-stats").innerHTML = `<div class="stat-card"><div class="k">Share of supply</div><div class="v num" id="st-sup">0%</div></div><div class="stat-card risk"><div class="k">Share of the loss</div><div class="v num" id="st-risk">0%</div></div>`;
    countUp($("st-sup"), supplyShare * 100, { format: (v) => `${Math.round(v)}%` });
    countUp($("st-risk"), riskShare * 100, { format: (v) => `${Math.round(v)}%`, duration: 1.6 });
    $("a2-fine").textContent = `Conditional, not a forecast: if a ${Math.round(G.threshold * 100)}% loss happens, this is its most likely shape under a normal model${G.regime === "stress" ? " in an export-control regime (linked suppliers ρ = 0.8, China-linked volatility ×1.5; assumed)" : ""}.`;
    $("a2-tools").innerHTML = `<button class="chip" id="t-up" aria-pressed="false">↑ Follow it upstream</button><button class="chip" id="t-alt" aria-pressed="false">◎ Show 1,000 alternatives</button><button class="chip" id="t-reg" aria-pressed="${G.regime === "calm"}">${G.regime === "stress" ? "Regime: export controls" : "Regime: calm years"}</button>`;
    $("t-up").onclick = () => upstream($("t-up"));
    $("t-alt").onclick = () => alternatives($("t-alt"));
    $("t-reg").onclick = () => { G.regime = G.regime === "stress" ? "calm" : "stress"; reveal(); };
    $("btn-a2").disabled = false; $("btn-a2").textContent = "Build your defences →";
    announce($("a2-title").textContent);
  }
  const shortName = (s) => String(s).split(" (")[0].split(" - ")[0];
  function upstream(btn) {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", on);
    const bp = RST.backprop(G.a, G.model.nodes.map((n) => n.id), G.model.tier2);
    G.bp = bp;
    net2.upstream(bp, on);
    if (!on || !bp.spof) return;
    const spof = G.model.tier2.find((t) => t.id === bp.spof.id);
    const alt = G.model.nodes.map((n, i) => i).filter((i) => !["CHN", "HKG"].includes(G.model.nodes[i].country) && !/china/i.test(G.model.nodes[i].label));
    const fl = bp.flows.filter((f) => alt.some((i) => G.model.nodes[i].id === f.from));
    const tot = fl.reduce((s, f) => s + f.loss, 0), toSpof = fl.filter((f) => f.to === bp.spof.id).reduce((s, f) => s + f.loss, 0);
    const line = tot > 0 ? `<b>${pct(toSpof / tot)}</b> of the loss from your "alternative" suppliers traces back to <b>${esc(spof.label)}</b>.` : `<b>${pct(bp.spof.share)}</b> of the inferred loss converges on <b>${esc(spof.label)}</b>.`;
    toast(`<b style="color:var(--danger)">Hidden single point of failure.</b> ${line} <span class="faint">Upstream shares: ${esc(spof.evidence || "assumed")}; 1:1 contained element (assumed).</span>`);
  }
  function alternatives(btn) {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", on);
    if (!on) { net2.clearHalos(); return; }
    const caps = G.model.nodes.map((n) => n.mean);
    const q = RST.alternatives(regimeS(), G.L, caps, { samples: 1000, seed: 42 }).map((x) => ({ p10: x.p10 / G.L, p50: x.p50 / G.L, p90: x.p90 / G.L }));
    G.alt = q;
    net2.halos(q);
    toast(`Rings show the P10–P90 range of each supplier's share across 1,000 alternative ways the same loss could happen. The answer is a range, not one story.`, "good");
  }
  $("btn-a2").onclick = () => { if (step2 === "guess" && G.guess.length === 2) reveal(); else if (step2 === "reveal") show(3); };

  function evidence() {
    const M = G.model, S = regimeS(), n = M.nodes.length;
    const sigTable = `<table><tr><th></th>${M.nodes.map((x, j) => `<th>${j + 1}</th>`).join("")}</tr>${S.map((r, i) => `<tr><th>${i + 1}</th>${r.map((v) => `<td>${v.toFixed(1)}</td>`).join("")}</tr>`).join("")}</table>
      <p class="faint">${M.nodes.map((x, j) => `${j + 1} = ${esc(shortName(x.label))}`).join(" · ")}</p>`;
    drawer(`<h3>The evidence</h3>
      ${M.synthetic ? `<p><span class="pill game">illustrative</span> <b>Illustrative network — not measured.</b> ${esc(M.caveats[0] || "")}</p>` : `<p><span class="pill reported">measured</span> Σ estimated from ${M.points} ${esc(M.granularity)} periods of ${esc(M.measure || "")} (Sayari bills of lading), linearly detrended${M.lambda ? `, shrunk toward the diagonal (λ = ${M.lambda}, <span class="pill assumed">assumed</span>)` : ""}.</p>`}
      <h4>Formula</h4><pre>a = L · Σ1 / (1ᵀΣ1)      L = ${G.L.toFixed(1)} (= ${Math.round(G.threshold * 100)}% × 100)</pre>
      ${G.a ? `<p>Inferred loss a = [${G.a.map((v) => v.toFixed(2)).join(", ")}], sum ${G.a.reduce((x, y) => x + y, 0).toFixed(1)}.</p>` : ""}
      <h4>Σ (${G.regime === "stress" ? "export-control regime" : "calm years"})</h4>${sigTable}
      <p class="faint">Stress Σ = calm Σ with structurally linked pairs set to ρ = 0.8 and China-linked σ × 1.5 (<span class="pill assumed">assumed</span>). Export controls are regime shifts, not normal noise. Correlations from calm years understate how suppliers fail together.</p>
      <h4>Structural links</h4><ul>${M.links.map((l) => `<li>${esc(shortName(M.nodes[l.i].label))} ↔ ${esc(shortName(M.nodes[l.j].label))}: ${esc(l.reason || "")} ${(l.evidence || []).slice(0, 2).map((e) => (typeof e === "string" && /^http/.test(e) ? `<a href="${esc(e)}" target="_blank" rel="noopener">${esc(domain(e))}</a>` : `<code>${esc(typeof e === "string" ? e : JSON.stringify(e)).slice(0, 80)}</code>`)).join(" ")}</li>`).join("") || "<li>none</li>"}</ul>
      <h4>Suppliers</h4><ul>${M.nodes.map((x) => `<li><b>${esc(x.label)}</b>: ${pct(x.share)} of supply · <span class="pill ${/assumed/.test(x.evidence) ? "assumed" : "reported"}">${esc(x.evidence)}</span> <span class="faint">${esc(String(x.source || "").slice(0, 220))}</span></li>`).join("")}</ul>
      <h4>Guardrails</h4><ul>
        <li>Assumes a multivariate normal model of supplier losses and uses history only.</li>
        <li>Results are <b>conditional</b> on the loss happening. This is not a forecast.</li>
        <li>Densities and σ-distances are <b>not calibrated probabilities</b>.</li>
        <li>Alternatives sample the conditional normal (the paper generates q = 0.5 alternatives and clusters them; this is a simplification), clipped to [0, mean flow] and renormalised to L (<span class="pill game">game adjustment</span>).</li></ul>
      ${M.comparison ? `<h4>Cross-check</h4><p>${esc(M.comparison)}</p>` : ""}
      <h4>Method / tool calls</h4><ul>${(Array.isArray(M.method) ? M.method : [M.method]).slice(0, 12).map((m) => `<li class="faint">${esc(m)}</li>`).join("")}</ul>
      ${M.caveats.length ? `<h4>Caveats</h4><ul>${M.caveats.slice(M.synthetic ? 1 : 0, 8).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      <p class="faint">Reverse-stress logic adapted from the <a href="https://ethical-tech-colab.github.io/reverse-stress/" target="_blank" rel="noopener">Ethical Tech CoLab Resilience Atlas</a> (teaching material, not a validated product).</p>`);
  }
  function nodeEvidence(nd) {
    drawer(`<h3>${esc(nd.label)}</h3><p>${pct(nd.share)} of supply · ${esc(nd.country)} · <span class="pill ${/assumed/.test(nd.evidence) ? "assumed" : "reported"}">${esc(nd.evidence)}</span></p>
      ${nd.companies && nd.companies.length ? `<h4>Companies (Sayari)</h4><ul>${nd.companies.slice(0, 8).map((c) => `<li>${esc(c.name || c)} ${c.sayariId ? `<code>${esc(c.sayariId)}</code>` : ""}</li>`).join("")}</ul>` : ""}
      ${nd.owners && nd.owners.length ? `<h4>Owners</h4><ul>${nd.owners.slice(0, 6).map((o) => `<li>${esc(typeof o === "string" ? o : (o.name || "") + (o.country ? ` (${o.country})` : ""))}</li>`).join("")}</ul>` : ""}
      ${nd.flags && nd.flags.length ? `<h4>Flags (Sayari findings, not allegations)</h4><ul>${nd.flags.slice(0, 6).map((f) => `<li>${esc(typeof f === "string" ? f : f.label || JSON.stringify(f))}</li>`).join("")}</ul>` : ""}
      <h4>Source</h4><p class="faint">${esc(nd.source || "")}</p>`);
  }
  function announce(text) { let a = $("sr-live"); if (!a) { a = document.createElement("div"); a.id = "sr-live"; a.setAttribute("aria-live", "assertive"); a.className = "hidden"; a.style.cssText = "position:absolute;left:-9999px"; document.body.appendChild(a); a.classList.remove("hidden"); } a.textContent = text; }

  // ---------- Act 3: defences ----------
  let net3 = null;
  const cps = () => COUNTERPARTIES.filter((c) => c.mineral === G.mission.id).sort((a, b) => a.upfront / a.docPerQ - b.upfront / b.docPerQ);
  const isLinked = (cp) => cp.ownerChina || (cp.upstreamChina || 0) > 0;
  function effSigma(list = G.signed, naive = {}) {
    let S = G.model.stressS, V = 100;
    for (const id of list) {
      const cp = COUNTERPARTIES.find((c) => c.id === id);
      const w = Missions.volumeFromDocPerQ(cp.docPerQ);
      const linked = isLinked(cp) && !naive[id];
      const nodesNow = S.length;
      S = RST.addSupplier(S, V, w, CV_NEW, (i) => (linked && i < G.model.nodes.length && G.model.nodes[i].chinaLinked ? 0.8 : 0));
      V += 0; // volume moved, not added: total demand stays 100
      void nodesNow;
    }
    return S;
  }
  const dist = (S, days) => RST.distance(S, G.L, Missions.bufferFromDays(days));
  function stockCost(days) {
    // ≈ cost of building `days` over successive quarters (sim.js quoteBuy + own-buying price impact; capped 45/quarter).
    const s = Sim.newState(), k = G.mission.id, p = MINERALS[k];
    let left = days, cost = 0, q = 0;
    while (left > 0 && q < 8) {
      const d = Math.min(left, Sim.maxBuy(s, k));
      cost += Sim.quoteBuy(s, k, d);
      s.minerals[k].priceIdx *= 1 + (p.eta * d) / p.marketDepth;
      left -= d; q++;
    }
    return { cost, quarters: q };
  }
  function budgetLeft() {
    if (G.act < 3 && !G.stockDays) return D.CONFIG.budget;
    const up = G.signed.reduce((s, id) => s + COUNTERPARTIES.find((c) => c.id === id).upfront, 0);
    return D.CONFIG.budget - stockCost(G.stockDays).cost - up - G.investCost;
  }
  window.UI.budgetLeft = budgetLeft;
  function act3() {
    $("a3-badge").classList.toggle("hidden", !G.model.synthetic);
    $("a3-badge").onclick = evidence;
    net3 = new NetView($("net3"), G.model, { plantLabel: `US ${G.mission.mustNot.split(" and ")[0].toLowerCase()} line` });
    net3.setFaults(G.faults);
    for (const id of G.signed) addCpNode(COUNTERPARTIES.find((c) => c.id === id), false);
    paintRisk(false);
    net3.onTap = (i) => (i < G.model.nodes.length ? nodeEvidence(G.model.nodes[i]) : null);
    renderLevers();
  }
  function paintRisk(animate = true) {
    const S = effSigma();
    const { a } = RST.solve(S, G.L);
    net3.morph(a.map((v) => Math.max(0, v) / G.L), { mode: "risk", duration: animate ? 1.2 : 0.01 });
    net3.showLinks(true);
  }
  function addCpNode(cp, animate = true) {
    const linkTo = isLinked(cp) ? G.model.nodes.map((n, i) => (n.chinaLinked ? i : -1)).filter((i) => i >= 0).slice(0, 1) : [];
    const k = net3.addNode({ id: cp.id, label: cp.name, country: cp.country, share: Missions.volumeFromDocPerQ(cp.docPerQ) / 100, chinaLinked: isLinked(cp), sub: `offtake · ${cp.country}`, linkReason: cp.ownerChina ? "China-based owner (Sayari)" : "Chinese feedstock (Sayari)" }, animate ? linkTo : []);
    if (!animate && linkTo.length) net3.extraLinks.push({ i: k, j: linkTo[0], on: true });
    return k;
  }
  function renderLevers() {
    const d = dist(effSigma(), G.stockDays);
    if (G.dNow == null) G.dNow = d;
    const band = RST.band(d), scaleX = (x) => Math.min(100, (x / 5) * 100);
    $("distance").innerHTML = `<div class="hud-k">Distance to disaster <button class="evidence-btn" id="ev3" style="font-size:11px">ⓘ what is σ?</button></div>
      <div class="row"><span class="big num" id="dval">${G.dNow.toFixed(1)}σ</span><span class="band band-${band}">${band}</span><span class="faint">started at ${G.dStart.toFixed(1)}σ</span></div>
      <div class="dscale"><b style="left:${scaleX(G.dStart)}%"></b><i id="dmark" style="left:${scaleX(G.dNow)}%"></i></div>
      <div class="dlabels"><span>Fragile</span><span>1.5</span><span>Exposed</span><span>2.5</span><span>Resilient</span><span>3.5</span><span>Hardened</span></div>`;
    countUp($("dval"), d, { from: G.dNow, format: (v) => `${v.toFixed(1)}σ`, duration: 0.8 });
    requestAnimationFrame(() => { const mk = $("dmark"); if (mk) mk.style.left = `${scaleX(d)}%`; });
    G.dNow = d;
    $("ev3").onclick = () => drawer(`<h3>Distance to disaster</h3><pre>d = (L + S) / √(1ᵀ Σ 1)</pre>
      <p>L is the loss that stops your line (${Math.round(G.threshold * 100)}% of a quarter's supply). S is the shortfall your stockpile absorbs. √(1ᵀΣ1) is the typical size of a total supply shock under the current regime, including your offtakes.</p>
      <p>Bands: Fragile &lt; 1.5σ · Exposed 1.5–2.5σ · Resilient 2.5–3.5σ · Hardened &gt; 3.5σ.</p>
      <p><b>Not a probability.</b> It's a distance under the model, and the atlas guardrail applies.</p>
      <p class="faint">Offtakes move volume out of the existing mix (σ ∝ volume, CV ${CV_NEW}, <span class="pill assumed">assumed</span>). A China-owned or China-fed supplier gets ρ = 0.8 with China-linked nodes (<span class="pill assumed">assumed</span>).</p>`);
    const sc = stockCost(G.stockDays);
    $("lever-stock").innerHTML = `<h3>Stockpile <span class="num">${G.stockDays} days</span></h3>
      <input type="range" id="stock" min="0" max="180" step="5" value="${G.stockDays}" aria-label="Days of runtime to stockpile" />
      <div class="meta"><span>Factory keeps running <b class="num">${Math.round(G.stockDays / G.threshold)} days</b> at a ${Math.round(G.threshold * 100)}% shortfall</span><span class="num">≈ ${fmt$(sc.cost)}${sc.quarters > 1 ? ` over ${sc.quarters} quarters` : ""}</span></div>
      <div class="faint">Thin market: your own buying pushes the price up (sim.js price model). Purchases are capped at 45 days a quarter.</div>`;
    $("stock").oninput = (e) => { G.stockDays = +e.target.value; renderLevers(); hud(); };
    $("stock").onchange = () => $("stock").focus();
    const list = cps();
    $("lever-offtake").innerHTML = `<h3>Sign an offtake <span class="faint" style="font-family:var(--sans);font-weight:500">${list.length} real producers</span></h3>
      <div class="faint">Cheapest first. Pull the Sayari ownership file before you sign (${fmt$(INVESTIGATE_COST)}).</div>
      <div class="carousel">${list.map((cp) => cpCard(cp)).join("") || `<div class="faint">No vetted producers for this mineral yet.</div>`}</div>`;
    $("lever-offtake").querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => investigate(b.dataset.inv)));
    $("lever-offtake").querySelectorAll("[data-sign]").forEach((b) => (b.onclick = () => sign(b.dataset.sign)));
    if (document.activeElement && document.activeElement.id === "stock") $("stock").focus();
    hud();
  }
  function cpCard(cp) {
    const inv = G.investigated.has(cp.id), signed = G.signed.includes(cp.id);
    const S0 = effSigma();
    const naive = { [cp.id]: !inv };
    const dAfter = signed ? null : dist(effSigma([...G.signed, cp.id], naive), G.stockDays);
    const gain = dAfter == null ? null : dAfter - dist(S0, G.stockDays);
    const flags = cp.flags || [];
    return `<div class="cp-card ${signed ? "signed" : ""} ${signed && isLinked(cp) ? "trap" : ""}">
      <b>${esc(cp.name)}</b><div class="row"><span class="mini">${esc(cp.country)}</span><span class="mini">${fmt$(cp.upfront)}</span><span class="mini">${cp.docPerQ} d/qtr</span><span class="mini">lag ${cp.lag[0]}–${cp.lag[1]}q</span></div>
      ${inv || signed ? `<div class="row">${cp.ownerChina ? `<span class="mini danger">China-based owner</span>` : ""}${flags.filter((f) => f.kind !== "owner").slice(0, 3).map((f) => `<span class="mini ${["labour", "sanctions"].includes(f.kind) ? "danger" : "warn"}" title="${esc(f.why || "")}">${esc(String(f.label).slice(0, 38))}</span>`).join("")}${!cp.ownerChina && !flags.length ? `<span class="mini ok">no flags returned</span>` : ""}</div>
        <div class="faint">Owner: ${esc(cp.owner || "—")} · TV score ${cp.score != null ? esc(cp.score) : "—"}</div>` : `<div class="faint">Ownership unknown. Investigate to see what Sayari holds.</div>`}
      ${gain != null ? `<div class="faint">Projected: <b class="num" style="color:${gain > 0.05 ? "var(--ok)" : "var(--ink-2)"}">${gain >= 0 ? "+" : ""}${gain.toFixed(2)}σ</b>${inv ? "" : " (assumes independent)"}</div>` : `<div class="faint">Signed${isLinked(cp) ? " · fails with China" : ""}</div>`}
      <div class="btns"><button data-inv="${cp.id}" ${inv || signed ? "disabled" : ""}>${inv ? "Investigated" : `Investigate ${fmt$(INVESTIGATE_COST)}`}</button><button class="sign" data-sign="${cp.id}" ${signed || budgetLeft() < cp.upfront ? "disabled" : ""}>${signed ? "Signed" : "Sign"}</button></div></div>`;
  }
  function investigate(id) {
    const cp = COUNTERPARTIES.find((c) => c.id === id);
    G.investigated.add(id); G.investCost += INVESTIGATE_COST;
    const before = dist(effSigma([...G.signed, id], { [id]: true }), G.stockDays), after = dist(effSigma([...G.signed, id]), G.stockDays);
    if (isLinked(cp)) toast(`<b style="color:var(--danger)">Ownership file: ${esc(cp.name)}.</b> ${cp.ownerChina ? "Sayari shows a China-based owner." : "Sayari shows Chinese feedstock."} The projected gain drops from <b class="num">${(before - dist(effSigma(), G.stockDays)).toFixed(2)}σ</b> to <b class="num">${(after - dist(effSigma(), G.stockDays)).toFixed(2)}σ</b>. Diversification can get worse as you learn more.`);
    else toast(`Ownership file: ${esc(cp.name)}. ${cp.flags && cp.flags.length ? `Flags: ${esc(cp.flags.map((f) => f.label).join("; ").slice(0, 160))}.` : "No flags returned."} <span class="faint">Sayari findings, not allegations.</span>`, "good");
    renderLevers();
  }
  function sign(id) {
    const cp = COUNTERPARTIES.find((c) => c.id === id);
    const before = G.dNow;
    G.signed.push(id);
    addCpNode(cp, true);
    setTimeout(() => paintRisk(true), 650);
    renderLevers();
    if (isLinked(cp)) setTimeout(() => toast(`<b style="color:var(--danger)">Trap.</b> ${esc(cp.name)} ${cp.ownerChina ? "has a China-based owner in Sayari" : "runs on Chinese feedstock (Sayari)"}. Its edge snaps to the China cluster: when China's controls bite, it fails too. Distance ${before.toFixed(1)}σ → ${G.dNow.toFixed(1)}σ.`), 500);
    else toast(`Signed ${esc(cp.name)}. Deliveries start in ${cp.lag[0]}–${cp.lag[1]} quarters. Distance ${before.toFixed(1)}σ → ${G.dNow.toFixed(1)}σ.`, "good");
  }
  $("btn-a3").onclick = () => show(4);

  // ---------- About ----------
  $("btn-about").onclick = () => drawer(`<h3>About Stockpile Strategist</h3>
    <p>You run America's critical-minerals reserve with $12B, the size of the real Project Vault. The game teaches one idea: <b>your biggest supplier is not your biggest risk; the suppliers that fail together are.</b></p>
    <h4>Data</h4><ul>
      <li><b>Tavily:</b> dated pre-quarter news, no foresight, plus the forward-mode news signal.</li>
      <li><b>Tradeverifyd:</b> UN Comtrade US import flows (globe arcs, teaching networks), copper price, disruption checks, entity scores.</li>
      <li><b>Sayari:</b> shipment records (antimony network), beneficial owners, watchlist and risk flags for real producers. Flags are findings, not allegations.</li></ul>
    <h4>Honesty rules</h4><ul><li>Reported vs assumed is labelled everywhere. Illustrative networks carry a badge.</li><li>Reverse-stress results are conditional, not forecasts. σ-distances aren't probabilities. Act 5 counts are counts of <i>simulated</i> futures.</li></ul>
    <p class="faint">Reverse-stress logic adapted from the <a href="https://ethical-tech-colab.github.io/reverse-stress/" target="_blank" rel="noopener">Ethical Tech CoLab Resilience Atlas</a> (teaching material, not a validated product).</p>
    <p><a href="../classic/">Open Analyst mode</a> for the full six-mineral dashboard (v3).</p>`);

  // ---------- keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
    if (e.key !== "Enter") return;
    if (e.target.closest("button, a, input, select, textarea, [role=button]")) return;
    const btn = document.querySelector(".act.on [data-primary]:not(.hidden)");
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
  });

  // ---------- enter hooks ----------
  const ENTER = { 0: act0, 1: act1, 2: act2, 3: act3, 4: () => Replay.start(G), 5: () => Futures.start(G) };
  window.ACTS = { ENTER, hud, budgetLeft, stockCost, effSigma, dist, isLinked, show };

  // ---------- boot ----------
  Stage.init($("stage")).then(({ arcs }) => {
    const tot = arcs.reduce((s, a) => s + a.value, 0);
    const yr = arcs[0] && arcs[0].year;
    $("globe-caption").textContent = arcs.length ? `Arcs: ${arcs.length} real US import flows for six critical minerals, $${(tot / 1e6).toFixed(0)}M in ${yr} (Tradeverifyd · UN Comtrade · covered corridors only).` : "";
  });
  const start = (location.hash.match(/act=(\d)/) || [])[1];
  const m = (location.hash.match(/m=([a-z]+)/) || [])[1];
  if (m) { G.mission = Missions.MISSIONS.find((x) => x.id === m) || null; if (G.mission) document.documentElement.style.setProperty("--mission", G.mission.color); }
  document.querySelector('.act[data-act="0"]').classList.add("on");
  ENTER[0]();
  if (start && +start > 0 && (G.mission || +start === 1)) {
    if (+start >= 3) { G.model = Missions.buildModel(G.mission.id); const { a } = RST.solve(G.model.stressS, G.L); G.a = a; const o = a.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]); G.faults = [o[0][1], o[1][1]]; G.guessHits = 0; G.dStart = RST.distance(G.model.stressS, G.L); }
    show(+start);
  }
})();
