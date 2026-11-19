/* Stockpile Strategist v4 — coach bar (how to complete each step), decision ledger (what each
 * decision did), and impact chips (the consequence of a change, in plain units). */
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Steps per act. `hint` = what to do now; `why` = why it matters.
  const STEPS = {
    1: { title: "Pick what to protect", why: "You follow one mineral for the whole game. The shortage you pick is the line your factory can't cross.", steps: [
      { id: "pick", label: "Pick a mineral", hint: "Tap one of the mineral cards. Each one feeds a different kind of factory." },
      { id: "thr", label: "Choose the shortage", hint: "Optional: drag the slider to set how big a shortage stops the factory. 25% is a good default." },
      { id: "go1", label: "Continue", hint: "Press the orange button to see where this mineral comes from." } ] },
    2: { title: "Find the weak spots", why: "The biggest supplier isn't always the biggest risk. Suppliers that fail at the same time are.", steps: [
      { id: "look", label: "Look at the map", hint: "Each circle is a supplier. Bigger circle = more of America's supply." },
      { id: "guess", label: "Take the quiz", hint: "Tap the two suppliers you think would cause most of a shortage." },
      { id: "reveal", label: "See the answer", hint: "Press 'Show me the answer'. The circles resize to show each supplier's share of a shortage." },
      { id: "explore", label: "Dig deeper (optional)", hint: "Optional: try 'Where do they get their raw material?' or drag a slider and watch the circles change." },
      { id: "go2", label: "Continue", hint: "Press the orange button to start preparing." } ] },
    3: { title: "Prepare", why: "Everything you do here is tested against real events next. Aim for a 'Safe' safety margin.", steps: [
      { id: "stock", label: "Store supply", hint: "Drag 'Store extra supply'. Watch the safety margin and the cost change as you go." },
      { id: "invest", label: "Check an owner", hint: "Optional: tap 'Check owner' on a producer to see if it's secretly tied to China." },
      { id: "sign", label: "Sign a deal", hint: "Optional: sign a deal with a producer you trust. A trap deal ties itself to China on the map." },
      { id: "go3", label: "Start the clock", hint: "When your safety margin reads Safe (or you're out of money), press 'Start the clock'." } ] },
    4: { title: "Live through 2023–26", why: "Your plan meets what really happened. It's a fair test, because you prepared without knowing the future.", steps: [
      { id: "watch", label: "Watch", hint: "Each step is three months. The left panel explains what happened to your supply and why." },
      { id: "decide", label: "Make 4 decisions", hint: "When the game pauses, pick an option. Each one shows its cost before you choose." },
      { id: "validate", label: "Check the result", hint: "The card at the end says whether the weak spots you found were the ones history hit." },
      { id: "go4", label: "Continue", hint: "Press the orange button to face the 2027 deadline." } ] },
    5: { title: "The 2027 deadline", why: "Nobody knows what happens after 10 January 2027. 1,000 simulated futures show how robust your plan is.", steps: [
      { id: "fan", label: "Watch the futures", hint: "Each line is one possible future for your stockpile in 2027. Red means the factory stopped." },
      { id: "whatif", label: "Try 'what if'", hint: "Drag a slider, e.g. store more before 2027, and the 1,000 futures re-run instantly." },
      { id: "card", label: "Read your report", hint: "Scroll down for your grade and a comparison with other strategies." },
      { id: "share", label: "Share or replay", hint: "Share your result, try another mineral, or open Analyst mode for all six." } ] },
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
      <div class="coach-main"><div class="coach-k">Step ${state.act} of 5 · ${esc(spec.title)}</div>
        <div class="coach-hint" aria-live="polite"><b>What to do now:</b> ${esc(cur.hint)}</div></div>
      <ol class="coach-steps">${spec.steps.map((s) => `<li class="${done.has(s.id) ? "done" : s === cur ? "cur" : ""}">${done.has(s.id) ? "✓" : ""} ${esc(s.label)}</li>`).join("")}</ol>
      <button class="coach-why" title="${esc(spec.why)}" aria-label="Why this step matters">Why?</button>
      <button class="coach-ledger" id="btn-ledger" title="Every choice you've made and what it changed">Your decisions <b>${ledger.length}</b></button>`;
    el.querySelector(".coach-why").onclick = () => root.UI.toast(`<b>Why this step matters.</b> ${esc(spec.why)}`, "good");
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
    root.UI.drawer(`<h3>Your decisions and what they changed</h3>
      <p class="faint">Every choice you've made so far. Green = better for you, red = worse.</p>
      ${Object.keys(byAct).length ? Object.entries(byAct).map(([a, es]) => `<h4>Step ${a} · ${esc(STEPS[a] ? STEPS[a].title : "")}</h4>
        <ul class="ledger">${es.map((e) => `<li><b>${esc(e.label)}</b> ${chips(e.changes || [])}${e.note ? `<div class="faint">${esc(e.note)}</div>` : ""}</li>`).join("")}</ul>`).join("") : "<p>No decisions yet.</p>"}`);
  }

  root.Guide = { setAct, tick, reset, chips, log, render, ledger, STEPS };
})(window);
