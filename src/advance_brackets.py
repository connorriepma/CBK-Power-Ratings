"""Fill tournament brackets from results.

Reads data/brackets.json and data/results.json. When both teams in a bracket game are known (fixed teams, or
winners/losers of earlier games that have a saved score), the game is added to data/schedule.json so it can be
scored, ingested and simulated like any other game. TBD placeholders in data/tbd_games.json for these events are
rebuilt: a team gets one on each guaranteed date it has no real game.

Safe to run any time: with nothing new it changes nothing. A game this script added earlier is moved or removed if a
corrected score changes who plays in it, unless it already has a result (then it is left alone and reported).

Usage:
    python3 src/advance_brackets.py            # write changes
    python3 src/advance_brackets.py --check    # report only
"""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


def load(name):
    return json.loads((DATA / name).read_text())


def dump(name, obj):
    (DATA / name).write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n")


def pair_key(date, a, b):
    return (date, frozenset((a, b)))


def advance(schedule, tbd, results, brackets, teams):
    """Return (schedule, tbd, report lines). Mutates and returns the lists passed in."""
    key_to_name = {t["key"]: t["team"] for t in teams}
    won = {}  # (date, {team names}) -> winner name
    for r in results:
        h, a = key_to_name.get(r["home"]), key_to_name.get(r["away"])
        if h is None or a is None or r["homeScore"] == r["awayScore"]:
            continue
        won[pair_key(r["date"], h, a)] = h if r["homeScore"] > r["awayScore"] else a

    report = []
    existing = {pair_key(g["date"], g["home"], g["away"]): g for g in schedule}
    have_result = set(won)

    for ev in brackets["events"]:
        resolved = {}  # game id -> (teamA, teamB) or None
        outcome = {}   # game id -> (winner, loser) or None

        def slot_team(slot):
            if "team" in slot:
                return slot["team"]
            src = outcome.get(slot.get("winner") or slot.get("loser"))
            if not src:
                return None
            return src[0] if "winner" in slot else src[1]

        for g in ev["games"]:
            a, b = (slot_team(s) for s in g["slots"])
            pair = (a, b) if a and b else None
            resolved[g["id"]] = pair
            outcome[g["id"]] = None
            if pair:
                k = pair_key(g["date"], *pair)
                if k in won:
                    w = won[k]
                    outcome[g["id"]] = (w, pair[1] if w == pair[0] else pair[0])

        # Add, move or remove the rows this script owns (rows carrying a "bracket" id).
        for g in ev["games"]:
            pair = resolved[g["id"]]
            owned = [r for r in schedule if r.get("bracket") == g["id"]]
            for r in owned:
                still_right = pair and {r["home"], r["away"]} == set(pair) and r["date"] == g["date"]
                if still_right:
                    continue
                if pair_key(r["date"], r["home"], r["away"]) in have_result:
                    report.append(f"WARNING {g['id']}: {r['away']} @ {r['home']} has a score but the bracket now says "
                                  f"{pair}. Left alone, check the scores.")
                    continue
                schedule.remove(r)
                existing.pop(pair_key(r["date"], r["home"], r["away"]), None)
                report.append(f"removed {g['id']}: {r['away']} vs {r['home']} (teams changed)")
            if not pair:
                continue
            k = pair_key(g["date"], *pair)
            if k in existing:
                continue
            row = {"date": g["date"], "home": pair[0], "away": pair[1], "neutral": True, "conf": False,
                   "site": ev["site"], "bracket": g["id"]}
            schedule.append(row)
            existing[k] = row
            report.append(f"added {g['id']} ({g['round']}): {pair[1]} vs {pair[0]} on {g['date']}")

        # TBD placeholders: one per team per guaranteed date with no real game.
        names = {s["team"] for g in ev["games"] for s in g["slots"] if "team" in s}
        by_team_date = {(r["home"], r["date"]) for r in schedule} | {(r["away"], r["date"]) for r in schedule}
        prefix = ev["name"]
        # Placeholders for this event: the exact name, or the name followed by a note in brackets. Not a plain prefix,
        # because one event name can start another's ("Acrisure Series" and "Acrisure Series Thanksgiving Event").
        tbd[:] = [t for t in tbd if not (t["event"] == prefix or t["event"].startswith(prefix + " ("))]
        for d in ev["guaranteedDates"]:
            for team in sorted(names):
                if (team, d) not in by_team_date:
                    tbd.append({"team": team, "date": d, "event": prefix, "site": ev["site"]})
    return schedule, tbd, report


def main(argv):
    check = "--check" in argv
    teams = load("teams.json")
    sched0, tbd0 = load("schedule.json"), load("tbd_games.json")
    schedule, tbd, report = advance(json.loads(json.dumps(sched0)), json.loads(json.dumps(tbd0)),
                                    load("results.json"), load("brackets.json"), teams)
    changed = schedule != sched0 or tbd != tbd0
    for line in report:
        print(line)
    print(f"schedule rows {len(sched0)} -> {len(schedule)}; TBD placeholders {len(tbd0)} -> {len(tbd)}"
          + ("" if changed else " (no change)"))
    if changed and not check:
        dump("schedule.json", schedule)
        dump("tbd_games.json", tbd)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
