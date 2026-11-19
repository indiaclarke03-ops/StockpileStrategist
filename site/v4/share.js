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
    x.fillStyle = "#EEF1F6"; x.font = "700 44px Space Grotesk, Inter, sans-serif"; x.fillText(`Mission: ${m.mustNot}`, 280, 150);
    x.fillStyle = "#AEB6C4"; x.font = "500 22px Inter, sans-serif"; x.fillText(`Line stops at a ${Math.round(G.threshold * 100)}% shortfall · 10 Jan 2027 cliff`, 280, 190);
    x.fillStyle = "#E08A52"; x.font = "800 190px Space Grotesk, Inter, sans-serif"; x.fillText(r.grade, 920, 250);
    const rows = [
      ["Fault lines spotted", `${r.guessHits} of 2`],
      ["Distance to disaster", `${G.dStart.toFixed(1)}σ → ${r.dFinal.toFixed(1)}σ`],
      ["History 2023–26", `${Math.round(r.yours)} days lost (doing nothing: ${Math.round(r.ghost)})`],
      ["Simulated futures survived", `${r.survived} of 1,000`],
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
  root.Share = { card };
})(window);
