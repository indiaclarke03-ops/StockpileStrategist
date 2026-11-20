/* Stockpile Strategist — first-run pointers and the "what changed and why" line.
 * Tips appear once per browser (remembered locally); "Show me" replays the current screen's tips. */
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const seen = (() => { try { return JSON.parse(localStorage.getItem("ss-tour") || "{}"); } catch { return {}; } })();
  const save = () => { try { localStorage.setItem("ss-tour", JSON.stringify(seen)); } catch {} };
  let queue = [], current = [];

  /** tips: [{key, sel, text}] — shown one after another, each anchored to its element. */
  function tips(list, force = false) {
    current = list;
    queue = list.filter((t) => force || !seen[t.key]);
    next();
  }
  function next() {
    document.querySelectorAll(".tour").forEach((t) => t.remove());
    const t = queue.shift(); if (!t) return;
    const el = document.querySelector(t.sel);
    if (!el || !el.getBoundingClientRect().width) { seen[t.key] = 1; save(); return next(); }
    const r = el.getBoundingClientRect();
    const b = document.createElement("div");
    b.className = "tour"; b.setAttribute("role", "dialog"); b.setAttribute("aria-live", "polite");
    b.innerHTML = `<div class="tour-t">${esc(t.text)}</div><div class="tour-a"><span class="faint">${current.indexOf(t) + 1} of ${current.length}</span><button class="ghost small" data-skip>Skip</button><button class="primary" data-next>${queue.length ? "Next" : "Got it"}</button></div>`;
    document.body.appendChild(b);
    const bw = Math.min(300, innerWidth - 24), below = r.bottom + 12 + 140 < innerHeight;
    b.style.width = bw + "px";
    b.style.left = Math.max(12, Math.min(innerWidth - bw - 12, r.left + r.width / 2 - bw / 2)) + "px";
    b.style.top = (below ? r.bottom + 12 : Math.max(76, r.top - b.offsetHeight - 12)) + "px";
    b.classList.add(below ? "below" : "above");
    el.classList.add("tour-focus");
    const done = () => { el.classList.remove("tour-focus"); seen[t.key] = 1; save(); };
    b.querySelector("[data-next]").onclick = () => { done(); next(); };
    b.querySelector("[data-skip]").onclick = () => { done(); queue.forEach((q) => (seen[q.key] = 1)); save(); queue = []; next(); };
    b.querySelector("[data-next]").focus({ preventScroll: true });
  }
  function replay() { tips(current, true); }

  /** One line, always in the same place: what just changed and why. */
  let whyTimer = null;
  function why(html, kind = "") {
    const el = document.getElementById("whyline"); if (!el) return;
    el.className = `whyline ${kind}`; el.innerHTML = html; el.classList.remove("hidden");
    clearTimeout(whyTimer); whyTimer = setTimeout(() => el.classList.add("fade"), 9000);
  }

  root.Tour = { tips, replay, why, clearWhy: () => { const el = document.getElementById("whyline"); if (el) el.classList.add("hidden"); } };
})(window);
