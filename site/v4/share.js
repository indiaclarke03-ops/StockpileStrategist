/* Stockpile Strategist v4 — shareable PNG report card (canvas → PNG). */
(function (root) {
  function card(G) {
    const r = G.report, m = G.mission;
    const W = 1200, H = 630, c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0B0F17"); g.addColorStop(1, "#141d2e");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // element tile
    x.strokeStyle = m.color; x.lineWidth = 4; roundRect(x, 70, 70, 170, 170, 16); x.stroke();
    x.fillStyle = hexA(m.color, 0.18); roundRect(x, 70, 70, 170, 170, 16); x.fill();
    x.fillStyle = "#AEB6C4"; x.font = "600 22px JetBrains Mono, monospace"; x.fillText(String(m.num), 86, 104);
    x.fillStyle = "#EEF1F6"; x.font = "700 86px Space Grotesk, Inter, sans-serif"; x.textAlign = "center"; x.fillText(m.sym, 155, 186); x.textAlign = "left";
    x.fillStyle = "#7D8698"; x.font = "500 16px JetBrains Mono, monospace"; x.fillText(m.mass, 126, 226);
    x.fillStyle = "#E08A52"; x.font = "600 18px JetBrains Mono, monospace"; x.fillText("STOCKPILE STRATEGIST · FIND THE FAULT LINES", 280, 96);
    x.fillStyle = "#EEF1F6"; x.font = "700 44px Space Grotesk, Inter, sans-serif"; x.fillText(`Protecting: ${m.mustNot}`, 280, 150);
    x.fillStyle = "#AEB6C4"; x.font = "500 22px Inter, sans-serif"; x.fillText(`${m.name} · factory stops at a ${Math.round(G.threshold * 100)}% shortage · 10 Jan 2027 deadline`, 280, 190);
    x.fillStyle = "#E08A52"; x.font = "800 190px Space Grotesk, Inter, sans-serif"; x.fillText(r.grade, 920, 250);
    const rows = [
      ["Weak spots found", `${r.guessHits} of 2`],
      ["Safety margin", `${G.dStart.toFixed(1)}× → ${r.dFinal.toFixed(1)}× (${Plain.zone(r.dFinal).label})`],
      ["2023–26: factory stopped", `${Math.round(r.yours)} days (no plan: ${Math.round(r.ghost)})`],
      ["2027: futures survived", `${r.survived} of 1,000`],
    ];
    rows.forEach(([k, v], i) => {
      const yy = 330 + i * 62;
      x.fillStyle = "#7D8698"; x.font = "600 18px JetBrains Mono, monospace"; x.fillText(k.toUpperCase(), 70, yy);
      x.fillStyle = "#EEF1F6"; x.font = "700 30px Space Grotesk, Inter, sans-serif"; x.fillText(v, 470, yy + 2);
    });
    x.fillStyle = "#7D8698"; x.font = "500 16px Inter, sans-serif";
    x.fillText("Real data: Tavily · Tradeverifyd · Sayari. Reverse-stress logic adapted from the Ethical Tech CoLab Resilience Atlas.", 70, 590);
    c.toBlob(async (blob) => {
      const file = new File([blob], `stockpile-${m.id}-${r.grade}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: "Stockpile Strategist" }); return; } catch (e) { /* fall through to download */ } }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      root.UI.toast("Report card saved as PNG.", "good");
    }, "image/png");
  }
  function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
  const hexA = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };
  /** One-page policy briefing (memo layout), opened in a new tab for print / save as PDF. */
  function brief(G) {
    const r = G.report, m = G.mission, h = G.history, M = G.model, D = root.GAME_DATA, EXT = D.EXT || {};
    const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const pct = (x) => `${Math.round(x * 100)}%`;
    const faults = G.faults.map((i) => root.UI.shortName(M.nodes[i].label));
    const bp = RST.backprop(G.a, M.nodes.map((n) => n.id), M.tier2), spof = bp.spof && M.tier2.find((t) => t.id === bp.spof.id);
    const risk = RST.lossShare(G.a, G.faults), sup = G.faults.reduce((acc, i) => acc + M.nodes[i].share, 0);
    const deals = G.signed.map((id) => D.COUNTERPARTIES.find((c) => c.id === id));
    const futures = G.futures ? G.futures.survived : r.survived;
    const real = (EXT.responses || []).filter((x) => (x.minerals || []).includes(m.id) && /stockpile|offtake|price-floor|equity|deal/.test(x.type || "")).slice(0, 3);
    const rec = futures < 800 ? `Increase the ${m.name.toLowerCase()} reserve before 10 January 2027 and prioritise suppliers independent of ${spof ? esc(spof.label) : "Chinese processing"}.` : `Maintain the current ${m.name.toLowerCase()} reserve; monitor the 10 January 2027 decision and keep release rules ready.`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Briefing: ${esc(m.name)} supply risk</title>
<style>@page{size:A4;margin:18mm}body{font:11pt/1.5 Georgia,"Times New Roman",serif;color:#111;max-width:760px;margin:24px auto;padding:0 20px}
h1{font:700 20pt/1.2 Helvetica,Arial,sans-serif;margin:0 0 4px}.meta{font:9.5pt Helvetica,Arial,sans-serif;color:#555;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:14px}
h2{font:700 10.5pt Helvetica,Arial,sans-serif;text-transform:uppercase;letter-spacing:.08em;margin:16px 0 4px;color:#9a4a16}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}.k{border:1px solid #ccc;padding:6px 8px}.k b{display:block;font:700 15pt Helvetica,Arial,sans-serif}.k span{font:8.5pt Helvetica,Arial,sans-serif;color:#555}
.rec{border-left:4px solid #9a4a16;padding:6px 12px;background:#faf3ee}ul{margin:4px 0;padding-left:18px}.src{font:8.5pt Helvetica,Arial,sans-serif;color:#555;margin-top:18px;border-top:1px solid #ccc;padding-top:6px}
.noprint{margin:16px 0}@media print{.noprint{display:none}}</style></head><body>
<div class="noprint"><button onclick="print()">Print / save as PDF</button></div>
<h1>${esc(m.name)}: supply risk and stockpile plan</h1>
<div class="meta">Stockpile Strategist briefing · Protecting: ${esc(m.mustNot)} · Prepared ${new Date().toISOString().slice(0, 10)} · Grade ${esc(r.grade)} (${Math.round(r.score)}/100)</div>
<h2>Situation</h2><p>China's pause on its toughest new export restrictions ends on <b>10 January 2027</b>. The factory line stops if ${esc(m.name.toLowerCase())} supply falls by more than <b>${Math.round(G.threshold * 100)}%</b> for a quarter.</p>
<h2>Where the risk really sits (reverse stress test)</h2><p>Working backward from a ${Math.round(G.threshold * 100)}% shortage, its most likely cause is <b>${esc(faults.join(" and "))}</b>: ${pct(sup)} of supply but ${pct(risk)} of the shortfall, because they fail together.${spof ? ` Most of the risk, including from "non-Chinese" suppliers, traces upstream to <b>${esc(spof.label)}</b>.` : ""}</p>
<h2>Plan</h2><ul><li>Stockpile target: <b>${G.stockDays} days</b> of normal use; safety margin ${Plain.margin(r.dFinal)} (${Plain.zone(r.dFinal).label}).</li>
<li>Supply deals: ${deals.length ? deals.map((d) => `${esc(d.name)} (${esc(d.country)})${d.ownerChina || d.upstreamChina ? ", tied to China" : ""}`).join("; ") : "none"}.</li>
<li>Release rule: ${G.releaseTrigger ? "hold for big shocks (ration gaps under 10%)" : "release at the first shortfall"}; priority: ${{ defence: "defence first", even: "shared evenly", civilian: "commercial first" }[G.priority]}.</li></ul>
<h2>Test against 2023–26</h2><div class="kpis"><div class="k"><b>${Math.round(h.yours)}</b><span>output days lost, your plan</span></div><div class="k"><b>${Math.round(h.ghost)}</b><span>without a stockpile</span></div><div class="k"><b>${h.stopped}/14</b><span>quarters stopped</span></div><div class="k"><b>${Math.round(h.drawn)}</b><span>days supplied from stock</span></div></div>
<h2>Outlook for 2027</h2><p>In <b>${futures} of 1,000</b> simulated futures the line keeps running (scenarios: pause extended, restrictions return, or a new deal; weighted by this week's headlines). These are simulations, not forecasts.</p>
${real.length ? `<h2>What the US government has actually done</h2><ul>${real.map((x) => `<li>${esc(x.date)} · ${esc(x.actor)}: ${esc(x.summary)}</li>`).join("")}</ul>` : ""}
<h2>Recommendation</h2><p class="rec">${rec}</p>
<div class="src">Sources: UN Comtrade (all-partner US imports); Sayari shipping, ownership and risk records (findings, not allegations); Tavily-sourced news, prices and government actions; Tradeverifyd entity data. Method: reverse stress testing adapted from the Ethical Tech CoLab Resilience Atlas (teaching material, not a validated product). ${M.synthetic ? "Supply-network variability is illustrative." : "Supply network measured from shipping records."}</div>
</body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); } else root.UI.toast("Allow pop-ups to open the briefing.", "");
  }

  root.Share = { card, brief };
})(window);
