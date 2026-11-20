"""Read-only audit: compare the CollegeBasketballData season schedule with data/schedule.json.

Nothing in data/ is changed. Prints a report (also written to the Actions step summary) and, with --dump PATH, saves the
raw API games so the matching rules can be checked against real data.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402


def fetch_season(key: str, start: date, end: date, step: int = 10) -> list[dict]:
    games: dict = {}
    d = start
    while d <= end:
        e = min(d + timedelta(days=step), end + timedelta(days=1))
        q = {"season": ing.SEASON, "startDateRange": d.strftime("%Y-%m-%dT00:00:00Z"),
             "endDateRange": e.strftime("%Y-%m-%dT00:00:00Z")}
        req = urllib.request.Request(ing.API + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=120) as r:
            chunk = json.load(r)
        for g in chunk:
            games[g.get("id", id(g))] = g
        d = e
    return list(games.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", help="save the raw API games to this file")
    ap.add_argument("--from", dest="start", default="2026-11-01")
    ap.add_argument("--to", dest="end", default="2027-04-15")
    ap.add_argument("--limit", type=int, default=60, help="lines to print per section")
    args = ap.parse_args()
    key = os.environ.get("CBBD_API_KEY")
    if not key:
        print("CBBD_API_KEY is not set", file=sys.stderr)
        return 1
    teams = cbk.load_json("teams.json")
    names = ing.Names(teams, cbk.load_json("ingest_aliases.json"))
    schedule = cbk.load_json("schedule.json")
    games = fetch_season(key, date.fromisoformat(args.start), date.fromisoformat(args.end))
    if args.dump:
        Path(args.dump).write_text(json.dumps(games, ensure_ascii=False), encoding="utf-8")

    out = [f"API games: {len(games)}", "Status counts: " + ", ".join(f"{k}={v}" for k, v in Counter(g.get("status") for g in games).most_common()), ""]
    by_pair_sched = defaultdict(list)
    for s in schedule:
        by_pair_sched[frozenset((s["home"], s["away"]))].append(s)
    sched_by_date_pair = {(s["date"], frozenset((s["home"], s["away"]))): s for s in schedule}

    api_rows = []
    for g in games:
        if g.get("season") != ing.SEASON or g.get("seasonLabel") != ing.SEASON_LABEL:
            continue
        h, a = names.resolve(g["homeTeam"]), names.resolve(g["awayTeam"])
        if h is None and a is None:
            continue
        if (h is None) != (a is None):
            h, a = (h or ing.NON_D1), (a or ing.NON_D1)
        api_rows.append((g, h, a, ing.local_dates(g["startDate"])))

    missing, moved, neutral, postponed = [], [], [], []
    matched_sched = set()
    for g, h, a, dates in api_rows:
        pair = frozenset((h, a))
        hit = next((sched_by_date_pair[(d, pair)] for d in dates if (d, pair) in sched_by_date_pair), None)
        label = f'{g["awayTeam"]} @ {g["homeTeam"]} [{g["startDate"][:16]}Z, {g.get("status")}, neutral={g.get("neutralSite")}]'
        if hit:
            matched_sched.add(id(hit))
            if bool(g.get("neutralSite")) != bool(hit["neutral"]):
                neutral.append(f'{hit["date"]} {hit["away"]} @ {hit["home"]}: schedule neutral={hit["neutral"]}, API neutral={g.get("neutralSite")}')
            if g.get("status") == "postponed":
                postponed.append(f'{hit["date"]} {hit["away"]} @ {hit["home"]}: API says postponed, still on schedule')
            continue
        if g.get("status") == "postponed":
            continue
        others = [s for s in by_pair_sched.get(pair, []) if s["home"] != ing.NON_D1 and s["away"] != ing.NON_D1]
        if others and ing.NON_D1 not in pair:
            moved.append(f'{label}: schedule has {", ".join(s["date"] for s in others)}')
        else:
            missing.append(label)
    today = datetime.now(timezone.utc).date().isoformat()
    extra = [f'{s["date"]} {s["away"]} @ {s["home"]}' for s in sorted(schedule, key=lambda s: s["date"])
             if id(s) not in matched_sched and s["date"] >= args.start and s["date"] <= args.end
             and ing.NON_D1 not in (s["home"], s["away"])]
    for title, rows in (("API GAME, NO SCHEDULE ROW AT ALL", missing), ("API GAME ON A DIFFERENT DATE THAN OUR SCHEDULE", moved),
                        ("NEUTRAL FLAG DIFFERS", neutral), ("API SAYS POSTPONED, STILL ON OUR SCHEDULE", postponed),
                        ("ON OUR SCHEDULE (D1 vs D1), NOT IN API", extra)):
        out += [f"### {title} ({len(rows)})", ""] + [f"- {r}" for r in rows[:args.limit]]
        if len(rows) > args.limit:
            out.append(f"- ... and {len(rows) - args.limit} more")
        out.append("")
    text = "\n".join(out)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
