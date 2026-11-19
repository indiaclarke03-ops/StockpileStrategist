#!/usr/bin/env python3
"""Fetch date-filtered Tavily news briefings per quarter (spec §6.1) → data/intel/quarters.json.

No foresight: each quarter only gets news published in the 90 days before it starts.
Needs TAVILY_API_KEY in the environment. The committed cache was produced with the
same queries via the Tavily MCP tool; re-run this to refresh it, then run build_data.py.
"""
import datetime as dt
import json
import os
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "intel" / "quarters.json"
QUARTERS = [f"{y}Q{q}" for y in (2023, 2024, 2025, 2026) for q in (1, 2, 3, 4)][2:]
QUERY_BANK = [
    "China export controls gallium germanium",
    "rare earth export restrictions dysprosium magnets",
    "DRC cobalt export",
    "antimony export controls prices",
    "graphite export China licensing",
    "critical minerals stockpile",
]
MINERAL_TERMS = {
    "gallium": ["gallium"], "germanium": ["germanium"], "antimony": ["antimony"],
    "graphite": ["graphite"], "dysprosium": ["rare earth", "dysprosium", "magnet", "terbium"],
    "cobalt": ["cobalt"],
}


def quarter_start(q: str) -> dt.date:
    return dt.date(int(q[:4]), (int(q[5]) - 1) * 3 + 1, 1)


def search(query: str, start: dt.date, end: dt.date) -> list:
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=json.dumps({
            "api_key": os.environ["TAVILY_API_KEY"], "query": query, "topic": "news",
            "start_date": start.isoformat(), "end_date": end.isoformat(), "max_results": 5,
        }).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("results", [])


def main() -> None:
    out = {"fetched": dt.date.today().isoformat(),
           "method": "Tavily /search, topic=news, window [quarter_start-90d, quarter_start-1d]",
           "quarters": {}}
    for q in QUARTERS:
        qs = quarter_start(q)
        start, end = qs - dt.timedelta(days=90), qs - dt.timedelta(days=1)
        seen, items = set(), []
        for query in QUERY_BANK:
            for r in search(query, start, end):
                date = (r.get("published_date") or "")[:10]
                # Hard no-foresight rule: keep only items dated inside the window.
                try:
                    d = dt.date.fromisoformat(date)
                except ValueError:
                    continue
                if not (start <= d <= end) or r["url"] in seen:
                    continue
                seen.add(r["url"])
                text = (r["title"] + " " + r.get("content", "")).lower()
                items.append({
                    "date": date, "title": r["title"], "url": r["url"],
                    "source": r["url"].split("/")[2].removeprefix("www."),
                    "summary": r.get("content", "")[:240],
                    "minerals": [m for m, ts in MINERAL_TERMS.items() if any(t in text for t in ts)],
                })
        items.sort(key=lambda i: i["date"], reverse=True)
        out["quarters"][q] = {"window": [start.isoformat(), end.isoformat()], "queries": QUERY_BANK, "items": items[:5]}
        print(q, len(items[:5]))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
