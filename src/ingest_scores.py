"""Pull final scores from the CollegeBasketballData API and match them to schedule.json.

DRY RUN BY DEFAULT. Without --write this script changes nothing: it prints (and writes to the
GitHub run summary) what it found and how each game compares with data/results.json.

Safeguards, all enforced in code:
  * Only season 2027 (the 2026-27 season) is accepted. Any other season is ignored.
  * Only games marked final, with two different scores.
  * A game is saved only if it matches exactly one row of data/schedule.json (same two teams,
    date within the Eastern/Pacific local-date candidates). Anything else is reported, never guessed.
  * A result already in data/results.json is never overwritten, even if the score differs.
  * Team names resolve only by exact name, cleanup (State->St, punctuation) or data/ingest_aliases.json.
  * --write refuses to add more than --max-new games in one run.

Usage:
    python src/ingest_scores.py                  # dry run, last 3 days of games
    python src/ingest_scores.py --days 7
    python src/ingest_scores.py --write          # NOT used by any workflow yet
Needs CBBD_API_KEY in the environment.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cbk_ratings as cbk  # noqa: E402

DATA = cbk.DATA_DIR
API = "https://api.collegebasketballdata.com/games"
SEASON = 2027
SEASON_LABEL = "20262027"
NON_D1 = "Non D1 Opponent"
EASTERN, PACIFIC = ZoneInfo("America/New_York"), ZoneInfo("America/Los_Angeles")


# ---------- names ----------

def norm(s: str) -> str:
    s = s.lower().replace("&", "and").replace("'", "").replace("’", "").replace(".", "")
    s = re.sub(r"\bstate\b", "st", s)
    s = re.sub(r"\bsaint\b", "st", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


class Names:
    def __init__(self, teams: list[dict], aliases: dict):
        self.by_name = {t["team"]: t for t in teams}
        by_norm: dict[str, set] = {}
        for t in teams:
            by_norm.setdefault(norm(t["team"]), set()).add(t["team"])
        self.by_norm = {k: next(iter(v)) for k, v in by_norm.items() if len(v) == 1}
        self.aliases = {k: v for k, v in aliases.items() if v in self.by_name}

    def resolve(self, api_name: str) -> str | None:
        if api_name in self.by_name:
            return api_name
        if api_name in self.aliases:
            return self.aliases[api_name]
        return self.by_norm.get(norm(api_name))


# ---------- API ----------

def fetch_games(key: str, days: int) -> list[dict]:
    now = datetime.now(timezone.utc)
    q = {
        "season": SEASON,
        "startDateRange": (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endDateRange": (now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


# ---------- matching ----------

def local_dates(start_iso: str) -> list[str]:
    t = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    return sorted({t.astimezone(EASTERN).date().isoformat(), t.astimezone(PACIFIC).date().isoformat()})


def result_id(date: str, a: str, b: str) -> str:
    return date + "_" + "_".join(sorted((a, b)))


def current_line(home: str, away: str, neutral: bool, date: str, ratings: dict, hc: dict, mods: dict):
    """The line the site would lock for this game right now (home team's spread, negative = home favored)."""
    if home not in ratings or away not in ratings:
        return None
    m = cbk.predicted_margin(ratings[home], ratings[away], hc[home], neutral)
    m += cbk.home_bonus(mods, {"date": date, "home": home, "away": away})
    s = cbk.spread(m)
    return 0 if s == 0 else -s


def classify(games, names: Names, schedule, results, now_iso):
    """Return (rows, new_entries). Each row is a dict for the report; nothing is written here."""
    teams = list(names.by_name.values())
    key_of = {t["team"]: t["key"] for t in teams}
    start = {t["key"]: t["preseason_rating"] for t in teams}
    hc = {t["key"]: t["home_court"] for t in teams}
    cfg = cbk.Config.from_dict(cbk.load_json("rating_config.json"))
    mods = cbk.build_game_mods(schedule, teams)
    ratings, _ = cbk.replay(start, hc, results, cfg, mods)

    sched_by_date: dict[str, list[dict]] = {}
    for g in schedule:
        sched_by_date.setdefault(g["date"], []).append(g)
    existing = {result_id(r["date"], r["home"], r["away"]): r for r in results}

    rows, new, seen = [], [], set()
    for g in sorted(games, key=lambda x: x["startDate"]):
        label = f'{g["awayTeam"]} @ {g["homeTeam"]}'
        row = {"label": label, "score": f'{g.get("awayPoints")}-{g.get("homePoints")}', "status": None, "note": ""}
        rows.append(row)
        if g.get("season") != SEASON or g.get("seasonLabel") != SEASON_LABEL:
            row.update(status="IGNORED", note=f'not the 2026-27 season (season={g.get("season")})')
            continue
        if g.get("status") != "final" or g.get("homePoints") is None or g.get("awayPoints") is None:
            row.update(status="SKIPPED", note=f'not final (status={g.get("status")})')
            continue
        if g["homePoints"] == g["awayPoints"]:
            row.update(status="SKIPPED", note="tied score, not saved")
            continue
        h, a = names.resolve(g["homeTeam"]), names.resolve(g["awayTeam"])
        if h is None and a is None:
            row.update(status="IGNORED", note="neither team is Division I")
            continue
        cands = []
        for d in local_dates(g["startDate"]):
            for s in sched_by_date.get(d, []):
                if h and a and {s["home"], s["away"]} == {h, a}:
                    cands.append(s)
                elif (h is None) != (a is None):
                    d1 = h or a
                    if {s["home"], s["away"]} == {d1, NON_D1}:
                        cands.append(s)
        cands = list({(s["date"], s["home"], s["away"]): s for s in cands}.values())
        if len(cands) != 1:
            unresolved = [n for n, r in ((g["homeTeam"], h), (g["awayTeam"], a)) if r is None] if (h is None) != (a is None) else []
            why = "no schedule row matches" if not cands else "more than one schedule row matches"
            hint = f' (unrecognized name: {", ".join(unresolved)}: if it is a D1 team, add it to data/ingest_aliases.json)' if unresolved and not cands else ""
            row.update(status="UNMATCHED", note=why + hint)
            continue
        s = cands[0]
        pts = {g["homeTeam"]: g["homePoints"], g["awayTeam"]: g["awayPoints"]}
        names_of = {}
        for api_name, res in ((g["homeTeam"], h), (g["awayTeam"], a)):
            names_of[res if res else NON_D1] = api_name
        home_score = pts[names_of[s["home"]]]
        away_score = pts[names_of[s["away"]]]
        hk, ak = key_of.get(s["home"], cbk_key(s["home"])), key_of.get(s["away"], cbk_key(s["away"]))
        rid = result_id(s["date"], hk, ak)
        if rid in seen:
            row.update(status="SKIPPED", note="duplicate in this pull")
            continue
        seen.add(rid)
        if bool(g.get("neutralSite")) != bool(s["neutral"]):
            row["note"] = f'neutral-site flag differs (API {g.get("neutralSite")}, schedule {s["neutral"]}); schedule used. '
        row["sched"] = f'{s["date"]} {s["away"]} @ {s["home"]}'
        old = existing.get(rid)
        if old:
            same = old["homeScore"] == home_score and old["awayScore"] == away_score
            row.update(status="MATCHES YOURS" if same else "DIFFERS FROM YOURS",
                       note=row["note"] + ("" if same else f'you entered {old["awayScore"]}-{old["homeScore"]} (away-home); left untouched'))
            continue
        line = current_line(hk, ak, bool(s["neutral"]), s["date"], ratings, hc, mods)
        entry = {"date": s["date"], "home": hk, "away": ak, "neutral": bool(s["neutral"]),
                 "homeScore": home_score, "awayScore": away_score, "line": line, "ts": now_iso}
        row.update(status="NEW", note=row["note"] + f'would save {away_score}-{home_score} (away-home), line {line}')
        new.append(entry)
    return rows, new


def cbk_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# ---------- output ----------

def serialize(rows: list[dict]) -> str:
    """Same format as the site's js/store.js serialize()."""
    if not rows:
        return "[]\n"
    ordered = sorted(rows, key=lambda r: (r["date"], r["home"] + r["away"]))
    return "[\n" + ",\n".join(json.dumps(r, separators=(",", ":"), ensure_ascii=False) for r in ordered) + "\n]\n"


def report(rows, new, dry: bool) -> str:
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    out = [f'## Score ingestion ({"DRY RUN: nothing saved" if dry else "WRITE MODE"})', "",
           f'Games pulled: {len(rows)}. ' + ", ".join(f"{k}: {v}" for k, v in sorted(counts.items())), ""]
    for status in ("DIFFERS FROM YOURS", "UNMATCHED", "NEW", "MATCHES YOURS", "SKIPPED", "IGNORED"):
        sel = [r for r in rows if r["status"] == status]
        if not sel:
            continue
        out += [f"### {status} ({len(sel)})", ""]
        if status == "IGNORED":
            out.append(f"{len(sel)} games with no Division I team or from another season.")
        else:
            for r in sel:
                out.append(f'- {r["label"]}  {r["score"]}  {r["note"]}'.rstrip())
        out.append("")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--write", action="store_true", help="save NEW results to data/results.json (off by default)")
    ap.add_argument("--max-new", type=int, default=300)
    args = ap.parse_args()

    key = os.environ.get("CBBD_API_KEY")
    if not key:
        print("CBBD_API_KEY is not set", file=sys.stderr)
        return 1
    teams = cbk.load_json("teams.json")
    names = Names(teams, cbk.load_json("ingest_aliases.json"))
    schedule = cbk.load_json("schedule.json")
    results = cbk.load_json("results.json")
    games = fetch_games(key, args.days)
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    rows, new = classify(games, names, schedule, results, now_iso)

    text = report(rows, new, dry=not args.write)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(text + "\n", encoding="utf-8")

    if args.write and new:
        if len(new) > args.max_new:
            print(f"Refusing to save {len(new)} games (limit {args.max_new}).", file=sys.stderr)
            return 1
        (DATA / "results.json").write_text(serialize(results + new), encoding="utf-8")
        print(f"Saved {len(new)} new results.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
