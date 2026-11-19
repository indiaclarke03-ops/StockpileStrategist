/* Stockpile Strategist — plain-language layer shared by story and analyst modes.
 * One place for: the glossary, the safety-margin wording, and zone names. */
(function (root) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // Safety margin = the reverse-stress "distance to disaster" d = (L + S) / √(1ᵀΣ1),
  // explained as: how many times worse than a typical bad quarter your factory can absorb.
  const ZONES = { Fragile: "Danger", Exposed: "At risk", Resilient: "Safe", Hardened: "Very safe" };
  const zone = (d) => { const key = root.RST ? root.RST.band(d) : d < 1.5 ? "Fragile" : d < 2.5 ? "Exposed" : d < 3.5 ? "Resilient" : "Hardened"; return { key, label: ZONES[key] }; };
  const margin = (d) => `${d.toFixed(1)}×`;
  const zoneTag = (d) => { const z = zone(d); return `<span class="band band-${z.key}">${z.label}</span>`; };
  const marginSentence = (d) => d < 1
    ? `Even a <b>normal bad quarter</b> could stop your factory.`
    : `Your factory could survive a shortage about <b>${d.toFixed(1)}× worse</b> than a typical bad quarter.`;

  const GLOSSARY = [
    ["Critical minerals", "Metals that modern products can't do without, such as magnets in car motors, chips in phones and radar, batteries, and ammunition. The US imports most of them, often from China."],
    ["Export controls / restrictions", "Rules a country uses to limit what can be sold abroad. Since 2023, China has required licences or banned sales of several minerals to the US."],
    ["The pause (10 Jan 2027)", "In November 2025, China and the US agreed a truce: China paused its toughest new rare-earth restrictions for a year. In November 2026 that pause was extended only to 10 January 2027. If it isn't extended again, those restrictions could return."],
    ["Stockpile / reserve", "Minerals the government buys and stores ahead of time, so factories can keep working if imports stop. The US launched a real $12B stockpile ('Project Vault') in February 2026."],
    ["Days of supply in storage", "How long your stored minerals would last if imports stopped completely. 60 days is Japan's long-standing target."],
    ["Shortage that stops the factory", "The size of shortfall your factory can't work around, e.g. supply 25% below normal for three months. You choose it at the start."],
    ["Safety margin", "How big a shock your plan can absorb, compared with a typical bad quarter. 1× means a normal bad quarter could stop you; 3× means it would take a shock three times worse. Zones: Danger (under 1.5×), At risk, Safe, Very safe (over 3.5×). It's a rule-of-thumb distance, not a probability."],
    ["Weak spot / fault line", "A supplier that would cause much more of a shortage than its size suggests, usually because it tends to fail at the same time as others."],
    ["Fail together", "Suppliers that rely on the same source (often Chinese refining) are hit by the same event. Two 'different' suppliers can turn out to be one risk."],
    ["Where suppliers get their raw material (upstream)", "Your suppliers buy their own inputs from someone else. If those inputs come from China, a 'non-Chinese' supplier still depends on China."],
    ["Hidden weak point", "The single upstream source that most of your risk traces back to, even though you never buy from it directly."],
    ["Supply deal", "A contract with a producer to deliver a fixed amount every quarter (industry calls it an 'offtake'). It takes a year or more to start, and only helps if the producer isn't itself dependent on China."],
    ["Ownership check", "Looking up who really owns a company and what risks are recorded against it, using Sayari's corporate-records database. Results are records, not accusations."],
    ["Rerouting", "When direct sales are banned, some material still arrives via other countries over time. This slowly fills part of the gap."],
    ["Public trust", "How much the public and Congress trust your handling of the reserve. It falls when factories stop or when you sign questionable deals."],
    ["1,000 possible futures", "We replay 2027 a thousand times with different random events, based on how often China and the DRC acted in 2023–26. Counting how many go well shows how robust your plan is. These are simulations, not predictions."],
    ["Illustrative network", "Where we couldn't measure how suppliers' shipments move over time, the supplier list and shares are real but how much each one varies is estimated. These views carry a yellow badge."],
  ];

  function glossaryHTML() {
    return `<h3>Key terms, in plain English</h3><dl class="gloss">${GLOSSARY.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>`;
  }

  root.Plain = { zone, margin, zoneTag, marginSentence, GLOSSARY, glossaryHTML, ZONES };
})(window);
