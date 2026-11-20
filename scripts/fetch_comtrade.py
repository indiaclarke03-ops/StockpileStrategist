#!/usr/bin/env python3
"""US imports from ALL partner countries, per mineral, from the UN Comtrade public API.

Replaces the four-corridor view (China/Japan/Korea/Mexico) that overstated China's share.
No API key needed (public preview endpoint, ≤500 rows per call). Output: data/trade/comtrade_all.json.
Run build_data.py afterwards.
"""
import datetime as dt
import json
import pathlib
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "trade" / "comtrade_all.json"
URL = "https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=842&period={year}&cmdCode={hs}&flowCode=M"
YEARS = [2023, 2024, 2025]
HS = {
    "gallium": ["811292"], "germanium": ["811292"], "antimony": ["811010"],
    "graphite": ["250410", "380110"], "dysprosium": ["280530", "284690", "850511"],
    "cobalt": ["260500", "810520", "282200"],
}
NAMES = {  # ISO3 → readable name (common partners; others fall back to the ISO code)
    "CHN": "China", "JPN": "Japan", "KOR": "South Korea", "MEX": "Mexico", "DEU": "Germany", "CAN": "Canada", "IND": "India",
    "THA": "Thailand", "OMN": "Oman", "VNM": "Vietnam", "MMR": "Myanmar", "DOM": "Dominican Rep.", "GBR": "United Kingdom",
    "BEL": "Belgium", "NLD": "Netherlands", "FRA": "France", "ITA": "Italy", "ESP": "Spain", "AUS": "Australia", "BRA": "Brazil",
    "NOR": "Norway", "FIN": "Finland", "EST": "Estonia", "PHL": "Philippines", "MYS": "Malaysia", "IDN": "Indonesia", "TWN": "Taiwan",
    "S19": "Taiwan", "HKG": "Hong Kong", "SGP": "Singapore", "ZAF": "South Africa", "COD": "DR Congo", "ZMB": "Zambia", "MDG": "Madagascar",
    "MOZ": "Mozambique", "TZA": "Tanzania", "KAZ": "Kazakhstan", "RUS": "Russia", "UKR": "Ukraine", "TUR": "Turkey", "BOL": "Bolivia",
    "PER": "Peru", "CHL": "Chile", "AUT": "Austria", "CHE": "Switzerland", "SWE": "Sweden", "POL": "Poland", "CZE": "Czechia", "ISR": "Israel",
    "ARE": "UAE", "LKA": "Sri Lanka", "SVK": "Slovakia", "SVN": "Slovenia", "HUN": "Hungary", "ROU": "Romania", "PRT": "Portugal",
    "DNK": "Denmark", "IRL": "Ireland", "NZL": "New Zealand", "ARG": "Argentina", "COL": "Colombia", "CUB": "Cuba", "MAR": "Morocco",
}


# UN M49 numeric partner codes → ISO3 (the preview endpoint returns codes only). 490 = "Other Asia, nes" (Taiwan).
M49 = {156: "CHN", 392: "JPN", 410: "KOR", 484: "MEX", 276: "DEU", 124: "CAN", 699: "IND", 356: "IND", 764: "THA", 512: "OMN", 704: "VNM",
       104: "MMR", 214: "DOM", 826: "GBR", 56: "BEL", 58: "BEL", 528: "NLD", 251: "FRA", 250: "FRA", 381: "ITA", 380: "ITA", 724: "ESP", 36: "AUS",
       76: "BRA", 579: "NOR", 578: "NOR", 246: "FIN", 233: "EST", 608: "PHL", 458: "MYS", 360: "IDN", 490: "TWN", 158: "TWN", 344: "HKG",
       702: "SGP", 710: "ZAF", 180: "COD", 894: "ZMB", 450: "MDG", 508: "MOZ", 834: "TZA", 398: "KAZ", 643: "RUS", 804: "UKR", 792: "TUR",
       68: "BOL", 604: "PER", 152: "CHL", 40: "AUT", 757: "CHE", 756: "CHE", 752: "SWE", 616: "POL", 203: "CZE", 376: "ISR", 784: "ARE",
       144: "LKA", 703: "SVK", 705: "SVN", 348: "HUN", 642: "ROU", 620: "PRT", 208: "DNK", 372: "IRL", 554: "NZL", 32: "ARG", 170: "COL",
       192: "CUB", 504: "MAR", 842: "USA", 418: "LAO", 116: "KHM", 50: "BGD", 586: "PAK", 818: "EGY", 566: "NGA", 288: "GHA", 72: "BWA",
       716: "ZWE", 646: "RWA", 800: "UGA", 404: "KEN", 499: "MNE", 688: "SRB", 100: "BGR", 300: "GRC", 191: "HRV", 440: "LTU", 428: "LVA", 112: "BLR"}


def fetch(year: int, hs: str) -> list:
    for attempt in range(6):
        try:
            with urllib.request.urlopen(URL.format(year=year, hs=hs), timeout=40) as r:
                data = json.load(r).get("data", [])
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 5:
                raise
            time.sleep(8 * (attempt + 1))  # rate limited: back off and retry
    rows = [d for d in data if d.get("partnerCode") not in (0, None) and (d.get("primaryValue") or 0) > 0]
    for d in rows:
        d["partnerISO"] = d.get("partnerISO") or M49.get(d["partnerCode"], str(d["partnerCode"]))
    return rows


def main() -> None:
    out = {"fetched": dt.date.today().isoformat(), "source": "UN Comtrade public API (preview), reporter USA (842), flow M (imports), all partners",
           "method": URL, "minerals": {}}
    cache = {}
    for m, codes in HS.items():
        years = {}
        for y in YEARS:
            partners = {}
            for hs in codes:
                key = (y, hs)
                if key not in cache:
                    try:
                        cache[key] = fetch(y, hs)
                    except Exception as e:  # keep going; record the gap
                        cache[key] = []
                        print("  ! failed", y, hs, e)
                    time.sleep(3)  # be polite to the public endpoint
                for r in cache[key]:
                    iso = r.get("partnerISO") or str(r.get("partnerCode"))
                    partners[iso] = partners.get(iso, 0) + (r.get("primaryValue") or 0)
            tot = sum(partners.values())
            if tot <= 0:
                continue
            ranked = sorted(partners.items(), key=lambda kv: -kv[1])
            years[str(y)] = {
                "total": tot,
                "chinaShare": round((partners.get("CHN", 0) + partners.get("HKG", 0)) / tot, 4),
                "partners": [{"iso": iso, "country": NAMES.get(iso, iso), "value": v, "share": round(v / tot, 4)} for iso, v in ranked],
            }
        out["minerals"][m] = {"hs": codes, "years": years,
                              "note": "Gallium and germanium share basket code 811292 (also indium, niobium), so their shares are proxies." if m in ("gallium", "germanium") else ""}
        print(m, {y: (round(v["chinaShare"] * 100), len(v["partners"])) for y, v in years.items()})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1))
    print("wrote", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
