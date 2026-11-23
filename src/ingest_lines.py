"""Save market (betting) lines for finished games to data/market_lines.json, so the site can compare the model with the market.

DRY RUN BY DEFAULT. Without --write nothing is changed: it prints (and writes to the GitHub run summary) what it found.

Rules, all enforced in code:
  * Only season 2027, and only games that already have a result in data/results.json. The API's line for a finished game
    is its closing line, so this is what the model is graded against.
  * A game is matched to a results row the same way ingest_scores.py matches scores (same names, same date candidates).
    Anything that does not match exactly one row is reported, never guessed.
  * A game already in data/market_lines.json is never overwritten, so the saved closing line stays fixed.
  * Spread convention is the site's: negative means the HOME team is favored (a line of -7.5 is home by 7.5).
    The report checks that sign against the model's own line on the same games and warns loudly if it looks flipped.

  * --upcoming is the other mode: it saves the CURRENT line for games not yet played to data/upcoming_lines.json
    (replaced on every run, never used to grade anything). The Plays tab uses it for Suggested plays.

Usage:
    python src/ingest_lines.py --days 30          # dry run
    python src/ingest_lines.py --days 30 --write  # used by .github/workflows/ingest-lines.yml
    python src/ingest_lines.py --upcoming --write # used by .github/workflows/refresh-upcoming-lines.yml
Needs CBBD_API_KEY in the environment.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402

API = "https://api.collegebasketballdata.com/lines"
FILE = "market_lines.json"
UPCOMING = "upcoming_lines.json"
PREFERRED = ("Caesars", "Consensus", "consensus")


def fetch_lines(key: str, days: int, ahead: int = 1) -> list[dict]:
    now = datetime.now(timezone.utc)
    q = {
        "season": ing.SEASON,
        "startDateRange": (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateRange": (now + timedelta(days=ahead)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def num(x):
    return float(x) if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def provider_lines(game: dict) -> dict:
    """provider -> {spread, open, total} for every provider that gave a spread."""
    out = {}
    for ln in game.get("lines") or []:
        s = num(ln.get("spread"))
        if s is None or not ln.get("provider"):
            continue
        out[str(ln["provider"])] = {"spread": s, "open": num(ln.get("spreadOpen")), "total": num(ln.get("overUnder"))}
    return out


def match(games, names, schedule, results, existing, upcoming=False):
    """-> (new entries keyed by result id, report rows).

    Normal mode saves only games that already have a result. upcoming=True is the reverse: only games with NO result yet.
    """
    sched_by_date: dict[str, list[dict]] = {}
    for s in schedule:
        sched_by_date.setdefault(s["date"], []).append(s)
    have = {ing.result_id(r["date"], r["home"], r["away"]): r for r in results}
    new, rows = {}, []
    for g in games:
        label = f'{g.get("awayTeam")} @ {g.get("homeTeam")}'
        row = {"label": label, "status": None, "note": ""}
        rows.append(row)
        if g.get("season") not in (None, ing.SEASON):
            row.update(status="IGNORED", note=f'season={g.get("season")}')
            continue
        h, a = names.resolve(g.get("homeTeam", "")), names.resolve(g.get("awayTeam", ""))
        if h is None or a is None:
            row.update(status="IGNORED", note="not Division I vs Division I")
            continue
        lines = provider_lines(g)
        if not lines:
            row.update(status="NO LINE", note="API gave no spread")
            continue
        cands = []
        for d in ing.local_dates(g["startDate"]):
            for s in sched_by_date.get(d, []):
                if {s["home"], s["away"]} == {h, a}:
                    cands.append(s)
        cands = list({(s["date"], s["home"], s["away"]): s for s in cands}.values())
        if len(cands) != 1:
            row.update(status="UNMATCHED", note="no schedule row" if not cands else "more than one schedule row")
            continue
        s = cands[0]
        key_of = lambda t: names.by_name[t]["key"] if t in names.by_name else ing.cbk_key(t)  # noqa: E731
        hk, ak = key_of(s["home"]), key_of(s["away"])
        rid = ing.result_id(s["date"], hk, ak)
        # Match the key style used in results.json (it can differ from a plain slug).
        r = have.get(rid)
        if upcoming:
            if r is not None:
                row.update(status="ALREADY PLAYED", note="has a result")
                continue
            r = {"date": s["date"], "home": hk, "away": ak}
        elif r is None:
            row.update(status="NOT FINAL YET", note="no result saved for this game yet")
            continue
        if rid in new or (not upcoming and rid in existing):
            row.update(status="ALREADY SAVED", note="kept as is")
            continue
        if names.resolve(g["homeTeam"]) != s["home"]:
            # The schedule has the teams the other way round from the API: flip the sign so it stays home-based.
            lines = {p: {k: (-v if k in ("spread", "open") and v is not None else v) for k, v in d.items()} for p, d in lines.items()}
        new[rid] = {"date": r["date"], "home": r["home"], "away": r["away"], "lines": lines}
        row.update(status="NEW", note=", ".join(sorted(lines)))
    return new, rows


def sanity(new: dict, results: list[dict]) -> str:
    """Compare the market spread with the model's locked line on the same games (both: negative = home favored)."""
    by = {ing.result_id(r["date"], r["home"], r["away"]): r for r in results}
    agree = disagree = 0
    diffs = []
    for rid, e in new.items():
        r = by.get(rid)
        if not r or not isinstance(r.get("line"), (int, float)) or r["line"] == 0:
            continue
        p = next((e["lines"][k] for k in PREFERRED if k in e["lines"]), next(iter(e["lines"].values())))
        if abs(p["spread"]) < 0.5:
            continue
        if (p["spread"] < 0) == (r["line"] < 0):
            agree += 1
        else:
            disagree += 1
        diffs.append(abs(p["spread"] - r["line"]))
    if not agree + disagree:
        return "Sign check: no games to compare."
    msg = f"Sign check vs the model's line: favorite agrees on {agree} of {agree + disagree} games"
    if disagree > (agree + disagree) * 0.25:
        msg += ". WARNING: the sign convention may be flipped. Do not trust these lines until checked."
    if diffs:
        msg += f". Average gap between market and model line: {sum(diffs) / len(diffs):.1f} points."
    return msg


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--upcoming", action="store_true", help=f"save current lines for games not yet played to data/{UPCOMING}")
    ap.add_argument("--ahead", type=int, default=7, help="with --upcoming: how many days ahead to look")
    ap.add_argument("--write", action="store_true", help=f"save NEW lines to data/{FILE} (off by default)")
    args = ap.parse_args()
    key = os.environ.get("CBBD_API_KEY")
    if not key:
        print("CBBD_API_KEY is not set", file=sys.stderr)
        return 1
    names = ing.Names(cbk.load_json("teams.json"), cbk.load_json("ingest_aliases.json"))
    schedule, results = cbk.load_json("schedule.json"), cbk.load_json("results.json")
    path = cbk.DATA_DIR / FILE
    existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}

    if args.upcoming:
        games = fetch_lines(key, 0, args.ahead)
        new, rows = match(games, names, schedule, results, {}, upcoming=True)
    else:
        games = fetch_lines(key, args.days)
        new, rows = match(games, names, schedule, results, existing)
    counts = Counter(r["status"] for r in rows)
    provs = Counter(p for g in games for p in provider_lines(g))
    out = [f"## Market lines ({'WRITE' if args.write else 'dry run'})", "",
           f"API games: {len(games)}. " + ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())),
           "Providers seen (games): " + (", ".join(f"{k} {v}" for k, v in provs.most_common()) or "none"),
           "" if args.upcoming else sanity(new, results), ""]
    if games and not provs:
        out.append("The API answered but no game had a spread. Fields in the first game: " + ", ".join(sorted(games[0])))
    for r in rows[:60]:
        out.append(f'- {r["status"]}: {r["label"]} {r["note"]}'.rstrip())
    text = "\n".join(out)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(text + "\n", encoding="utf-8")
    if args.upcoming:
        up = cbk.DATA_DIR / UPCOMING
        if args.write and new:      # an empty answer never replaces the last good file
            stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            up.write_text(json.dumps({"updated": stamp, "games": new}, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
            print(f"Saved current lines for {len(new)} upcoming games.")
        return 0
    if args.write and new:
        merged = {**existing, **new}
        path.write_text(json.dumps(merged, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Saved {len(new)} new market lines.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
