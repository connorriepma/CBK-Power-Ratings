"""Compare the CollegeBasketballData season schedule with data/schedule.json, and optionally apply the API's version.

Default is a dry run: nothing in data/ changes, the report lists what WOULD change. With --apply the changes are written
to data/schedule.json (and data/postponed.json) and every one is appended to data/schedule_changes.json so it can be
reviewed afterwards.

The API wins where it differs, with these guards (those cases are reported, never changed):
  * a schedule row that already has a saved score
  * a row that belongs to a bracket, or that you gave a site / hcaMod
  * a game between two teams of the same bracket event (the bracket automation owns those)
  * neutral flag: API "neutral" is applied, but API "not neutral" never overrides a neutral game you entered
    (the API does not know about neutral doubleheaders and showcases)
Games on our schedule that the API does not have are only listed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402

PROTECTED_KEYS = ("bracket", "site", "hcaMod")


def fetch_season(key: str, start: date, end: date, step: int = 10) -> list[dict]:
    games: dict = {}
    d = start
    while d <= end:
        e = min(d + timedelta(days=step), end + timedelta(days=1))
        q = {"season": ing.SEASON, "startDateRange": d.strftime("%Y-%m-%dT00:00:00Z"),
             "endDateRange": e.strftime("%Y-%m-%dT00:00:00Z")}
        req = urllib.request.Request(ing.API + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + key})
        for attempt in range(4):        # the API now and then answers 502; wait and try again
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    chunk = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if (e.code < 500 and e.code != 429) or attempt == 3:
                    raise
                time.sleep(20 * (attempt + 1) if e.code == 429 else 5 * (attempt + 1))
        for g in chunk:
            games[g.get("id", id(g))] = g
        d = e
    return list(games.values())


def game_date(start_iso: str) -> str:
    """The date a game is listed under: its US Eastern date. Evening starts (7 pm ET = 00:00 UTC) stay on the day they
    were played, and the API's date-only stamps (midnight ET, or 23:59 ET for the previous day) land on their own day."""
    t = datetime.fromisoformat(start_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    return t.astimezone(ing.EASTERN).date().isoformat()


def bracket_pairs(brackets: dict) -> set:
    out = set()
    for ev in brackets.get("events", []):
        teams = sorted({s["team"] for g in ev["games"] for s in g["slots"] if "team" in s})
        out.add(tuple(teams))
    return out


def plan(games, names, schedule, results, brackets, tbd=None):
    """Return (changes, notes). changes: list of dicts {type, ...}; nothing is modified."""
    tbd = tbd or []
    tbd_site = {(x["team"], x["date"]): x.get("site") for x in tbd}
    done = {ing.result_id(r["date"], r["home"], r["away"]) for r in results}
    ev_teams = [set(t) for t in bracket_pairs(brackets)]

    def in_bracket_event(a, b):
        return any(a in t and b in t for t in ev_teams)

    def has_result(s):
        return ing.result_id(s["date"], ing.cbk_key(s["home"]), ing.cbk_key(s["away"])) in done

    def protected(s):
        return has_result(s) or any(k in s for k in PROTECTED_KEYS)

    def protected_nosite(s):         # a placeholder row may carry its tournament's site; it is still a placeholder
        return has_result(s) or any(k in s for k in ("bracket", "hcaMod"))

    by_dp = {(s["date"], frozenset((s["home"], s["away"]))): s for s in schedule}
    by_pair = defaultdict(list)
    for s in schedule:
        by_pair[frozenset((s["home"], s["away"]))].append(s)

    api_rows, notes = [], []
    for g in games:
        if g.get("season") != ing.SEASON or g.get("seasonLabel") != ing.SEASON_LABEL:
            continue
        h, a = names.resolve(g["homeTeam"]), names.resolve(g["awayTeam"])
        if h is None and a is None:
            continue
        if g.get("status") == "final" and g.get("homePoints") == g.get("awayPoints"):
            # "final" with a tied score (0-0): the API's placeholder for a pairing that was never played.
            notes.append(f'ignored, API lists it final with a tied score: {game_date(g["startDate"])} {g["awayTeam"]} @ {g["homeTeam"]}')
            continue
        if (h is None) != (a is None):
            h, a = (h or ing.NON_D1), (a or ing.NON_D1)
        api_rows.append({"g": g, "h": h, "a": a, "pair": frozenset((h, a)), "date": game_date(g["startDate"]),
                         "cands": ing.local_dates(g["startDate"])})

    changes, matched = [], set()
    unmatched = []
    for r in api_rows:
        hit = next((by_dp[(d, r["pair"])] for d in [r["date"]] + r["cands"] if (d, r["pair"]) in by_dp), None)
        if hit is None:
            unmatched.append(r)
            continue
        matched.add(id(hit))
        g = r["g"]
        if g.get("status") == "postponed":
            if protected(hit):
                notes.append(f'API says postponed but not changed (protected row): {hit["date"]} {hit["away"]} @ {hit["home"]}')
            else:
                changes.append({"type": "postpone", "row": dict(hit)})
            continue
        api_neutral = bool(g.get("neutralSite"))
        if api_neutral and not hit["neutral"]:
            if protected(hit):
                notes.append(f'neutral differs, not changed (protected row): {hit["date"]} {hit["away"]} @ {hit["home"]} (API neutral)')
            else:
                changes.append({"type": "neutral", "row": dict(hit), "to": True})
        elif not api_neutral and hit["neutral"]:
            notes.append(f'kept your neutral game: {hit["date"]} {hit["away"]} @ {hit["home"]} (API says not neutral)')

    # Unmatched API games: same pair on another date -> move; otherwise add.
    by_pair_api = defaultdict(list)
    for r in unmatched:
        by_pair_api[r["pair"]].append(r)
    for pair, rows in by_pair_api.items():
        a_name, b_name = sorted(pair) if len(pair) == 2 else (None, None)
        rows = [r for r in rows if r["g"].get("status") != "postponed"]
        free = [s for s in by_pair.get(pair, []) if id(s) not in matched and ing.NON_D1 not in pair]
        pairs_by_gap = sorted(((abs((date.fromisoformat(r["date"]) - date.fromisoformat(s["date"])).days), i, j)
                               for i, r in enumerate(rows) for j, s in enumerate(free)))
        used_r, used_s = set(), set()
        for gap, i, j in pairs_by_gap:
            if i in used_r or j in used_s:
                continue
            used_r.add(i)
            used_s.add(j)
            r, s = rows[i], free[j]
            matched.add(id(s))
            if in_bracket_event(r["h"], r["a"]) or protected(s):
                notes.append(f'date differs, not changed (protected/bracket): {s["date"]} {s["away"]} @ {s["home"]} -> API {r["date"]}')
                continue
            changes.append({"type": "date", "row": dict(s), "to": r["date"]})
        for i, r in enumerate(rows):
            if i in used_r:
                continue
            if in_bracket_event(r["h"], r["a"]):
                notes.append(f'bracket game left to the bracket automation: {r["date"]} {r["g"]["awayTeam"]} @ {r["g"]["homeTeam"]}')
                continue
            row = {"date": r["date"], "home": r["h"], "away": r["a"],
                   "neutral": bool(r["g"].get("neutralSite")), "conf": bool(r["g"].get("conferenceGame", False))}
            site = tbd_site.get((r["h"], r["date"])) or tbd_site.get((r["a"], r["date"]))
            if site:                    # a tournament game we had a placeholder for: keep the event's site
                row["site"] = site
            stand_ins = [s for s in schedule if s["date"] == r["date"] and ing.NON_D1 in (s["home"], s["away"])
                         and ({s["home"], s["away"]} - {ing.NON_D1}) <= {r["h"], r["a"]} and not protected_nosite(s)]
            if stand_ins and ing.NON_D1 not in (r["h"], r["a"]):
                row.setdefault("site", next((s["site"] for s in stand_ins if s.get("site")), None) or None)
                if row.get("site") is None:
                    del row["site"]
                changes.append({"type": "replace", "row": row, "remove": [dict(s) for s in stand_ins],
                                "final": r["g"].get("status") == "final"})
                continue
            changes.append({"type": "add", "row": row, "final": r["g"].get("status") == "final"})
    # A team cannot play twice in one day: a move or an add that would double-book a team is reported, not made.
    busy = defaultdict(int)
    for s in schedule:
        for tm in (s["home"], s["away"]):
            if tm != ing.NON_D1:
                busy[(tm, s["date"])] += 1
    for c in changes:
        if c["type"] == "date":
            for tm in (c["row"]["home"], c["row"]["away"]):
                if tm != ing.NON_D1:
                    busy[(tm, c["row"]["date"])] -= 1
        elif c["type"] == "replace":
            for s in c["remove"]:
                for tm in (s["home"], s["away"]):
                    if tm != ing.NON_D1:
                        busy[(tm, s["date"])] -= 1
    kept = []
    for c in changes:
        if c["type"] in ("date", "add", "replace"):
            r, d = c["row"], c.get("to", c["row"]["date"])
            clash = [tm for tm in (r["home"], r["away"]) if tm != ing.NON_D1 and busy[(tm, d)] > 0]
            if clash:
                notes.append(f'CONFLICT, not changed: {describe(c)} would double-book {", ".join(clash)} (already has a game that day)')
                if c["type"] == "date":
                    for tm in (r["home"], r["away"]):
                        if tm != ing.NON_D1:
                            busy[(tm, r["date"])] += 1
                continue
            for tm in (r["home"], r["away"]):
                if tm != ing.NON_D1:
                    busy[(tm, d)] += 1
        kept.append(c)
    changes = kept
    lo = min((r["date"] for r in api_rows), default="0")
    hi = max((r["date"] for r in api_rows), default="9")
    for s in sorted(schedule, key=lambda s: s["date"]):
        if id(s) not in matched and lo <= s["date"] <= hi and ing.NON_D1 not in (s["home"], s["away"]) \
                and not any(c["type"] == "date" and c["row"] is s for c in changes):
            notes.append(f'on our schedule, not in the API (left alone): {s["date"]} {s["away"]} @ {s["home"]}')
    return changes, notes


def describe(c) -> str:
    r = c["row"]
    base = f'{r["date"]} {r["away"]} @ {r["home"]}'
    if c["type"] == "add":
        return f'ADD {base}' + (" (neutral)" if r["neutral"] else "") + (" [already final in API]" if c.get("final") else "")
    if c["type"] == "replace":
        gone = ", ".join(f'{s["away"]} @ {s["home"]}' for s in c["remove"])
        return f'REPLACE {gone} -> {base}' + (" [already final in API]" if c.get("final") else "")
    if c["type"] == "date":
        return f'DATE {base} -> {c["to"]}'
    if c["type"] == "neutral":
        return f'NEUTRAL {base}: now neutral (API)'
    return f'POSTPONED {base}: removed, added to postponed list'


def drop_filled_placeholders(schedule, tbd):
    """TBD placeholders (data/tbd_games.json) are one per team per tournament date with no real game: drop the ones
    that now have a real game (same rule as src/advance_brackets.py)."""
    busy = {(tm, s["date"]) for s in schedule for tm in (s["home"], s["away"])}
    return [x for x in tbd if (x["team"], x["date"]) not in busy]


def apply(changes, schedule, postponed):
    sched = list(schedule)
    for c in changes:
        r = c["row"]
        if c["type"] == "add":
            sched.append(r)
        elif c["type"] == "replace":
            gone = {(s["date"], s["home"], s["away"]) for s in c["remove"]}
            sched = [s for s in sched if (s["date"], s["home"], s["away"]) not in gone]
            sched.append(r)
        else:
            idx = next(i for i, s in enumerate(sched) if (s["date"], s["home"], s["away"]) == (r["date"], r["home"], r["away"]))
            if c["type"] == "date":
                sched[idx] = {**sched[idx], "date": c["to"]}
            elif c["type"] == "neutral":
                sched[idx] = {**sched[idx], "neutral": True}
            else:
                del sched[idx]
                postponed = postponed + [{"teams": [r["home"], r["away"]], "conf": bool(r.get("conf", False)),
                                          "note": f'API status postponed (was {r["date"]}). New date not set.'}]
    return sched, postponed


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    ap.add_argument("--from", dest="start", default="2026-11-01")
    ap.add_argument("--to", dest="end", default="2027-04-15")
    ap.add_argument("--day", help="YYYY-MM-DD: list every API game that day and whether our schedule has it (report only)")
    args = ap.parse_args()
    key = os.environ.get("CBBD_API_KEY")
    if not key:
        print("CBBD_API_KEY is not set", file=sys.stderr)
        return 1
    teams = cbk.load_json("teams.json")
    names = ing.Names(teams, cbk.load_json("ingest_aliases.json"))
    schedule, results = cbk.load_json("schedule.json"), cbk.load_json("results.json")
    brackets, postponed = cbk.load_json("brackets.json"), ing.load_postponed()
    tbd = cbk.load_json("tbd_games.json")
    if args.day:
        d0 = date.fromisoformat(args.day)
        games = fetch_season(key, d0 - timedelta(days=1), d0 + timedelta(days=1))
        have = {(s["date"], frozenset((s["home"], s["away"]))) for s in schedule}
        lines = []
        for g in games:
            if game_date(g["startDate"]) != args.day:
                continue
            h, a = names.resolve(g["homeTeam"]), names.resolve(g["awayTeam"])
            if h is None and a is None:
                tag = "both non-D1/unknown"
            else:
                pair = frozenset(((h or ing.NON_D1), (a or ing.NON_D1)))
                tag = "on schedule" if any((d, pair) in have for d in [args.day] + ing.local_dates(g["startDate"])) else "MISSING FROM SCHEDULE"
                if h is None or a is None:
                    tag += f' (unrecognized name: {g["homeTeam"] if h is None else g["awayTeam"]})'
            lines.append(f'{tag}: {g["awayTeam"]} @ {g["homeTeam"]} [{g["startDate"][11:16]}Z {g.get("status")} neutral={g.get("neutralSite")}]')
        lines.sort()
        sched_day = [s for s in schedule if s["date"] == args.day]
        print(f"API games dated {args.day}: {len(lines)}; our schedule: {len(sched_day)}")
        print("\n".join(lines))
        return 0
    games = fetch_season(key, date.fromisoformat(args.start), date.fromisoformat(args.end))
    changes, notes = plan(games, names, schedule, results, brackets, tbd)

    out = [f"API games: {len(games)}", f"Mode: {'APPLY' if args.apply else 'dry run (nothing written)'}", ""]
    for t in ("add", "replace", "date", "neutral", "postpone"):
        sel = [c for c in changes if c["type"] == t]
        out += [f"### {t.upper()} ({len(sel)})", ""] + [f"- {describe(c)}" for c in sel] + [""]
    out += [f"### NOT CHANGED, FOR YOUR INFORMATION ({len(notes)})", ""] + [f"- {n}" for n in notes] + [""]
    text = "\n".join(out)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        Path(summary).write_text(text + "\n", encoding="utf-8")

    if args.apply and changes:
        new_sched, new_post = apply(changes, schedule, postponed)
        (ing.DATA / "schedule.json").write_text(json.dumps(new_sched, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        (ing.DATA / "postponed.json").write_text(json.dumps(new_post, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        new_tbd = drop_filled_placeholders(new_sched, tbd)
        if len(new_tbd) != len(tbd):
            (ing.DATA / "tbd_games.json").write_text(json.dumps(new_tbd, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Dropped {len(tbd) - len(new_tbd)} TBD placeholders that now have a real game.")
        log_path = ing.DATA / "schedule_changes.json"
        log = json.loads(log_path.read_text(encoding="utf-8")) if log_path.exists() else []
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        log += [{"at": now, "change": describe(c), "type": c["type"]} for c in changes]
        log_path.write_text(json.dumps(log, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Applied {len(changes)} changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
