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
    $("coach").classList.toggle("hidden", n === 0);
    if (n > 0) Guide.setAct(n);
    setTimeout(() => window.__syncHud && window.__syncHud(), 0);
    $("stage").classList.toggle("dim", n >= 2 && n <= 3);
    $("stage").classList.toggle("gone", n >= 4);
    Stage.setRotate(n <= 1);
  }
  window.Router = { show };

  // ---------- HUD ----------
  function hud() {
    const m = G.mission;
    $("hud-mission").innerHTML = m ? `${tile(m, "sm")}<div><div class="hud-k">Protecting · ${esc(m.name)}</div><div class="hud-v" style="font-size:15px">${esc(m.mustNot)}</div></div>` : "";
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
  const howHTML = `<h3>How it works, in five steps</h3>
    <p><b>1 · Pick what to protect.</b> Choose one mineral, such as the one inside electric-car motors, and decide how big a shortage would stop the factory.</p>
    <p><b>2 · Find the weak spots.</b> You'll see where America gets that mineral. Guess which two suppliers would cause most of a shortage. The answer is often <i>not</i> the biggest supplier, but the suppliers that fail <i>at the same time</i> because they depend on the same source.</p>
    <p><b>3 · Prepare.</b> Spend your $12B storing extra supply and signing deals with producers outside China. Check who really owns a producer before you sign: some "alternatives" are secretly tied to China.</p>
    <p><b>4 · Live through 2023–26.</b> The real export bans and price shocks of those years hit your plan, three months at a time. You make four decisions along the way.</p>
    <p><b>5 · Face the deadline.</b> China's pause ends on 10 January 2027. We play out 1,000 possible futures to see how often your factory keeps running.</p>
    <p class="faint">Everything uses real data: news via Tavily, trade figures via Tradeverifyd, and company ownership and shipping records via Sayari. Look for the ⓘ buttons to see the evidence.</p>`;
  $("btn-how").onclick = () => drawer(howHTML);
  $("btn-gloss0").onclick = () => drawer(Plain.glossaryHTML());
  $("btn-gloss").onclick = () => drawer(Plain.glossaryHTML());

  // ---------- Act 1: mission ----------
  let factoryRAF = null;
  function act1() {
    const M = Missions.MISSIONS;
    $("missions").innerHTML = M.map((m, i) => {
      const model = Missions.buildModel(m.id);
      return `<button class="mission" role="listitem" data-m="${m.id}" aria-pressed="${G.mission && G.mission.id === m.id}" style="--tile:${m.color}">
        ${tile(m)}<div class="faint" style="margin-top:-4px">${esc(m.name)}</div><h3>${esc(m.mustNot)}</h3><div class="hook">${esc(m.what || "")}</div><div class="hook" style="color:var(--ink)">${esc(m.hook)}</div>
        <div class="pips">${[1, 2, 3].map((p) => `<i class="${p <= m.difficulty ? "on" : ""}"></i>`).join("")}<span style="margin-left:6px">${["", "Easier", "Medium", "Harder"][m.difficulty]}</span></div>
        <span class="badge-teach">${model.synthetic ? "Real suppliers · some figures estimated" : "Measured from real shipping records"}</span></button>`;
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
    $("btn-a1").disabled = false; $("btn-a1").textContent = `Next: see where ${G.mission.name.toLowerCase()} comes from →`;
    Stage.focus(id, G.mission.color);
    hud(); factory(); thrLive();
    if (!silent) Guide.tick("pick");
    if (!silent) fx(() => gsap.from("#threshold", { opacity: 0, y: 12, duration: 0.4 }), 600);
  }
  $("thr").oninput = (e) => { G.threshold = +e.target.value / 100; G.L = G.threshold * 100; $("thr-v").textContent = `${e.target.value}%`; hud(); thrLive(); Guide.tick("thr"); };
  /** Live consequence of the threshold: what it means in days, and the starting distance it implies. */
  function thrLive() {
    if (!G.mission) return;
    const model = Missions.buildModel(G.mission.id);
    const d = RST.distance(model.stressS, G.L);
    $("thr-live").innerHTML = `<div>In plain terms: about <b>${Math.round(G.threshold * 91.25)} days' worth</b> of ${esc(G.mission.name.toLowerCase())} missing over three months would stop the line.</div>
      <div>Your starting <b>safety margin</b>, with nothing stored yet: <b class="num">${Plain.margin(d)}</b> ${Plain.zoneTag(d)}. ${Plain.marginSentence(d)} <button class="evidence-btn" id="what-margin">What's a safety margin?</button></div>`;
    $("what-margin").onclick = () => drawer(Plain.glossaryHTML());
  }
  function factory() {
    const el = $("factory");
    el.innerHTML = `<svg viewBox="0 0 160 110" role="img" aria-label="Factory">
      <path d="M10 100 V55 L45 38 V55 L80 38 V55 L115 38 V100 Z" fill="rgba(30,41,59,.9)" stroke="#AEB6C4" stroke-width="1.5"/>
      <rect x="120" y="20" width="14" height="80" fill="rgba(30,41,59,.9)" stroke="#AEB6C4" stroke-width="1.5"/>
      <g id="gear" transform="translate(62 78)"><circle r="13" fill="none" stroke="#E08A52" stroke-width="4" stroke-dasharray="5 4"/><circle r="4" fill="#E08A52"/></g>
      <circle id="lamp" cx="96" cy="70" r="6" fill="#5fc08f"/>
      <text id="sup" x="80" y="14" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#AEB6C4">supply −0%</text></svg>`;
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
      sup.textContent = `supply −${Math.round(s * 100)}% · ${stopped ? "STOPPED" : "running"}`;
      sup.setAttribute("fill", stopped ? "#FF5A4E" : "#AEB6C4");
      factoryRAF = requestAnimationFrame(loop);
    };
    factoryRAF = requestAnimationFrame(loop);
  }
  $("btn-a1").onclick = () => { if (!G.mission) return; Guide.tick("go1"); Guide.log(1, `Mission: ${G.mission.name}`, [{ k: "Threshold", delta: G.threshold * 100, unit: "%", fmt: (v) => Math.round(v) }], G.mission.mustNot); show(2); };

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
    $("a2-title").textContent = `This is where America's ${G.mission.name.toLowerCase()} comes from.`;
    $("a2-why").classList.add("hidden");
    $("a2-legend").innerHTML = `<span><i style="border-color:var(--mission)"></i>a supplier · bigger = more supply</span><span><i style="border-color:#c7cbd4"></i>China-linked</span><span><i style="border-color:rgba(148,163,184,.6)"></i>top row: where suppliers get raw material</span><span><span class="net-legend dash" style="position:static;padding:0;background:none"></span>fail together</span>`;
    $("a2-lede").innerHTML = `Each circle in the middle row is a country or company that sells ${esc(G.mission.name.toLowerCase())} to the US. <b>Bigger circle = more of the supply.</b> The top row is where <i>they</i> get their raw material. ${G.model.synthetic ? "Supplier shares are real; some figures are estimated (yellow badge)." : `Measured from ${G.model.points} quarters of real shipping records (Sayari).`} <button class="evidence-btn" id="ev2">ⓘ evidence</button>`;
    $("ev2").onclick = evidence;
    net2 = new NetView($("net"), G.model, { plantLabel: `Your US factory` });
    net2.onTap = (i) => {
      if (step2 !== "guess") { nodeEvidence(G.model.nodes[i]); return; }
      G.guess = net2.toggleSelect(i, 2);
      if (G.guess.length === 2) Guide.tick("guess");
      $("btn-a2").disabled = G.guess.length !== 2;
      $("btn-a2").textContent = G.guess.length === 2 ? "Show me the answer" : `Tap ${2 - G.guess.length} more supplier${G.guess.length === 1 ? "" : "s"}`;
    };
    if (gsap && !reduced()) { const tw = gsap.from("#net .n-node, #net .n-t2", { opacity: 0, scale: 0.3, transformOrigin: "center", stagger: 0.12, duration: 0.6, ease: "back.out(1.8)" }); setTimeout(() => tw.progress(1), 2600); }
    $("btn-a2").disabled = true; $("btn-a2").textContent = "Loading the map…";
    setTimeout(() => {
      if (G.act !== 2) return;
      step2 = "guess"; Guide.tick("look");
      $("a2-title").textContent = `Quiz: supply suddenly drops by ${Math.round(G.threshold * 100)}%. Which 2 suppliers would be most to blame?`;
      $("a2-lede").innerHTML = `Tap two circles in the middle row. Most people pick the two biggest. Let's see if that's right. <button class="evidence-btn" id="ev2">ⓘ evidence</button>`;
      $("ev2").onclick = evidence;
      $("btn-a2").textContent = "Tap 2 suppliers";
    }, reduced() ? 300 : 3200);
  }
  function reveal() {
    const first = step2 !== "reveal";
    step2 = "reveal"; Guide.tick("reveal");
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
      ? `Your two biggest suppliers provide <span class="num">${pct(supplyShare)}</span> of supply, but would cause <span class="num" style="color:var(--danger)">${pct(riskShare)}</span> of a shortage.`
      : `${esc(names)} provide only <span class="num">${pct(supplyShare)}</span> of supply, but would cause <span class="num" style="color:var(--danger)">${pct(riskShare)}</span> of a shortage.`;
    $("a2-lede").innerHTML = `${hits === 2 ? "✓ You found both weak spots." : hits === 1 ? "You found 1 of the 2 weak spots." : "You found 0 of the 2 weak spots. Most people pick the biggest circles."} The circles have now <b>resized to show how much of a shortage each supplier would cause</b>. Red outlines mark the weak spots. <button class="evidence-btn" id="ev2">ⓘ how is this worked out?</button>`;
    // Plain-English "why": point at the links that make these suppliers fail together.
    const linkWhy = G.model.links.filter((l) => G.faults.includes(l.i) || G.faults.includes(l.j)).slice(0, 2).map((l) => `<b>${esc(shortName(G.model.nodes[l.i].label))}</b> and <b>${esc(shortName(G.model.nodes[l.j].label))}</b>: ${esc(String(l.reason || "linked").split(";")[0].slice(0, 120))}`);
    $("a2-why").classList.remove("hidden");
    $("a2-why").innerHTML = `<span class="k">Why?</span>${sameAsBiggest ? "Big suppliers matter, but they're even riskier than their size suggests" : "Size isn't everything. These suppliers matter more than their size suggests"} because <b>they tend to fail at the same time</b>, usually because they depend on the same source. The red dashed lines on the map show these links.${linkWhy.length ? `<ul style="margin:6px 0 0;padding-left:18px">${linkWhy.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}`;
    $("ev2").onclick = evidence;
    $("a2-stats").classList.remove("hidden");
    $("a2-stats").innerHTML = `<div class="stat-card"><div class="k">Their share of supply</div><div class="v num" id="st-sup">0%</div></div><div class="stat-card risk"><div class="k">Their share of a shortage</div><div class="v num" id="st-risk">0%</div></div>`;
    countUp($("st-sup"), supplyShare * 100, { format: (v) => `${Math.round(v)}%` });
    countUp($("st-risk"), riskShare * 100, { format: (v) => `${Math.round(v)}%`, duration: 1.6 });
    $("a2-fine").textContent = `This is an "if it happens" analysis, not a prediction: if a ${Math.round(G.threshold * 100)}% shortage happens, this is the most likely way it would happen${G.regime === "stress" ? ", assuming a crisis where linked suppliers fail together" : ", using calm-year patterns"}.`;
    $("a2-tools").innerHTML = `<div class="hud-k" style="width:100%">Dig deeper (optional)</div><button class="chip" id="t-up" aria-pressed="false">↑ Where do they get their raw material?</button><button class="chip" id="t-alt" aria-pressed="false">◎ How certain is this?</button><button class="chip" id="t-reg" aria-pressed="${G.regime === "calm"}">${G.regime === "stress" ? "Showing: crisis mode (switch to normal times)" : "Showing: normal times (switch to crisis mode)"}</button>`;
    $("t-up").onclick = () => { Guide.tick("explore"); upstream($("t-up")); };
    $("t-alt").onclick = () => { Guide.tick("explore"); alternatives($("t-alt")); };
    $("t-reg").onclick = () => { Guide.tick("explore"); G.regime = G.regime === "stress" ? "calm" : "stress"; reveal(); };
    if (first) Guide.log(2, "Guessed the fault lines", [{ k: "Spotted", delta: hits, unit: " of 2", fmt: (v) => v }, { k: "Risk carried by the real fault lines", delta: riskShare * 100, unit: "%", fmt: (v) => Math.round(v) }], `${G.guess.map((i) => shortName(G.model.nodes[i].label)).join(" + ")} vs ${names}`);
    explorer();
    $("btn-a2").disabled = false; $("btn-a2").textContent = "Next: prepare your defences →";
    announce($("a2-title").textContent);
  }
  // Friendly supplier names for sentences: drop qualifiers like "(…)", " - …", " direct", "& warehouse lots".
  const shortName = (s) => String(s).split(" (")[0].split(" - ")[0].replace(/\s+direct\b.*$/i, "").replace(/\s*&\s*warehouse.*$/i, "").replace(/\s+(lots|metal)$/i, "").trim();
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
    const line = tot > 0 ? `Even your "non-Chinese" suppliers depend on it: <b>${pct(toSpof / tot)}</b> of the risk from them traces back to <b>${esc(spof.label)}</b>.` : `<b>${pct(bp.spof.share)}</b> of the shortage risk traces back to <b>${esc(spof.label)}</b>.`;
    toast(`<b style="color:var(--danger)">Hidden weak point found.</b> ${line} You never buy from it directly, but almost everything flows through it. <span class="faint">(Some upstream shares are estimates.)</span>`);
  }
  function alternatives(btn) {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", on);
    if (!on) { net2.clearHalos(); return; }
    const caps = G.model.nodes.map((n) => n.mean);
    const q = RST.alternatives(regimeS(), G.L, caps, { samples: 1000, seed: 42 }).map((x) => ({ p10: x.p10 / G.L, p50: x.p50 / G.L, p90: x.p90 / G.L }));
    G.alt = q;
    net2.halos(q);
    toast(`The faint rings around each circle show the range across 1,000 slightly different ways the same shortage could unfold. Big rings mean less certainty. The answer is a range, not one fixed story.`, "good");
  }
  $("btn-a2").onclick = () => { if (step2 === "guess" && G.guess.length === 2) reveal(); else if (step2 === "reveal") { Guide.tick("go2"); show(3); } };
  /** Live explorer: drag correlation / volatility and watch the inferred loss re-flow. Exploration only. */
  function explorer() {
    const el = $("a2-explore");
    el.classList.remove("hidden");
    G.xRho = G.xRho != null ? G.xRho : 0.8; G.xMult = G.xMult != null ? G.xMult : 1.5;
    el.innerHTML = `<div class="hud-k">Try it yourself: what makes a weak spot?</div>
      <label>How often linked suppliers fail at the same time <div class="slider-row"><input type="range" id="x-rho" min="0" max="0.95" step="0.05" value="${G.xRho}"><b id="x-rho-v">${Math.round(G.xRho * 100)}%</b></div></label>
      <label>How much China-linked supply swings in a crisis <div class="slider-row"><input type="range" id="x-mult" min="1" max="2.5" step="0.1" value="${G.xMult}"><b id="x-mult-v">×${G.xMult.toFixed(1)}</b></div></label>
      <div class="live" id="x-live"></div>
      <div class="faint">Drag a slider and watch the circles resize. This is just for exploring; the rest of the game uses the standard settings. <button class="evidence-btn" id="x-reset">Reset</button></div>`;
    const run = (morph) => {
      const S = RST.stress(G.model.calm, G.model.links.map((l) => ({ ...l, rho: G.xRho })), G.model.chinaIdx, { sigmaMult: G.xMult });
      const { a } = RST.solve(S, G.L);
      const share = a.map((v) => Math.max(0, v) / G.L);
      if (morph) net2.morph(share, { mode: "risk", duration: 0.3, ease: "power2.out" });
      const order = share.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]);
      const top = [order[0][1], order[1][1]];
      const d = RST.distance(S, G.L);
      $("x-live").innerHTML = `Biggest weak spots now: <b>${top.map((i) => esc(shortName(G.model.nodes[i].label))).join(" + ")}</b>, causing <b class="num" style="color:var(--danger)">${pct(RST.lossShare(a, top))}</b> of a shortage. Safety margin: <b class="num">${Plain.margin(d)}</b> ${Plain.zoneTag(d)}.`;
      const sr = $("st-risk"); if (sr) sr.textContent = pct(RST.lossShare(a, G.faults));
    };
    $("x-rho").oninput = (e) => { G.xRho = +e.target.value; $("x-rho-v").textContent = `${Math.round(G.xRho * 100)}%`; Guide.tick("explore"); run(true); };
    $("x-mult").oninput = (e) => { G.xMult = +e.target.value; $("x-mult-v").textContent = `×${G.xMult.toFixed(1)}`; Guide.tick("explore"); run(true); };
    $("x-reset").onclick = () => { G.xRho = 0.8; G.xMult = 1.5; explorer(); run(true); };
    run(false);
  }

  function evidence() {
    const M = G.model, S = regimeS(), n = M.nodes.length;
    const sigTable = `<table><tr><th></th>${M.nodes.map((x, j) => `<th>${j + 1}</th>`).join("")}</tr>${S.map((r, i) => `<tr><th>${i + 1}</th>${r.map((v) => `<td>${v.toFixed(1)}</td>`).join("")}</tr>`).join("")}</table>
      <p class="faint">${M.nodes.map((x, j) => `${j + 1} = ${esc(shortName(x.label))}`).join(" · ")}</p>`;
    drawer(`<h3>How this is worked out (for experts)</h3>
      <p>In plain terms: we look at how much each supplier's shipments usually swing, and how often they swing together. Then we ask "if supply fell by ${Math.round(G.threshold * 100)}%, what's the most likely mix of suppliers behind it?" Suppliers that swing together end up carrying more of the blame than their size suggests.</p>
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
    $("a3-legend").innerHTML = `<span><i style="border-color:#FF5A4E"></i>weak spot</span><span><i style="border-color:var(--mission)"></i>circle size = share of a shortage</span><span><span class="net-legend dash" style="position:static;padding:0;background:none"></span>fail together</span>`;
    net3 = new NetView($("net3"), G.model, { plantLabel: `Your US factory` });
    net3.setFaults(G.faults);
    for (const id of G.signed) addCpNode(COUNTERPARTIES.find((c) => c.id === id), false);
    paintRisk(false);
    net3.onTap = (i) => (i < G.model.nodes.length ? nodeEvidence(G.model.nodes[i]) : null);
    G._snap = snapshot();
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
    const k = net3.addNode({ id: cp.id, label: cp.name, country: cp.country, share: Missions.volumeFromDocPerQ(cp.docPerQ) / 100, chinaLinked: isLinked(cp), sub: `your deal · ${cp.country}`, linkReason: cp.ownerChina ? "China-based owner (Sayari)" : "Chinese feedstock (Sayari)" }, animate ? linkTo : []);
    if (!animate && linkTo.length) net3.extraLinks.push({ i: k, j: linkTo[0], on: true });
    return k;
  }
  function renderLevers() {
    const d = dist(effSigma(), G.stockDays);
    if (G.dNow == null) G.dNow = d;
    const scaleX = (x) => Math.min(100, (x / 5) * 100);
    $("distance").innerHTML = `<div class="hud-k">Your safety margin <button class="evidence-btn" id="ev3" style="font-size:11px">ⓘ what does this mean?</button></div>
      <div class="row"><span class="big num" id="dval">${Plain.margin(G.dNow)}</span>${Plain.zoneTag(d)}<span class="faint">you started at ${Plain.margin(G.dStart)}</span></div>
      <div class="sentence">${Plain.marginSentence(d)}</div>
      <div class="dscale"><b style="left:${scaleX(G.dStart)}%" title="where you started"></b><i id="dmark" style="left:${scaleX(G.dNow)}%" title="where you are now"></i></div>
      <div class="dlabels"><span>Danger</span><span>1.5×</span><span>At risk</span><span>2.5×</span><span>Safe</span><span>3.5×</span><span>Very safe</span></div>`;
    countUp($("dval"), d, { from: G.dNow, format: (v) => `${v.toFixed(1)}×`, duration: 0.8 });
    requestAnimationFrame(() => { const mk = $("dmark"); if (mk) mk.style.left = `${scaleX(d)}%`; });
    G.dNow = d;
    $("ev3").onclick = () => drawer(`<h3>Safety margin</h3><p><b>In plain terms:</b> supply always wobbles a bit from quarter to quarter. Your safety margin says how many "typical bad quarters" of wobble your factory could absorb before it stops. 1× means one ordinary bad quarter could stop you. 3× means it would take a shock three times worse than usual. Storing supply and signing good deals both push it up.</p><p><b>For experts</b>, it's the reverse-stress "distance to disaster":</p><pre>d = (L + S) / √(1ᵀ Σ 1)</pre>
      <p>L is the loss that stops your line (${Math.round(G.threshold * 100)}% of a quarter's supply). S is the shortfall your stockpile absorbs. √(1ᵀΣ1) is the typical size of a total supply shock under the current regime, including your offtakes.</p>
      <p>Zones: Danger &lt; 1.5× · At risk 1.5–2.5× · Safe 2.5–3.5× · Very safe &gt; 3.5×.</p>
      <p><b>Not a probability.</b> It's a distance under the model, and the atlas guardrail applies.</p>
      <p class="faint">Offtakes move volume out of the existing mix (σ ∝ volume, CV ${CV_NEW}, <span class="pill assumed">assumed</span>). A China-owned or China-fed supplier gets ρ = 0.8 with China-linked nodes (<span class="pill assumed">assumed</span>).</p>`);
    const sc = stockCost(G.stockDays);
    $("lever-stock").innerHTML = `<h3><span><span class="step-n">1</span>Store extra supply</span> <span class="num">${G.stockDays} days</span></h3>
      <div class="plain-note">How many days of normal use to keep in storage. Drag the slider.</div>
      <input type="range" id="stock" min="0" max="180" step="5" value="${G.stockDays}" aria-label="Days of supply to store" />
      <div class="meta"><span>If your shortage hits, the factory keeps running for <b class="num">${Math.round(G.stockDays / G.threshold)} days</b></span><span class="num">Cost ≈ ${fmt$(sc.cost)}${sc.quarters > 1 ? ` (bought over ${sc.quarters} quarters)` : ""}</span></div>
      <div class="faint">Buying a lot at once pushes the price up, so big purchases cost more per day. You can buy at most 45 days' worth per quarter.</div>
      ${(() => { const nd = Math.min(180, G.stockDays + 10); if (nd === G.stockDays) return ""; const dc = stockCost(nd).cost - sc.cost, dd = dist(effSigma(), nd) - dist(effSigma(), G.stockDays); return `<div class="faint">10 more days would cost ≈<b class="num">${fmt$(dc)}</b> and add <b class="num">+${dd.toFixed(2)}×</b> to your safety margin.</div>`; })()}`;
    $("stock").oninput = (e) => { G.stockDays = +e.target.value; Guide.tick("stock"); renderLevers(); hud(); };
    $("stock").onchange = () => { logChange(`Stockpile set to ${G.stockDays} days`); $("stock").focus(); };
    dcurve();
    renderStress();
    const list = cps();
    $("lever-offtake").innerHTML = `<h3><span><span class="step-n">2</span>Sign a supply deal (optional)</span> <span class="faint" style="font-family:var(--sans);font-weight:500">${list.length} real producers</span></h3>
      <div class="plain-note">A deal gets you a steady delivery every quarter from a producer outside China, after a delay of a year or more. <b>But check who owns them first</b> (${fmt$(INVESTIGATE_COST)}): a cheap "alternative" that's secretly tied to China fails when China cuts supply. Scroll sideways to see more producers.</div>
      <div class="carousel">${list.map((cp) => cpCard(cp)).join("") || `<div class="faint">No vetted producers for this mineral yet.</div>`}</div>`;
    $("lever-offtake").querySelectorAll("[data-inv]").forEach((b) => (b.onclick = () => investigate(b.dataset.inv)));
    $("lever-offtake").querySelectorAll("[data-sign]").forEach((b) => (b.onclick = () => sign(b.dataset.sign)));
    if (document.activeElement && document.activeElement.id === "stock") $("stock").focus();
    hud();
  }
  /** What a decision changed: snapshot before/after. */
  function snapshot() { return { d: dist(effSigma(), G.stockDays), budget: budgetLeft(), runtime: G.stockDays / G.threshold }; }
  function logChange(label, note) {
    const a = G._snap || snapshot(), b = snapshot();
    Guide.log(3, label, [{ k: "Safety margin", from: a.d, to: b.d, unit: "×", dp: 2, fmt: (v) => v.toFixed(1) }, { k: "Money", delta: (b.budget - a.budget), unit: "M", fmt: (v) => `$${Math.round(v)}` }, { k: "Factory runs", delta: b.runtime - a.runtime, unit: " days", fmt: (v) => Math.round(v) }], note);
    G._snap = b;
  }
  /** Distance-to-disaster vs stockpile curve (with and without your offtakes). Click to set. */
  function dcurve() {
    const host = $("lever-stock"), W = 380, H = 120, L = 30, R = 8, T = 8, B = 18;
    const S = effSigma(), S0 = G.model.stressS;
    const xs = []; for (let d = 0; d <= 180; d += 5) xs.push(d);
    const ys = xs.map((x) => dist(S, x)), ys0 = xs.map((x) => dist(S0, x));
    const maxY = Math.max(4, ...ys) * 1.05;
    const X = (v) => L + (v / 180) * (W - L - R), Y = (v) => T + (1 - v / maxY) * (H - T - B);
    const bands = [[0, 1.5, "rgba(255,90,78,.08)"], [1.5, 2.5, "rgba(244,178,74,.08)"], [2.5, 3.5, "rgba(57,135,229,.08)"], [3.5, maxY, "rgba(95,192,143,.08)"]];
    const line = (arr) => arr.map((y, i) => `${X(xs[i])},${Y(y)}`).join(" ");
    const svg = `<svg class="dcurve" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distance to disaster versus stockpile days">
      ${bands.map(([a, b, c]) => `<rect x="${L}" y="${Y(Math.min(b, maxY))}" width="${W - L - R}" height="${Y(a) - Y(Math.min(b, maxY))}" fill="${c}"/>`).join("")}
      <polyline points="${line(ys0)}" fill="none" stroke="rgba(174,182,196,.55)" stroke-dasharray="4 4" stroke-width="1.5"/>
      <polyline points="${line(ys)}" fill="none" stroke="#E08A52" stroke-width="2.5"/>
      <circle cx="${X(G.stockDays)}" cy="${Y(dist(S, G.stockDays))}" r="6" fill="#E08A52" stroke="#0B0F17" stroke-width="2"/>
      <text x="${L}" y="${H - 4}">0 days</text><text x="${W - R}" y="${H - 4}" text-anchor="end">180 days stored</text>
      ${[1.5, 2.5, 3.5].filter((v) => v < maxY).map((v) => `<text x="${L - 4}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`).join("")}
    </svg><div class="faint">How your safety margin grows as you store more (orange = your plan, dashed = without deals). Background colours are the zones. Click anywhere on the chart to choose an amount.</div>`;
    host.insertAdjacentHTML("beforeend", svg);
    host.querySelector(".dcurve").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const v = Math.max(0, Math.min(180, Math.round(((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * 180 / 5) * 5));
      G.stockDays = v; Guide.tick("stock"); renderLevers(); logChange(`Stockpile set to ${v} days (from the curve)`);
    };
  }
  /** Three live stress tests: does the line hold, and for how long? */
  function renderStress() {
    const el = $("lever-stress"); if (!el) return;
    const signed = G.signed.map((id) => COUNTERPARTIES.find((c) => c.id === id));
    const clean = signed.filter((c) => !isLinked(c)).reduce((s, c) => s + c.docPerQ, 0), linked = signed.filter(isLinked).reduce((s, c) => s + c.docPerQ, 0);
    const cnShare = Math.min(1, G.model.nodes.filter((n) => n.chinaLinked).reduce((s, n) => s + n.share, 0));
    const tests = [
      { k: `Supply drops ${Math.round(G.threshold * 100)}%`, need: G.threshold * 91.25, have: clean + linked },
      { k: `Supply drops ${Math.round(Math.min(1, 2 * G.threshold) * 100)}%`, need: Math.min(1, 2 * G.threshold) * 91.25, have: clean + linked },
      { k: `All China-linked supply stops (${pct(cnShare)})`, need: cnShare * 91.25, have: clean },
    ];
    el.innerHTML = `<h3><span><span class="step-n">3</span>Test your plan</span> <span class="faint" style="font-family:var(--sans);font-weight:500">how long would the factory keep running?</span></h3>
      ${tests.map((t) => {
        const gap = Math.max(0, t.need - t.have) / 91.25; // fraction of demand missing per day
        const runs = gap <= 1e-9 ? Infinity : G.stockDays / gap;
        const ok = runs >= 365;
        return `<div class="stress-row"><span>${esc(t.k)}</span><div class="stress-bar" title="Bar = one year of this shock"><div class="need" style="width:100%"></div><div class="have" style="width:${Math.min(100, (Math.min(runs, 365) / 365) * 100)}%"></div></div>
          <span class="stress-verdict ${ok ? "ok" : "bad"}">${runs === Infinity ? "never stops ✓" : runs >= 365 ? "a year+ ✓" : `${Math.round(runs)} days`}</span></div>`;
      }).join("")}
      <div class="faint">Each bar is one year of that shortage; orange is how long your plan keeps the factory going. Deals count once they're delivering, and deals tied to China deliver nothing if China stops. Simple arithmetic, not a prediction.</div>`;
  }
  function cpCard(cp) {
    const inv = G.investigated.has(cp.id), signed = G.signed.includes(cp.id);
    const S0 = effSigma();
    const naive = { [cp.id]: !inv };
    const dAfter = signed ? null : dist(effSigma([...G.signed, cp.id], naive), G.stockDays);
    const gain = dAfter == null ? null : dAfter - dist(S0, G.stockDays);
    const flags = cp.flags || [];
    return `<div class="cp-card ${signed ? "signed" : ""} ${signed && isLinked(cp) ? "trap" : ""}">
      <b>${esc(cp.name)}</b><div class="row"><span class="mini">${esc(cp.country)}</span><span class="mini">${fmt$(cp.upfront)}</span><span class="mini" title="days of supply delivered each quarter">+${cp.docPerQ} days/quarter</span><span class="mini" title="delay before deliveries start">starts in ${cp.lag[0]}–${cp.lag[1]} quarters</span></div>
      ${inv || signed ? `<div class="row">${cp.ownerChina ? `<span class="mini danger">China-based owner</span>` : ""}${flags.filter((f) => f.kind !== "owner").slice(0, 3).map((f) => `<span class="mini ${["labour", "sanctions"].includes(f.kind) ? "danger" : "warn"}" title="${esc(f.why || "")}">${esc(String(f.label).slice(0, 38))}</span>`).join("")}${!cp.ownerChina && !flags.length ? `<span class="mini ok">no flags returned</span>` : ""}</div>
        <div class="faint">Owner: ${esc(cp.owner || "—")}</div>` : `<div class="faint">Owner unknown. Check before you sign.</div>`}
      ${gain != null ? `<div class="faint">Safety margin: <b class="num" style="color:${gain > 0.05 ? "var(--ok)" : "var(--ink-2)"}">${gain >= 0 ? "+" : ""}${gain.toFixed(2)}×</b>${inv ? "" : " if it's truly independent"}</div>` : `<div class="faint">${isLinked(cp) ? "✗ Signed, but it fails when China cuts supply" : "✓ Signed"}</div>`}
      <div class="btns"><button data-inv="${cp.id}" ${inv || signed ? "disabled" : ""}>${inv ? "Checked ✓" : `Check owner · ${fmt$(INVESTIGATE_COST)}`}</button><button class="sign" data-sign="${cp.id}" ${signed || budgetLeft() < cp.upfront ? "disabled" : ""}>${signed ? "Signed" : "Sign deal"}</button></div></div>`;
  }
  function investigate(id) {
    const cp = COUNTERPARTIES.find((c) => c.id === id);
    G.investigated.add(id); G.investCost += INVESTIGATE_COST; Guide.tick("invest");
    const before = dist(effSigma([...G.signed, id], { [id]: true }), G.stockDays), after = dist(effSigma([...G.signed, id]), G.stockDays);
    if (isLinked(cp)) toast(`<b style="color:var(--danger)">Careful: ${esc(cp.name)} is tied to China.</b> ${cp.ownerChina ? "Records show its owner is based in China." : "Records show it relies on Chinese raw material."} So it would fail at the same time as China. Its benefit drops from <b class="num">+${(before - dist(effSigma(), G.stockDays)).toFixed(2)}×</b> to <b class="num">+${(after - dist(effSigma(), G.stockDays)).toFixed(2)}×</b>.`);
    else toast(`${esc(cp.name)}: no ties to China found. ${cp.flags && cp.flags.length ? `Other records: ${esc(cp.flags.map((f) => f.label).join("; ").slice(0, 140))}.` : ""} <span class="faint">(Sayari records, not accusations.)</span>`, "good");
    renderLevers();
    logChange(`Investigated ${cp.name}`, isLinked(cp) ? (cp.ownerChina ? "Sayari: China-based owner" : "Sayari: Chinese feedstock") : "No China link found");
  }
  function sign(id) {
    const cp = COUNTERPARTIES.find((c) => c.id === id);
    const before = G.dNow;
    G.signed.push(id); Guide.tick("sign");
    addCpNode(cp, true);
    setTimeout(() => paintRisk(true), 650);
    renderLevers();
    if (isLinked(cp)) setTimeout(() => toast(`<b style="color:var(--danger)">That was a trap.</b> ${esc(cp.name)} ${cp.ownerChina ? "is owned from China" : "depends on Chinese raw material"}, so a red line now ties it to China on the map: when China cuts supply, this deal fails too. Safety margin ${Plain.margin(before)} → ${Plain.margin(G.dNow)}.`), 500);
    else toast(`Deal signed with ${esc(cp.name)}. Deliveries start in ${cp.lag[0]}–${cp.lag[1]} quarters. Safety margin ${Plain.margin(before)} → ${Plain.margin(G.dNow)}.`, "good");
    logChange(`Signed ${cp.name}`, isLinked(cp) ? "Trap: China-linked, so it fails with China" : `Deliveries in ${cp.lag[0]}–${cp.lag[1]} quarters`);
  }
  $("btn-a3").onclick = () => { Guide.tick("go3"); Guide.log(3, "Started the clock", [{ k: "Safety margin", delta: G.dNow, unit: "×", fmt: (v) => v.toFixed(1) }, { k: "Stored", delta: G.stockDays, unit: " days", fmt: (v) => Math.round(v) }], `${G.signed.length} deal(s) signed`); show(4); };

  // ---------- About ----------
  $("btn-about").onclick = () => drawer(`<h3>About Stockpile Strategist</h3>
    <p>You run America's emergency mineral stockpile with $12B, the size of the real "Project Vault" launched in 2026. The game teaches one idea: <b>your biggest supplier isn't always your biggest risk. Suppliers that fail at the same time are.</b></p>
    ${howHTML}
    <h4>Data</h4><ul>
      <li><b>Tavily:</b> dated pre-quarter news, no foresight, plus the forward-mode news signal.</li>
      <li><b>Tradeverifyd:</b> UN Comtrade US import flows (globe arcs, teaching networks), copper price, disruption checks, entity scores.</li>
      <li><b>Sayari:</b> shipment records (antimony network), beneficial owners, watchlist and risk flags for real producers. Flags are findings, not allegations.</li></ul>
    <h4>Honesty rules</h4><ul><li>Reported vs assumed is labelled everywhere. Illustrative networks carry a badge.</li><li>Reverse-stress results are conditional, not forecasts. σ-distances aren't probabilities. Act 5 counts are counts of <i>simulated</i> futures.</li></ul>
    <p class="faint">Reverse-stress logic adapted from the <a href="https://ethical-tech-colab.github.io/reverse-stress/" target="_blank" rel="noopener">Ethical Tech CoLab Resilience Atlas</a> (teaching material, not a validated product).</p>
    <p><a href="../classic/">Open Analyst mode</a> to manage all six minerals at once, quarter by quarter.</p>`);

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

  // Keep the coach bar just under the HUD, whatever height the HUD wraps to.
  const syncHud = () => {
    const r = document.documentElement.style;
    r.setProperty("--hud-h", `${$("hud").offsetHeight || 64}px`);
    r.setProperty("--coach-h", `${$("coach").classList.contains("hidden") ? 0 : $("coach").offsetHeight}px`);
  };
  window.__syncHud = syncHud;
  addEventListener("resize", syncHud); setInterval(syncHud, 500);
  // ---------- boot ----------
  Stage.init($("stage")).then(({ arcs }) => {
    const tot = arcs.reduce((s, a) => s + a.value, 0);
    const yr = arcs[0] && arcs[0].year;
    $("globe-caption").textContent = arcs.length ? `The glowing lines on the globe are real shipments of these minerals into the US in ${yr}: ${arcs.length} trade routes worth $${(tot / 1e6).toFixed(0)}M (UN trade data via Tradeverifyd).` : "";
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
