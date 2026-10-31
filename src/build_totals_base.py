"""Build data/totals/base.json: each team's tempo and offense/defense for the Totals tab.

Run from the repo root:  python src/build_totals_base.py

Starts from KenPom's 2027 preseason adjusted tempo / offense / defense, then shifts offense up and
defense down by half the gap so that each team's efficiency margin matches its site preseason
rating (display rating = 80 + 0.7 x efficiency margin). Reads the site's exact preseason ratings
from data/teams.json. Does not touch any rating file.
"""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SCALE = 0.7  # site rating points per point of efficiency margin


def team_key(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def build() -> dict:
    name_map = json.loads((DATA / "totals" / "kenpom_name_map.json").read_text())
    teams = {t["key"]: t for t in json.loads((DATA / "teams.json").read_text())}
    rows = list(csv.DictReader(open(DATA / "totals" / "kenpom_2027_preseason.csv")))
    avg_tempo = sum(float(r["adj_tempo"]) for r in rows) / len(rows)
    avg_eff = sum(float(r["adj_oe"]) for r in rows) / len(rows)

    out, missing = {}, []
    for r in rows:
        site = name_map[r["team_name"]]
        t = teams.get(team_key(site))
        if t is None:
            missing.append(site)
            continue
        gap = (t["preseason_rating"] - 80) / SCALE - float(r["adj_em"])
        out[t["key"]] = {
            "team": t["team"],
            "tempo": round(float(r["adj_tempo"]), 4),
            "oe": round(float(r["adj_oe"]) + gap / 2, 4),
            "de": round(float(r["adj_de"]) - gap / 2, 4),
        }
    if missing:
        raise SystemExit("KenPom teams with no site rating: " + ", ".join(missing))
    return {
        "avgTempo": round(avg_tempo, 4),
        "avgEff": round(avg_eff, 4),
        "scale": SCALE,
        # Starting values, expected to change as results come in.
        "errCap": 30,   # biggest total miss one game can feed back into the offsets
        "share": 0.5,   # fraction of K x miss each team's offset takes (0.5 = the two teams split it)
        "teams": out,
    }


if __name__ == "__main__":
    base = build()
    (DATA / "totals" / "base.json").write_text(json.dumps(base, indent=1, sort_keys=True) + "\n")
    print(f"{len(base['teams'])} teams, avg tempo {base['avgTempo']}, avg efficiency {base['avgEff']}")
