/* Stockpile Strategist — Analyst casebook.
 * Eleven real decisions (cases.js). For each: what was known, the choice, then what the US actually
 * did and what EVERY option would have led to through 2026 (paths.js on the sim.js engine).
 * Three paths run in lockstep: You, the real US, and No action. The end screen derives the best
 * path in hindsight, a playbook, and tests all paths against 1,000 futures for 2027. */
(function () {
  const D = window.GAME_DATA, EXT = D.EXT || {}, { QUARTERS, MINERALS, EVENTS } = D;
  const { CASES, LESSONS } = window.CASEBOOK;
  const KEYS = Sim.KEYS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt$ = (m) => (Math.abs(m) >= 1000 ? `$${(m / 1000).toFixed(1)}B` : `$${Math.round(m)}M`);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const domain = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const months = (q) => ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"][+q.slice(5) - 1] + " " + q.slice(0, 4);
  const TILE = { gallium: "#3987e5", germanium: "#0ca30c", antimony: "#199e70", graphite: "#c98500", dysprosium: "#9085e9", cobalt: "#d55181" };
  const COL = { you: "#E08A52", real: "#8cc0ff", idle: "#7D8698", best: "#5fc08f" };
  const THR = 0.25;
  const why = (h, k) => Tour.why(h, k);

  let P, ci, phase, cmp, choice, lastRep, history;
  const models = {};

  // ---------- setup ----------
  function reset(intro = true) {
    P = { you: Paths.newPath("You"), real: Paths.newPath("Real US"), idle: Paths.newPath("No action") };
    ci = 0; phase = "decide"; cmp = null; choice = null; lastRep = null; history = [];
    for (const k of KEYS) models[k] = models[k] || Missions.buildModel(k);
    advanceAll(QUARTERS.indexOf(CASES[0].q));
    $("game").classList.remove("hidden"); $("end").classList.add("hidden");
    render();
    if (intro) showIntro();
  }
  function advanceAll(qi) {
    const r = Paths.advanceTo(P.you, qi); Paths.advanceTo(P.real, qi); Paths.advanceTo(P.idle, qi);
    if (r.length) lastRep = r[r.length - 1];
  }
  const cum = (p) => p.down.reduce((a, d) => a + KEYS.reduce((b, k) => b + d[k], 0), 0);
  const realRefs = (c) => (EXT.responses || []).filter((r) => c.refs.includes(r.date));

  // ---------- render ----------
  function render() { renderProgress(); renderScore(); renderCase(); renderChart(); renderStocks(); renderChain(); }

  function renderProgress() {
    const done = phase === "end";
    $("progress").innerHTML = `<div class="lab">${done ? "Review" : `Case ${ci + 1} of ${CASES.length} · <b>${esc(CASES[ci].when)}</b>`}</div>
      <div class="bar">${CASES.map((c, i) => { const h = history[i]; return `<i class="${(i < ci || done) && h ? (h.matchBest ? "best" : "done") : i === ci && !done ? "on" : ""}" title="${esc(c.when)}: ${esc(c.title)}"></i>`; }).join("")}</div>`;
  }
  function renderScore() {
    const s = (k, p) => `<div class="stat"><div class="k"><i class="dot" style="background:${COL[k]}"></i>${esc(p.name)}</div><div class="v">${Math.round(cum(p))} days</div><div class="s">output lost · ${fmt$(p.s.spent)} spent</div></div>`;
    $("score").innerHTML = s("you", P.you) + s("real", P.real) + s("idle", P.idle) + `<div class="stat"><div class="k">Your money</div><div class="v">${fmt$(P.you.s.budget)}</div><div class="s">${months(QUARTERS[Math.min(P.you.s.qi, QUARTERS.length - 1)])}</div></div>`;
  }

  function renderCase() {
    const c = CASES[ci], el = $("case");
    const news = ((EXT.intel || {})[c.q] || {}).items || [];
    const head = `<div class="kicker">Case ${ci + 1} of ${CASES.length} · ${esc(c.when)}</div>
      <h2 class="cb-title">${esc(c.title)}</h2>
      <div class="role">You are: <b>${esc(c.role)}</b></div>
      <div class="chips" style="margin:8px 0">${c.minerals.map((k) => `<span class="chip" style="border-color:${TILE[k]}">${MINERALS[k].name}</span>`).join("")}</div>`;
    if (phase === "decide") {
      el.innerHTML = `${head}
        <h3 class="sub">The situation</h3><ul class="facts">${c.situation.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        ${news.length ? `<details class="news"><summary>What the news was saying (${Math.min(3, news.length)})</summary>${news.slice(0, 3).map((n) => `<div class="n"><span class="faint">${esc(n.date)} · <a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.source || domain(n.url))}</a></span><br>${esc(n.title)}</div>`).join("")}</details>` : ""}
        <h3 class="q">${esc(c.question)}</h3>
        <div class="opts" role="group" aria-label="Options">${c.options.map((o, i) => `<button class="opt" data-o="${i}"><b>${esc(o.label)}</b>${o.detail ? `<span>${esc(o.detail)}</span>` : ""}</button>`).join("")}</div>
        <p class="faint" style="margin-top:12px">Pick what you would have done. Then see what the US actually did, and what every option would have led to by the end of 2026.</p>`;
      el.querySelectorAll("[data-o]").forEach((b, i, all) => {
        b.onclick = () => decide(+b.dataset.o);
        b.onkeydown = (e) => { const d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); all[(i + d + all.length) % all.length].focus(); } };
      });
      return;
    }
    const real = c.options.find((o) => o.real), refs = realRefs(c);
    const rows = cmp.res.map((r) => ({ ...r, you: r.o === choice, isReal: r.o === real, isBest: r.o === cmp.best.o }));
    const mine = rows.find((r) => r.you), rr = rows.find((r) => r.isReal);
    const maxCost = Math.max(...rows.map((r) => r.cost)) || 1;
    const verdict = mine.isBest ? ["good", "Your call was the best option in hindsight."]
      : mine.o === real ? ["info", "You made the same call as the US."]
      : mine.cost < rr.cost - 1 ? ["good", `Your call beat what the US actually did by ${fmt$(rr.cost - mine.cost)} in total cost.`]
      : ["bad", `What the US actually did came out ${fmt$(mine.cost - rr.cost)} cheaper overall than your call.`];
    el.innerHTML = `${head}
      <div class="real"><div class="rk">What actually happened</div><p>${esc(c.realText)}</p>
        ${refs.length ? `<div class="faint">${refs.map((r) => `<a href="${esc(r.source)}" target="_blank" rel="noopener">${esc(r.actor)}, ${esc(r.date)}</a>`).join(" · ")}</div>` : ""}</div>
      <div class="verdict ${verdict[0]}">${verdict[1]}</div>
      <h3 class="sub">What each option would have led to, through 2026</h3>
      <table class="data cmp"><thead><tr><th>Option</th><th>Output lost</th><th>Money spent</th><th>Total cost</th></tr></thead><tbody>
        ${rows.map((r) => `<tr class="${r.you ? "you" : ""}"><td><b>${esc(r.o.label)}</b><div class="tags">${r.you ? `<span class="tag you">You</span>` : ""}${r.isReal ? `<span class="tag real">Real US</span>` : ""}${r.isBest ? `<span class="tag best">Best</span>` : ""}</div></td>
          <td>${Math.round(r.lost)} days<div class="faint">${c.minerals.map((k) => MINERALS[k].symbol).join("/")}</div></td><td>${fmt$(r.spent)}</td>
          <td><div class="cbar"><i style="width:${(r.cost / maxCost) * 100}%;background:${r.isBest ? COL.best : r.you ? COL.you : "rgba(148,163,184,.5)"}"></i></div>${fmt$(r.cost)}</td></tr>`).join("")}
      </tbody></table>
      <p class="faint">Each row starts from your position just before this choice and runs to the end of 2026. Money spent includes topping up stock targets you set in earlier cases. Total cost = money spent + the estimated value of factory output lost across all six minerals. <button class="linkbtn" id="how">How is this worked out?</button> · <a href="../methods.html" target="_blank" rel="noopener">Methods &amp; sources</a></p>
      <label class="scale">How much is a lost factory day worth? <b id="scale-v">×${Paths.opt.scale.toFixed(2)}</b> <input type="range" id="scale" min="0.5" max="3" step="0.25" value="${Paths.opt.scale}"> <span class="faint">Higher means stockpiles pay off more</span></label>
      ${cmp.best.o.tag === "trap-deal" ? `<div class="banner warn">The cheap deal came out best only because ${c.minerals.includes("cobalt") ? "China never restricted cobalt" : "its China tie never bit"} in 2023–26. It is still exposed if China acts.</div>` : ""}
      <div class="lesson"><b>Lesson:</b> ${esc(LESSONS[cmp.best.o.tag] || "")}</div>
      <div class="cb-nav"><button class="primary" id="next">${ci + 1 < CASES.length ? `Next case: ${esc(CASES[ci + 1].when)} →` : "See the full review →"}</button></div>`;
    $("next").onclick = next;
    $("how").onclick = showMethod;
    $("scale").oninput = (e) => { Paths.opt.scale = +e.target.value; rejudge(); };
  }

  function decide(i) {
    const c = CASES[ci];
    choice = c.options[i];
    const before = Paths.clonePath(P.you);
    cmp = Paths.compare(before, c);
    const real = c.options.find((o) => o.real);
    history[ci] = { c, you: choice, real, best: cmp.best.o, matchBest: choice === cmp.best.o, matchReal: choice === real, before };
    P.you.choices.push({ case: c.id, option: choice.id, tag: choice.tag }); Paths.applyEffect(P.you, choice.eff);
    P.real.choices.push({ case: c.id, option: real.id, tag: real.tag }); Paths.applyEffect(P.real, real.eff);
    phase = "reveal";
    render();
    $("next").focus({ preventScroll: true });
    why(`<span class="wk">Decided</span>${esc(choice.label)}. ${choice === real ? "Same as the real US." : `The US chose: ${esc(real.label)}.`}`, choice === cmp.best.o ? "good" : "ore");
  }
  /** Re-judge the same case from the same starting position with a new value of lost output. */
  function rejudge() {
    const h = history[ci];
    cmp = Paths.compare(h.before, h.c);
    h.best = cmp.best.o; h.matchBest = choice === cmp.best.o;
    const v = $("scale").value; renderCase(); renderProgress(); $("scale").value = v; $("scale").focus();
  }

  function next() {
    const from = P.you.down.length;
    if (ci + 1 < CASES.length) {
      ci++; advanceAll(QUARTERS.indexOf(CASES[ci].q)); phase = "decide";
      const evs = EVENTS.filter((e) => { const q = QUARTERS.indexOf(e.quarter); return q >= from && q < P.you.down.length && !e.narrativeOnly; });
      const lost = P.you.down.slice(from).reduce((a, d) => a + KEYS.reduce((b, k) => b + d[k], 0), 0);
      why(`<span class="wk">Meanwhile</span>${evs.length ? esc(evs.map((e) => e.headline.split(";")[0]).slice(0, 2).join(" · ")) + ". " : "No new restrictions. "}Your factories lost <b>${Math.round(lost)} days</b> of output.`, lost > 5 ? "bad" : "good");
      render(); window.scrollTo(0, 0);
      const h = document.querySelector(".cb-title"); if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    } else { advanceAll(QUARTERS.length); phase = "end"; showEnd(); }
  }

  // ---------- side panels ----------
  function renderChart() {
    const W = 380, H = 190, L = 34, R = 10, T = 16, B = 22, n = QUARTERS.length;
    const series = (p) => { let a = 0; return [0, ...p.down.map((d) => (a += KEYS.reduce((b, k) => b + d[k], 0)))]; };
    const proj = (p) => { const c = Paths.clonePath(p); Paths.advanceTo(c, n); return series(c); };
    const S = { you: series(P.you), real: series(P.real), idle: series(P.idle) };
    const F = phase === "end" ? null : { you: proj(P.you), real: proj(P.real) };
    const top = Math.max(50, ...Object.values(S).flat(), ...(F ? Object.values(F).flat() : [])), max = top * 1.08;
    const X = (i) => L + (i / n) * (W - L - R), Y = (v) => T + (1 - v / max) * (H - T - B);
    const line = (arr, col, dash, from = 0) => `<polyline points="${arr.slice(from).map((v, i) => `${X(i + from)},${Y(v)}`).join(" ")}" fill="none" stroke="${col}" stroke-width="${dash ? 1.6 : 2.4}" ${dash ? 'stroke-dasharray="4 4" opacity=".75"' : ""}/>`;
    const now = P.you.down.length;
    $("chart").innerHTML = `<h2>Factory output lost, 2023–26</h2>
      <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Cumulative output lost for each path">
        ${[0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${Y(top * f)}" y2="${Y(top * f)}" stroke="rgba(148,163,184,.15)"/><text x="${L - 4}" y="${Y(top * f) + 3}" text-anchor="end">${Math.round(top * f)}</text>`).join("")}
        ${F ? line(F.real, COL.real, true, now) + line(F.you, COL.you, true, now) : ""}
        ${line(S.idle, COL.idle)}${line(S.real, COL.real)}${line(S.you, COL.you)}
        ${F ? `<line x1="${X(now)}" x2="${X(now)}" y1="${T}" y2="${H - B}" stroke="rgba(238,241,246,.35)" stroke-dasharray="2 3"/><text x="${X(now)}" y="${T - 4}" text-anchor="middle">now</text>` : ""}
        <text x="${L}" y="${H - 6}">mid-2023</text><text x="${W - R}" y="${H - 6}" text-anchor="end">end 2026</text></svg>
      <div class="legend"><span><i style="background:${COL.you}"></i>You</span><span><i style="background:${COL.real}"></i>Real US</span><span><i style="background:${COL.idle}"></i>No action</span>${F ? `<span class="faint">dashed = where current plans lead</span>` : ""}</div>`;
  }
  function renderStocks() {
    const s = P.you.s;
    $("stocks").innerHTML = `<h2>Your stockpile now</h2>${KEYS.map((k) => {
      const m = s.minerals[k], r = lastRep && lastRep.minerals[k], f = r ? r.shortFrac || 0 : 0, st = f < 0.01 ? "running" : f <= THR ? "rationing" : "stopped";
      return `<div class="srow"><span class="sname"><i style="background:${TILE[k]}"></i>${MINERALS[k].name}</span><div class="sbar"><i style="width:${Math.min(100, (m.reserveDoC / 120) * 100)}%"></i><b style="left:50%"></b></div><span class="sv num">${Math.round(m.reserveDoC)}d</span><span class="state-chip ${st}">${{ running: "OK", rationing: "Ration", stopped: "Stop" }[st]}</span></div>`;
    }).join("")}<div class="faint">Days of normal use stored · tick = 60 days · status = last quarter's factories</div>`;
  }
  function renderChain() {
    const k = CASES[Math.min(ci, CASES.length - 1)].minerals[0], model = models[k], m = P.you.s.minerals[k], r = lastRep && lastRep.minerals[k];
    $("chain").innerHTML = `<h2>${MINERALS[k].name} supply chain · your path</h2><div id="chainGraph"></div><div class="faint">Circle = supplier (size = share) · −x% = cut by restrictions · tank = your stockpile${model.synthetic ? " · some figures estimated" : ""}</div>`;
    const net = new NetView($("chainGraph"), model, { plantLabel: "US factories" });
    let ex = model.nodes.map((n, i) => i).filter((i) => (k === "cobalt" ? model.tier2.some((t) => t.country === "COD" && (t.share || {})[model.nodes[i].id] >= 0.3) : model.nodes[i].chinaLinked));
    if (!ex.length) ex = model.nodes.map((n, i) => i);
    const exShare = ex.reduce((s, i) => s + model.nodes[i].share, 0) || 1, f = Math.max(0, Math.min(1, 1 - (1 - m.importAvail) / exShare));
    net.setFlows(model.nodes.map((n, i) => (ex.includes(i) ? f : 1)));
    net.setTank(m.reserveDoC);
    const sf = r ? r.shortFrac || 0 : 0, drawn = r && r.drawn > 0.5;
    net.setFactory(sf < 0.01 ? (drawn ? "strained" : "running") : sf <= THR ? "rationing" : "stopped", sf < 0.01 ? (drawn ? "running on stockpile" : "running") : sf <= THR ? `rationing −${Math.round(sf * 100)}%` : "stopped");
    net.onTap = () => {};
  }

  // ---------- end: review, best path, playbook, 2027 ----------
  function showEnd() {
    $("game").classList.add("hidden"); const el = $("end"); el.classList.remove("hidden");
    const best = Paths.playAll(CASES, Paths.bestChooser, "Best in hindsight");
    const paths = [["you", P.you], ["real", P.real], ["idle", P.idle], ["best", best]];
    const tot = (p) => p.s.spent + Paths.lostValue(p, 0);
    const sig = EXT.signal ? EXT.signal.value : 0;
    const fut = Object.fromEntries(paths.map(([k, p]) => [k, MonteCarlo.run(p.s, { paths: 1000, signal: sig })]));
    const matchedBest = history.filter((h, i) => h.you.id === best.choices[i].option).length, matchedReal = history.filter((h) => h.matchReal).length;
    const tags = []; for (const ch of best.choices) if (!tags.includes(ch.tag)) tags.push(ch.tag);
    const disagree = history.map((h, i) => ({ h, b: h.c.options.find((o) => o.id === best.choices[i].option) })).filter((x) => x.b && x.b !== x.h.real);
    const rec = Object.fromEntries(KEYS.map((k) => [k, MonteCarlo.recommend(P.you.s, k, { signal: sig, paths: 200 })]));
    const gap = (k) => (rec[k] != null ? Math.max(0, Math.ceil(rec[k] - P.you.s.minerals[k].reserveDoC)) : 0);
    const recCost = KEYS.reduce((a, k) => a + (gap(k) ? Sim.quoteBuy(P.you.s, k, gap(k)) : 0), 0);
    el.innerHTML = `<div class="panel">
        <div class="kicker">Review · ${CASES.length} real decisions, 2023–2026</div>
        <h2 class="cb-title">You matched the best call in hindsight ${matchedBest} of ${CASES.length} times, and the real US ${matchedReal} times.</h2>
        <div class="paths4">${paths.map(([k, p]) => `<div class="pcard" style="border-top-color:${COL[k]}"><div class="k">${esc(p.name)}</div><div class="v">${Math.round(cum(p))} days</div><div class="s">factory output lost, 2023–26</div>
          <div class="row"><span>Money spent</span><b>${fmt$(p.s.spent)}</b></div><div class="row"><span>Total cost</span><b>${fmt$(tot(p))}</b></div><div class="row"><span>2027 average output lost</span><b>${Math.round(fut[k].expectedDowntime)} days</b></div></div>`).join("")}</div>
        <p class="faint">Total cost = money spent + estimated value of lost output. 2027 = average over 1,000 simulated futures after China's pause ends, starting from each path's final stockpile. <a href="../methods.html" target="_blank" rel="noopener">Methods &amp; sources</a></p>
      </div>
      <div class="panel section"><h2>Case by case</h2>
        <table class="data cases"><thead><tr><th>Case</th><th>You</th><th>Real US</th><th>Best in hindsight</th></tr></thead><tbody>
        ${history.map((h, i) => { const b = h.c.options.find((o) => o.id === best.choices[i].option); return `<tr><td><b>${esc(h.c.when)}</b><div class="faint">${esc(h.c.title)}</div></td><td class="${h.you === b ? "ok" : ""}">${esc(h.you.label)}${h.you === b ? " ✓" : ""}</td><td>${esc(h.real.label)}</td><td>${esc(b ? b.label : "")}</td></tr>`; }).join("")}</tbody></table></div>
      <div class="panel section"><h2>The playbook: what worked</h2>
        <ol class="playbook">${tags.map((t) => `<li>${esc(LESSONS[t])}</li>`).join("")}</ol>
        ${disagree.length ? `<h3 class="sub">Where hindsight and the real US differed</h3><ul class="facts">${disagree.slice(0, 6).map((x) => `<li><b>${esc(x.h.c.when)}</b>: the US chose "${esc(x.h.real.label)}"; hindsight says "${esc(x.b.label)}".</li>`).join("")}</ul>` : ""}
        <p class="faint">"Best in hindsight" picks, at each case, the option with the lowest total cost given the choices before it, knowing how 2023–26 actually unfolded. It's a benchmark to learn from, not a forecast.</p></div>
      <div class="panel section"><h2>The best way forward: 2027</h2>
        <p class="muted" style="margin-top:0">Hindsight rewards what worked in 2023–26; the future may differ. Here each path's final stockpile is tested against 1,000 possible futures after 10 January 2027 (pause extended, restrictions return, or a new deal, weighted by this week's headlines).</p>
        <table class="data"><thead><tr><th>Mineral</th>${paths.map(([k, p]) => `<th style="color:${COL[k]}">${esc(p.name)}</th>`).join("")}<th>To be safe, hold</th></tr></thead><tbody>
        ${KEYS.map((k) => `<tr><td>${MINERALS[k].name}</td>${paths.map(([pk]) => `<td>${pct(1 - fut[pk].minerals[k].pBelow60)}</td>`).join("")}<td><b>${rec[k] == null ? "—" : `${rec[k]} days`}</b>${gap(k) ? ` <span class="faint">(+${gap(k)})</span>` : rec[k] != null ? " ✓" : ""}</td></tr>`).join("")}</tbody></table>
        <p class="faint">Percentages = share of simulated futures in which that stockpile stays above 60 days all year. "To be safe" = days to hold so it stays above 60 days in 9 of 10 futures (≈${fmt$(recCost)} to reach from your position at today's prices).</p></div>
      <div class="end-actions"><button class="primary" id="again">Play the cases again</button><button class="ghost" id="print">Print this review</button><a class="ghost" href="../methods.html">Methods &amp; sources</a><a class="ghost" href="../v4/">Story mode</a></div>`;
    $("again").onclick = () => reset(false); $("print").onclick = () => window.print();
    renderProgress(); renderScore();
    why(`<span class="wk">Done</span>Output lost: you <b>${Math.round(cum(P.you))} days</b>, real US <b>${Math.round(cum(P.real))}</b>, best in hindsight <b>${Math.round(cum(best))}</b>.`, cum(P.you) <= cum(P.real) ? "good" : "ore");
    window.scrollTo(0, 0);
  }

  // ---------- modals ----------
  function modal(html) { $("modal").innerHTML = html; $("overlay").classList.remove("hidden"); const b = $("modal").querySelector(".primary, button"); if (b) b.focus(); }
  function closeModal() { $("overlay").classList.add("hidden"); }
  $("overlay").addEventListener("click", (e) => { if (e.target.id === "overlay") closeModal(); });
  function showIntro() {
    modal(`<div class="kicker">Analyst casebook</div><h3 style="font-size:24px;margin:6px 0 10px">${CASES.length} real decisions, 2023 to 2026.</h3>
      <ol class="muted" style="line-height:1.8;margin:0 0 10px;padding-left:20px"><li>Read what officials knew at the time.</li><li>Make the call yourself.</li><li>See what the US actually did, and what <b>every</b> option would have led to.</li></ol>
      <p class="muted">Three paths run side by side through the real events: <b style="color:${COL.you}">you</b>, the <b style="color:${COL.real}">real US</b> and <b style="color:${COL.idle}">no action</b>. At the end: the best path in hindsight, a playbook, and a test of the way forward for 2027.</p>
      <div class="banner">You have Project Vault-sized money ($12B, arriving each fiscal year) from 2023, three years before the real Vault existed. That's the "what if" being tested.</div>
      <div style="display:flex;justify-content:flex-end;gap:8px"><a class="ghost" href="../methods.html" style="text-decoration:none">Methods &amp; sources</a><button class="primary" id="go">Start case 1 →</button></div>`);
    $("go").onclick = closeModal;
  }
  function showMethod() {
    modal(`<div class="modal-head"><h3>How the comparison works</h3><button class="ghost" id="x">Close</button></div>
      <ul class="muted" style="line-height:1.7"><li>Every option is simulated from <b>your position just before this case</b>, through the real events to the end of 2026, with no later decisions. Same engine, same random seed: the only difference is the choice.</li>
      <li><b>Output lost</b> = factory days lost for this case's minerals, after imports, substitutes, deals and your stockpile.</li>
      <li><b>Money spent</b> = purchases, deals, grants and storage from now on. Stock targets are topped up each quarter, at most 45 days a quarter.</li>
      <li><b>Total cost</b> = money spent + value of output lost across all six minerals: estimated $M per lost day (${KEYS.map((k) => `${MINERALS[k].symbol} ${Paths.VALUE[k]}`).join(", ")}) × the slider.</li></ul>
      <p><a href="../methods.html" target="_blank" rel="noopener">Full methods &amp; sources →</a></p>`);
    $("x").onclick = closeModal;
  }
  $("btn-gloss").onclick = () => { modal(`<div class="modal-head"><div class="kicker">Plain English</div><button class="ghost" id="x">Close</button></div>${Plain.glossaryHTML()}`); $("x").onclick = closeModal; };
  $("btn-reset").onclick = () => { if (confirm("Restart the casebook from case 1?")) reset(false); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  reset(!/nointro/.test(location.hash));
})();
