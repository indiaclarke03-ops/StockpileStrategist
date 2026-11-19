#!/usr/bin/env python3
"""Forward-mode live news signal (spec §6.1) → data/signals.json.

Scores the past week's headlines with a transparent keyword lexicon:
escalation terms +1, de-escalation terms −1; signal = mean item score ∈ [−1, 1].
Needs TAVILY_API_KEY. Run build_data.py afterwards.
"""
import datetime as dt
import json
import os
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "signals.json"
QUERIES = [
    "China rare earth export control suspension January 2027",
    "China export controls gallium germanium antimony",
    "DRC cobalt export quota 2027",
    "critical minerals stockpile",
]
ESCALATION = [r"\bban", r"tighten", r"control list", r"retaliat", r"restrict", r"suspend exports", r"\bhalt"]
DEESCALATION = [r"extend(ed|s)? (the )?suspension", r"extension", r"general licen[cs]e", r"truce", r"\beas(e|ing)", r"resum", r"\blift"]


def search(query: str) -> list:
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=json.dumps({"api_key": os.environ["TAVILY_API_KEY"], "query": query,
                         "topic": "news", "time_range": "week", "max_results": 8}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("results", [])


def main() -> None:
    items, seen = [], set()
    for q in QUERIES:
        for r in search(q):
            if r["url"] in seen:
                continue
            seen.add(r["url"])
            text = (r["title"] + " " + r.get("content", "")).lower()
            esc = [p for p in ESCALATION if re.search(p, text)]
            de = [p for p in DEESCALATION if re.search(p, text)]
            score = (len(esc) > len(de)) - (len(de) > len(esc))
            items.append({"date": (r.get("published_date") or "")[:10], "title": r["title"], "url": r["url"],
                          "source": r["url"].split("/")[2].removeprefix("www."), "score": score,
                          "matched": esc + [f"−{d}" for d in de]})
    signal = max(-1.0, min(1.0, sum(i["score"] for i in items) / max(1, len(items))))
    OUT.write_text(json.dumps({"fetched": dt.date.today().isoformat(), "method": "Tavily /search topic=news time_range=week + keyword lexicon",
                               "lexicon": {"escalation": ESCALATION, "deescalation": DEESCALATION},
                               "items": items, "signal": round(signal, 3)}, indent=2, ensure_ascii=False))
    print(f"{len(items)} items, signal {signal:+.2f}")


if __name__ == "__main__":
    main()
