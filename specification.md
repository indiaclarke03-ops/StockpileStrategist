# Stockpile Strategist — Specification

Companion to `concept.md`. Written for a one-day hackathon build.

---

## 1. Design principles

1. **Real events, honest numbers.** Every event's date, actor and direction of effect comes from cited reporting. Effect *sizes* use reported moves where they exist (e.g. "antimony +40% the day after the US ban"). Anything assumed is labelled `assumed` in the data files and shown with a dotted line in the UI.
2. **Normalised volumes.** Each mineral's national demand is 100 units per quarter, and the reserve is measured in **days of cover** (DoC). Real tonnages are an optional calibration layer (§9). This keeps the game true to the timing and size of shocks without inventing national consumption figures.
3. **No API keys in the browser.** Tool calls run in a small fetch script or serverless proxy and are cached as JSON. The game itself is a static site (GitHub Pages friendly).
4. **No hidden foresight.** In historical mode, the intel briefing only uses news published *before* the quarter starts.

---

## 2. Architecture

```
/data
  events.json          # historical event timeline + effects (hand-curated, cited)
  minerals.json        # per-mineral parameters (demand, depth, elasticity, HS codes)
  prices_index.json    # quarterly price index anchors (sourced) + interpolation flags
  intel/Q3-2023.json … # cached Tavily briefings per quarter
  trade/*.json         # cached Tradeverifyd trade flows + Sayari supplier facets
  counterparties.json  # offtake candidates + Sayari/Tradeverifyd vetting results
/scripts
  fetch_intel.py       # Tavily (date-filtered) → /data/intel
  fetch_trade.py       # Tradeverifyd tia_trade_flow + Sayari search_trade_facets → /data/trade
  vet_counterparty.py  # Sayari + Tradeverifyd vetting → counterparties.json
  live_signals.py      # forward mode: Tavily news + Tradeverifyd disruptions → signals.json
/site
  index.html  app.js  sim.js  montecarlo.js  styles.css
```

- **Stack:** vanilla JS or React plus Chart.js or D3. Python scripts call the APIs.
- **Live mode:** a single serverless function (Vercel or Cloudflare Worker) wraps `live_signals.py` logic so forward mode can refresh during the demo. If it fails, fall back to cached `signals.json`.

---

## 3. Game state

```js
state = {
  quarter: "2023Q3",
  budget: 12_000,            // $M, mirrors Project Vault's $12B
  politicalCapital: 100,     // falls with shortages, waste, and tainted deals
  minerals: {
    gallium: {
      reserveDoC: 0,         // days of cover held
      avgCost: 0,            // $M per DoC, for mark-to-market
      priceIdx: 100,         // ex-China price index, 2023Q2 = 100
      importAvail: 1.0,      // share of normal imports available this quarter
      chinaShare: 0.0,       // set from trade data (§6)
      offtakes: []           // {counterpartyId, DoCPerQ, startQ, risk}
    }, …
  },
  industryDowntimeDays: 0,
  log: []
}
```

---

## 4. Simulation model (per quarter, per mineral `m`)

### 4.1 Import availability

```
cut_m(t)    = Σ active events: eventCut × chinaShare_m × targetFactor
rerouted_m  = cut_m × (1 − e^(−rerouteRate_m × quartersSinceEvent))
importAvail = 1 − cut_m + rerouted_m + offtakeDelivered_m / 100
```

- `targetFactor` is 1.0 when the US is explicitly targeted (e.g. Dec 2024 ban) and 0.5 for licensing regimes that slow but don't stop flows (`assumed`).
- `rerouteRate_m` reflects leakage and substitution. The antimony calibration example uses Tradeverifyd Comtrade data: US imports of HS 811010 from China fell from $10.39M (2024) to $3.20M (2025), while imports from Korea rose from $0.21M to $3.26M.

### 4.2 Shortfall and industry damage

```
supply        = 100 × importAvail + release_m      (units/quarter)
shortfall_m   = max(0, 100 − supply)
downtimeDays += shortfall_m × criticality_m × 0.9  (≈ days of a 91-day quarter lost)
politicalCapital −= shortfall_m × 0.2
```

`criticality_m` (0–1) sets how hard a shortage hits factories. Magnets (dysprosium) are high, anchored by real outcomes: Ford idled its Chicago Explorer plant in May 2025 and Suzuki halted Swift production on 26 May 2025.

### 4.3 Price

```
priceIdx_m(t) = priceIdx_m(t−1)
              × Π eventPriceMultipliers(t)
              × (1 + η_m × playerBuy_m / marketDepth_m)   // your buying moves price
              × (1 + panic_m)                              // others' stockpiling
              × meanReversion_m(t)
```

- `marketDepth_m`: small for gallium, germanium and dysprosium, large for cobalt and graphite (`assumed`, tunable).
- `panic_m`: +X% when a control is announced but not yet in force, decaying over two quarters. This captures the November 2023 pre-ban graphite buying and the Japan 2010–11 lesson.
- `meanReversion_m`: pulls price 15%/quarter back toward 100 when no event is active (`assumed`). Truce events apply negative multipliers.
- **Ex-China vs China price.** Dysprosium tracks the *ex-China* price, because that's what a Western reserve pays. Reported spreads are about 4.9× (Aug 2026, Fastmarkets) and about 16.3× CIF Europe vs DDP China at end-Q3 2026 (Benchmark). The UI shows the spread.

### 4.4 Cost of buying

```
cost($M) = DoC × baseCost_m × priceIdx_m / 100
storage  = 0.5% of reserve value per quarter   (assumed)
```

### 4.5 Offtake deals

- Pay an upfront $M. Deliveries start after a lag `L` (4–12 quarters, drawn from a distribution) at `DoCPerQ`.
- Each quarter, a 20% chance of slipping one more quarter (`assumed`; mine and refinery projects routinely slip).
- **Vetting (Sayari + Tradeverifyd, §6.3)** sets three things:
  - `ownershipFlag`: if the ultimate owner is Chinese state-linked, the deal is subject to Chinese controls and `cut` applies to its deliveries.
  - `riskFlags`: forced labour, sanctions adjacency, environmental. Each adds a per-quarter probability of the deal being blocked (e.g. a UFLPA detention) and a one-time political-capital penalty.
  - `entityScore`: the Tradeverifyd score, shown to the player.

### 4.6 Scoring (end of campaign)

```
score = 40 × (avg min-DoC across minerals / 60, capped at 1)
      + 30 × (1 − downtimeDays / worstCaseDowntime)
      + 15 × (budgetEfficiency = value protected / $ spent)
      + 15 × (politicalCapital / 100)
```

Grades are benchmarked against named strategies run through the same engine:

- **"Do nothing"**
- **"JOGMEC 60-day":** hold 60 DoC on everything from turn 1.
- **"Panic buyer":** buy only after announcements.
- **"Perfect hindsight":** the upper bound.

---

## 5. Historical event timeline (`events.json`)

Effects marked † are reported figures. The rest are `assumed` calibrations to tune.

| Quarter | Event | Mineral(s) | Effect in model |
|---|---|---|---|
| 2023Q3 | China export licensing on gallium and germanium from 1 Aug 2023 | Ga, Ge | cut 0.5 (licensing); Ga price ×1.27† initially |
| 2023Q4 | Graphite licensing announced 20 Oct, in force 1 Dec 2023; Chinese flake exports −94% m/m in Dec† | Graphite | panic +10% in Nov; cut 0.5, but price ≈ flat because of weak demand† (the "shock that fizzled") |
| 2024Q1–Q2 | No direct US cuts; Ga/Ge exports to the US effectively zero through Oct 2024† | Ga, Ge | cut persists; rerouting begins |
| 2024Q3 | Antimony controls from 15 Sep 2024; China's antimony exports −97% in Oct† | Sb | cut 0.5, price ×1.5 (assumed) |
| 2024Q4 | 3 Dec 2024: China bans Ga, Ge and Sb exports to the US | Ga, Ge, Sb | targetFactor 1.0; Sb price ×1.40 next day†; cumulative Ga +80%, Ge +50% since curbs† |
| 2025Q1 | DRC cobalt export ban (Feb 2025) | Co | cut 0.7; Co metal ×~1.5, hydroxide ×2+† |
| 2025Q2 | 4 Apr 2025: China licences 7 heavy REEs (Sm, Gd, Tb, Dy, Lu, Sc, Y) | Dy | cut 0.8; European Dy ≈ tripled in a month†; Ford and Suzuki shutdowns trigger downtime |
| 2025Q4 | 9 Oct: expanded extraterritorial REE controls. 16 Oct: DRC quota (87,000t base + 9,600t strategic)†. Nov: US–China truce, one-year suspension, general licences for Ga/Ge/Sb† | Dy, Co, Ga, Ge, Sb | Dy cut spike then partial relief; Ga/Ge/Sb cut −50% (truce); cobalt hydroxide ~4× from pre-ban† |
| 2026Q1 | 2 Feb: Project Vault, $12B, ~60-day buffer†. Jan: China dual-use controls targeting Japan† | all | narrative: the player's real-world counterpart arrives; allied-demand panic +5% on Dy |
| 2026Q2 | Apr: DRC quota rules lift supply, cobalt −2.5% in two days†. 22 Jun: China adds 10 US firms incl. MP Materials to its control list†. 30 Jun: DRC forfeits unused quotas† | Co, Dy | Co mean-reversion; Dy offtakes with US producers face a new upstream risk |
| 2026Q3 | Ex-China heavy REE surge: Dy CIF Europe +150% in the quarter, 16.3× China price† | Dy | Dy price ×2.5† |
| 2026Q4 | 9 Nov: suspension extended to **10 Jan 2027**; April 2025 HREE controls stay† | Dy and others | campaign ends; hand-off to forward mode |

### Event schema

```json
{
  "id": "cn-ban-ga-ge-sb-us-2024-12",
  "quarter": "2024Q4",
  "date": "2024-12-03",
  "actor": "China MOFCOM",
  "minerals": ["gallium", "germanium", "antimony"],
  "effects": {
    "antimony": { "cut": 1.0, "targetFactor": 1.0, "priceMult": 1.40, "priceMultSource": "reported" },
    "gallium":  { "cut": 1.0, "targetFactor": 1.0, "priceMult": 1.15, "priceMultSource": "assumed" }
  },
  "headline": "China bans exports of gallium, germanium, antimony to US",
  "sources": ["https://www.kitco.com/news/off-the-wire/2024-12-03/china-bans-export-critical-minerals-us-trade-tensions-escalate"],
  "lesson": "Retaliation can be immediate; prior curbs had already zeroed direct flows."
}
```

---

## 6. Tool integration

### 6.1 Tavily: intel briefings and live signals

**Historical briefings** (run once, cache per quarter):

```python
tavily_search(
  query="China export controls gallium germanium",   # per-mineral query bank
  end_date=quarter_start,                             # no foresight
  start_date=quarter_start - 90d,
  max_results=5, topic="news")
```

- Show 3 headlines plus the source domain, so the player decides on what was knowable at the time.
- "What actually happened" cards come from `events.json` sources. `tavily_extract` can pull a one-line summary.

**Forward signals** (live):

```python
tavily_search(query="China rare earth export control suspension January 2027",
              time_range="week", topic="news")
```

- Score headlines with a keyword lexicon: escalation terms (`ban`, `tighten`, `control list`, `retaliat*`) count +1, de-escalation terms (`extend suspension`, `general licence`, `truce`) count −1.
- `signal ∈ [−1, 1]` shifts event probabilities (§7). The lexicon and its matches are shown in the UI for transparency.

### 6.2 Tradeverifyd: trade flows, disruptions, scores

| Call | Use |
|---|---|
| `tia_trade_flow(hs_code, reporter="USA", years=3)` | `chinaShare_m` and rerouting evidence. Covered corridors include USA↔CHN, USA↔MEX/JPN/KOR, CHN↔DEU, CHN→VNM; the tool reports gaps in `limitations`. |
| `tia_get_disruptions(region=…, min_severity="warning")` | Forward-mode random events near producing regions (DRC, Inner Mongolia/Jiangxi, Myanmar for HREE feed, Indonesia). A live critical event adds a supply-cut draw. |
| `search_entities` → `entity_score`, `entity_trade_relationships` | Offtake counterparty vetting score and who they actually trade with. |
| `tia_commodity_price("copper")` | Live copper benchmark for the header ticker (a check found no prices for cobalt, gallium, antimony or nickel; see §10). |

### 6.3 Sayari: concentration, ownership, risk

| Call | Use |
|---|---|
| `search_trade_facets(scope="suppliers", hs_code, arrival_country="USA", date_from="2025-01-01")` | Supplier-country concentration (HHI) and supplier risk flags per mineral. A test on HS 850511 (permanent magnets into the US) returned 28 suppliers, with China the largest bucket (20), and flags including forced labour, Xinjiang-origin sub-tier and sanctions-adjacent. |
| `search_suppliers` | Builds the list of candidate offtake counterparties outside China. |
| `find_beneficial_owners(entity_id)` | Sets `ownershipFlag`. A Chinese-parented "alternative" doesn't diversify. |
| `check_watchlist(entity_id)` | Sanctions, PEP and regulatory hits → block probability. |
| `get_upstream_supply_chain(entity_id)` | Optional: shows the player whether the counterparty's own feedstock is Chinese. |

### 6.4 HS code map (`minerals.json`; verify with Sayari `lookup_hs_codes`)

| Mineral | HS proxies |
|---|---|
| Gallium / Germanium | 811292 (shared basket code; label as proxy) |
| Antimony | 811010 (verified in Tradeverifyd) |
| Graphite | 250410 natural, 380110 artificial |
| Dysprosium | 280530 RE metals, 284690 RE compounds, 850511 magnets |
| Cobalt | 260500 ores (verified in tool docs), 810520 intermediates, 282200 oxides |

---

## 7. Forward mode: Monte Carlo (2027Q1–2027Q4)

**Base rates.** Count actor actions per quarter in the 2023Q3–2026Q4 timeline:

- China tightening: roughly 8 in 14 quarters → p ≈ 0.55/quarter.
- China easing: about 2 in 14.
- DRC actions: about 4 in 14.

Split by mineral with weights from the timeline.

**Adjustments:**

- `p_adj = clamp(p_base × (1 + 0.5 × signal), 0.05, 0.95)`
- Scheduled cliff: 2027Q1 has a dedicated branch for the 10 Jan 2027 expiry. Its outcomes are extend again, lapse (expanded controls return) or new deal. Default weights are 0.45 / 0.35 / 0.20 (`assumed`), shifted by the Tavily signal.
- A live Tradeverifyd disruption in a producing region adds a 10–30% supply-cut draw for that quarter.

**Run:**

- 1,000 paths × 4 quarters against the player's *frozen* strategy, i.e. their current reserve plus standing orders.
- Event effect sizes are sampled from the empirical range of historical effects (e.g. Dy price multiplier ∈ [1.2, 3.0]).

**Output:**

- Fan chart of DoC (P10/P50/P90) per mineral.
- Probability of falling below 30 and 60 DoC.
- Expected downtime days.
- A "minimum reserve to stay above 60 days in 90% of futures" recommendation per mineral, found by bisection.

---

## 8. UI (single dashboard)

```
┌ Header: Quarter · Budget $M · Political capital · Copper (live) · Next cliff: 10 Jan 2027 ┐
├ Left: INTEL BRIEFING (Tavily headlines, date-stamped)  │ Centre: SIX MINERAL CARDS            │
│   Event probability gauge (forward mode)               │  DoC bar (target line at 60/180)     │
│                                                        │  price index sparkline (China vs ex-China for Dy) │
│                                                        │  import availability %               │
│                                                        │  [Buy] [Release] [Offtake…]          │
├ Bottom-left: WORLD MAP — supplier concentration (Sayari), active disruptions (Tradeverifyd)   │
├ Bottom-right: CONSEQUENCES LOG + "What actually happened" card with source link             │
└ End screen: score vs benchmark strategies · forward Monte Carlo fan charts                    ┘
```

**Offtake modal.** A candidate list, each with:

- Country and owner (Sayari beneficial owners).
- Risk chips (Sayari risk factors and watchlist).
- Tradeverifyd score.
- Lag and price.

Picking a flagged supplier triggers a confirmation that explains the risk.

---

## 9. Optional real calibration

To move from normalised to real tonnages, put a 2025 US net import figure per mineral in `minerals.json` (`realQuarterlyDemandTonnes`), sourced from the USGS Mineral Commodity Summaries 2026. The game then shows tonnes and $ alongside DoC. Leave it off if the figures can't be verified in time.

---

## 10. Known data limits (found while testing the tools)

- **Prices.** Tradeverifyd `tia_commodity_price` returned no data for cobalt, gallium, antimony or nickel; copper worked (USD/lb, dated 2026-09-01). Minor-metal prices therefore come from `prices_index.json`, which is anchored to cited reported moves and interpolated elsewhere. Interpolated points are flagged and drawn dotted.
- **HS trends.** `tia_hs_trends` reported that its scan hasn't run in this environment. Treat it as optional and don't build on it.
- **Trade coverage.** `tia_trade_flow` covers a fixed set of corridors plus European reporters, so `chinaShare_m` falls back to Sayari supplier facets where Comtrade corridors are missing.
- **Shared HS codes.** Gallium and germanium share basket codes, so trade-derived shares for them are proxies.

These limits should appear on an "About the data" page.

---

## 11. One-day build plan

| Time | Task |
|---|---|
| 0:00–1:00 | Repo, static shell, `events.json` from §5, `minerals.json` with defaults |
| 1:00–2:30 | `sim.js` (§4) plus unit checks: "Do nothing" vs "JOGMEC 60-day" should diverge sharply in 2025Q2 |
| 2:30–3:30 | Fetch scripts: Tavily briefings for 14 quarters, Tradeverifyd trade flows for 6 HS codes, Sayari facets for 6 HS codes; cache to `/data` |
| 3:30–4:30 | Dashboard UI: mineral cards, intel panel, consequences log |
| 4:30–5:30 | Offtake modal with Sayari/Tradeverifyd vetting for about 8 pre-fetched counterparties |
| 5:30–6:30 | Forward mode Monte Carlo and fan charts; live-signal refresh with cached fallback |
| 6:30–7:00 | Benchmark strategies, end screen, About-the-data page |
| 7:00+ | Rehearse the 3-minute demo: play 2024Q4 → 2025Q2 live, then forward mode |

## 12. Demo script (3 minutes)

1. "It's July 2023. You run America's mineral reserve." Show the intel panel.
2. Skip to 2024Q4. The ban hits, and antimony jumps 40% the next day. Show the "What actually happened" card.
3. In 2025Q2, the player without a dysprosium reserve watches downtime climb, with the Ford and Suzuki cards appearing.
4. In the offtake modal, the cheapest "non-Chinese" supplier turns out to have a Chinese owner or forced-labour flags (Sayari).
5. Forward mode: 10 January 2027 is seven weeks away. The fan chart shows the reserve needed to stay above 60 days in 90% of futures.

---

## 13. Sources (seed list for `events.json`)

- Project Vault: https://www.jdsupra.com/legalnews/breaking-china-s-stranglehold-trump-s-2105337/ · https://www.mining.com/trump-plans-12b-minerals-vault-to-cut-china-reliance · https://www.3dtested.com/tech-industry/trump-administration-plans-12bn-critical-minerals-stockpile-to-offset-china-supply-risk
- REE suspension extended to 10 Jan 2027: https://www.spglobal.com/energy/en/news-research/latest-news/metals/110926-china-extends-rare-earth-export-suspension-to-january-2027
- 2026 REE enforcement (MP Materials listing, Japan controls): https://www.skillings.net/?p=99800 · https://skillings.net/chinas-critical-minerals-export-controls-what-happens-next-and-who-gets-squeezed-in-2026
- Ga/Ge/Sb ban and price moves: https://www.kitco.com/news/off-the-wire/2024-12-03/china-bans-export-critical-minerals-us-trade-tensions-escalate · https://mhlnews.com/home/news/55247345/china-bans-export-of-critical-minerals · https://2024.minexeurasia.com/?p=2060
- Graphite controls: https://www.fastmarkets.com/insights/chinas-graphite-exports-plunge-in-december-after-introduction-of-export-controls/ · https://www.marketindex.com.au/news/graphite-stocks-have-surged-so-where-do-they-go-from-here
- Cobalt ban, quotas and prices: https://www.mining.com/web/column-can-the-congo-tame-the-wild-cobalt-market · https://www.fastmarkets.com/insights/drc-may-reduce-cobalt-quota-if-market-needs-rebalancing-arecoms-says-exclusive/ · https://www.sunsirs.com/commodity-news/petail-31901.html · https://www.miningweekly.com/article/congo-withdraws-unused-cobalt-export-quotas-2026-06-30
- April 2025 HREE controls and auto shutdowns: https://amp.claimsjournal.com/news/national/2025/06/13/331185.htm · https://www.carscoops.com/2025/06/auto-production-ceasing-over-a-resource-youve-probably-never-heard-of/ · https://news.metal.com/newscontent/103310477/Dysprosium-and-Terbium-Supplies-Are-Tight-Overseas,-Price-Spread-Between-Rare-Earths-at-Home-and-Abroad-Widens-[[SMM-Analysis]]
- Heavy REE price divergence 2026: https://source.benchmarkminerals.com/article/ex-china-heavy-rare-earths-continue-to-surge-q3-2026-rare-earths-price-review · https://www.fastmarkets.com/?p=135475
- Japan / JOGMEC lessons: https://www.inkl.com/news/japan-takes-steps-to-secure-rare-metal-supply · https://rusi.org/explore-our-research/publications/commentary/japans-responses-chinas-supply-chain-dominance
