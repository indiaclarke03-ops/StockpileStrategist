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

### How the simulation mirrors a real shortage

The **reverse stress test** (start from the shortage you can't afford, work back to its most likely cause) finds the weak spots. The same networks now drive the history replay too: each mineral's exposure is the China-linked share of its supply network (direct, or via ownership and feedstock), and for cobalt the DRC-fed share.

- **Factories ration before they stop.** Substitutes cover part of a gap as alternatives ramp up over about two quarters, for example ferrite magnets or LFP batteries. A gap below your threshold means *rationing*; above it, the line *stops*.
- **Release rules matter as much as size.** You choose when stored supply goes out (at once, or held for big shocks) and who gets it first (defence, evenly, or factories). Defence shortfalls cost twice as much public trust.
- **Deals run late.** Delivery shows "promised vs actual" when a deal starts.
- **Money follows the fiscal year.** It arrives in tranches each October, and 25% of anything unspent lapses on 30 September.
- **Allies compete for supply.** When Japan or the EU make real purchases or deals (from the Tavily-sourced actions dataset), you can buy less that quarter.
- **Officials' look-back.** Each decision shows months of imports stored, the six-month price trend, and how many non-China suppliers are producing.
- **The 2027 dysprosium outlook is fixed.** If the pause ends, the suspended October 2025 controls now return on top of the April 2025 heavy-rare-earth controls.
- **Trade data covers all partner countries.** UN Comtrade public API (`scripts/fetch_comtrade.py`), not just four corridors. China's real share of US antimony imports, for example, was about 13% in 2023, not the 93% the corridor data implied.
- **The data refreshes weekly.** A GitHub Action re-runs the news signal (if a `TAVILY_API_KEY` secret is set) and Comtrade.

### Clarity aids

- A one-line **"what changed and why"** note after every action, always in the same place.
- **First-run pointers** that appear once; **Show me** replays them.
- A **globe intro** to the real trade routes on the supply-chain step.
- A **no-stockpile twin factory** running beside yours during the replay.
- A **20-second animated recap** on the results step.
- A one-page **policy briefing** to print or save as PDF.
- Analyst mode shows two columns by default, with **Riskiest first** and **More columns** toggles.

### Story mode in 14 short steps

Each screen has one idea and one action, with Back/Next in the same place every time:

1. Choose a mineral
2. Your factory's limit
3. The supply chain
4. Quiz
5. The weak spots
6. The hidden weak point
7. Build a stockpile
8. Supply deals
9. Plan how you'll use it
10. Check your plan
11. Live through 2023–26
12. Your results
13. The 2027 deadline
14. Your report

The **live supply chain panel** stays beside the step and reacts to what you do. Your stockpile tank fills as you buy. In the 2023–26 replay, supply lines thin with "−x%" when restrictions hit, the tank drains as stored supply keeps the factory running, the factory lamp turns red when the line stops, and deals light up once they deliver. Analyst mode shows the same graph for any mineral in its "Supply chain" tab.

### Written for newcomers

- **Plain language throughout.**
  - The front page explains the situation in three cards: the problem, the 10 January 2027 deadline, and your job.
  - Every step opens with a plain "what you'll do here".
  - Jargon is replaced: "distance to disaster (σ)" becomes a **safety margin** ("your factory could survive a shortage 2.6× worse than a typical bad quarter"), shown in zones from Danger to Very safe. "Days of cover" becomes days of supply stored, "offtake" becomes supply deal, "political capital" becomes public trust.
- **Key terms** opens a plain-English glossary (`site/v4/plain.js`, shared by both modes). The maths sits in "for experts" drawers.

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

**Analyst casebook** ([`site/classic/`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/classic/)) works through 11 real US decisions from August 2023 to September 2026. Examples: the gallium licences, the December 2024 ban, the MP Materials deal, the DLA's first stockpile buys, Project Vault.

- **Each case** shows what officials could know at the time. You choose, then see what the US actually did, with sources, and what *every* option would have led to through 2026.
- **Same simulation for every option:** each runs from your position, with the same engine and random seed.
- **Three paths in lockstep:** you, the real US, and no action.
- **The review** gives the best path in hindsight, a playbook of what worked, and a 2027 test of every path against 1,000 futures, with how much to hold to be safe.
- **A slider** sets how much a lost factory day is worth, to show how conclusions shift.

[**Methods & sources**](https://indiaclarke03-ops.github.io/StockpileStrategist/site/methods.html) covers the reverse-stress maths, the engine, assumptions, datasets, known limits and every cited reference. It's generated from the cached data.

Shortcuts: [`#ff=2024Q4`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/classic/index.html#ff=2024Q4) · [`#ff=END`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/classic/index.html#ff=END).

**v4 shortcuts:** [`#step=answer&m=cobalt`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/v4/#step=answer&m=cobalt) jumps to the cobalt weak-spot reveal. [`#step=store&m=dysprosium`](https://indiaclarke03-ops.github.io/StockpileStrategist/site/v4/#step=store&m=dysprosium) jumps to building a dysprosium stockpile. Press Enter for the primary action, ←/→ to move between choices, and Esc to close drawers.

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
| `site/classic/` | Analyst casebook: `cases.js` (11 real decisions, cited), `paths.js` (path engine and counterfactuals), `app.js` |
| `site/methods.html` | Methods & sources page |
| `site/data.js`, `integrate.js`, `sim.js`, `montecarlo.js`, `data_cache.js` | Shared data and engines. `montecarlo.js` gained an optional per-path `track` output; its maths is unchanged |
| `data/` | Cached tool results; `data/network/` holds the v4 supply networks |
| `tests/rst.test.js` | Node tests for the reverse-stress engine |
