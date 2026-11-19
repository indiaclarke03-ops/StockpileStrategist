/* Stockpile Strategist v4 — layered supply-network view (Acts 2–4).
 * Tier 0 = the US plant (bottom), tier 1 = import suppliers, tier 2 = their feedstock (top).
 * Node size encodes either share of supply or share of the inferred loss (the morph).
 */
(function (root) {
  const NS = "http://www.w3.org/2000/svg";
  // Compact geometry: the graph is a live side panel, not the whole page.
  const W = 1000, H = 560, PLANT = { x: 430, y: 500 }, Y1 = 290, Y2 = 70, TANK = { x: 640, y: 500 };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (s, n = 24) => { const t = String(s).split(" (")[0]; return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  const rOf = (v) => 9 + 64 * Math.sqrt(Math.max(0, v));
  // GSAP when available; always force-completed on a timer so throttled rAF can't leave a half-drawn state.
  const tween = (target, vars) => {
    if (root.gsap && !reduced()) { const tw = root.gsap.to(target, vars); setTimeout(() => tw.progress(1), (vars.duration || 0.5) * 1000 + 120); return tw; }
    const end = {}; for (const k in vars) if (typeof vars[k] === "number" && k !== "duration") end[k] = vars[k];
    Object.assign(target, end); vars.onUpdate && vars.onUpdate.call({ targets: () => [target] }); vars.onComplete && vars.onComplete();
  };

  class NetView {
    constructor(el, model, opts = {}) {
      this.el = el; this.model = model; this.opts = opts;
      this.nodes = model.nodes.map((n) => ({ ...n }));
      this.tier2 = (model.tier2 || []).map((t) => ({ ...t }));
      this.vals = this.nodes.map((n) => n.share);
      this.r = this.vals.map(rOf);
      this.mode = "supply";
      this.selected = new Set();
      this.extraLinks = [];
      this.render();
    }

    layout() {
      const n = this.nodes.length;
      // Largest in the middle, alternating outward.
      const order = this.nodes.map((nd, i) => i).sort((a, b) => this.nodes[b].share - this.nodes[a].share);
      const mid = Math.floor((n - 1) / 2);
      const centreOut = [];
      for (let d = 0; centreOut.length < n; d++) { if (mid - d >= 0 && !centreOut.includes(mid - d)) centreOut.push(mid - d); if (mid + d < n && !centreOut.includes(mid + d)) centreOut.push(mid + d); }
      const slots = new Array(n);
      order.forEach((idx, k) => { slots[centreOut[k]] = idx; });
      const x0 = 110, x1 = W - 110;
      this.pos = []; this.slot = [];
      slots.forEach((idx, s) => {
        const x = n === 1 ? W / 2 : x0 + ((x1 - x0) * s) / (n - 1);
        const curve = 40 * Math.pow((x - W / 2) / (W / 2), 2);
        this.pos[idx] = { x, y: Y1 - 10 + curve }; this.slot[idx] = s;
      });
      const m = this.tier2.length;
      const pad2 = m > 5 ? 70 : 150;
      this.pos2 = this.tier2.map((t, j) => ({ x: m === 1 ? W / 2 : pad2 + ((W - 2 * pad2) * j) / Math.max(1, m - 1), y: Y2 + (m > 5 && j % 2 ? 22 : 0) }));
    }

    render() {
      this.layout();
      const N = this.nodes, P = this.pos;
      const t1idx = (id) => N.findIndex((n) => n.id === id);
      const edge = (a, b) => `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`;
      const links = [...(this.model.links || []), ...this.extraLinks];
      this.el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Supply network for ${esc(this.model.mission)}">
        <defs><radialGradient id="glow"><stop offset="0" stop-color="rgba(224,138,82,.35)"/><stop offset="1" stop-color="rgba(224,138,82,0)"/></radialGradient></defs>
        <g class="up-edges">${this.tier2.map((t, j) => Object.entries(t.share || {}).map(([id, s]) => { const i = t1idx(id); if (i < 0 || s <= 0) return ""; return `<path class="n-edge up" data-t2="${j}" data-t1="${i}" d="${edge(this.pos2[j], P[i])}" stroke-width="${1 + 6 * s}"/>`; }).join("")).join("")}</g>
        <g class="t2">${this.tier2.map((t, j) => `<g class="n-t2" data-j="${j}" transform="translate(${this.pos2[j].x},${this.pos2[j].y})"><circle class="pulse" r="20" opacity="0"/><circle r="16"/><text y="${this.tier2.length > 5 && j % 2 ? 36 : -26}">${esc(short(t.label, this.tier2.length > 5 ? 16 : 30))}</text><text class="spof-label" y="${this.tier2.length > 5 && j % 2 ? -26 : 40}" opacity="0">HIDDEN WEAK POINT</text><title>${esc(t.label)} · upstream share ${t.evidence || "assumed"}</title></g>`).join("")}</g>
        <g class="edges">${N.map((nd, i) => `<path class="n-edge flow" data-i="${i}" d="${edge(P[i], PLANT)}" stroke-width="${1 + 12 * nd.share}"/>`).join("")}</g>
        <g class="links">${links.map((l) => { const i = l.i, j = l.j; if (!P[i] || !P[j]) return ""; const mx = (P[i].x + P[j].x) / 2, my = Math.min(P[i].y, P[j].y) - 70 - Math.abs(P[i].x - P[j].x) * 0.08; return `<path class="n-link${l.on ? " on" : ""}" data-a="${i}" data-b="${j}" d="M${P[i].x},${P[i].y} Q${mx},${my} ${P[j].x},${P[j].y}"><title>${esc(l.reason || "structural link")}</title></path>`; }).join("")}</g>
        <path class="tank-flow" d="M${TANK.x - 40},${TANK.y} L${PLANT.x + 92},${PLANT.y}"/>
        <g class="plant n-plant ${this.factory || ""}" transform="translate(${PLANT.x},${PLANT.y})"><circle r="70" fill="url(#glow)"/><rect x="-92" y="-26" width="184" height="52" rx="10"/><text y="-2">${esc(this.opts.plantLabel || "Your US factory")}</text><text class="plant-status" y="16">${esc(this.factoryLabel || "running")}</text><circle class="lamp" cx="-74" cy="0" r="6"/></g>
        <g class="tank" transform="translate(${TANK.x},${TANK.y})"><text class="tank-k" y="-66" x="0">STOCKPILE</text><rect class="tank-shell" x="-34" y="-56" width="68" height="100" rx="10"/><rect class="tank-fill" x="-30" y="${40 - 92 * Math.min(1, (this.tankDays || 0) / (this.tankMax || 180))}" width="60" height="${92 * Math.min(1, (this.tankDays || 0) / (this.tankMax || 180))}" rx="7"/><text class="tank-v" y="2">${Math.round(this.tankDays || 0)}</text><text class="tank-u" y="18">days</text></g>
        <g class="nodes">${N.map((nd, i) => `<g class="n-node${nd.chinaLinked ? " cn" : ""}${nd.isNew ? " new" : ""}" data-i="${i}" transform="translate(${P[i].x},${P[i].y})" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(nd.label)}, ${Math.round(nd.share * 100)}% of supply">
          <circle class="halo h90" r="0"/><circle class="halo h10" r="0"/>
          <circle class="ring" r="${this.r[i] + 7}"/>
          <circle class="body" r="${this.r[i]}"/>
          <text class="val" y="5">${this.fmt(this.vals[i])}</text>
          <text class="cutb" y="${-this.r[i] - 8}"></text>
          <text y="${this.r[i] + 20 + this.lblOff(i)}" class="lbl">${esc(short(nd.label, 18))}</text>
          <text y="${this.r[i] + 35 + this.lblOff(i)}" class="sub">${esc(nd.sub || nd.country || "")}</text>
          <title>${esc(nd.label)}</title></g>`).join("")}</g>
        <g class="fx"></g></svg>`;
      this.svg = this.el.querySelector("svg");
      this.svg.querySelectorAll(".n-node").forEach((g) => {
        const i = +g.dataset.i;
        const act = () => this.onTap && this.onTap(i);
        g.addEventListener("click", act);
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      });
      this.applyClasses();
      if (this.mode === "risk") this.paintVals(false);
    }

    fmt(v) { return `${Math.round(v * 100)}%`; }
    lblOff(i) { return this.nodes.length > 4 && this.slot[i] % 2 ? 30 : 0; }
    node(i) { return this.svg.querySelector(`.n-node[data-i="${i}"]`); }

    applyClasses() {
      this.svg.querySelectorAll(".n-node").forEach((g) => {
        const i = +g.dataset.i;
        g.classList.toggle("sel", this.selected.has(i));
        g.setAttribute("aria-pressed", this.selected.has(i) ? "true" : "false");
        g.classList.toggle("fault", !!(this.faults && this.faults.includes(i)));
      });
    }

    toggleSelect(i, max = 2) {
      if (this.selected.has(i)) this.selected.delete(i);
      else if (this.selected.size < max) this.selected.add(i);
      this.applyClasses();
      return [...this.selected];
    }

    /** Morph node sizes to new values (0..1 shares). */
    morph(vals, opts = {}) {
      const from = this.vals.slice();
      this.vals = vals.slice();
      this.mode = opts.mode || this.mode;
      const st = { t: 0 };
      tween(st, {
        t: 1, duration: opts.duration || 1.6, ease: opts.ease || "elastic.out(1, 0.55)",
        onUpdate: () => {
          from.forEach((f, i) => {
            const v = f + (vals[i] - f) * st.t;
            const g = this.node(i); if (!g) return;
            const r = rOf(Math.max(0, v));
            g.querySelector(".body").setAttribute("r", r);
            g.querySelector(".ring").setAttribute("r", r + 7);
            g.querySelector(".val").textContent = this.fmt(Math.max(0, f + (vals[i] - f) * Math.min(1, st.t)));
            g.querySelector(".lbl").setAttribute("y", r + 20 + this.lblOff(i));
            g.querySelector(".sub").setAttribute("y", r + 35 + this.lblOff(i));
          });
        },
      });
      // edges reflect the new values too
      this.svg.querySelectorAll(".edges .n-edge").forEach((p) => { const i = +p.dataset.i; p.setAttribute("stroke-width", 1 + 12 * Math.max(0, vals[i])); p.style.stroke = this.mode === "risk" ? `rgba(255,90,78,${0.25 + 0.7 * Math.min(1, vals[i] * 1.5)})` : ""; });
    }
    paintVals() { this.morph(this.vals, { duration: 0.01 }); }

    setFaults(idx) { this.faults = idx; this.applyClasses(); }
    showLinks(on, filter) {
      this.svg.querySelectorAll(".n-link").forEach((p) => {
        const a = +p.dataset.a, b = +p.dataset.b;
        p.classList.toggle("on", on && (!filter || filter(a, b)));
      });
    }

    /** Back-propagation: red particles up the tier-2 edges; SPOF pulses. */
    upstream(bp, on) {
      const t2 = this.tier2;
      const maxFlow = Math.max(1e-9, ...bp.flows.map((f) => f.loss));
      this.svg.querySelectorAll(".n-edge.up").forEach((p) => {
        const j = +p.dataset.t2, i = +p.dataset.t1;
        const f = bp.flows.find((x) => x.to === t2[j].id && x.from === this.nodes[i].id);
        const w = f ? f.loss / maxFlow : 0;
        p.classList.toggle("on", on && w > 0.01);
        p.setAttribute("stroke-width", 1 + 9 * w);
      });
      this.svg.querySelectorAll(".n-t2").forEach((g) => {
        const j = +g.dataset.j, isSpof = on && bp.spof && t2[j].id === bp.spof.id;
        g.classList.toggle("spof", isSpof);
        g.querySelector(".pulse").setAttribute("opacity", isSpof ? 1 : 0);
        g.querySelector(".spof-label").setAttribute("opacity", isSpof ? 1 : 0);
        const conv = (bp.converged[t2[j].id] || 0) / Math.max(1e-9, bp.spof ? bp.spof.loss : 1);
        g.querySelector("circle:not(.pulse)").setAttribute("r", on ? 10 + 22 * Math.sqrt(conv) : 16);
      });
    }

    /** Alternatives halo: rings at P10 and P90 of each node's loss share. */
    halos(q) {
      this.svg.querySelectorAll(".n-node").forEach((g) => {
        const i = +g.dataset.i; if (!q[i]) return;
        g.querySelector(".h10").setAttribute("r", rOf(q[i].p10));
        g.querySelector(".h90").setAttribute("r", rOf(q[i].p90));
      });
    }
    clearHalos() { this.svg.querySelectorAll(".halo").forEach((c) => c.setAttribute("r", 0)); }

    /** Add a supplier node live (Act 3). linkTo: indices it is correlated with (trap). */
    addNode(nd, linkTo = []) {
      this.nodes.push({ ...nd, isNew: true });
      this.vals.push(nd.share);
      this.r.push(rOf(nd.share));
      const k = this.nodes.length - 1;
      for (const j of linkTo) this.extraLinks.push({ i: k, j, on: true, reason: nd.linkReason || "correlated with China" });
      this.render();
      const g = this.node(k);
      if (g && root.gsap && !reduced()) { const tw = root.gsap.from(g, { opacity: 0, scale: 0.2, transformOrigin: "center", duration: 0.7, ease: "back.out(2)" }); setTimeout(() => tw.progress(1), 820); }
      if (linkTo.length) this.snap(k, linkTo[0]);
      return k;
    }

    /** Trap reveal: the new node's edge visibly snaps toward the China cluster. */
    snap(k, j) {
      const fx = this.svg.querySelector(".fx");
      const a = this.pos[k], b = this.pos[j];
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", a.x); line.setAttribute("y2", a.y);
      line.setAttribute("stroke", "#FF5A4E"); line.setAttribute("stroke-width", 4); line.setAttribute("stroke-linecap", "round");
      line.style.filter = "drop-shadow(0 0 8px #FF5A4E)";
      fx.appendChild(line);
      tween({ t: 0 }, { t: 1, duration: 0.5, ease: "power3.in", onUpdate: function () { const t = this && this.targets ? this.targets()[0].t : 1; line.setAttribute("x2", a.x + (b.x - a.x) * t); line.setAttribute("y2", a.y + (b.y - a.y) * t); },
        onComplete: () => { line.setAttribute("x2", b.x); line.setAttribute("y2", b.y); setTimeout(() => line.remove(), 900); } });
    }

    /** Shock pulse from the given supplier indices down to the plant. */
    pulse(idx, opts = {}) {
      const fx = this.svg.querySelector(".fx");
      idx.forEach((i) => {
        const path = this.svg.querySelector(`.edges .n-edge[data-i="${i}"]`); if (!path) return;
        const g = this.node(i); if (g) g.classList.add("dimmed");
        if (reduced()) return;
        const len = path.getTotalLength();
        const dot = document.createElementNS(NS, "circle"); dot.setAttribute("r", 9); dot.setAttribute("class", "n-shock"); fx.appendChild(dot);
        const st = { t: 0 };
        tween(st, { t: 1, duration: opts.duration || 1.1, ease: "power2.in", onUpdate: () => { const p = path.getPointAtLength(len * st.t); dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); }, onComplete: () => dot.remove() });
      });
    }
    undim() { this.svg.querySelectorAll(".n-node.dimmed").forEach((g) => g.classList.remove("dimmed")); }

    /** Stockpile tank beside the factory. drawing = supply is being taken out right now. */
    setTank(days, opts = {}) {
      this.tankDays = days; this.tankMax = opts.max || this.tankMax || 180;
      const g = this.svg && this.svg.querySelector(".tank"); if (!g) return;
      const h = 92 * Math.min(1, days / this.tankMax);
      const fill = g.querySelector(".tank-fill");
      fill.setAttribute("y", 40 - h); fill.setAttribute("height", h);
      g.querySelector(".tank-v").textContent = Math.round(days);
      g.classList.toggle("empty", days < 0.5);
      this.svg.querySelector(".tank-flow").classList.toggle("on", !!opts.drawing);
    }
    /** Factory state: "running" | "stopped" | "strained". */
    setFactory(state, label) {
      this.factory = state; this.factoryLabel = label || state;
      const g = this.svg && this.svg.querySelector(".n-plant"); if (!g) return;
      g.classList.remove("running", "stopped", "strained"); g.classList.add(state);
      g.querySelector(".plant-status").textContent = this.factoryLabel;
    }
    /** Live supply flows: factors[i] in [0,1] = share of supplier i's normal flow still arriving. */
    setFlows(factors, labels = []) {
      this.flows = factors;
      this.svg.querySelectorAll(".edges .n-edge").forEach((p) => {
        const i = +p.dataset.i, f = factors[i] == null ? 1 : factors[i], nd = this.nodes[i];
        p.setAttribute("stroke-width", Math.max(0.6, 1 + 12 * nd.share * f));
        p.style.stroke = f < 0.95 ? `rgba(255,90,78,${0.25 + 0.5 * (1 - f)})` : "";
        p.style.opacity = 0.3 + 0.7 * f;
      });
      this.svg.querySelectorAll(".n-node").forEach((g) => {
        const i = +g.dataset.i, f = factors[i] == null ? 1 : factors[i];
        g.classList.toggle("cut", f < 0.95);
        g.querySelector(".cutb").textContent = labels[i] != null ? labels[i] : f < 0.95 ? `−${Math.round((1 - f) * 100)}%` : "";
      });
    }
  }

  root.NetView = NetView;
})(window);
