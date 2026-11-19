/* Stockpile Strategist v4 — coach bar (how to complete each step), decision ledger (what each
 * decision did), and impact chips (the consequence of a change, in plain units). */
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Steps per act. `hint` = what to do now; `why` = why it matters.
  const STEPS = {
    1: { title: "Choose your mission", why: "One mineral per run. The threshold is the loss your factory can't survive.", steps: [
      { id: "pick", label: "Pick a mineral", hint: "Tap a mineral tile. Each one is a different real supply chain." },
      { id: "thr", label: "Set the threshold", hint: "Drag the slider. Lower means a more fragile line, and the starting distance to disaster updates live." },
      { id: "go1", label: "Map the network", hint: "Press the button (or Enter) to see where this mineral really comes from." } ] },
    2: { title: "Find the fault lines", why: "The biggest supplier is not always the biggest risk. The ones that fail together are.", steps: [
      { id: "look", label: "See the network", hint: "Node size is each supplier's share of US imports." },
      { id: "guess", label: "Guess 2 suppliers", hint: "Tap the two suppliers you think would cause most of a shortfall." },
      { id: "reveal", label: "Reveal", hint: "Press Reveal. Node sizes morph to each supplier's share of the inferred loss." },
      { id: "explore", label: "Explore one tool", hint: "Follow it upstream, show alternatives, or drag the correlation slider and watch the risk move." },
      { id: "go2", label: "Build defences", hint: "Press the button when you're ready." } ] },
    3: { title: "Build your defences", why: "Push your line away from disaster before history starts. Every lever moves the σ gauge live.", steps: [
      { id: "stock", label: "Set a stockpile", hint: "Drag the stockpile slider and watch the distance, the stress tests and the cost move." },
      { id: "invest", label: "Investigate a producer", hint: "Pull a Sayari ownership file (−$25M). It can reveal that an 'alternative' isn't one." },
      { id: "sign", label: "Sign a deal (optional)", hint: "Sign an offtake. Clean producers add distance; China-linked ones snap back to the China cluster." },
      { id: "go3", label: "Start the clock", hint: "Aim for Exposed (1.5σ) or better, then press Start." } ] },
    4: { title: "History strikes", why: "The real 2023–26 shocks hit your defences. This is the forward test.", steps: [
      { id: "watch", label: "Watch the shocks", hint: "Each quarter shows what hit, why your line held or stopped, and what governments actually did." },
      { id: "decide", label: "Make 4 decisions", hint: "The replay pauses at four real moments. Each choice shows its cost before you commit." },
      { id: "validate", label: "Check the test", hint: "The validation card says whether your fault lines matched what history hit." },
      { id: "go4", label: "Face the cliff", hint: "Press the button for 1,000 futures past 10 January 2027." } ] },
    5: { title: "The cliff", why: "1,000 simulated futures past 10 Jan 2027. Counts of simulated paths, not probabilities.", steps: [
      { id: "fan", label: "Watch the futures", hint: "Each line is one simulated future of your reserve, coloured by what happens at the cliff." },
      { id: "whatif", label: "Try a what-if", hint: "Drag the what-if sliders. The futures re-run instantly." },
      { id: "card", label: "Read your report", hint: "The report card shows how each act's decisions added up." },
      { id: "share", label: "Share or replay", hint: "Share the PNG, try another mineral, or open Analyst mode." } ] },
  };

  const state = { act: 0, done: {} };
  const ledger = [];

  function render() {
    const el = document.getElementById("coach");
    if (!el) return;
    const spec = STEPS[state.act];
    if (!spec) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const done = state.done[state.act] || new Set();
    const cur = spec.steps.find((s) => !done.has(s.id)) || spec.steps[spec.steps.length - 1];
    el.innerHTML = `<div class="coach-acts" aria-hidden="true">${[1, 2, 3, 4, 5].map((a) => `<i class="${a < state.act ? "done" : a === state.act ? "on" : ""}"></i>`).join("")}</div>
      <div class="coach-main"><div class="coach-k">Act ${state.act} of 5 · ${esc(spec.title)}</div>
        <div class="coach-hint" aria-live="polite"><b>Step ${spec.steps.indexOf(cur) + 1}/${spec.steps.length}:</b> ${esc(cur.hint)}</div></div>
      <ol class="coach-steps">${spec.steps.map((s) => `<li class="${done.has(s.id) ? "done" : s === cur ? "cur" : ""}">${done.has(s.id) ? "✓" : ""} ${esc(s.label)}</li>`).join("")}</ol>
      <button class="coach-why" title="${esc(spec.why)}" aria-label="Why this step matters">Why?</button>
      <button class="coach-ledger" id="btn-ledger">Decisions <b>${ledger.length}</b></button>`;
    el.querySelector(".coach-why").onclick = () => root.UI.toast(`<b>Why this act matters.</b> ${esc(spec.why)}`, "good");
    el.querySelector("#btn-ledger").onclick = showLedger;
  }

  function setAct(n) { state.act = n; state.done[n] = state.done[n] || new Set(); render(); }
  function tick(id) {
    const set = (state.done[state.act] = state.done[state.act] || new Set());
    if (set.has(id)) return;
    set.add(id); render();
  }
  function reset() { for (const k of Object.keys(state.done)) delete state.done[k]; ledger.length = 0; render(); }

  /** changes: [{k: "Distance", from, to, unit: "σ", fmt}] or [{k, delta, unit}] */
  function chips(changes) {
    return `<span class="impacts">${changes.filter(Boolean).map((c) => {
      const d = c.delta != null ? c.delta : c.to - c.from;
      const good = c.goodIfDown ? d < 0 : d > 0;
      const f = c.fmt || ((v) => (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(c.dp != null ? c.dp : 1)));
      const txt = c.from != null ? `${f(c.from)}${c.unit || ""} → ${f(c.to)}${c.unit || ""}` : `${d >= 0 ? "+" : "−"}${f(Math.abs(d))}${c.unit || ""}`;
      return `<span class="impact ${Math.abs(d) < 1e-9 ? "" : good ? "up" : "down"}"><span class="ik">${esc(c.k)}</span> ${esc(txt)}</span>`;
    }).join("")}</span>`;
  }

  function log(act, label, changes, note) {
    ledger.push({ act, label, changes, note, when: new Date() });
    render();
  }

  function showLedger() {
    const byAct = {};
    ledger.forEach((e) => (byAct[e.act] = byAct[e.act] || []).push(e));
    root.UI.drawer(`<h3>Your decisions and what they did</h3>
      <p class="faint">Every choice you've made, with its measured effect at the moment you made it.</p>
      ${Object.keys(byAct).length ? Object.entries(byAct).map(([a, es]) => `<h4>Act ${a} · ${esc(STEPS[a] ? STEPS[a].title : "")}</h4>
        <ul class="ledger">${es.map((e) => `<li><b>${esc(e.label)}</b> ${chips(e.changes || [])}${e.note ? `<div class="faint">${esc(e.note)}</div>` : ""}</li>`).join("")}</ul>`).join("") : "<p>No decisions yet.</p>"}`);
  }

  root.Guide = { setAct, tick, reset, chips, log, render, ledger, STEPS };
})(window);
