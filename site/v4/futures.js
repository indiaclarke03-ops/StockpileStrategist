/* Stockpile Strategist — 2027: 1,000 possible futures (unchanged montecarlo.js maths) + report card. */
(function (root) {
  const D = root.GAME_DATA, EXT = D.EXT || {}, { FORWARD } = D;
  const BR = { extend: { c: "#3987e5", l: "Pause extended" }, lapse: { c: "#d55181", l: "Restrictions return" }, deal: { c: "#c98500", l: "New US–China deal" } };
  const FAIL = "#FF5A4E";
  const hexA = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };

  function run(G, o = {}) {
    const s = G.history.state, k = G.mission.id;
    return MonteCarlo.run(s, { paths: 1000, signal: o.signal != null ? o.signal : EXT.signal ? EXT.signal.value : 0, track: k, failAt: G.threshold, seed: 2027, overrideStart: o.extra ? { [k]: s.minerals[k].reserveDoC + o.extra } : null });
  }

  function start(G) {
    const U = root.UI, sig = EXT.signal ? EXT.signal.value : 0;
    const res = run(G), survived = res.paths.filter((p) => p.failQ < 0).length;
    G.futures = { res, survived, signal: sig };
    const counts = { extend: 0, lapse: 0, deal: 0 }; res.paths.forEach((p) => counts[p.branch]++);
    U.$("s-futures").innerHTML = `<div class="step-k">Step 13 · After 10 January 2027</div>
      <h2>In <span class="num" id="surv">0</span> of 1,000 possible futures, your factory keeps running.</h2>
      <p class="lead">China may extend its pause, bring restrictions back, or strike a new deal. Each line is one possible 2027.</p>
      <div class="fan-wrap"><canvas id="fan" aria-label="1,000 possible futures of your stockpile"></canvas>
        <div class="fan-labels">${Object.entries(BR).map(([b, v]) => `<span>${v.l} (${counts[b]})<i style="background:${v.c}"></i></span>`).join("")}<span>Factory stopped<i style="background:${FAIL}"></i></span></div></div>
      <div class="whatif">
        <label>What if you'd stored more before 2027? <span class="slider-head"><input type="range" id="w-extra" min="0" max="120" step="5" value="0"><b id="w-extra-v">+0 days</b></span></label>
        <label>What if the news were calmer or tenser? <span class="slider-head"><input type="range" id="w-sig" min="-1" max="1" step="0.05" value="${sig}"><b id="w-sig-v">${sig >= 0 ? "+" : ""}${sig.toFixed(2)}</b></span></label>
        <div><div class="faint">Result of your what-if</div><div class="kpi" style="margin-top:4px"><div class="v num" id="w-out">${survived} / 1,000</div></div></div>
      </div>
      <p class="faint">Based on how often China and the DRC acted in 2023–26, plus this week's real headlines. A test of your plan, not a prediction.</p>`;
    draw(res, () => U.countUp(U.$("surv"), survived, { duration: 1.2, format: (v) => Math.round(v).toLocaleString() }));
    let extra = 0, signal = sig;
    const rerun = () => {
      const r = run(G, { extra, signal }), n = r.paths.filter((p) => p.failQ < 0).length;
      U.$("w-out").innerHTML = `${n} / 1,000 ${Guide.chips([{ k: "vs your plan", delta: n - survived, unit: "", fmt: (v) => Math.round(v) }])}`;
      draw(r, null, { instant: true });
    };
    U.$("w-extra").oninput = (e) => { extra = +e.target.value; U.$("w-extra-v").textContent = `+${extra} days`; rerun(); };
    U.$("w-sig").oninput = (e) => { signal = +e.target.value; U.$("w-sig-v").textContent = `${signal >= 0 ? "+" : ""}${signal.toFixed(2)}`; rerun(); };
    U.$("w-extra").onchange = U.$("w-sig").onchange = () => Guide.log(12, "2027 what-if", [{ k: "Extra stored", delta: extra, unit: " days", fmt: (v) => Math.round(v) }], U.$("w-out").textContent.split(" ").slice(0, 3).join(" ") + " futures keep running");
  }

  function draw(res, done, opts = {}) {
    const cv = root.UI.$("fan"); if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const L = 48, R = 96, T = 22, B = 30, n = FORWARD.quarters.length;
    const max = Math.max(60, ...res.paths.map((p) => Math.max(...p.doc))) * 1.08;
    const x = (i) => L + (i / n) * (W - L - R), y = (v) => T + (1 - v / max) * (H - T - B);
    c.clearRect(0, 0, W, H);
    c.font = "11px JetBrains Mono, monospace"; c.fillStyle = "#7D8698"; c.strokeStyle = "rgba(148,163,184,.16)";
    ["Today", "Jan–Mar 27", "Apr–Jun", "Jul–Sep", "Oct–Dec"].forEach((lab, i) => c.fillText(lab, x(i) - 18, H - 10));
    const stepT = max > 150 ? 60 : 30; for (let v = 0; v <= max; v += stepT) { c.beginPath(); c.moveTo(L, y(v)); c.lineTo(W - R, y(v)); c.stroke(); c.fillText(String(v), 10, y(v) + 4); }
    c.fillText("days of supply in your stockpile", L, 12);
    const paths = res.paths, batch = root.UI.reduced() || opts.instant ? paths.length : 50;
    let i = 0;
    c.globalCompositeOperation = "lighter";
    const step = () => {
      for (let b = 0; b < batch && i < paths.length; b++, i++) {
        const p = paths[i];
        for (let t = 1; t < p.doc.length; t++) {
          c.strokeStyle = p.failQ >= 0 && t - 1 >= p.failQ ? "rgba(255,90,78,.3)" : hexA(BR[p.branch].c, 0.1);
          c.beginPath(); c.moveTo(x(t - 1), y(p.doc[t - 1])); c.lineTo(x(t), y(p.doc[t])); c.stroke();
        }
      }
      if (i < paths.length) setTimeout(step, 16);
      else {
        c.globalCompositeOperation = "source-over";
        const q = (arr, pp) => { const a = arr.slice().sort((u, v) => u - v); return a[Math.floor(pp * (a.length - 1))]; };
        const med = Array.from({ length: n + 1 }, (_, t) => q(paths.map((p) => p.doc[t]), 0.5));
        c.strokeStyle = "#EEF1F6"; c.lineWidth = 2.4; c.beginPath(); med.forEach((v, t) => (t ? c.lineTo(x(t), y(v)) : c.moveTo(x(t), y(v)))); c.stroke(); c.lineWidth = 1;
        c.fillStyle = "#EEF1F6"; c.font = "600 11px Inter, sans-serif"; c.fillText("typical future", x(n) + 6, y(med[n]) + 4);
        done && done();
      }
    };
    if (opts.instant) step(); else setTimeout(step, 30);
  }

  function missionRun(fn, k) {
    const s = Sim.newState(); let last = null, down = 0;
    while (!s.done) { const o = fn(s, last) || {}; const buy = o.buy && o.buy[k] ? { [k]: o.buy[k] } : {}; if (!Sim.applyOrders(s, { buy }).ok) Sim.applyOrders(s, {}); last = Sim.resolveQuarter(s); down += last.minerals[k].downtime; }
    return { s, down };
  }

  function report(G) {
    const U = root.UI, k = G.mission.id, h = G.history, f = G.futures || { survived: 0, signal: 0 };
    const dFinal = G.dNow != null ? G.dNow : G.dStart;
    const histPts = h.ghost > 0.5 ? Math.max(0, Math.min(1, 1 - h.yours / h.ghost)) : 1;
    const score = 100 * (0.2 * ((G.guessHits || 0) / 2) + 0.25 * Math.min(1, dFinal / 3.5) + 0.3 * histPts + 0.25 * (f.survived / 1000));
    const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "E";
    G.report = { score, grade, survived: f.survived, dFinal, guessHits: G.guessHits || 0, yours: h.yours, ghost: h.ghost, verdict: h.verdict };
    const benches = Object.values(Sim.STRATEGIES).map((st) => {
      const r = missionRun(st.fn, k), mc = MonteCarlo.run(r.s, { paths: 400, signal: f.signal, track: k, failAt: G.threshold, seed: 2027 });
      return { label: st.label, down: r.down, spent: r.s.spent, surv: mc.paths.filter((p) => p.failQ < 0).length / 400 };
    });
    U.$("s-report").innerHTML = `<div class="step-k">Step 14 · Your report</div>
      <div class="report-grid"><div><div class="grade">${grade}</div><div class="faint" style="text-align:center">${Math.round(score)} / 100</div></div>
        <div class="kpis" style="margin:0">${U.kpi("Weak spots found", `${G.guessHits || 0} of 2`, "")}${U.kpi("Safety margin", Plain.margin(dFinal), Plain.zone(dFinal).label)}${U.kpi("2023–26 output lost", `${Math.round(h.yours)} days`, `no stockpile: ${Math.round(h.ghost)}`, h.yours < h.ghost ? "good" : "bad")}${U.kpi("2027 futures OK", `${f.survived} / 1,000`, "")}</div></div>
      <h3 style="margin-top:18px">Other strategies, same events</h3>
      <table class="bench"><thead><tr><th>Strategy</th><th>Output days lost</th><th>Spent</th><th>2027 futures OK</th></tr></thead><tbody>
        <tr class="you"><td>You</td><td>${Math.round(h.yours)}</td><td>${U.fmt$(h.state.spent)}</td><td>${Math.round(f.survived / 10)}%</td></tr>
        ${benches.map((b) => `<tr><td>${U.esc(b.label)}</td><td>${Math.round(b.down)}</td><td>${U.fmt$(b.spent)}</td><td>${Math.round(b.surv * 100)}%</td></tr>`).join("")}</tbody></table>
      <div class="front-actions" style="margin-top:18px"><button class="primary" id="btn-brief">Open policy briefing (print / PDF)</button><button class="ghost" id="btn-share">Save as image</button><a class="ghost" href="../classic/" style="text-decoration:none;color:inherit">Analyst mode: all six minerals</a></div>`;
    U.$("btn-share").onclick = () => Share.card(G);
    U.$("btn-brief").onclick = () => Share.brief(G);
  }

  root.Futures = { start, report };
})(window);
