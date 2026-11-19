# Stockpile Strategist — Find the Fault Lines

*A critical-minerals reserve game played on real events, real trade data and live intelligence.*

You run America's $12B critical-minerals reserve, the size of Project Vault. You pick one mineral your factory can't do without, and the game teaches one idea:

> **Your biggest supplier is not your biggest risk. The suppliers that fail together are.**

### ▶ [Play it live: indiaclarke03-ops.github.io/StockpileStrategist](https://indiaclarke03-ops.github.io/StockpileStrategist/)

To play locally, open `site/v4/index.html` in a browser. There's no build step, server or API keys.

## The five acts

| Act | What happens | Under the hood |
|---|---|---|
| **0 · Cold open** | A globe with real US import arcs, and a live countdown to 10 Jan 2027, when China's rare-earth pause expires | globe.gl · Tradeverifyd Comtrade flows · Tavily headline ticker |
| **1 · Mission** | Pick a mineral: Dy (magnets), Sb (shells), Ga (radar) or Co (batteries). Then set the shortfall that stops your line | — |
| **2 · Fault lines** | Guess the two suppliers behind a loss. Node sizes then **morph** from share of supply to share of the inferred loss. "Follow it upstream" finds the hidden single point of failure | Reverse stress test `a = L·Σ1/(1ᵀΣ1)` in `site/v4/rst.js` |
| **3 · Defences** | Stockpile, pull Sayari ownership files and sign real offtakes. Watch your **distance to disaster** (σ) move. China-linked "alternatives" snap to the China cluster | `sim.js` cost model · Sayari / Tradeverifyd vetting |
| **4 · History strikes** | The real 2023–26 events replay against your defences, with a do-nothing ghost and four decision pauses. A validation card reports Match / Partial / Miss honestly | Unchanged `sim.js` engine · cited events · Tavily intel |
| **5 · The cliff** | 1,000 simulated futures draw in, split by cliff branch. Then a report card, benchmarks and a shareable PNG | Unchanged `montecarlo.js` · Tavily news signal |

### How you know what to do, and what your decisions did

- **Coach bar (both modes).** It tells you the current step and why it matters, and ticks steps off as you complete them.
- **Live previews before you commit:**
  - Stockpile sliders recompute the distance to disaster, cost, price impact and runway as you drag.
  - Act 3 adds a distance-vs-stockpile curve you can click, plus three stress tests.
  - Each Act 4 decision shows its cost and impact before you choose.
- **Live explorers:**
  - Act 2 correlation and volatility sliders re-morph the fault lines.
  - Act 5 what-if sliders (extra reserve, news signal, threshold, branch filter) re-run 1,000 futures instantly.
- **Consequences explained:**
  - Every quarter shows where supply came from: imports, offtakes, reserve, or unmet.
  - It shows what doing nothing would have cost.
  - It shows **what governments and industry actually did** that quarter (DLA awards, DoD price floors, JOGMEC, EU).
- **Decision ledger.** Every choice is listed with its measured effect (Δσ, Δ$, Δ runtime, Δ downtime).

**Analyst mode** ([`site/classic/`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/classic/)) runs all six minerals quarter by quarter. It has:
- the same coach bar and a clickable 14-quarter history strip;
- a mineral detail panel with the real price path against cited points;
- sliders with a live impact preview, including distance to disaster from each mineral's supply network;
- a supply-mix breakdown and real-world counterparts after every commit;
- a live forward mode at the end.

Shortcuts: [`#ff=2024Q4`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/classic/index.html#ff=2024Q4) · [`#ff=END`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/classic/index.html#ff=END).

**v4 shortcuts:** [`#act=2&m=antimony`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/v4/#act=2&m=antimony) jumps to the antimony fault-line reveal. [`#act=3&m=dysprosium`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/v4/#act=3&m=dysprosium) jumps to the dysprosium defences. Press Enter for the primary action, ←/→ to move between choices, and Esc to close drawers.

## The networks: what's measured, what's illustrative

| Mission | Network | Badge |
|---|---|---|
| **Antimony** | **Measured.** Sayari bills of lading, HS 811010, monthly kg from 2023-01 to 2026-10, aggregated to quarters (15 quarters, λ = 0.3). It has 7 suppliers, 10 feed sources and 7 evidenced links | none |
| **Cobalt** | **Measured.** Sayari bills of lading, HS 810520, 450 shipments over 46 months. Six suppliers: Japan's Sumitomo (45%) runs on Indonesian and Philippine feed; China/HK (15%) is about 64% DRC-fed. DRC Katanga emerges as the hidden single point of failure | none |
| **Dysprosium** | **Real structure, illustrative variance.** BIS Section 232 and Comtrade shares, Sayari company IDs, evidenced links. Sayari shipment search ignores date filters, so σ is assumed | "Illustrative network — not measured" |
| **Gallium** | **Real structure, illustrative variance.** USGS MCS 2026 import shares: Canada (5N Plus) 28%, Japan 22%, China 18%, Germany 16%. Sayari holds only 6 gallium-metal lots in 46 months, so no series could be built | "Illustrative network — not measured" |

Honesty note: the antimony Σ is estimated from 2023–26 shipments, so its Act 4 history check is **in-sample**. The validation card says so.

## Real prices drive history

Historical prices follow **cited real price paths**, not assumed multipliers. That's 107 Fastmarkets/Argus/Benchmark points gathered via Tavily (`data/prices/anchors.json`). Gaps are interpolated and flagged. Your own buying still pushes the price up on top, and decays. Dysprosium uses the ex-China price a Western reserve actually pays. Gathering the points exposed several model assumptions that were wrong: gallium kept rising after the truce, to about 10× its 2023 level; graphite fell after its controls; antimony peaked in mid-2025. Event cards now say "price: real path" wherever the engine follows reality. To return to the assumed multipliers, set `CONFIG.realPrices = false`.

## How the tools power it

| Tool | What's cached in `/data` | Where it shows up |
|---|---|---|
| **Tavily** | 60 dated news items from the 90 days before each quarter (`intel/quarters.json`); a forward news signal (`signals.json`); 107 cited price points (`prices/anchors.json`); 58 real government and industry actions, 2023–26 (`responses.json`) | Intel briefings, real price paths, "what the real world did" panels, cliff branch weights |
| **Tradeverifyd** | UN Comtrade US import flows (`trade/trade.json`), copper price, disruption checks (`live.json`), entity scores | Globe arcs, teaching-network shares, offtake scores |
| **Sayari** | Antimony and cobalt bills of lading; dysprosium and gallium supplier structure (`network/*.json`); ownership, watchlist and risk flags for 15 real producers (`counterparties.json`) | Fault-line networks and links, distance to disaster in both modes, investigate and trap mechanics |

`scripts/build_data.py` bundles `/data` (including `network/*.json`) into `site/data_cache.js`. `scripts/fetch_intel.py` and `scripts/live_signals.py` refresh the Tavily data (`TAVILY_API_KEY`). The Sayari and Tradeverifyd caches came from their MCP tools, and each file lists its calls in `method` / `source`.

```
python3 scripts/build_data.py   # after any change in /data
node tests/rst.test.js          # reverse-stress engine: atlas example, sum-to-L, clipping, d monotonicity, back-prop
```

## Honesty rules

- **No foresight.** Intel is dated before its quarter. Trade years only show once they're complete. Act 4 pauses use only headlines that were already published.
- **Reverse stress results are conditional, not forecasts.** σ-distances aren't probabilities. Act 5 reports counts of *simulated* futures.
- **Reported vs assumed** is labelled everywhere, and illustrative networks carry a badge.
- **Real companies, proportionate mechanics.** Sayari flags are findings, not allegations. Trade-link adjacency counts as low risk. Sub-tier labour flags are a detention risk. China-linked minority holders aren't treated as control. Deal terms are game calibrations.
- Reverse-stress logic is adapted from the [Ethical Tech CoLab Resilience Atlas](https://ethical-tech-colab.github.io/reverse-stress/) (teaching material, not a validated product).

## Files

| Path | What it holds |
|---|---|
| `site/v4/` | Story mode: `guide.js` (coach bar, ledger, impact chips), `acts.js` (router, HUD, Acts 0–3), `rst.js` (reverse-stress engine), `missions.js` (missions + network models), `network.js` (graph and morph), `globe.js`, `replay.js` (Act 4), `futures.js` (Act 5), `share.js`, `v4.css` |
| `site/classic/` | Analyst mode: the six-mineral dashboard, redesigned (coach, history strip, detail panel, live previews, ledger) |
| `site/data.js`, `integrate.js`, `sim.js`, `montecarlo.js`, `data_cache.js` | Shared data and engines. `montecarlo.js` gained an optional per-path `track` output; its maths is unchanged |
| `data/` | Cached tool results; `data/network/` holds the v4 supply networks |
| `tests/rst.test.js` | Node tests for the reverse-stress engine |
