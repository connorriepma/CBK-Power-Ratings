"""Daily gap check: flag problems nobody would notice without watching the site. Reports only, never changes data.

Looks at the last few completed days (Pacific) and lists:
  1. schedule games with no saved score (and not on the postponed list)
  2. API games that did not match anything on our schedule, or that are final but not saved
  3. API games with a "TBD" team (the API has not named the opponent, so nothing can be matched automatically)
Exit code 1 when anything is listed, so the GitHub run fails and GitHub emails the list. No findings, no email.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402

DAYS = 3
NON_D1 = "Non D1 Opponent"


def find_gaps(games, names, schedule, results, postponed, now, days=DAYS):
    today = now.astimezone(ing.PACIFIC).date()
    lo = (today - timedelta(days=days)).isoformat()
    hi = (today - timedelta(days=1)).isoformat()
    done = {ing.result_id(r["date"], r["home"], r["away"]) for r in results}
    post = {frozenset(p["teams"]) for p in postponed}
    status = {}
    for g in games:
        h, a = names.resolve(g["homeTeam"]), names.resolve(g["awayTeam"])
        status.setdefault(frozenset((h or NON_D1, a or NON_D1)), g.get("status"))

    no_score = []
    for s in schedule:
        if not (lo <= s["date"] <= hi) or "TBD" in (s["home"], s["away"]):
            continue
        if frozenset((s["home"], s["away"])) in post:
            continue
        if ing.result_id(s["date"], ing.cbk_key(s["home"]), ing.cbk_key(s["away"])) in done:
            continue
        api = status.get(frozenset((s["home"], s["away"])))
        no_score.append(f'{s["date"]} {s["away"]} @ {s["home"]} (API status: {api or "not in the API pull"})')

    window = [g for g in games if any(lo <= d <= hi for d in ing.local_dates(g["startDate"]))]
    rows, _new = ing.classify(window, names, schedule, results, now.strftime("%Y-%m-%dT%H:%M:%S.000Z"))
    api_issues = [f'{r["label"]} ({r["score"]}): {r["note"].split(" [")[0]}' for r in rows if r["status"] == "UNMATCHED"]
    api_issues += [f'{r["label"]} ({r["score"]}): final in the API but not saved' for r in rows if r["status"] == "NEW"]
    tbd = [f'{g["awayTeam"]} @ {g["homeTeam"]} [{g.get("status")}]' for g in window
           if "TBD" in (g["homeTeam"].upper(), g["awayTeam"].upper())]
    return no_score, api_issues, tbd


def main() -> int:
    key = os.environ.get("CBBD_API_KEY")
    if not key:
        print("CBBD_API_KEY is not set", file=sys.stderr)
        return 1
    now = datetime.now(timezone.utc)
    games = ing.fetch_games(key, DAYS + 2)
    names = ing.Names(cbk.load_json("teams.json"), cbk.load_json("ingest_aliases.json"))
    no_score, api_issues, tbd = find_gaps(games, names, cbk.load_json("schedule.json"), cbk.load_json("results.json"),
                                          ing.load_postponed(), now)
    out = []
    for title, items in (("Schedule games with no saved score", no_score),
                         ("API games that do not match our schedule / are not saved", api_issues),
                         ("API games with a TBD team", tbd)):
        if items:
            out.append(f"{title} ({len(items)}):")
            out += [f"  - {i}" for i in items]
    text = "\n".join(out) if out else "No gaps found."
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(text + "\n", encoding="utf-8")
    return 1 if out else 0


if __name__ == "__main__":
    sys.exit(main())
