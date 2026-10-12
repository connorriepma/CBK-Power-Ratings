"""Lock each team's preseason rating once its first rated game is in results.json.

Usage:
    python src/lock_preseason.py          # adds locks for teams that now have a game; checks the rest

A team's preseason rating (data/teams.json) may be edited freely until its first result
exists. After that it is recorded in data/preseason_locks.json and must not change, because
every rating is replayed from it. Exits 1 if a locked rating no longer matches teams.json.
"""

import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


def played_keys(results, keys):
    """Team keys with at least one rated game (both teams in teams.json)."""
    out = set()
    for g in results:
        if g["home"] in keys and g["away"] in keys:
            out.update((g["home"], g["away"]))
    return out


def lock(teams, results, locks):
    """Return (new locks dict, list of mismatch messages). Never overwrites an existing lock."""
    start = {t["key"]: t["preseason_rating"] for t in teams}
    new = dict(locks)
    problems = []
    for k in sorted(played_keys(results, start)):
        if k not in new:
            new[k] = start[k]
        elif new[k] != start[k]:
            problems.append(f"{k}: locked {new[k]} but teams.json has {start[k]}")
    return new, problems


def main():
    load = lambda n: json.loads((DATA / n).read_text(encoding="utf-8"))
    locks = load("preseason_locks.json")
    new, problems = lock(load("teams.json"), load("results.json"), locks)
    if problems:
        print("Preseason rating changed after the team's first game:\n  " + "\n  ".join(problems))
        sys.exit(1)
    if new != locks:
        (DATA / "preseason_locks.json").write_text(
            json.dumps(dict(sorted(new.items())), indent=1) + "\n", encoding="utf-8")
        print(f"Locked {len(new) - len(locks)} team(s).")
    else:
        print("No new locks.")


if __name__ == "__main__":
    main()
