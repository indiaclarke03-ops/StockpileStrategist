// node tests/rst.test.js — reverse-stress engine checks (brief §4, §7)
const assert = require("assert");
const RST = require("../site/v4/rst.js");
let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log("  ✓ " + name); };
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

// Atlas example: A,B,C = 60/25/15 kt, σ = 3/5/4, ρ(B,C) = 0.8, L = 20 kt.
const S = RST.sigmaFrom([3, 5, 4], (i, j) => ((i === 1 && j === 2) || (i === 2 && j === 1) ? 0.8 : 0));

t("atlas example: a = [2.20, 10.00, 7.80]", () => {
  const { a } = RST.solve(S, 20);
  close(a[0], 2.2, 0.005); close(a[1], 10.0, 0.005); close(a[2], 7.8, 0.005);
});

t("losses sum to L", () => {
  const { a } = RST.solve(S, 20);
  close(a.reduce((x, y) => x + y, 0), 20);
});

t("B+C carry 89% of the loss from 40% of supply", () => {
  const { a } = RST.solve(S, 20);
  close(RST.lossShare(a, [1, 2]), 0.89, 0.001);
});

t("alternatives: every sample clipped to [0, cap] and P50s near the central solution", () => {
  const alt = RST.alternatives(S, 20, [60, 25, 15], { samples: 2000, seed: 7 });
  alt.forEach((q, i) => { assert.ok(q.p10 >= 0 && q.p90 <= [60, 25, 15][i] + 1e-9); assert.ok(q.p10 <= q.p50 && q.p50 <= q.p90); });
  close(alt[1].p50, 10, 1.5);
});

t("clip/renormalise keeps the total at L and respects caps", () => {
  const x = RST.clipRenorm([-5, 30, 10], 20, [60, 12, 15]);
  close(x.reduce((a, b) => a + b, 0), 20, 1e-6);
  assert.ok(x[0] >= 0 && x[1] <= 12 + 1e-9);
});

t("distance to disaster rises with stockpile", () => {
  assert.ok(RST.distance(S, 20, 10) > RST.distance(S, 20, 0));
});

t("distance to disaster falls when correlation rises", () => {
  const S2 = RST.setRho(S, 0, 1, 0.8);
  assert.ok(RST.distance(S2, 20) < RST.distance(S, 20));
});

t("independent offtake helps; a China-correlated one helps less", () => {
  const V = 100;
  const clean = RST.addSupplier(S, V, 10, 0.1, () => 0);
  const linked = RST.addSupplier(S, V, 10, 0.1, (i) => (i === 1 || i === 2 ? 0.8 : 0));
  const d0 = RST.distance(S, 20), dc = RST.distance(clean, 20), dl = RST.distance(linked, 20);
  assert.ok(dc > d0, "clean offtake raises d");
  assert.ok(dl < dc, "linked offtake raises d less");
});

t("back-propagation finds the converged upstream node", () => {
  const { a } = RST.solve(S, 20);
  const bp = RST.backprop(a, ["A", "B", "C"], [
    { id: "refinery-x", share: { B: 0.9, C: 0.9 } },
    { id: "mine-a", share: { A: 1 } },
  ]);
  assert.strictEqual(bp.spof.id, "refinery-x");
  assert.deepStrictEqual(bp.spof.feeds.sort(), ["B", "C"]);
});

t("estimateSigma: perfectly co-moving series → correlation ≈ 1 (before shrinkage)", () => {
  const T = 40, a = [], b = [];
  for (let i = 0; i < T; i++) { const shock = Math.sin(i * 1.3) * 5; a.push(50 + shock + i * 0.1); b.push(20 + shock * 0.5); }
  const est = RST.estimateSigma([a, b], { lambda: 0 });
  close(RST.corr(est.sigma, 0, 1), 1, 1e-6);
  assert.strictEqual(RST.estimateSigma([a.slice(0, 20), b.slice(0, 20)]).lambda, 0.3, "shrinkage applies under 36 points");
});

console.log(`\n${passed} tests passed`);
