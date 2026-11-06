#!/usr/bin/env python3
"""Merge one team's schedule into data/schedule.json without touching anything else.

Usage:
    python3 tools/schedule_merge.py incoming/howard.json            # dry run: prints the report only
    python3 tools/schedule_merge.py incoming/howard.json --apply    # writes the changes
    add --fix-dates to also move existing games whose date differs from the incoming list

Input file:
    {"team": "Howard",
     "games": [
       {"date": "2026-11-23", "opp": "Non D1 Opponent", "loc": "H"},
       {"date": "2026-11-29", "opp": "Charleston", "loc": "A"},
       {"date": "2026-02-20", "opp": "Tennessee St", "loc": "N", "site": "Phoenix, AZ"},
       {"date": "2026-12-21", "tbd_event": "UTEP event (Omaha/Kent St)", "site": "El Paso, TX"}
     ]}
    loc is H (home), A (away) or N (neutral). Names must match data/teams.json exactly.
    Exhibitions and conference tournaments are left out of the input.

Rules it enforces:
  * Only adds games that are missing. Never deletes or reorders anything.
  * A game that already exists (same teams, same date) is skipped.
  * The same two teams already playing on a nearby date is reported as a DATE CONFLICT
    and left alone unless --fix-dates is given.
  * Unknown team names stop the run before anything is written.
  * Non-D1 opponents may appear more than once on a date range; the count is compared.
"""
import json, sys, datetime as dt, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
NON_D1 = "Non D1 Opponent"


def load(p):
    return json.loads((ROOT / p).read_text())


def d(s):
    return dt.date.fromisoformat(s)


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    apply_, fix_dates = "--apply" in argv, "--fix-dates" in argv
    if len(args) != 1:
        print(__doc__); return 2
    inc = json.loads(pathlib.Path(args[0]).read_text())
    team, games = inc["team"], inc["games"]
    sched, tbd, teams = load("data/schedule.json"), load("data/tbd_games.json"), load("data/teams.json")
    conf = {t["team"]: t["conference"] for t in teams}

    problems = []
    if team not in conf: problems.append(f"unknown team: {team!r}")
    for g in games:
        if "tbd_event" in g: continue
        if g["opp"] != NON_D1 and g["opp"] not in conf: problems.append(f"unknown opponent: {g['opp']!r} ({g['date']})")
        if g.get("loc") not in ("H", "A", "N"): problems.append(f"bad loc on {g}")
        try: d(g["date"])
        except Exception: problems.append(f"bad date on {g}")
    if problems:
        print("STOPPED, nothing written:"); [print("  -", p) for p in problems]; return 1

    add, skip, conflicts, fixes = [], [], [], []
    existing = [g for g in sched if team in (g["home"], g["away"])]
    used = set()  # indexes of existing games already matched to an incoming game
    for g in games:
        if "tbd_event" in g:
            dup = any(t["team"] == team and t["date"] == g["date"] for t in tbd)
            (skip if dup else add).append(("tbd", {"team": team, "date": g["date"], "event": g["tbd_event"], "site": g.get("site", "")}))
            continue
        opp, loc = g["opp"], g["loc"]
        home, away = (team, opp) if loc == "H" else (opp, team) if loc == "A" else (team, opp)
        rec = {"date": g["date"], "home": home, "away": away, "neutral": loc == "N",
               "conf": bool(opp != NON_D1 and conf.get(opp) == conf[team] and not g.get("nonconf"))}
        if loc == "N" and g.get("site"): rec["site"] = g["site"]
        exact = [i for i, e in enumerate(existing) if i not in used and e["date"] == g["date"] and {e["home"], e["away"]} == {home, away}]
        if exact:
            used.add(exact[0]); skip.append(("game", rec)); continue
        near = [i for i, e in enumerate(existing) if i not in used and opp != NON_D1 and {e["home"], e["away"]} == {home, away}
                and abs((d(e["date"]) - d(g["date"])).days) <= 7]
        if near:
            i = near[0]; used.add(i)
            (fixes if fix_dates else conflicts).append((existing[i], rec)); continue
        add.append(("game", rec))

    print(f"Team: {team}   incoming games: {len(games)}   site has: {len(existing)}")
    print(f"  already on site: {len(skip)}   to add: {len(add)}   date conflicts: {len(conflicts) + len(fixes)}")
    for kind, r in add:
        print("  + ADD ", r if kind == "tbd" else f"{r['date']}  {r['away']} {'vs' if r['neutral'] else '@'} {r['home']}{'  (conf)' if r['conf'] else ''}")
    for e, r in conflicts:
        print(f"  ! DATE CONFLICT  site {e['date']} vs incoming {r['date']}: {e['away']} @ {e['home']}   (use --fix-dates to take the incoming date)")
    for e, r in fixes:
        print(f"  ~ FIX DATE {e['date']} -> {r['date']}: {e['away']} @ {e['home']}")
    leftover = [e for i, e in enumerate(existing) if i not in used and not any(e["date"] == s[1].get("date") and {e["home"], e["away"]} == {s[1].get("home"), s[1].get("away")} for s in skip if s[0] == "game")]
    if leftover:
        print(f"  ? on site but not in the incoming list ({len(leftover)}), left alone:")
        for e in leftover: print(f"      {e['date']}  {e['away']} @ {e['home']}")

    if not apply_:
        print("\nDry run. Nothing written."); return 0
    for e, r in fixes: e["date"] = r["date"]
    for kind, r in add:
        (tbd if kind == "tbd" else sched).append(r)
    (ROOT / "data/schedule.json").write_text(json.dumps(sched, indent=1, ensure_ascii=False) + "\n")
    (ROOT / "data/tbd_games.json").write_text(json.dumps(tbd, indent=1, ensure_ascii=False) + "\n")
    print("\nWritten. Next: python3 src/travel_miles.py (if travel miles should refresh), then run the page check.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
