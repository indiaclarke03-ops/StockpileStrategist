# Stockpile Strategist

*A critical-minerals reserve game played on real events, real trade data and live intelligence.*

You run America's critical-minerals reserve with $12B, the size of Project Vault. You play 14 quarters of real history (Q3 2023 → Q4 2026): export bans, quotas, price shocks and a truce. Then 1,000 Monte Carlo futures test your reserve against the real 10 January 2027 cliff, when China's suspension of its expanded rare-earth controls expires.

**Play:** open `site/index.html` in a browser. There's no build step, server or API keys. On GitHub Pages, the repo root redirects to `site/`.

**Demo shortcuts:** `site/index.html#ff=2024Q4` jumps to the December 2024 ban, and `#ff=END` jumps to the end screen and forward mode. Press Enter to commit a quarter or continue.

See `concept.md` and `specification.md` for the design.

## How the tools power it

| Tool | What's cached in `/data` | Where it shows up |
|---|---|---|
| **Tavily** | 60 dated news items, 3–5 per quarter, each from the 90 days *before* the quarter starts (`intel/quarters.json`). A forward-mode news signal from the past week's headlines, scored with a published keyword lexicon (`signals.json`). | Intel briefing panel. Forward-mode signal slider and its "why" table. |
| **Tradeverifyd** | UN Comtrade US import flows per HS code (`trade/trade.json`), copper benchmark, disruption checks for producing regions (`live.json`), entity scores for counterparties. | China's 2023 share sets each mineral's exposure in the model. China-share trend on each card, supply map, header copper price, forward-mode disruption toggles, offtake scores. |
| **Sayari** | Supplier-country concentration and supplier risk-flag counts per HS code (`trade/trade.json`). Beneficial owners, watchlist and risk factors for 13 real producers (`counterparties.json`). | Map caption (HHI, risk flags). Offtake modal: ownership, flags and block risk. Two cheap cobalt "alternatives" have China-based owners. |

Tool calls run ahead of time and are cached, so no keys reach the browser (spec §1.3). `scripts/build_data.py` bundles `/data/*.json` into `site/data_cache.js`, so the site also works from `file://`. `scripts/fetch_intel.py` and `scripts/live_signals.py` re-fetch the Tavily data through its REST API (`TAVILY_API_KEY`). The Sayari and Tradeverifyd caches were produced through their MCP tools, and each JSON records the calls in its `method` and `source` fields.

```
python3 scripts/fetch_intel.py     # optional refresh (needs TAVILY_API_KEY)
python3 scripts/live_signals.py    # optional refresh
python3 scripts/build_data.py      # always run after changing /data
```

## Honesty rules

- **No foresight.** Intel items are dated before their quarter starts, which is checked at build and again at load. Trade figures only show calendar years that had finished before the current quarter.
- **Reported vs assumed.** Event effect sizes are tagged `reported` or `assumed`. Modelled price points are drawn hollow and dashed. Every tunable number lives in `site/data.js`.
- **Real companies, proportionate mechanics.**
  - Flags are Sayari findings, not allegations.
  - A trade link to a sanctioned party counts as adjacency (low risk), not a listing.
  - A sub-tier forced-labour flag carries a UFLPA detention risk, not Chinese-control exposure.
  - A China-linked minority holder with no stake size is disclosed but isn't treated as control.
  - Deal terms (upfront cost, volume, lag) are game calibrations.
- **Known data limits** are listed in the in-game "About the data" page. For example, Comtrade US imports cover only China, Japan, Korea and Mexico, gallium and germanium share basket code 811292, and there are no minor-metal price feeds.

## Files

| File | What it holds |
|---|---|
| `site/data.js` | Minerals, the cited 2023–26 event timeline, fallback counterparties, forward-mode base rates, config |
| `site/integrate.js` | Merges cached tool data into the game and maps Sayari flags to game effects |
| `site/sim.js` | Quarter engine (spec §4), scoring, benchmark strategies |
| `site/montecarlo.js` | Forward mode (spec §7): 1,000 futures, the cliff branch, bisection recommendations |
| `site/map.js` | Supply map (D3 + world-atlas from a CDN; falls back to a list offline) |
| `site/app.js`, `site/styles.css` | Dashboard UI (spec §8) |
