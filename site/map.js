/* Stockpile Strategist — supply map (spec §8 bottom-left).
 * Shades countries by their share of US imports for the selected mineral (Tradeverifyd
 * Comtrade / Sayari facets), pins offtake counterparties, and marks live disruptions.
 * Uses D3 + world-atlas from a CDN; falls back to a ranked list if they can't load.
 */
(function (root) {
  const ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
  let world = null, loading = null;

  // Map trade-data country labels (names or ISO3) to world-atlas names.
  const ALIAS = {
    usa: "United States of America", "united states": "United States of America", us: "United States of America",
    chn: "China", "china": "China", "people's republic of china": "China", prc: "China",
    kor: "South Korea", "korea": "South Korea", "republic of korea": "South Korea", "korea, republic of": "South Korea", "rep. of korea": "South Korea",
    jpn: "Japan", deu: "Germany", can: "Canada", mex: "Mexico", bel: "Belgium", fra: "France", gbr: "United Kingdom", "uk": "United Kingdom",
    aus: "Australia", ind: "India", vnm: "Vietnam", "viet nam": "Vietnam", rus: "Russia", "russian federation": "Russia",
    cod: "Dem. Rep. Congo", drc: "Dem. Rep. Congo", "democratic republic of the congo": "Dem. Rep. Congo", "congo, dem. rep.": "Dem. Rep. Congo", "dr congo": "Dem. Rep. Congo",
    zaf: "South Africa", bra: "Brazil", moz: "Mozambique", mdg: "Madagascar", nor: "Norway", fin: "Finland", est: "Estonia",
    twn: "Taiwan", "taiwan, china": "Taiwan", "chinese taipei": "Taiwan", mys: "Malaysia", tha: "Thailand", idn: "Indonesia", phl: "Philippines",
    ukr: "Ukraine", kaz: "Kazakhstan", tur: "Turkey", "türkiye": "Turkey", turkiye: "Turkey", bol: "Bolivia", per: "Peru", chl: "Chile",
    nld: "Netherlands", ita: "Italy", esp: "Spain", aut: "Austria", che: "Switzerland", swe: "Sweden", pol: "Poland", cze: "Czechia", "czech republic": "Czechia",
    are: "United Arab Emirates", uae: "United Arab Emirates", sgp: "Singapore", hkg: "Hong Kong", "hong kong": "China", isr: "Israel", omn: "Oman", mmr: "Myanmar", "burma": "Myanmar",
    zmb: "Zambia", mar: "Morocco", tza: "Tanzania", lka: "Sri Lanka", arg: "Argentina", kgz: "Kyrgyzstan", tjk: "Tajikistan", lao: "Laos", gab: "Gabon",
  };
  const norm = (s) => {
    if (!s) return null;
    const k = String(s).trim().toLowerCase();
    return ALIAS[k] || String(s).trim();
  };

  const DISRUPTION_XY = {
    drc: [25.5, -10.7], "inner-mongolia": [110.0, 40.6], jiangxi: [114.9, 25.8], myanmar: [97.4, 25.4], indonesia: [121.5, -2.5],
  };

  function load() {
    if (world || loading) return loading;
    if (!root.d3 || !root.topojson) return Promise.reject(new Error("d3 not loaded"));
    loading = fetch(ATLAS).then((r) => r.json()).then((topo) => {
      world = root.topojson.feature(topo, topo.objects.countries);
      return world;
    });
    return loading;
  }

  /**
   * render(el, { shares: [{country, share}], china: number, pins: [{country, label, bad}], disruptions: [{region,title}], source })
   */
  function render(el, opts) {
    const shares = (opts.shares || []).map((s) => ({ ...s, atlas: norm(s.country) })).filter((s) => s.atlas);
    const fallback = () => {
      el.innerHTML = `<div class="map-fallback">${shares.length ? shares.slice(0, 8).map((s) => `<div class="order-line"><span>${s.atlas}</span><span class="num">${Math.round(s.share * 100)}%</span></div>`).join("") : `<div class="muted">No trade data cached for this mineral.</div>`}</div>`;
    };
    if (!root.d3) { fallback(); return; }
    load().then(() => {
      const d3 = root.d3;
      const W = 900, H = 420;
      const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
      const path = d3.geoPath(proj);
      const byName = new Map(shares.map((s) => [s.atlas, s.share]));
      const max = Math.max(0.05, ...shares.map((s) => s.share));
      const shade = (name) => {
        const v = byName.get(name);
        if (v == null) return "var(--map-land)";
        return `color-mix(in srgb, var(--accent) ${Math.round(18 + 72 * Math.sqrt(v / max))}%, var(--map-land))`;
      };
      const feats = world.features;
      const findFeat = (c) => feats.find((f) => f.properties.name === norm(c));
      const pins = (opts.pins || []).map((p) => { const f = findFeat(p.country); return f ? { ...p, xy: proj(d3.geoCentroid(f)) } : null; }).filter(Boolean);
      // spread pins that share a country
      const seen = {};
      pins.forEach((p) => { const n = (seen[p.country] = (seen[p.country] || 0) + 1) - 1; p.xy = [p.xy[0] + n * 11, p.xy[1] - n * 4]; });
      const dis = (opts.disruptions || []).map((d) => DISRUPTION_XY[d.region] ? { ...d, xy: proj(DISRUPTION_XY[d.region]) } : null).filter(Boolean);
      el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="worldmap" role="img" aria-label="Map of US import sources">
        <path d="${path({ type: "Sphere" })}" fill="var(--map-sea)"/>
        ${feats.map((f) => {
          const n = f.properties.name, v = byName.get(n);
          return `<path d="${path(f)}" fill="${shade(n)}" stroke="${n === "China" ? "var(--bad)" : "var(--map-border)"}" stroke-width="${n === "China" ? 1.6 : 0.5}"><title>${n}${v != null ? `: ${Math.round(v * 100)}% of US imports` : ""}</title></path>`;
        }).join("")}
        ${dis.map((d) => `<g transform="translate(${d.xy[0]},${d.xy[1]})"><circle r="11" fill="none" stroke="var(--bad)" stroke-width="2" opacity=".55"><animate attributeName="r" values="6;14;6" dur="2.4s" repeatCount="indefinite"/></circle><circle r="4" fill="var(--bad)"/><title>${d.title || "Disruption"}</title></g>`).join("")}
        ${pins.map((p) => `<g transform="translate(${p.xy[0]},${p.xy[1]})"><path d="M0,0 l-6,-12 a7,7 0 1,1 12,0 z" fill="${p.bad ? "var(--warn)" : "var(--info)"}" stroke="var(--surface)" stroke-width="1.2"/><title>${p.label}</title></g>`).join("")}
      </svg>`;
    }).catch(fallback);
  }

  root.SupplyMap = { render, norm };
})(window);
