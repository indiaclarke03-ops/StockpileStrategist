/* Stockpile Strategist v4 — decision ledger (what each choice changed) and impact chips. */
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ledger = [];

  /** changes: [{k, from, to, unit, fmt}] or [{k, delta, unit, fmt, goodIfDown}] */
  function chips(changes) {
    return `<span class="impacts">${changes.filter(Boolean).map((c) => {
      const d = c.delta != null ? c.delta : c.to - c.from;
      const good = c.goodIfDown ? d < 0 : d > 0;
      const f = c.fmt || ((v) => (Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)));
      const txt = c.from != null ? `${f(c.from)}${c.unit || ""} → ${f(c.to)}${c.unit || ""}` : `${d >= 0 ? "+" : "−"}${f(Math.abs(d))}${c.unit || ""}`;
      return `<span class="impact ${Math.abs(d) < 1e-9 ? "" : good ? "up" : "down"}"><span class="ik">${esc(c.k)}</span> ${esc(txt)}</span>`;
    }).join("")}</span>`;
  }

  function render() { const n = document.getElementById("ledger-n"); if (n) n.textContent = ledger.length; }
  function log(step, label, changes, note) { ledger.push({ step, label, changes, note }); render(); }
  function reset() { ledger.length = 0; render(); }

  function showLedger() {
    root.UI.drawer(`<h3>Your decisions</h3><p class="faint">What each choice changed. Green = better, red = worse.</p>
      ${ledger.length ? `<ul class="ledger">${ledger.map((e) => `<li><b>${esc(e.label)}</b> ${chips(e.changes || [])}${e.note ? `<div class="faint">${esc(e.note)}</div>` : ""}</li>`).join("")}</ul>` : "<p>No decisions yet.</p>"}`);
  }

  // Kept for compatibility with modules that mark progress.
  const tick = () => {};
  root.Guide = { chips, log, reset, render, showLedger, ledger, tick, setAct: () => {} };
})(window);
