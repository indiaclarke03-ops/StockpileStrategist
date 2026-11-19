# Stockpile Strategist v4 — "Find the Fault Lines" · Build Brief for Claude Code

> **Read this whole file before writing code.** It tells you what to keep from v3, what to change, and how to build v4. It blends two things:
> 1. The live v3 game (`site/`), a 14-quarter historical reserve game.
> 2. The **reverse stress testing** logic from the Ethical Tech CoLab Resilience Atlas (https://ethical-tech-colab.github.io/reverse-stress/).
>
> The goal for v4: a game someone *wants* to play within 10 seconds, that teaches one big idea, and that looks like a frontier demo.

---

## 0. TL;DR for the agent

- **Keep:** `sim.js`, `montecarlo.js`, `integrate.js`, `data.js` and everything in `/data`. Keep the honesty rules from the README: no foresight, reported vs assumed, Sayari flags are findings and not allegations.
- **Add:** `site/v4/`, a new story-driven experience with five screens ("acts"). It uses a new reverse-stress engine (`rst.js`) and a new network data file per mineral.
- **Move:** the current v3 dashboard becomes **"Analyst mode"** (`/site/classic/`), linked from the v4 end screen. Don't delete it.
- **The big idea the game teaches:** *"Your biggest supplier is not your biggest risk. The suppliers that fail **together** are."*
- **One mineral per run, not six at once.** The player picks a mission, and each mission is one mineral.
- **The visual standard:** an animated globe with flowing trade arcs, a supply-network graph whose nodes *morph* from "share of supply" to "share of the loss", and 1,000 futures drawn as a living fan. Everything moves with purpose, and reduced-motion is respected.

---

## 1. What's wrong with v3 (diagnosis from the live site)

| Problem | Evidence on the live page | v4 fix |
|---|---|---|
| Opens with a wall of text | Intro modal: 4 numbered paragraphs, a benchmark box, then "Take office" | A cinematic cold open with one sentence, a countdown and one button |
| Too many decisions at once | 6 identical mineral cards × ~8 numbers each, plus buy and release steppers | One mineral per mission, and one decision per screen |
| Everything is zero at the start, so nothing looks alive | "0 days of cover", "$0M", "100%", "+$0M" on every card | The first screen shows *real* flows moving (Tradeverifyd and Sayari data) before the player does anything |
| Jargon | DoC, HHI, mark-to-market, political capital, priceIdx | Plain language, with the expert terms kept in "Show the evidence" drawers |
| The orders panel comes before the story | "YOUR ORDERS" is the first panel on narrow screens | The story leads and controls appear only when needed |
| 14 turns × 6 minerals is long | Fast-forward exists because the turns drag | History becomes a ~90-second cinematic replay that pauses at **4 key decision moments** |
| The map and log are at the bottom | The best visual (the map) is below the fold | The globe *is* the stage, and everything else floats on it |
| No "aha" moment | The player reacts to events that are already known | The reverse stress reveal gives the aha (§3, Act 2) |

---

## 2. The blend: how reverse stress testing powers the game

The atlas method is "start with the loss you cannot tolerate, work backward to what could cause it, then forward-test". Each step maps to a game act:

| Atlas step | v4 act | Tools |
|---|---|---|
| 01 Define the function and 02 Set the loss threshold | **Act 1: Choose your mission** | none (curated) |
| Build the network | **Act 2: Map the network** (auto, animated) | Sayari, Tradeverifyd |
| Solve one layer + Back-propagate + Explore alternatives | **Act 2: Find the fault lines** (guess, then reveal) | `rst.js` |
| 05 Choose recovery actions | **Act 3: Build your defences** | Sayari (investigate), Tradeverifyd (scores), `rst.js` |
| 04 Forward-test & validate | **Act 4: History strikes** (2023–26 replay) | Tavily, existing `sim.js` events |
| Decision under uncertainty | **Act 5: The cliff** (10 Jan 2027, 1,000 futures) | existing `montecarlo.js`, Tavily signal |

This is also the atlas's "reverse, then forward" loop. Reverse stress testing *proposes* the dangerous configurations, and real history (Act 4) is the held-out test. That gives the demo its line:

> "Using only the network as it looked in mid-2023, the model said B and C would fail together. Then December 2024 happened."

**Act 4 must be honest about this.** If the reveal did *not* match history for the chosen mineral, say so on screen. That is still a good teaching moment.

---

## 3. The experience, screen by screen

Global rules:
- **One primary action per screen.** The primary button is big and always in the same place (bottom centre).
- **Time to first decision is under 20 seconds.**
- **Every decision shows its consequence within 1 second** through animation: numbers count up or down, nodes resize, arcs dim.
- **Progressive disclosure.** Every number has a small "ⓘ evidence" affordance. It opens a side drawer with source, tool call, reported/assumed badge and caveats. The honesty stays and the clutter goes.
- **Persistent HUD (minimal):** mission name · budget · "Factory runs for X days" gauge · 10 Jan 2027 countdown. Nothing else.

### Act 0: Cold open (5–8 seconds)

- Full-screen dark globe, slowly rotating. Thin glowing arcs show real US import flows for the six minerals, from `trade.json`. Arc thickness is import value, and colour is mineral.
- Headline type animates in: **"52 days until China's rare-earth pause expires. You run America's $12B mineral reserve."** Compute the days live from `2027-01-10`.
- One button: **"Take office"**. A secondary text link reads "How this works (30 sec)".
- Ambient detail: a tiny ticker at the bottom with 3 real, dated, past headlines from `intel/quarters.json`, fading in and out.

### Act 1: Choose your mission (one tap)

Three or four large mission cards in a periodic-table-tile style (element symbol big, atomic number small). Each card shows:
- **The thing that must not stop**, in plain words:
  - Dy: "EV motors and fighter-jet magnets"
  - Sb: "Artillery shells"
  - Ga: "Radar and chips"
  - Co: "Batteries and jet engines"
- **One real hook line:**
  - Dy: "In May 2025, Ford's Chicago plant stopped for a week."
  - Sb: "Antimony jumped 40% the day after China's ban."
  - Ga: "China ended direct gallium exports to the US in 2024."
  - Co: "The DRC banned cobalt exports in February 2025."
- **Difficulty pip** (Dy hard, Sb medium, Ga medium, Co easy).

After choosing, the player sees a **loss threshold slider** with a single sentence: "The line stops if supply falls by more than **[25%]** for a quarter." The default is 25%, matching the atlas's revised-paper threshold, with a range of 10–40%. Show a tiny factory icon that visibly stops when you drag past the threshold, for fun.

**MVP:** build Dysprosium fully first, then Antimony. Ga and Co can ship with clearly labelled synthetic networks (§5.4).

### Act 2: Map the network → Find the fault lines (the aha)

**2a. Map (auto-play, ~6 s).**
- The camera flies from the globe into a **layered network view**:
  - Tier 0: the US plant, at the centre-bottom.
  - Tier 1: import suppliers (countries and companies), in a ring above.
  - Tier 2: their feedstock sources, at the top.
- Nodes appear with a staggered animation. Edges are flows, with particles moving *toward* the plant.
- The node size is **share of supply**. A caption reads: "This is where your dysprosium comes from."

**2b. Guess (the game mechanic).**
- Prompt: **"A 25% shortfall hits. Tap the 2 suppliers you think will cause most of it."**
- Most players tap the biggest nodes. That is the point.

**2c. Reveal (the signature animation, ~2 s).**
- The node sizes **morph** from "share of supply" to "**share of the inferred loss**", using `rst.js` (§4).
- Correlated suppliers glow and links pulse between them.
- Big type:
  > **"These two carry 40% of your supply — but 89% of the risk."**
  
  Generate the copy from the actual numbers.
- Then the player's score for the guess: "You spotted 1 of 2 fault lines."
- **Back-propagation toggle:** "Follow it upstream". The tier-2 nodes light up as each tier-1 loss is pushed to its inputs. If two "different" suppliers converge on the same Chinese refinery, that node pulses red with the label **"Hidden single point of failure"**.
- **Alternatives:** a shimmer of 200 faint alternative loss configurations (§4.4) shows as a halo of thin rings around each node. This shows the answer is a range, not a single story.

**2d. "Show the evidence" drawer** contains:
- The formula `a = L Σ1 / (1ᵀΣ1)` with the actual Σ.
- The data source (Sayari shipments / Tradeverifyd).
- The guardrails, copied from the atlas: it assumes a normal model, uses history only, and its densities are not calibrated probabilities. Results are conditional on the loss happening; it is not a forecast.

### Act 3: Build your defences

The budget is shown as a physical "stack of coins" or a bar. There are three levers, shown as big tiles, with no steppers on the first view:

1. **Stockpile:** "Buy days of runtime". It's a slider with a live preview: the gauge "Factory keeps running for X days" fills as you drag. It uses the v3 cost and slippage model from `sim.js` (`quoteBuy`), so thin markets bite.
2. **Sign an offtake:** this opens a carousel of real counterparties from `counterparties.json`. Each card shows country, owner (Sayari), risk chips and the Tradeverifyd score. Signing one **adds a new node to the network graph live**, and the "distance to disaster" gauge (§4.5) moves.
   - **Trap mechanic (already in v3 data):** some cheap "alternatives" have China-based owners or sub-tier forced-labour flags. If chosen, its edge snaps to the China cluster with a correlation glow, and the gain disappears.
3. **Investigate (Sayari):** spend a small budget to "pull the ownership file" on any supplier. If Sayari shows a shared parent or shared feedstock, the correlation between those nodes rises in front of the player and the loss re-flows. *"Diversification" can get worse as you learn more.* That is honest and dramatic.

**Live readout (the one number that matters):**
- **Distance to disaster:** "Your line is **2.2σ** from stopping → now **3.1σ**."
- Show it with qualitative bands: Fragile < 1.5σ, Exposed 1.5–2.5σ, Resilient 2.5–3.5σ, Hardened > 3.5σ.
- **Never** convert σ to a probability in the UI. It's under the model, and the atlas guardrail applies.

### Act 4: History strikes (forward test, ~90 seconds)

- A horizontal timeline from **Jul 2023 to Dec 2026** plays automatically at about 6 seconds per quarter, using the existing `EVENTS` and `sim.js` step.
- Each event appears as a "breaking news" card with the real headline, date and source (Tavily / `events.json`). The shock **travels along the network edges** as a red pulse. Hit suppliers dim, and the runtime gauge drains or holds.
- The replay **pauses at 4 decision moments**. Each pause offers 2–3 simple choices (buy more / release / sign a deal / hold), with the intel headlines that were knowable then:
  1. **Aug 2023:** China licenses gallium and germanium.
  2. **Dec 2024:** the US ban on Ga, Ge and Sb.
  3. **Apr 2025:** heavy rare-earth controls; Ford and Suzuki stop.
  4. **Nov 2025:** the truce. Do you sell, hold, or keep buying?
- **Validation card** at the end of the replay: "Your reverse stress test flagged X and Y. History hit: Z." It shows match, partial match or miss, honestly.
- A **"What you avoided"** ghost line shows the same replay with no defences (the existing `do nothing` benchmark in `sim.js`).

### Act 5: The cliff: 10 January 2027

- Use the existing `montecarlo.js` with the player's final state.
- **Visual:** 1,000 futures draw in as thin translucent lines over ~3 seconds, on WebGL/canvas. They resolve into a P10/P50/P90 ribbon. Lines that cross below the "line stops" threshold flash red as they cross.
- Big type: **"In 870 of 1,000 futures, your factory keeps running."** This *is* a count of simulated paths. Label it "of the simulated futures", not a probability of reality.
- The three cliff branches (extend / lapse / new deal) appear as a three-way split in the fan. They are weighted by the Tavily signal (`signals.json`), with a "why" drawer showing the headlines and lexicon matches.
- **Report card**:
  - Grade.
  - Guess accuracy (Act 2).
  - Distance to disaster (Act 3).
  - History result (Act 4).
  - Futures survived (Act 5).
  - Comparison to the benchmarks: Do nothing, JOGMEC 60-day, Panic buyer, Perfect hindsight.
- Buttons: **Play another mineral** · **Share result** (renders a PNG card via canvas) · **Open Analyst mode** (v3).

---

## 4. Reverse-stress engine: `site/v4/rst.js`

Pure functions with no DOM, and unit-testable with Node like `sim.js`.

### 4.1 Inputs

For a mission mineral `m`, read `data/network/<m>.json` (§5):
- Tier-1 suppliers `i = 1..n` with monthly shipment volumes `v_i(t)`, where t = month, ideally 24+ months.
- A covariance matrix `Σ` of **absolute monthly volumes**, as in the atlas.
- Optional tier-2 inputs per supplier, with their own Σ.
- Target loss `L = threshold × total monthly demand` (same units as v).

### 4.2 Central solution (one layer)

Under a zero-mean multivariate normal model of supplier losses `x ~ N(0, Σ)`, the most likely configuration satisfying `1ᵀx = L` is:

```
s = 1ᵀ Σ 1
a = L · Σ1 / s          // attributed loss per supplier
```

**Sanity test (must pass; the atlas example):**
- A, B, C deliver 60/25/15 kt with σ = 3/5/4. ρ(B,C) = 0.8, and all other correlations are 0. L = 20 kt.
- Expected `a = [2.20, 10.00, 7.80]` (sum 20), so B+C carry 89% of the loss from 40% of the supply.

### 4.3 Back-propagation (multi-tier)

- Each tier-1 loss `a_i` becomes the target for supplier i's inputs: `a_ij = a_i · Σ⁽ⁱ⁾1 / (1ᵀΣ⁽ⁱ⁾1)`.
- Assume a 1:1 contained-element ratio and label it `assumed`.
- Sum the losses where paths converge on the same tier-2 node. The **largest converged node** is the "Hidden single point of failure".

### 4.4 Alternatives (ranges, not one story)

- The conditional distribution is `x | 1ᵀx = L ~ N(a, Σ − Σ11ᵀΣ / s)`.
- Draw 1,000 samples with a seeded RNG (reuse the Park–Miller RNG from `sim.js`).
- **Clip** each sample to `[0, v̄_i]`, where v̄_i is the supplier's mean flow, because the atlas guardrail says inferred losses can exceed actual flows. Then renormalise to sum to L. Label this step `game adjustment`.
- Output P10/P50/P90 per supplier.
- Note in the evidence drawer: *the paper generates q = 0.5 alternatives and clusters them. v4 samples the conditional normal instead, which is a simplification.*

### 4.5 Distance to disaster (the defence score)

```
d = L_eff / sqrt(1ᵀ Σ_eff 1)
```

- **Stockpile** of S units/month-equivalent → `L_eff = L + S`.
- **Offtake** adds a supplier: move volume w from the existing mix and add node k with σ_k = cv_k · w and ρ from its Sayari classification (0 for clean and independent; 0.8 with China for China-owned or China-feedstock, `assumed`). Rebuild Σ_eff.
  - Model σ as proportional to volume (constant coefficient of variation per supplier), so moving volume changes Σ consistently.
- **Investigate** may raise ρ between linked suppliers (shared owner or feedstock found in Sayari) to the "structural link" value of 0.8 (`assumed`), so d can fall.
- **Calm vs stress Σ toggle (teaching mechanic):** calm Σ is estimated from shipments; stress Σ = calm Σ with structurally linked pairs set to ρ = 0.8 and China-linked σ × 1.5 (`assumed`).
  - Caption: *"Export controls are regime shifts, not normal noise. Correlations from calm years understate how suppliers fail together."*

### 4.6 Bridge to `sim.js`

The Act 3 decisions map to v3 orders:
- Stockpile → `orders.buy[m]` in days of cover. Convert units with `UNITS_PER_DOC`.
- Offtake → `orders.offtakes`.
- Investigate → a new `orders.investigate` that only changes Σ and shows Sayari results. It has no `sim.js` effect beyond a small budget cost.

Act 4 then runs the **unchanged** `sim.js` quarter engine for the chosen mineral, so the history math stays exactly as in v3.

---

## 5. Data work

### 5.1 New file: `data/network/<mineral>.json`

```json
{
  "mineral": "dysprosium",
  "hs": ["850511", "280530", "284690"],
  "fetched": "2026-11-19",
  "demandMonthly": 100,
  "units": "normalised (100 = monthly US demand)",
  "tier1": [
    { "id": "cn-magnets", "label": "Chinese magnet exporters", "country": "CHN",
      "volumes": { "2023-07": 61.2, "...": 0 }, "source": "Sayari search_shipments …",
      "owners": [], "flags": [], "evidence": "reported" }
  ],
  "tier2": [
    { "id": "cn-hree-sep", "label": "Chinese HREE separation", "feeds": ["cn-magnets", "vn-magnet-plant"],
      "share": { "cn-magnets": 0.95, "vn-magnet-plant": 0.8 }, "evidence": "reported|assumed" }
  ],
  "links": [ { "a": "vn-magnet-plant", "b": "cn-magnets", "reason": "Chinese feedstock (Sayari upstream)", "rhoStress": 0.8 } ],
  "sigmaCalm": [[...]],
  "method": "list every tool call used"
}
```

### 5.2 How to fetch it (Claude Code has the Sayari, Tradeverifyd and Tavily MCPs)

1. **Sayari `search_trade_facets`** (scope `suppliers`, `arrival_country=USA`, HS code, `date_from=2023-01-01`) to find the top supplier buckets.
2. **Sayari `search_shipments`** per top supplier or country to build **monthly volume series**.
   - Check first whether monthly granularity is available and dense enough (≥ 18 months).
   - **If not**, fall back to quarterly, or to the synthetic network in §5.4. Never fake a series as reported.
3. **Sayari `get_upstream_supply_chain` / `find_beneficial_owners`** on tier-1 companies, for tier-2 links and structural correlations.
4. **Tradeverifyd `tia_trade_flow`** (already in `trade.json`) for annual country totals. Use it to scale and sanity-check the Sayari series.
5. **Tavily** for evidence of structural links. For example: "Vietnam magnet plant Chinese feedstock". Store the URLs in `links[].evidence`.
6. Add the file to `scripts/build_data.py`, so it lands in `site/data_cache.js`.

### 5.3 Covariance estimation

- Use sample covariance on detrended monthly volumes.
- With fewer than 36 points, apply **Ledoit-Wolf-style shrinkage** toward the diagonal (λ = 0.3, `assumed`) and show λ in the evidence drawer.

### 5.4 Synthetic fallback (allowed, but labelled)

If the shipment data is too thin, ship the mission with a **"Teaching network"**: realistic shares from `trade.json` and an illustrative Σ. Show a persistent badge, **"Illustrative network — not measured"**, exactly like the atlas does.

---

## 6. Visual and interaction design

### 6.1 Art direction: "Situation room meets periodic table"

- **Base:** deep navy/ink (`#0B0F17`) with soft vignette and fine grid noise.
- **Accent:** keep the v3 ochre ore (`#E08A52`) for the player's own reserve.
- **Mineral colours:** each mineral gets a distinct, colour-blind-checked hue for its arcs. Use the `dataviz` skill's validator.
- **Danger:** a single red (`#FF5A4E`) used *only* for shortfalls, fault lines and failing futures.
- **Type:**
  - A characterful display face for headlines, e.g. "Space Grotesk" or "Fraunces".
  - Inter for UI.
  - A mono face (JetBrains Mono) for numbers.
  - Numbers are big (48–96px) and they **count**; they don't jump.
- **Motif:** periodic-table element tiles (symbol, atomic number, mass) are used for mission cards, HUD and share cards.
- **Light mode** is optional. Dark is the hero.

### 6.2 Libraries (CDN, no build step; keep `file://` working where possible)

| Need | Library |
|---|---|
| Globe and arcs | **globe.gl** (Three.js) — arcs, points, rings, auto-rotate, camera fly-to |
| Network graph and morph | **D3** (already used) with d3-force for layout plus custom tier constraints; or SVG with GSAP for the morph |
| Choreography | **GSAP** (core + ScrollTrigger + Flip) for act transitions, number counters, the node-morph reveal |
| 1,000 futures fan | **Canvas 2D** with additive blending (fast enough); upgrade to **regl**/WebGL if needed |
| Share card | Canvas → PNG (`toBlob`) |
| Optional sound | WebAudio: soft UI ticks, a low drone on shocks. Off by default, with a toggle |

Fallbacks:
- If the CDN fails, show a static SVG world from v3's `map.js`.
- If `prefers-reduced-motion` is set, all transitions become crossfades under 200 ms, particles are disabled, and the fan renders instantly.

### 6.3 Signature moments (do these well; they *are* the demo)

1. **Arc globe cold open** (Act 0).
2. **Supply → risk node morph** (Act 2c). The single most important animation. Nodes grow or shrink with an elastic ease, correlated links light up, and the headline number counts up.
3. **Upstream convergence** (Act 2c): particles flow backward up the tiers and pile into the hidden single point of failure, which pulses.
4. **Trap reveal** (Act 3): a "clean" offtake's edge snaps to the China cluster.
5. **Shock pulse** (Act 4): a red wave travels along edges from China outward, and the runtime gauge drains.
6. **1,000 futures** (Act 5): lines draw in and failures flash red as they cross the threshold.

### 6.4 UX checklist

- Keyboard: Enter for the primary action, ←/→ for choices, Esc to close drawers. Visible focus rings.
- Mobile: acts stack vertically, the globe becomes a smaller hero, and the network graph is pannable. Touch targets are at least 44px.
- Empty states never show "0" walls. Show the real network instead.
- Copy: second person, present tense, short. Explain jargon on first use, then hide it in the evidence drawer.
- Performance: first paint under 2 s on a laptop, 60fps animations, and lazy-load the globe textures.
- Accessibility: colour plus shape/label for every status, aria-live announcements for reveals, and contrast ≥ 4.5:1.

---

## 7. File plan

```
site/
  classic/            ← move v3 here unchanged (index.html, app.js, styles.css, map.js); fix relative paths
  v4/
    index.html        ← single page, five acts as <section data-act>
    v4.css
    acts.js           ← act router + HUD + transitions (GSAP)
    globe.js          ← Act 0 + background stage (globe.gl)
    network.js        ← Act 2/3 graph, morph, back-prop animation (D3 + GSAP)
    rst.js            ← reverse-stress engine (pure)
    replay.js         ← Act 4 timeline driving sim.js
    futures.js        ← Act 5 canvas fan driving montecarlo.js
    share.js          ← PNG report card
  index.html          ← redirect to v4/ (keep a "Classic" link)
data/network/dysprosium.json, antimony.json  (+ synthetic ga/co)
tests/rst.test.js     ← node: atlas example, sum-to-L, clip/renormalise, d monotonic in stockpile
```

---

## 8. Build order (today; ship something at each checkpoint)

| # | Checkpoint | Done when |
|---|---|---|
| 1 | `rst.js` + tests | The atlas example passes; `d` rises with stockpile and falls when ρ rises |
| 2 | Act shell + HUD + router, dark theme, type | You can click through 5 placeholder acts with transitions |
| 3 | Act 1 missions + threshold slider | Picking Dy loads its network JSON (synthetic first is fine) |
| 4 | Act 2 network + guess + **morph reveal** | The reveal animation works on the synthetic Dy network |
| 5 | Dy real data (§5.2) | `data/network/dysprosium.json` built from Sayari/Tradeverifyd, or the badge says illustrative |
| 6 | Act 3 levers + distance gauge + trap/investigate | Signing a China-owned offtake visibly fails to help |
| 7 | Act 4 replay with 4 pauses via `sim.js` | Dec 2024 and Apr 2025 visibly hit; the validation card renders |
| 8 | Act 5 futures fan + report card | 1,000 lines draw; the survived count matches `montecarlo.js` |
| 9 | Act 0 globe cold open | Arcs from `trade.json`, the countdown is live |
| 10 | Polish: reduced motion, mobile, share PNG, Antimony mission | Lighthouse a11y ≥ 90; a full run takes under 5 minutes |

If time runs out, **2c (the morph reveal) and Act 4** are the must-haves. The globe can be a static hero image.

---

## 9. Honesty and guardrails (carry over and extend)

- Every v3 honesty rule still applies (README "Honesty rules").
- Reverse stress results are **conditional** ("*if* a 25% loss happens, this is the most likely way"), never a forecast. Put that sentence on the Act 2 reveal screen in small type.
- σ distance and conditional densities are **not probabilities**. The Act 5 counts are counts of *simulated* futures.
- The synthetic network badge is shown wherever data is illustrative.
- Credit the atlas and its research lineage on the About page: *"Reverse-stress logic adapted from the Ethical Tech CoLab Resilience Atlas (teaching material, not a validated product)."*
- Sayari flags are findings, not allegations. Keep the v3 wording.

---

## 10. Demo script (3 minutes)

1. **Cold open:** the globe, "52 days…", then Take office. (10 s)
2. **Mission:** Dysprosium, "EV motors and fighter-jet magnets", threshold 25%. (10 s)
3. **Guess:** tap the two biggest suppliers. **Reveal:** "40% of supply, 89% of the risk." Follow it upstream to the hidden single point of failure. (45 s)
4. **Defend:** sign the cheap Vietnamese offtake. It snaps to the China cluster, a trap. Investigate, then pick a clean one and buy runtime. The gauge goes from 2.2σ to 3.1σ. (40 s)
5. **History:** watch Apr 2025 hit. Your line holds, while the ghost line (do nothing) stops like Ford's did. Validation card. (45 s)
6. **Cliff:** 1,000 futures draw. "In 870 of 1,000 simulated futures, your factory keeps running." Report card, then Share. (30 s)

> The numbers in this script are placeholders. Use whatever the engine actually produces.
