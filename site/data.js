/* Stockpile Strategist — game data (v1)
 * Source of truth for minerals, the historical event timeline and offtake candidates.
 * Every parameter not taken from reporting is tagged `assumed` (see spec §1).
 * Loaded as a plain script so the site works from file:// without a server.
 */
(function (root) {
  const QUARTERS = [
    "2023Q3", "2023Q4",
    "2024Q1", "2024Q2", "2024Q3", "2024Q4",
    "2025Q1", "2025Q2", "2025Q3", "2025Q4",
    "2026Q1", "2026Q2", "2026Q3", "2026Q4",
  ];

  // Per-mineral parameters. All numeric values are `assumed` calibrations unless noted.
  // demand: 100 units / quarter (normalised, spec §1.2). 1 day of cover (DoC) = 100/91 units.
  const MINERALS = {
    gallium: {
      name: "Gallium", symbol: "Ga", uses: "Chips, radar, LEDs",
      baseCost: 4,          // $M per DoC at priceIdx 100 (assumed)
      exposure: { china: 0.6 }, // share of US imports exposed to the actor (assumed until trade fetch)
      rerouteRate: 0.5, criticality: 0.7, marketDepth: 60, eta: 0.2,
      hs: ["811292 (basket, proxy)"],
    },
    germanium: {
      name: "Germanium", symbol: "Ge", uses: "Fibre optics, infrared optics",
      baseCost: 5, exposure: { china: 0.5 },
      rerouteRate: 0.5, criticality: 0.5, marketDepth: 60, eta: 0.2,
      hs: ["811292 (basket, proxy)"],
    },
    antimony: {
      name: "Antimony", symbol: "Sb", uses: "Munitions, flame retardants",
      baseCost: 6, exposure: { china: 0.6 },
      rerouteRate: 0.6, // Comtrade: US HS 811010 from China $10.39M→$3.20M, Korea $0.21M→$3.26M (2024→2025)
      criticality: 0.6, marketDepth: 90, eta: 0.2,
      hs: ["811010"],
    },
    graphite: {
      name: "Graphite", symbol: "C", uses: "Battery anodes",
      baseCost: 12, exposure: { china: 0.8 },
      rerouteRate: 0.8, criticality: 0.4, marketDepth: 300, eta: 0.2,
      hs: ["250410 natural", "380110 artificial"],
    },
    dysprosium: {
      name: "Dysprosium", symbol: "Dy", uses: "EV motors, defence magnets (heavy REE)",
      baseCost: 15, exposure: { china: 0.9 },
      rerouteRate: 0.45, criticality: 1.0, marketDepth: 60, eta: 0.2,
      exChina: true, // tracks the ex-China price a Western reserve pays
      hs: ["280530", "284690", "850511 magnets"],
    },
    cobalt: {
      name: "Cobalt", symbol: "Co", uses: "Batteries, superalloys",
      baseCost: 15, exposure: { drc: 0.7, china: 0.2 },
      rerouteRate: 0.5, criticality: 0.6, marketDepth: 250, eta: 0.2,
      hs: ["260500", "810520", "282200"],
    },
  };

  // Effect fields (per mineral):
  //   cut, targetFactor, actor  → tightening: cutNet = max(cutNet, cut × exposure[actor] × targetFactor)
  //   relief                    → easing: cutNet × (1 − relief)
  //   setCut                    → replace regime: cutNet = setCut × exposure[actor]
  //   priceMult (+ priceSrc: "reported" | "assumed"), panic (fraction, decays 50%/q)
  //   downtimeNote              → narrative tag for real shutdown reports
  const EVENTS = [
    {
      id: "cn-ga-ge-licensing-2023-08", quarter: "2023Q3", date: "2023-08-01", actor: "China MOFCOM",
      headline: "China's export licensing on gallium and germanium takes effect",
      effects: {
        gallium: { cut: 0.5, targetFactor: 0.5, actor: "china", priceMult: 1.27, priceSrc: "reported" },
        germanium: { cut: 0.5, targetFactor: 0.5, actor: "china", priceMult: 1.2, priceSrc: "assumed" },
      },
      sources: ["https://www.kitco.com/news/off-the-wire/2024-12-03/china-bans-export-critical-minerals-us-trade-tensions-escalate"],
      lesson: "Licensing slows flows rather than stopping them — but it puts a valve in Beijing's hand.",
    },
    {
      id: "cn-graphite-licensing-2023-12", quarter: "2023Q4", date: "2023-12-01", actor: "China MOFCOM",
      headline: "Graphite licensing (announced 20 Oct) in force 1 Dec; Chinese flake exports −94% m/m in December",
      effects: {
        graphite: { cut: 0.5, targetFactor: 0.5, actor: "china", priceMult: 1.0, priceSrc: "reported", panic: 0.10 },
      },
      sources: [
        "https://www.fastmarkets.com/insights/chinas-graphite-exports-plunge-in-december-after-introduction-of-export-controls/",
        "https://www.marketindex.com.au/news/graphite-stocks-have-surged-so-where-do-they-go-from-here",
      ],
      lesson: "The shock that fizzled: volumes collapsed, but weak demand kept prices roughly flat.",
    },
    {
      id: "cn-ga-ge-us-zero-2024", quarter: "2024Q2", date: "2024-06-30", actor: "Market",
      headline: "No new US-specific cuts, but direct Ga/Ge exports to the US are effectively zero through Oct 2024",
      effects: {},
      narrativeOnly: true,
      sources: ["https://2024.minexeurasia.com/?p=2060"],
      lesson: "Quiet quarters aren't safe quarters — licensing had already throttled direct flows; rerouting fills part of the gap.",
    },
    {
      id: "cn-sb-controls-2024-09", quarter: "2024Q3", date: "2024-09-15", actor: "China MOFCOM",
      headline: "China's antimony export controls take effect; antimony exports −97% in October",
      effects: {
        antimony: { cut: 0.5, targetFactor: 0.5, actor: "china", priceMult: 1.5, priceSrc: "assumed" },
      },
      sources: ["https://mhlnews.com/home/news/55247345/china-bans-export-of-critical-minerals"],
      lesson: "Controls spread mineral by mineral; munitions supply chains were next.",
    },
    {
      id: "cn-ban-ga-ge-sb-us-2024-12", quarter: "2024Q4", date: "2024-12-03", actor: "China MOFCOM",
      headline: "China bans exports of gallium, germanium and antimony to the US",
      effects: {
        antimony: { cut: 1.0, targetFactor: 1.0, actor: "china", priceMult: 1.40, priceSrc: "reported" },
        gallium: { cut: 1.0, targetFactor: 1.0, actor: "china", priceMult: 1.15, priceSrc: "assumed" },
        germanium: { cut: 1.0, targetFactor: 1.0, actor: "china", priceMult: 1.15, priceSrc: "assumed" },
      },
      sources: [
        "https://www.kitco.com/news/off-the-wire/2024-12-03/china-bans-export-critical-minerals-us-trade-tensions-escalate",
        "https://mhlnews.com/home/news/55247345/china-bans-export-of-critical-minerals",
      ],
      lesson: "Retaliation can be immediate. Antimony jumped ~40% the next day.",
    },
    {
      id: "drc-co-ban-2025-02", quarter: "2025Q1", date: "2025-02-22", actor: "DRC (ARECOMS)",
      headline: "DRC suspends cobalt exports",
      effects: {
        cobalt: { cut: 0.7, targetFactor: 1.0, actor: "drc", priceMult: 1.5, priceSrc: "reported" },
      },
      sources: ["https://www.mining.com/web/column-can-the-congo-tame-the-wild-cobalt-market"],
      lesson: "China isn't the only actor: a producer-country ban hits a mineral China mostly refines.",
    },
    {
      id: "cn-hree-licensing-2025-04", quarter: "2025Q2", date: "2025-04-04", actor: "China MOFCOM",
      headline: "China licenses 7 heavy rare earths (Sm, Gd, Tb, Dy, Lu, Sc, Y); Ford idles Chicago plant, Suzuki halts Swift",
      effects: {
        dysprosium: { cut: 0.8, targetFactor: 1.0, actor: "china", priceMult: 3.0, priceSrc: "reported", panic: 0.10,
          downtimeNote: "Ford idled its Chicago Explorer plant (May 2025); Suzuki halted Swift production (26 May 2025)." },
      },
      sources: [
        "https://amp.claimsjournal.com/news/national/2025/06/13/331185.htm",
        "https://www.carscoops.com/2025/06/auto-production-ceasing-over-a-resource-youve-probably-never-heard-of/",
        "https://news.metal.com/newscontent/103310477/Dysprosium-and-Terbium-Supplies-Are-Tight-Overseas,-Price-Spread-Between-Rare-Earths-at-Home-and-Abroad-Widens-[[SMM-Analysis]]",
      ],
      lesson: "Magnets are where shortages become idle factories. European Dy roughly tripled in a month.",
    },
    {
      id: "cn-ree-extraterritorial-2025-10", quarter: "2025Q4", date: "2025-10-09", actor: "China MOFCOM",
      headline: "Expanded extraterritorial REE controls (9 Oct)",
      effects: {
        dysprosium: { priceMult: 1.1, priceSrc: "assumed" },
      },
      sources: ["https://www.skillings.net/?p=99800"],
      lesson: "Controls now reach products made outside China with Chinese inputs.",
    },
    {
      id: "drc-co-quota-2025-10", quarter: "2025Q4", date: "2025-10-16", actor: "DRC (ARECOMS)",
      headline: "DRC replaces ban with export quotas (87,000t base + 9,600t strategic)",
      effects: {
        cobalt: { setCut: 0.5, actor: "drc", priceMult: 1.6, priceSrc: "assumed" },
      },
      sources: ["https://www.fastmarkets.com/insights/drc-may-reduce-cobalt-quota-if-market-needs-rebalancing-arecoms-says-exclusive/",
        "https://www.sunsirs.com/commodity-news/petail-31901.html"],
      lesson: "A ban that ends can become a quota that stays. Cobalt hydroxide ~4× its pre-ban level.",
    },
    {
      id: "us-cn-truce-2025-11", quarter: "2025Q4", date: "2025-11-10", actor: "US–China",
      headline: "US–China truce: one-year suspension of expanded controls; general licences for Ga/Ge/Sb",
      effects: {
        gallium: { relief: 0.5, priceMult: 0.85, priceSrc: "assumed" },
        germanium: { relief: 0.5, priceMult: 0.85, priceSrc: "assumed" },
        antimony: { relief: 0.5, priceMult: 0.85, priceSrc: "assumed" },
      },
      sources: ["https://www.spglobal.com/energy/en/news-research/latest-news/metals/110926-china-extends-rare-earth-export-suspension-to-january-2027"],
      lesson: "Shocks reverse. Inventory bought at the peak is now marked down.",
    },
    {
      id: "us-project-vault-2026-02", quarter: "2026Q1", date: "2026-02-02", actor: "United States",
      headline: "Project Vault launched: $12B stockpile (~$10B EXIM loan), ~60-day buffer; China dual-use controls target Japan",
      effects: {
        dysprosium: { panic: 0.05, priceSrc: "assumed" },
      },
      sources: [
        "https://www.mining.com/trump-plans-12b-minerals-vault-to-cut-china-reliance",
        "https://www.jdsupra.com/legalnews/breaking-china-s-stranglehold-trump-s-2105337/",
        "https://skillings.net/chinas-critical-minerals-export-controls-what-happens-next-and-who-gets-squeezed-in-2026",
      ],
      lesson: "Your real-world counterpart arrives — and allied buyers start competing for the same thin markets.",
    },
    {
      id: "drc-quota-ease-2026-04", quarter: "2026Q2", date: "2026-04-15", actor: "DRC / China MOFCOM",
      headline: "DRC quota rules lift supply (cobalt −2.5% in two days); China adds 10 US firms incl. MP Materials to its control list (22 Jun)",
      effects: {
        cobalt: { setCut: 0.4, actor: "drc", priceMult: 0.975, priceSrc: "reported" },
        dysprosium: { priceMult: 1.1, priceSrc: "assumed", flagsUSProducers: true },
      },
      sources: ["https://www.miningweekly.com/article/congo-withdraws-unused-cobalt-export-quotas-2026-06-30",
        "https://www.skillings.net/?p=99800"],
      lesson: "Even a US producer can face upstream Chinese risk once it's on Beijing's list.",
    },
    {
      id: "ex-china-hree-surge-2026-q3", quarter: "2026Q3", date: "2026-09-30", actor: "Market",
      headline: "Ex-China heavy REE surge: Dy CIF Europe +150% in the quarter, ~16.3× the China price",
      effects: {
        dysprosium: { priceMult: 2.5, priceSrc: "reported" },
      },
      sources: ["https://source.benchmarkminerals.com/article/ex-china-heavy-rare-earths-continue-to-surge-q3-2026-rare-earths-price-review",
        "https://www.fastmarkets.com/?p=135475"],
      lesson: "A Western reserve pays the ex-China price — and that price has decoupled.",
      spreadNote: "Benchmark: Dy CIF Europe ≈ 16.3× the DDP China price at end-Q3 2026 (Fastmarkets put it at ~4.9× in August). Chinese magnet makers pay a fraction of what your reserve pays.",
    },
    {
      id: "cn-suspension-extended-2026-11", quarter: "2026Q4", date: "2026-11-09", actor: "China MOFCOM",
      headline: "Suspension of expanded REE controls extended to 10 January 2027; April 2025 HREE controls stay in force",
      effects: {},
      narrativeOnly: true,
      sources: ["https://www.spglobal.com/energy/en/news-research/latest-news/metals/110926-china-extends-rare-earth-export-suspension-to-january-2027"],
      lesson: "The campaign ends on a real cliff edge. Forward mode takes it from here.",
    },
  ];

  // Background known before the campaign starts (from concept.md).
  const BACKGROUND = [
    { date: "2010-09", text: "China's rare-earth embargo on Japan; Japanese firms panic-buy and bid prices up against each other.", src: "rusi.org" },
    { date: "2023", text: "Japan's JOGMEC holds a 60-day stockpile threshold, moving toward ~180 days for high-risk metals.", src: "inkl.com" },
  ];

  // Offtake candidates — ILLUSTRATIVE ONLY. Fictional names; vetting fields are placeholders
  // to be replaced with real Sayari (beneficial owners, watchlist, risk factors) and
  // Tradeverifyd (entity score) results via scripts/vet_counterparty.py.
  const COUNTERPARTIES = [
    { id: "cp-ga-ca", name: "Kestrel Gallium Recovery", country: "Canada", mineral: "gallium",
      upfront: 400, docPerQ: 8, lag: [6, 10], owner: "Independent, listed", ownerChina: false,
      flags: [], score: 82 },
    { id: "cp-ge-be", name: "Harbour Germanium Refining", country: "Belgium", mineral: "germanium",
      upfront: 350, docPerQ: 6, lag: [4, 8], owner: "European industrial group", ownerChina: false,
      flags: [], score: 78 },
    { id: "cp-sb-kr", name: "Pacific Antimony Smelting", country: "South Korea", mineral: "antimony",
      upfront: 250, docPerQ: 10, lag: [4, 6], owner: "Korean conglomerate", ownerChina: false,
      upstreamChina: 0.5, flags: [{ label: "Chinese feedstock (sub-tier)", kind: "upstream" }], score: 70 },
    { id: "cp-c-mz", name: "Tasman Graphite", country: "Mozambique", mineral: "graphite",
      upfront: 300, docPerQ: 12, lag: [6, 12], owner: "Australian junior miner", ownerChina: false,
      flags: [{ label: "Environmental", kind: "env", blockP: 0.03, pcPenalty: 3 }], score: 65 },
    { id: "cp-dy-au", name: "Southern Cross Rare Earths", country: "Australia", mineral: "dysprosium",
      upfront: 900, docPerQ: 8, lag: [8, 12], owner: "Independent, listed", ownerChina: false,
      flags: [], score: 85 },
    { id: "cp-dy-us", name: "Great Plains Magnet Metals", country: "United States", mineral: "dysprosium",
      upfront: 600, docPerQ: 6, lag: [6, 10], owner: "US-listed producer", ownerChina: false,
      usProducer: true, flags: [], score: 75 },
    { id: "cp-dy-vn", name: "Lumen Magnetics", country: "Vietnam", mineral: "dysprosium",
      upfront: 300, docPerQ: 10, lag: [4, 6], owner: "Parent: Chinese state-linked group", ownerChina: true,
      flags: [{ label: "Chinese state-linked owner", kind: "owner" }], score: 48 },
    { id: "cp-co-fi", name: "Atlas Cobalt Refinery", country: "Finland", mineral: "cobalt",
      upfront: 500, docPerQ: 10, lag: [4, 8], owner: "Nordic mining group", ownerChina: false,
      flags: [], score: 80 },
    { id: "cp-co-ae", name: "Highveld Cobalt Trading", country: "UAE", mineral: "cobalt",
      upfront: 150, docPerQ: 15, lag: [4, 5], owner: "Private, opaque structure", ownerChina: false,
      flags: [
        { label: "Forced labour (artisanal sourcing)", kind: "labour", blockP: 0.12, pcPenalty: 10 },
        { label: "Sanctions-adjacent", kind: "sanctions", blockP: 0.05, pcPenalty: 5 },
      ], score: 35 },
  ];

  // Forward mode (§7). Base rates counted from the timeline above.
  const FORWARD = {
    quarters: ["2027Q1", "2027Q2", "2027Q3", "2027Q4"],
    pChinaTighten: 0.55, pChinaEase: 2 / 14, pDRC: 4 / 14,
    // tightening targets weighted by how often each was hit in 2023–26
    tightenWeights: { gallium: 2, germanium: 2, antimony: 2, graphite: 1, dysprosium: 3 },
    cliff: { extend: 0.45, lapse: 0.35, deal: 0.20 }, // assumed
    // empirical-ish price multiplier ranges for a tightening event
    priceRange: { gallium: [1.1, 1.3], germanium: [1.1, 1.3], antimony: [1.3, 1.6], graphite: [0.95, 1.1], dysprosium: [1.2, 3.0], cobalt: [1.0, 1.6] },
    disruptionRegions: [
      { id: "drc", label: "DRC (cobalt)", mineral: "cobalt" },
      { id: "myanmar", label: "Myanmar (HREE feed)", mineral: "dysprosium" },
      { id: "inner-mongolia", label: "Inner Mongolia / Jiangxi (REE)", mineral: "dysprosium" },
      { id: "indonesia", label: "Indonesia (cobalt/nickel)", mineral: "cobalt" },
    ],
  };

  // Dysprosium: ex-China vs China price spread, as reported. `knownFrom` = first quarter a player
  // could have read it (no foresight). Only cited figures; nothing interpolated.
  const DY_SPREAD = [
    { knownFrom: "2025Q3", ratio: null, label: "Overseas Dy/Tb supply tight; domestic–overseas price spread widening (Jun 2025)",
      source: "https://news.metal.com/newscontent/103310477/Dysprosium-and-Terbium-Supplies-Are-Tight-Overseas,-Price-Spread-Between-Rare-Earths-at-Home-and-Abroad-Widens-[[SMM-Analysis]]", outlet: "SMM" },
    { knownFrom: "2026Q4", ratio: 4.9, label: "Ex-China Dy ≈ 4.9× the China price (Aug 2026)", source: "https://www.fastmarkets.com/?p=135475", outlet: "Fastmarkets" },
    { knownFrom: "2026Q4", ratio: 16.3, label: "Dy CIF Europe ≈ 16.3× DDP China (end-Q3 2026)", source: "https://source.benchmarkminerals.com/article/ex-china-heavy-rare-earths-continue-to-surge-q3-2026-rare-earths-price-review", outlet: "Benchmark" },
  ];

  const CONFIG = {
    budget: 12000,            // $M — mirrors Project Vault
    politicalCapital: 100,
    maxBuyPerQ: 45,           // DoC per mineral per quarter at full import availability (assumed)
    storageRate: 0.005,       // of reserve value per quarter (assumed)
    meanReversion: 0.15,      // per quarter toward an elevated floor (assumed)
    slipP: 0.20,              // offtake slip probability per quarter (assumed)
    valuePerDowntimeDay: 20,  // $M of industrial output protected per downtime day (assumed)
    seed: 20230701,
  };

  root.GAME_DATA = { QUARTERS, MINERALS, EVENTS, BACKGROUND, COUNTERPARTIES, FORWARD, CONFIG, DY_SPREAD };
  if (typeof module !== "undefined") module.exports = root.GAME_DATA;
})(typeof window !== "undefined" ? window : globalThis);
