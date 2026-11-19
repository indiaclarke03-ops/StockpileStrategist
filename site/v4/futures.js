/* Stockpile Strategist v4 — Act 5: the cliff (montecarlo.js, unchanged maths) + report card. */
(function (root) {
  const D = root.GAME_DATA, EXT = D.EXT || {}, { QUARTERS, FORWARD } = D;
  const BR = { extend: { c: "#3987e5", l: "Pause extended again" }, lapse: { c: "#d55181", l: "Pause lapses: expanded controls return" }, deal: { c: "#c98500", l: "New deal" } };
  const FAIL = "#FF5A4E";

  function missionRun(fn, k) {
    // Benchmark restricted to the mission mineral: same engine, same history.
    const s = Sim.newState(); let last = null, down = 0;
    while (!s.done) {
      const o = fn(s, last) || {};
      const buy = o.buy && o.buy[k] ? { [k]: o.buy[k] } : {};
      if (!Sim.applyOrders(s, { buy }).ok) Sim.applyOrders(s, {});
      last = Sim.resolveQuarter(s); down += last.minerals[k].downtime;
    }
    return { s, down };
  }

  function start(G) {
    const U = root.UI, k = G.mission.id;
    const s = G.history.state;
    const signal = EXT.signal ? EXT.signal.value : 0;
    const res = MonteCarlo.run(s, { paths: 1000, signal, track: k, failAt: G.threshold, seed: 2027 });
    const survived = res.paths.filter((p) => p.failQ < 0).length;
    G.futures = { res, survived };
    U.$("a5-title").textContent = "1,000 futures";
    U.$("report").classList.add("hidden");
    U.$("a5-dock").innerHTML = "";
    const counts = { extend: 0, lapse: 0, deal: 0 };
    res.paths.forEach((p) => counts[p.branch]++);
    U.$("fan-labels").innerHTML = Object.entries(BR).map(([b, v]) => `<span>${v.l} · <b class="num">${counts[b]}</b> <i style="background:${v.c}"></i></span>`).join("") + `<span>Line stops <i style="background:${FAIL}"></i></span>`;
    draw(res, () => {
      U.$("a5-title").innerHTML = `In <span class="num" id="surv">0</span> of 1,000 simulated futures, your factory keeps running.`;
      U.countUp(U.$("surv"), survived, { duration: 1.4, format: (v) => Math.round(v).toLocaleString() });
      report(G, res, survived, signal);
    });
  }

  function draw(res, done) {
    const cv = root.UI.$("fan"), dpr = Math.min(2, devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const L = 54, R = 86, T = 22, B = 34;
    const n = FORWARD.quarters.length;
    const max = Math.max(60, ...res.paths.map((p) => Math.max(...p.doc))) * 1.08;
    const x = (i) => L + (i / n) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
    const axes = () => {
      c.clearRect(0, 0, W, H);
      c.font = "11px JetBrains Mono, monospace"; c.fillStyle = "#7D8698"; c.strokeStyle = "rgba(148,163,184,.18)"; c.lineWidth = 1;
      ["Q4 26", ...FORWARD.quarters.map((q) => `Q${q.slice(5)} 27`)].forEach((lab, i) => { c.fillText(lab, x(i) - 16, H - 10); });
      const stepT = max > 150 ? 60 : 30; const ticks = []; for (let v = 0; v <= max; v += stepT) ticks.push(v);
      ticks.forEach((v) => { c.beginPath(); c.moveTo(L, y(v)); c.lineTo(W - R, y(v)); c.stroke(); c.fillText(String(v), 8, y(v) + 4); });
      c.fillText("days of cover in reserve", L, 12);
      c.fillStyle = "rgba(255,90,78,.10)"; c.fillRect(L, y(0) - 6, W - L - R, 6);
    };
    axes();
    const paths = res.paths;
    const reduced = root.UI.reduced();
    const batch = reduced ? paths.length : 40;
    let i = 0;
    c.globalCompositeOperation = "lighter";
    const step = () => {
      for (let b = 0; b < batch && i < paths.length; b++, i++) {
        const p = paths[i];
        c.lineWidth = 1;
        for (let t = 1; t < p.doc.length; t++) {
          c.strokeStyle = p.failQ >= 0 && t - 1 >= p.failQ ? "rgba(255,90,78,.28)" : hexA(BR[p.branch].c, 0.1);
          c.beginPath(); c.moveTo(x(t - 1), y(p.doc[t - 1])); c.lineTo(x(t), y(p.doc[t])); c.stroke();
        }
      }
      if (i < paths.length) setTimeout(step, 16); // timer, not rAF: keeps drawing in throttled/background tabs
      else { c.globalCompositeOperation = "source-over"; ribbon(); done && done(); }
    };
    const ribbon = () => {
      const q = (arr, p) => { const a = arr.slice().sort((u, v) => u - v); return a[Math.floor(p * (a.length - 1))]; };
      const cols = Array.from({ length: n + 1 }, (_, t) => paths.map((p) => p.doc[t]));
      const p10 = cols.map((col) => q(col, 0.1)), p50 = cols.map((col) => q(col, 0.5)), p90 = cols.map((col) => q(col, 0.9));
      c.fillStyle = "rgba(238,241,246,.07)"; c.beginPath();
      p90.forEach((v, t) => (t ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v))));
      for (let t = n; t >= 0; t--) c.lineTo(x(t), y(p10[t]));
      c.closePath(); c.fill();
      c.strokeStyle = "#EEF1F6"; c.lineWidth = 2.2; c.beginPath(); p50.forEach((v, t) => (t ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)))); c.stroke();
      c.fillStyle = "#EEF1F6"; c.font = "600 11px Inter, sans-serif";
      c.fillText("median", x(n) + 6, y(p50[n]) + 4);
      c.fillStyle = "#AEB6C4"; c.fillText("P10–P90", x(n) + 6, y(p90[n]) + 4);
    };
    setTimeout(step, 30);
  }
  const hexA = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };

  function report(G, res, survived, signal) {
    const U = root.UI, k = G.mission.id;
    const benches = Object.entries(Sim.STRATEGIES).map(([id, st]) => {
      const r = missionRun(st.fn, k);
      const mc = MonteCarlo.run(r.s, { paths: 400, signal, track: k, failAt: G.threshold, seed: 2027 });
      return { label: st.label, down: r.down, spent: r.s.spent, surv: mc.paths.filter((p) => p.failQ < 0).length / 400 };
    });
    const h = G.history, dFinal = G.dNow != null ? G.dNow : G.dStart;
    const guessPts = (G.guessHits || 0) / 2;
    const histPts = h.ghost > 0.5 ? Math.max(0, Math.min(1, 1 - h.yours / h.ghost)) : 1;
    const score = 100 * (0.2 * guessPts + 0.25 * Math.min(1, dFinal / 3.5) + 0.3 * histPts + 0.25 * (survived / 1000));
    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";
    G.report = { score, grade, survived, dFinal, guessHits: G.guessHits || 0, yours: h.yours, ghost: h.ghost, verdict: h.verdict };
    const el = U.$("report");
    el.classList.remove("hidden");
    el.innerHTML = `<div><div class="grade">${grade}</div><div class="faint" style="text-align:center">${Math.round(score)} / 100</div></div>
      <div><div class="report-rows">
        <div class="rr"><div class="k">Fault lines spotted</div><div class="v">${G.guessHits || 0} of 2</div></div>
        <div class="rr"><div class="k">Distance to disaster</div><div class="v">${G.dStart.toFixed(1)}σ → ${dFinal.toFixed(1)}σ</div><div class="faint">${RST.band(dFinal)} · not a probability</div></div>
        <div class="rr"><div class="k">History, 2023–26</div><div class="v">${Math.round(h.yours)} d lost</div><div class="faint">doing nothing: ${Math.round(h.ghost)} d · test: ${h.verdict}</div></div>
        <div class="rr"><div class="k">Simulated futures survived</div><div class="v">${survived} / 1,000</div><div class="faint">news signal ${signal >= 0 ? "+" : ""}${signal.toFixed(2)} <button class="evidence-btn" id="why-sig">why?</button></div></div>
      </div>
      <table class="bench"><thead><tr><th>Strategy (${U.esc(G.mission.name)} only)</th><th>Days lost 2023–26</th><th>Spent</th><th>Futures survived</th></tr></thead><tbody>
        <tr class="you"><td>You</td><td>${Math.round(h.yours)}</td><td>${U.fmt$(h.state.spent)}</td><td>${(survived / 10).toFixed(0)}%</td></tr>
        ${benches.map((b) => `<tr><td>${U.esc(b.label)}</td><td>${Math.round(b.down)}</td><td>${U.fmt$(b.spent)}</td><td>${(b.surv * 100).toFixed(0)}%</td></tr>`).join("")}
      </tbody></table>
      <p class="faint">Counts are of simulated futures under the forward model (base rates from 2023–26, cliff branches weighted by the Tavily signal). They are not probabilities of reality.</p></div>`;
    U.fx(() => root.gsap.from(el, { opacity: 0, y: 20, duration: 0.6 }), 800);
    U.$("why-sig").onclick = () => U.drawer(`<h3>Why the news signal is ${signal >= 0 ? "+" : ""}${signal.toFixed(2)}</h3>
      <p>The past week's headlines are scored with a published keyword lexicon: escalation terms +1, de-escalation −1. The signal shifts the cliff branches: extend ${Math.round(res.cliffWeights.extend * 100)}% · lapse ${Math.round(res.cliffWeights.lapse * 100)}% · new deal ${Math.round(res.cliffWeights.deal * 100)}% (base 45/35/20, <span class="pill assumed">assumed</span>).</p>
      <ul>${((EXT.signal || {}).items || []).map((i) => `<li><a href="${U.esc(i.url)}" target="_blank" rel="noopener">${U.esc(i.title)}</a> <span class="faint">${U.esc(i.source || "")} · ${U.esc(i.date || "")} · ${i.score > 0 ? "+1" : i.score < 0 ? "−1" : "0"} ${U.esc((i.matched || []).join(", "))}</span></li>`).join("")}</ul>`);
    U.$("a5-dock").innerHTML = `<button class="ghost" id="btn-again">Play another mineral</button><button class="primary big" id="btn-share" data-primary>Share result</button><a class="ghost" href="../classic/" style="text-decoration:none;color:inherit">Open Analyst mode</a>`;
    U.$("btn-again").onclick = () => { Object.assign(G, { guess: [], faults: [], stockDays: 0, signed: [], investigated: new Set(), investCost: 0, dStart: null, dNow: null, regime: "stress" }); Router.show(1); };
    U.$("btn-share").onclick = () => Share.card(G);
  }

  root.Futures = { start };
})(window);
