/* Stockpile Strategist v4 — globe stage (Act 0 + background).
 * Arcs are real US import flows (Tradeverifyd Comtrade, latest cached year) for all six minerals,
 * drawn in ONE hue (single series; thickness = value). A mission's own colour appears alone later.
 */
(function (root) {
  const GLOBE_URL = "https://cdn.jsdelivr.net/npm/globe.gl@2.46.2/dist/globe.gl.min.js";
  const ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
  const US = { lat: 39.5, lng: -98.35 };
  const ALIAS = { "Rep. of Korea": "South Korea", "United States": "United States of America", USA: "United States of America" };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  let globe = null, countries = null, centroids = {}, arcsAll = [], el = null;

  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  function buildArcs() {
    const EXT = root.GAME_DATA.EXT || {};
    const out = [];
    for (const [m, t] of Object.entries(EXT.trade || {})) {
      const years = Object.keys(t.sharesByYear || {}).sort();
      const y = years[years.length - 1];
      for (const p of (t.sharesByYear && t.sharesByYear[y]) || []) {
        const c = centroids[ALIAS[p.country] || p.country];
        if (!c || !p.value) continue;
        out.push({ mineral: m, country: p.country, value: p.value, year: y, startLat: c[1], startLng: c[0], endLat: US.lat, endLng: US.lng });
      }
    }
    const max = Math.max(1, ...out.map((a) => a.value));
    out.forEach((a) => { a.stroke = 0.25 + 1.6 * Math.sqrt(a.value / max); });
    return out;
  }

  async function init(container) {
    el = container;
    try {
      const topo = await fetch(ATLAS).then((r) => r.json());
      countries = root.topojson.feature(topo, topo.objects.countries).features;
      for (const f of countries) centroids[f.properties.name] = root.d3.geoCentroid(f);
      arcsAll = buildArcs();
    } catch (e) { arcsAll = []; }
    try {
      if (!root.Globe) await loadScript(GLOBE_URL);
      makeGlobe();
    } catch (e) { fallback(); }
    return { arcs: arcsAll };
  }

  function makeGlobe() {
    globe = root.Globe({ animateIn: !reduced() })(el)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true).atmosphereColor("#3d6fb6").atmosphereAltitude(0.18)
      .hexPolygonsData(countries || []).hexPolygonResolution(3).hexPolygonMargin(0.62).hexPolygonUseDots(true)
      .hexPolygonColor((f) => (f.properties.name === "China" ? "rgba(238,241,246,.55)" : f.properties.name === "United States of America" ? "rgba(224,138,82,.75)" : "rgba(148,170,205,.33)"))
      .arcsData(arcsAll)
      .arcColor(() => ["rgba(110,168,240,0.05)", "rgba(110,168,240,0.95)"])
      .arcStroke((a) => a.stroke).arcAltitudeAutoScale(0.42)
      .arcDashLength(0.5).arcDashGap(0.35).arcDashInitialGap(() => Math.random()).arcDashAnimateTime(() => (reduced() ? 0 : 2400 + Math.random() * 1600))
      .arcLabel((a) => `${a.country} → US · ${a.mineral} · $${(a.value / 1e6).toFixed(1)}M (${a.year})`)
      .ringsData([US]).ringColor(() => (t) => `rgba(224,138,82,${1 - t})`).ringMaxRadius(5).ringPropagationSpeed(1.6).ringRepeatPeriod(reduced() ? 0 : 1400);
    const mat = globe.globeMaterial();
    if (mat && mat.color) { mat.color.set("#0d1626"); if (mat.emissive) { mat.emissive.set("#0a1220"); mat.emissiveIntensity = 0.4; } mat.shininess = 0.6; }
    const c = globe.controls();
    c.autoRotate = !reduced(); c.autoRotateSpeed = 0.35; c.enableZoom = false;
    globe.pointOfView({ lat: 22, lng: 40, altitude: 2.35 }, 0);
    resize(); addEventListener("resize", resize);
  }

  function resize() { if (globe) globe.width(innerWidth).height(innerHeight); }

  function fallback() {
    // Static orthographic world (no WebGL / CDN failure).
    if (!root.d3 || !countries) return;
    const d3 = root.d3, W = innerWidth, H = innerHeight;
    const proj = d3.geoOrthographic().scale(Math.min(W, H) * 0.42).translate([W * 0.62, H * 0.52]).rotate([-40, -22]);
    const path = d3.geoPath(proj);
    el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${path({ type: "Sphere" })}" fill="#0d1626" stroke="rgba(61,111,182,.4)"/>
      ${countries.map((f) => `<path d="${path(f) || ""}" fill="${f.properties.name === "China" ? "rgba(238,241,246,.4)" : "rgba(148,170,205,.18)"}" stroke="rgba(11,15,23,.6)" stroke-width=".5"/>`).join("")}</svg>`;
  }

  /** Show only one mineral's arcs in its mission colour (single series), or all in the base hue. */
  function focus(mineral, color) {
    if (!globe) return;
    const data = mineral ? arcsAll.filter((a) => a.mineral === mineral) : arcsAll;
    globe.arcsData(data).arcColor(() => (mineral ? [hexA(color, 0.08), hexA(color, 1)] : ["rgba(110,168,240,0.05)", "rgba(110,168,240,0.95)"]));
  }
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  function flyTo(pov, ms = 1600) { if (globe) globe.pointOfView(pov, reduced() ? 0 : ms); }
  function setRotate(on) { if (globe) globe.controls().autoRotate = on && !reduced(); }

  root.Stage = { init, focus, flyTo, setRotate, get arcs() { return arcsAll; } };
})(window);
