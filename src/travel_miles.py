"""Tag long conference trips in data/schedule.json (a note only, never used in ratings).

Every non-neutral conference game where the road team travels THRESHOLD miles or more (straight line
between campuses, from data/campuses.json) gets "travelMiles" in schedule.json. Games below the
threshold have the field removed, so re-running after a schedule change keeps it current.

Usage:
    python src/travel_miles.py
"""

import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
THRESHOLD = 1500


def key(name):
    import re
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def miles(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 3959 * 2 * math.asin(math.sqrt(h))


def tag(schedule, teams, campuses, threshold=THRESHOLD):
    """Set or clear travelMiles on each game in place. Returns the number of tagged games."""
    by_name = {t["team"]: t["key"] for t in teams}
    n = 0
    for g in schedule:
        g.pop("travelMiles", None)
        h, a = by_name.get(g["home"]), by_name.get(g["away"])
        if not g.get("conf") or g.get("neutral") or h not in campuses or a not in campuses:
            continue
        d = round(miles(campuses[h], campuses[a]))
        if d >= threshold:
            g["travelMiles"] = d
            n += 1
    return n


def main():
    load = lambda n: json.loads((DATA / n).read_text(encoding="utf-8"))
    sched = load("schedule.json")
    n = tag(sched, load("teams.json"), load("campuses.json"))
    (DATA / "schedule.json").write_text(json.dumps(sched, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{n} games tagged at {THRESHOLD}+ miles")


if __name__ == "__main__":
    main()
