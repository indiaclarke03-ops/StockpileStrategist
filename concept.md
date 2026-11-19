# Stockpile Strategist — Concept

*A critical-minerals reserve game played on real events, real trade data and live intelligence.*

---

## One-line pitch

You run a national critical-minerals reserve. Each quarter you decide what to buy, what to release and whom to sign deals with. You play through the real export bans, quotas and price shocks of 2023–2026, then face the next 12 months in a Monte Carlo forecast built from today's news.

## The problem it dramatises

Governments are now building strategic mineral reserves:

- The US launched **Project Vault** on 2 February 2026: a $12B stockpile funded mainly by a $10B, 15-year EXIM loan, reportedly sized as a ~60-day buffer.
- Japan's **JOGMEC** has stockpiled to a 60-day threshold and is moving toward ~180 days for high-risk metals. Japan started this after China's 2010 rare-earth embargo.

Stockpiling is harder than it looks:

- **Markets are thin.** Gallium, germanium and heavy rare earths trade in small volumes, so your own buying moves the price.
- **Shocks don't all bite.** China's December 2023 graphite licensing cut flake exports by ~94% in a month, yet prices barely moved because demand was weak.
- **Shocks reverse.** After the November 2025 US–China truce, controls were suspended. Buying at the peak meant holding expensive inventory.
- **"Alternative" suppliers may not be alternatives.** A non-Chinese address can still have Chinese ownership, forced-labour exposure or sanctions adjacency.
- **Panic buying backfires.** In 2010–11, Japanese firms rushed to stockpile during the embargo and drove prices up against each other.

The game makes each of these lessons something the player experiences rather than reads.

## Who plays

- **Hackathon judges:** a 3-minute run through the historical campaign, then the forward forecast.
- **Policy and supply-chain students:** learn how export controls translate into price, supply and industry downtime.
- **Analysts:** use forward mode as a rough sensitivity tool ("what reserve level keeps us above 60 days in 90% of futures?").

## Core loop (one turn = one quarter)

1. **Intel briefing.** Headlines from just before that quarter (Tavily, date-filtered) are shown. The player sees what a real official would have seen, but not what happened next.
2. **Decide.** The player chooses among:
   - Buy days-of-cover for any of six minerals.
   - Release reserve to industry.
   - Sign an offtake deal with a non-Chinese producer, vetted with Sayari and Tradeverifyd.
   - Do nothing and save budget.
3. **Reality strikes.** The real event for that quarter fires, such as China's December 2024 ban on gallium, germanium and antimony exports to the US.
4. **Consequences.** The model updates prices, import availability, shortfalls, idled factories and the reserve's days of cover. A "What actually happened" card shows the real headline and source.
5. **Score.** Days of cover held, industry downtime avoided, dollars spent and market disruption caused.

## The six minerals

| Mineral | Why it's in the game | Real shock used |
|---|---|---|
| Gallium | Chips, radar, LEDs | China licensing (Aug 2023), US ban (Dec 2024), suspension (Nov 2025) |
| Germanium | Fibre optics, infrared optics | Same as gallium |
| Antimony | Munitions, flame retardants | China controls (Sep 2024), US ban (Dec 2024) |
| Graphite | Battery anodes | China licensing (Dec 2023), which mostly *didn't* bite |
| Dysprosium (heavy REE / magnets) | EV motors, defence | April 2025 controls, auto plant shutdowns, ex-China price spikes into 2026 |
| Cobalt | Batteries, superalloys | DRC export ban (Feb 2025), then quotas (Oct 2025 onward) |

## Two modes

**Historical campaign (Q3 2023 → Q4 2026, 14 turns).** Every event, date and direction of effect comes from real reporting, and each event card cites its source. Volumes are normalised as "days of cover" so the game stays honest. The timing and the size of shocks are real; national tonnages are a configurable calibration layer.

**Forward mode (Q1 2027 → Q4 2027).** The campaign ends on a real cliff edge. China's suspension of its expanded rare-earth controls was extended on 9 November 2026 to **10 January 2027**, while the April 2025 heavy rare-earth controls stay in force. Forward mode then:

- Runs 1,000 Monte Carlo futures.
- Draws event probabilities from the historical base rate (how often China or the DRC acted per quarter in 2023–26).
- Nudges those probabilities with live Tavily news and live Tradeverifyd disruption alerts.
- Shows the player a fan chart of days of cover under their strategy.

## How the three tools power it

| Tool | Role in the game |
|---|---|
| **Sayari** | Import dependence and supplier concentration per HS code, and risk flags on suppliers. Vets offtake counterparties: beneficial owners, watchlists, forced-labour flags. An "alternative" supplier owned by a Chinese parent doesn't count as diversification. |
| **Tradeverifyd** | UN Comtrade bilateral flows (e.g. US antimony imports from China fell from $10.4M in 2024 to $3.2M in 2025 while imports from Korea rose). Live natural-disaster disruptions near producing regions. Entity scores for counterparties. Copper price as a live benchmark. |
| **Tavily** | Date-filtered news for each turn's intel briefing, the "What actually happened" sources, and live news that shifts forward-mode event probabilities. |

## What makes it a strong demo

- **Real history, played forward.** Judges recognise the events: Ford idling its Chicago plant, the December 2024 ban, Project Vault.
- **Real stakes now.** The game ends at a real deadline seven weeks away.
- **Ethics is part of the mechanics.** Cheap offtake from a supplier with forced-labour or sanctions flags is tempting. Sayari exposes the flags, and taking the deal carries a reputational and enforcement risk.
- **The counter-intuitive lessons stick.** Your own buying raises prices, the graphite shock fizzles and the truce strands expensive inventory.

## Out of scope for the hackathon

- Real national tonnage calibration for every mineral (supported via a config file, not required).
- Multiplayer or allied coordination (stretch goal).
- Accounts or saved games.
