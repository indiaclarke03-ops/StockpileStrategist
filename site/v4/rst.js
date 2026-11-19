/* Stockpile Strategist v4 — reverse-stress engine (brief §4). Pure functions, no DOM.
 *
 * Method adapted from the Ethical Tech CoLab Resilience Atlas (teaching material, not a
 * validated product): start from a loss you cannot tolerate and infer the most likely way it
 * happens under a zero-mean multivariate normal model of supplier losses x ~ N(0, Σ):
 *     a = L · Σ1 / (1ᵀΣ1)
 * Results are CONDITIONAL on the loss happening. They are not forecasts, and σ-distances are
 * not probabilities.
 */
(function (root) {
  // ---------- small linear algebra ----------
  const ones = (n) => new Array(n).fill(1);
  const matVec = (M, v) => M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
  const sum = (v) => v.reduce((a, b) => a + b, 0);
  const clone = (M) => M.map((r) => r.slice());

  function cholesky(M) {
    const n = M.length, Lm = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = M[i][j];
        for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
        if (i === j) Lm[i][j] = Math.sqrt(Math.max(s, 1e-12));
        else Lm[i][j] = s / Lm[j][j];
      }
    }
    return Lm;
  }

  // Park–Miller RNG (same generator as sim.js) + Box–Muller normals.
  function rng(seed) {
    let s = seed % 2147483647; if (s <= 0) s += 2147483646;
    const u = () => (s = (s * 16807) % 2147483647) / 2147483647;
    let spare = null;
    u.normal = () => {
      if (spare != null) { const v = spare; spare = null; return v; }
      let a, b, r;
      do { a = 2 * u() - 1; b = 2 * u() - 1; r = a * a + b * b; } while (r >= 1 || r === 0);
      const f = Math.sqrt((-2 * Math.log(r)) / r);
      spare = b * f; return a * f;
    };
    return u;
  }

  // ---------- §5.3 covariance from volume series ----------
  /** series: array of equal-length numeric arrays (one per supplier). Linear detrend, sample
   *  covariance, then shrink toward the diagonal when there are < 36 points (λ assumed). */
  function estimateSigma(series, opts = {}) {
    const n = series.length, T = series[0].length;
    const lambda = opts.lambda != null ? opts.lambda : T < 36 ? 0.3 : 0;
    const resid = series.map((y) => {
      if (opts.detrend === false) { const m = sum(y) / T; return y.map((v) => v - m); }
      const tm = (T - 1) / 2, ym = sum(y) / T;
      let num = 0, den = 0;
      y.forEach((v, t) => { num += (t - tm) * (v - ym); den += (t - tm) ** 2; });
      const b = den ? num / den : 0;
      return y.map((v, t) => v - (ym + b * (t - tm)));
    });
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      resid[i].reduce((s, v, t) => s + v * resid[j][t], 0) / Math.max(1, T - 1)));
    const sigma = S.map((row, i) => row.map((v, j) => (i === j ? v : (1 - lambda) * v)));
    return { sigma, lambda, points: T, means: series.map((y) => sum(y) / T) };
  }

  /** Build Σ from standard deviations and a correlation lookup. */
  function sigmaFrom(sd, rho = () => 0) {
    return sd.map((si, i) => sd.map((sj, j) => (i === j ? si * si : rho(i, j) * si * sj)));
  }
  const sd = (S) => S.map((r, i) => Math.sqrt(Math.max(0, r[i])));
  const corr = (S, i, j) => S[i][j] / Math.sqrt(S[i][i] * S[j][j] || 1);

  // ---------- §4.2 central solution ----------
  function solve(S, L) {
    const S1 = matVec(S, ones(S.length));
    const s = sum(S1);
    return { a: S1.map((x) => (L * x) / s), s, S1 };
  }

  /** Share of the inferred loss carried by a subset of supplier indices. */
  const lossShare = (a, idx) => sum(idx.map((i) => a[i])) / sum(a);

  // ---------- §4.3 back-propagation ----------
  /** tier1Ids: ids in Σ order; tier2: [{id, share: {tier1Id: fraction}}].
   *  Each tier-1 loss is pushed to its inputs with σ ∝ input share and independent inputs
   *  (assumed), i.e. a_ij ∝ share_j². Input share not covered by tier2 goes to "unmapped".
   *  1:1 contained-element ratio (assumed). */
  function backprop(a, tier1Ids, tier2) {
    const converged = {};
    const flows = [];
    tier1Ids.forEach((tid, i) => {
      const inputs = tier2.filter((t) => t.share && t.share[tid] > 0).map((t) => ({ id: t.id, w: t.share[tid] }));
      const covered = sum(inputs.map((x) => x.w));
      if (covered < 0.999) inputs.push({ id: "unmapped", w: 1 - covered });
      const denom = sum(inputs.map((x) => x.w * x.w)) || 1;
      for (const x of inputs) {
        const v = (a[i] * x.w * x.w) / denom;
        converged[x.id] = (converged[x.id] || 0) + v;
        flows.push({ from: tid, to: x.id, loss: v });
      }
    });
    const ranked = Object.entries(converged).filter(([id]) => id !== "unmapped").sort((p, q) => q[1] - p[1]);
    const spof = ranked.length ? { id: ranked[0][0], loss: ranked[0][1], share: ranked[0][1] / (sum(a) || 1), feeds: flows.filter((f) => f.to === ranked[0][0] && f.loss > 1e-9).map((f) => f.from) } : null;
    return { converged, flows, spof };
  }

  // ---------- §4.4 alternatives ----------
  /** Exact conditional sampling: z ~ N(0,Σ), x = z + Σ1 (L − 1ᵀz)/s gives x | 1ᵀx = L.
   *  Then clip to [0, cap_i] (cap = mean flow; game adjustment) and water-fill back to L. */
  function alternatives(S, L, caps, opts = {}) {
    const N = opts.samples || 1000, n = S.length, r = rng(opts.seed || 20230701);
    const C = cholesky(S), { S1, s } = solve(S, L);
    const draws = Array.from({ length: n }, () => []);
    for (let k = 0; k < N; k++) {
      const e = Array.from({ length: n }, () => r.normal());
      const z = C.map((row) => row.reduce((acc, v, j) => acc + v * e[j], 0));
      const adj = (L - sum(z)) / s;
      let x = z.map((zi, i) => zi + S1[i] * adj);
      x = clipRenorm(x, L, caps);
      x.forEach((v, i) => draws[i].push(v));
    }
    const q = (arr, p) => { const a = arr.slice().sort((u, v) => u - v); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
    return draws.map((d) => ({ p10: q(d, 0.1), p50: q(d, 0.5), p90: q(d, 0.9) }));
  }

  /** Clip to [0, cap] then distribute the remaining target over unsaturated suppliers. */
  function clipRenorm(x, L, caps) {
    let v = x.map((xi, i) => Math.min(Math.max(xi, 0), caps ? caps[i] : Infinity));
    for (let it = 0; it < 20; it++) {
      const gap = L - sum(v);
      if (Math.abs(gap) < 1e-9) break;
      const free = v.map((vi, i) => (gap > 0 ? (caps ? caps[i] - vi : Infinity) : vi)).map((f) => Math.max(0, f));
      const room = sum(free.map((f) => (Number.isFinite(f) ? f : 1e9)));
      if (room <= 1e-12) break;
      const base = gap > 0 ? v.map((vi, i) => (free[i] > 0 ? Math.max(vi, 1e-6) : 0)) : v;
      const bs = sum(base) || 1;
      v = v.map((vi, i) => {
        const step = (gap * base[i]) / bs;
        return Math.min(Math.max(vi + step, 0), caps ? caps[i] : Infinity);
      });
    }
    return v;
  }

  // ---------- §4.5 distance to disaster ----------
  /** d = (L + S) / sqrt(1ᵀΣ1): how many standard deviations of total supply-loss noise sit
   *  between normal and "line stops". Not a probability. */
  function distance(S, L, buffer = 0) {
    return (L + buffer) / Math.sqrt(Math.max(1e-12, sum(matVec(S, ones(S.length)))));
  }
  const band = (d) => (d < 1.5 ? "Fragile" : d < 2.5 ? "Exposed" : d < 3.5 ? "Resilient" : "Hardened");

  /** Add a supplier k carrying volume w (moved proportionally out of the existing mix of total V).
   *  σ ∝ volume (constant CV), so existing Σ scales by (1 − w/V)²; σ_k = cv·w; ρ(k,i) from rhoTo(i). */
  function addSupplier(S, V, w, cv, rhoTo = () => 0) {
    const f = 1 - w / V, n = S.length;
    const sk = cv * w;
    const scaled = S.map((r) => r.map((x) => x * f * f));
    const sdv = sd(scaled);
    const out = scaled.map((r, i) => r.concat([rhoTo(i) * sk * sdv[i]]));
    out.push(Array.from({ length: n }, (_, i) => rhoTo(i) * sk * sdv[i]).concat([sk * sk]));
    return out;
  }

  /** Set correlation between i and j, keeping variances. */
  function setRho(S, i, j, rho) {
    const M = clone(S), v = Math.sqrt(M[i][i] * M[j][j]) * rho;
    M[i][j] = v; M[j][i] = v; return M;
  }

  /** Stress Σ (§4.5): structurally linked pairs → ρ = rhoStress; China-linked σ × sigmaMult (assumed). */
  function stress(S, links, chinaIdx, opts = {}) {
    const mult = opts.sigmaMult || 1.5;
    let M = S.map((r, i) => r.map((x, j) => x * (chinaIdx.includes(i) ? mult : 1) * (chinaIdx.includes(j) ? mult : 1)));
    for (const l of links) M = setRho(M, l.i, l.j, Math.max(corr(M, l.i, l.j), l.rho != null ? l.rho : 0.8));
    return M;
  }

  const RST = { rng, cholesky, estimateSigma, sigmaFrom, sd, corr, solve, lossShare, backprop, alternatives, clipRenorm, distance, band, addSupplier, setRho, stress };
  root.RST = RST;
  if (typeof module !== "undefined") module.exports = RST;
})(typeof window !== "undefined" ? window : globalThis);
