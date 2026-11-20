/* Stockpile Strategist — Analyst casebook: 11 real decision points, 2023–2026.
 * Each case takes effect from the START of `q` (the quarter after the decision), so nothing in a
 * case uses information from after the decision date. One option per case is what the US actually
 * did (`real: true`); its sources are the dated items in data/responses.json listed in `refs`.
 *
 * Option effects (applied to a path, see app.js):
 *   target {k: days}  keep at least this many days stored (topped up each quarter, ≤45 days/qtr)
 *   add    {k: days}  raise the target by this much above what's stored now
 *   buyUSD {k: $M}    one-off purchase worth roughly $M (real contract values ÷ 5 years)
 *   sign   [ids]      supply deals (upfront cost; deliveries start after a lag, often late)
 *   spend  $M         money spent with no supply before 2027 (grants, project support)
 *   sell   {k|all: f} sell this fraction of the stockpile at 90% of market value
 *   rule   {priority, trigger}  release rules
 * Game costs for deals and stock follow the engine's calibrations (labelled assumed).
 */
(function (root) {
  const D = root.GAME_DATA;
  // A real 2026 offtake not in the vetted list: Serra Verde (Brazil), heavy rare earths.
  if (!D.COUNTERPARTIES.find((c) => c.id === "cp-dysprosium-serra")) {
    D.COUNTERPARTIES.push({ id: "cp-dysprosium-serra", name: "Serra Verde (Brazil)", country: "Brazil", mineral: "dysprosium", upfront: 750, docPerQ: 6, lag: [2, 4],
      owner: "USA Rare Earth (agreed acquisition, Apr 2026)", ownerChina: false, flags: [], score: null, note: "Producing mine; DoW-funded offtake Aug 2026 (deal terms in game are assumed)" });
  }

  const CASES = [
    { id: "ga-licence", q: "2023Q4", when: "Aug 2023", role: "Defense Logistics Agency (National Defense Stockpile)", minerals: ["gallium", "germanium"],
      title: "China puts gallium and germanium under export licence",
      situation: ["From 1 August, Chinese exporters of gallium and germanium need a licence.", "China makes about 98% of the world's new gallium.", "The US defence stockpile holds germanium but no gallium."],
      question: "What do you do about gallium and germanium?",
      options: [
        { id: "buy", label: "Build 60 days of both now", tag: "early-buy", eff: { target: { gallium: 60, germanium: 60 } } },
        { id: "deal", label: "Sign Western supply deals", detail: "Rio Tinto gallium (Quebec) + Umicore germanium (Belgium)", tag: "clean-deal", eff: { sign: ["cp-gallium-riotinto", "cp-germanium-umicore"] } },
        { id: "grant", label: "Small development grants only", detail: "Fund future domestic projects; no stockpile", tag: "grant", real: true, eff: { spend: 53 } },
        { id: "wait", label: "Wait and watch", tag: "wait", eff: {} },
      ],
      realText: "No stockpile purchases. The Department of Defense gave small development grants instead: $37.5M to Graphite One and $15.5M to Perpetua (antimony).", refs: ["2023-07-17", "2023-08-21"] },

    { id: "graphite", q: "2024Q1", when: "Dec 2023", role: "Department of Energy / Treasury", minerals: ["graphite"],
      title: "China's graphite licences take effect",
      situation: ["China's licences for graphite exports began on 1 December.", "Chinese flake graphite exports fell 94% that month, but prices barely moved.", "About two-thirds of US graphite imports came from China in 2023."],
      question: "How do you protect battery-anode supply?",
      options: [
        { id: "buy", label: "Build 60 days of graphite", tag: "early-buy", eff: { target: { graphite: 60 } } },
        { id: "deal", label: "Back a US anode plant", detail: "Syrah's Vidalia, Louisiana facility", tag: "clean-deal", real: true, eff: { sign: ["cp-graphite-syrah"] } },
        { id: "wait", label: "Wait: prices haven't moved", tag: "wait", eff: {} },
      ],
      realText: "Backed a domestic plant: Syrah's DOE-supported Vidalia facility began anode production in February 2024. Treasury also barred Chinese graphite from EV tax credits.", refs: ["2023-12-01", "2024-02"] },

    { id: "antimony", q: "2024Q4", when: "Sep 2024", role: "US Trade Representative / Defense Logistics Agency", minerals: ["antimony"],
      title: "China restricts antimony exports",
      situation: ["China's antimony export controls take effect on 15 September.", "Antimony is used in ammunition and flame retardants.", "Antimony prices have nearly doubled since mid-2023 (Fastmarkets)."],
      question: "What do you do about antimony?",
      options: [
        { id: "buy", label: "Build 60 days of antimony", tag: "early-buy", eff: { target: { antimony: 60 } } },
        { id: "deal", label: "Contract US Antimony Corp", detail: "Small US smelter (Montana)", tag: "clean-deal", eff: { sign: ["cp-antimony-usac"] } },
        { id: "tariff", label: "Tariffs, not stockpiles", detail: "25% tariffs on Chinese critical minerals", tag: "wait", real: true, eff: {} },
      ],
      realText: "Tariffs, not stockpiles: 25% Section 301 tariffs on Chinese critical minerals from 27 September 2024. An earlier EXIM letter of interest to Perpetua (Apr 2024) was non-binding.", refs: ["2024-09", "2024-04-08"] },

    { id: "ban", q: "2025Q1", when: "Dec 2024", role: "Defense Logistics Agency", minerals: ["gallium", "germanium", "antimony"],
      title: "China bans gallium, germanium and antimony exports to the US",
      situation: ["On 3 December, China banned these exports to the US outright.", "Antimony prices jumped about 40% the next day.", "Direct Chinese gallium and germanium shipments to the US were already near zero."],
      question: "The ban is in force. What now?",
      options: [
        { id: "emergency", label: "Emergency buy: +30 days of each", detail: "At post-ban prices, while imports are restricted", tag: "late-buy", eff: { add: { gallium: 30, germanium: 30, antimony: 30 } } },
        { id: "korea", label: "Sign Korea Zinc for antimony", detail: "Korean smelter; some records link it to sanctioned trade partners", tag: "clean-deal", eff: { sign: ["cp-antimony-koreazinc"] } },
        { id: "wait", label: "No emergency purchases", tag: "wait", real: true, eff: {} },
      ],
      realText: "No emergency purchases. The DOE offered Novonix a $755M loan for a synthetic graphite plant instead.", refs: ["2024-12-16"] },

    { id: "cobalt", q: "2025Q2", when: "Mar 2025", role: "Defense Logistics Agency", minerals: ["cobalt"],
      title: "The DRC halts cobalt exports",
      situation: ["On 22 February the DRC suspended cobalt exports for four months.", "The DRC mines about 70% of the world's cobalt; most of it is refined in China.", "Cobalt prices rose about 50%."],
      question: "What do you do about cobalt?",
      options: [
        { id: "buy", label: "Build 60 days of cobalt", tag: "late-buy", eff: { target: { cobalt: 60 } } },
        { id: "jervois", label: "Sign Jervois (Finland)", detail: "Largest cobalt refinery outside China", tag: "clean-deal", eff: { sign: ["cp-cobalt-jervois"] } },
        { id: "cheap", label: "Sign the cheapest offer", detail: "Congo Dongfang: half the price", tag: "trap-deal", eff: { sign: ["cp-cobalt-cdm"] } },
        { id: "wait", label: "Wait: speed up permits instead", tag: "wait", real: true, eff: {} },
      ],
      realText: "No cobalt purchases. An executive order (20 March 2025) sped up permits for domestic mineral projects.", refs: ["2025-03-20"] },

    { id: "hree", q: "2025Q3", when: "Jun 2025", role: "Department of Commerce / Defense Logistics Agency", minerals: ["dysprosium"],
      title: "China restricts heavy rare earths; car plants stop",
      situation: ["Since 4 April, seven heavy rare earths, including dysprosium, need Chinese export licences.", "Ford idled its Chicago plant for a week in May; Suzuki halted Swift production.", "Dysprosium prices outside China roughly tripled in a month."],
      question: "Magnet supply is failing. What do you do?",
      options: [
        { id: "buy", label: "Emergency dysprosium buy (+45 days)", detail: "Capped: imports are restricted", tag: "late-buy", eff: { add: { dysprosium: 45 } } },
        { id: "lynas", label: "Sign Lynas (Australia/Malaysia)", detail: "Only large heavy-rare-earth separator outside China", tag: "clean-deal", eff: { sign: ["cp-dysprosium-lynas"] } },
        { id: "rule", label: "Ration: defence lines first", detail: "No new spending; protect military supply", tag: "rule", eff: { rule: { priority: "defence" } } },
        { id: "wait", label: "Open an investigation", detail: "Section 232 national-security review", tag: "wait", real: true, eff: {} },
      ],
      realText: "A Section 232 national-security investigation into processed critical minerals (opened 22 April 2025). No emergency purchases.", refs: ["2025-04-22", "2025-05"] },

    { id: "mp", q: "2025Q3", when: "Jul 2025", role: "Department of Defense", minerals: ["dysprosium"],
      title: "Back a US rare-earth champion?",
      situation: ["MP Materials runs America's only rare-earth mine (Mountain Pass, California).", "It doesn't yet produce dysprosium at scale.", "Magnet makers are still short of supply."],
      question: "How do you secure rare-earth supply for the long run?",
      options: [
        { id: "mp", label: "Equity stake + price floor in MP", detail: "$400M stock, $110/kg floor, magnet offtake", tag: "clean-deal", real: true, eff: { sign: ["cp-dysprosium-mp"] } },
        { id: "buy", label: "Buy 60 days of dysprosium now", detail: "At near-record prices", tag: "late-buy", eff: { target: { dysprosium: 60 } } },
        { id: "cheap", label: "Sign the cheapest magnet supplier", detail: "Vietnam Rare Earth Co. (VREX)", tag: "trap-deal", eff: { sign: ["cp-dysprosium-vrex"] } },
        { id: "wait", label: "Leave it to the market", tag: "wait", eff: {} },
      ],
      realText: "The DoD bought $400M of MP Materials preferred stock, set a $110/kg price floor and agreed a magnet offtake (10 July 2025). Apple signed a $500M magnet deal days later.", refs: ["2025-07-10", "2025-07-15"] },

    { id: "dla", q: "2025Q4", when: "Sep 2025", role: "Defense Logistics Agency", minerals: ["antimony", "cobalt"],
      title: "First stockpile purchases in decades",
      situation: ["The DLA has asked for bids to buy up to 7,500 tonnes of cobalt.", "It is also negotiating an antimony supply contract.", "Cobalt prices are rallying as the DRC's export ban continues."],
      question: "Which purchases do you go ahead with?",
      options: [
        { id: "both", label: "Buy both: 60 days each", tag: "early-buy", eff: { target: { antimony: 60, cobalt: 60 } } },
        { id: "sb", label: "Antimony contract only", detail: "US Antimony Corp, up to $245M over 5 years; cobalt tender cancelled", tag: "early-buy", real: true, eff: { buyUSD: { antimony: 49 } } },
        { id: "co", label: "Cobalt only", tag: "early-buy", eff: { target: { cobalt: 60 } } },
        { id: "none", label: "Neither", tag: "wait", eff: {} },
      ],
      realText: "The DLA awarded US Antimony Corp. a contract of up to $245M (23 Sep 2025), then cancelled its cobalt tender (15 Oct 2025) after six deadline extensions.", refs: ["2025-09-23", "2025-10-15"] },

    { id: "truce", q: "2026Q1", when: "Nov 2025", role: "White House / National Security Council", minerals: ["gallium", "germanium", "antimony", "dysprosium"],
      title: "US–China truce",
      situation: ["China suspends its October 2025 rare-earth controls for a year and issues general licences for gallium, germanium and antimony.", "Its April 2025 heavy-rare-earth controls stay in force.", "Prices are starting to ease."],
      question: "What do you do with your stockpiles?",
      options: [
        { id: "sell", label: "Sell half while prices are high", tag: "sell", eff: { sell: { all: 0.5 } } },
        { id: "hold", label: "Hold and sign allied frameworks", detail: "Australia and Japan agreements", tag: "hold", real: true, eff: {} },
        { id: "more", label: "Keep buying: +30 days of each", tag: "early-buy", eff: { addAll: 30 } },
      ],
      realText: "Held position and signed allied frameworks: an $8.5B US–Australia critical-minerals deal (20 Oct) and a US–Japan stockpiling framework (28 Oct). No sales.", refs: ["2025-10-20", "2025-10-28", "2025-11-01"] },

    { id: "vault", q: "2026Q2", when: "Feb 2026", role: "Project Vault (EXIM + White House)", minerals: ["gallium", "germanium", "antimony", "graphite", "dysprosium", "cobalt"],
      title: "Project Vault: $12B for a national reserve",
      situation: ["EXIM approved up to $10B in loans, plus about $2B private money, for a stockpile.", "Target: about 60 days of supply.", "China's pause on its toughest rare-earth controls is due to end in November."],
      question: "How should the reserve's money be used first?",
      options: [
        { id: "spread", label: "60 days of everything", tag: "spread", eff: { target: { gallium: 60, germanium: 60, antimony: 60, graphite: 60, dysprosium: 60, cobalt: 60 } } },
        { id: "focus", label: "Focus on the weak spots", detail: "90 days of dysprosium and gallium", tag: "focus", eff: { target: { dysprosium: 90, gallium: 90 } } },
        { id: "cobalt", label: "Start with a cobalt contract", detail: "Glencore, up to $900M over 5 years", tag: "early-buy", real: true, eff: { buyUSD: { cobalt: 180 } } },
        { id: "cash", label: "Keep the money in reserve", tag: "wait", eff: {} },
      ],
      realText: "The DLA's first big award went to cobalt: Glencore, up to $900M over five years (May 2026). The Vault itself made no purchases until September.", refs: ["2026-02-02", "2026-05"] },

    { id: "dy-surge", q: "2026Q4", when: "Aug–Sep 2026", role: "Department of War / Defense Logistics Agency", minerals: ["dysprosium", "gallium"],
      title: "Dysprosium prices outside China surge",
      situation: ["Ex-China dysprosium prices rose about 150% in a quarter, to around 16× the Chinese domestic price.", "China's rare-earth pause still ends in November.", "A Brazilian heavy-rare-earth mine (Serra Verde) is looking for buyers."],
      question: "What's your last move before the deadline?",
      options: [
        { id: "buy", label: "Buy 30 days of dysprosium", detail: "At record prices", tag: "late-buy", eff: { add: { dysprosium: 30 } } },
        { id: "serra", label: "Fund Serra Verde + gallium contract", detail: "Offtake from Brazil; Atalco gallium (Louisiana)", tag: "clean-deal", real: true, eff: { sign: ["cp-dysprosium-serra"], buyUSD: { gallium: 70 } } },
        { id: "cheap", label: "Sign the cheapest magnet plant", detail: "INST Magnetic (Vietnam)", tag: "trap-deal", eff: { sign: ["cp-dysprosium-instvn"] } },
        { id: "wait", label: "Wait for the deadline", tag: "wait", eff: {} },
      ],
      realText: "The Department of War funded a $750M offtake from Serra Verde (24 Aug 2026), invested in Atalco's gallium plant, and the DLA later awarded Atalco up to $350M for gallium (Nov 2026).", refs: ["2026-08-24", "2026-08-28", "2026-11-11"] },
  ];

  const LESSONS = {
    "early-buy": "Build stock before or as soon as controls appear, while prices are lower and imports still flow.",
    "late-buy": "Emergency buying after a ban is expensive and limited, because imports are already restricted.",
    "clean-deal": "Deals with independent producers help, but take a year or more to deliver, so start them early.",
    "trap-deal": "A cheap 'alternative' tied to China fails at the same time as China.",
    grant: "Grants and loans build future capacity, but deliver nothing during a two- or three-year crisis.",
    wait: "Waiting saves money, and works when a shock fizzles or supply reroutes.",
    sell: "Selling into a truce frees cash but leaves you exposed if restrictions return.",
    hold: "Holding through a truce keeps protection in place for the next shock.",
    focus: "Concentrating on the weak spots the stress test finds gets the most protection per dollar.",
    spread: "Spreading money evenly protects everything a little.",
    rule: "Release rules protect priority users without new spending.",
  };

  root.CASEBOOK = { CASES, LESSONS };
})(window);
