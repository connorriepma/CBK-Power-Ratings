"""Bracket games appear in the schedule once both teams are known. Run: python -m unittest discover -s tests"""

import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import advance_brackets as ab  # noqa: E402

TEAMS = json.loads((ROOT / "data/teams.json").read_text())
BRACKETS = json.loads((ROOT / "data/brackets.json").read_text())
KEY = {t["team"]: t["key"] for t in TEAMS}


def result(date, home, away, hs, as_):
    return {"date": date, "home": KEY[home], "away": KEY[away], "neutral": True, "homeScore": hs, "awayScore": as_}


def first_round_rows(ev):
    rows = []
    for g in ev["games"]:
        if all("team" in s for s in g["slots"]):
            a, b = (s["team"] for s in g["slots"])
            rows.append({"date": g["date"], "home": a, "away": b, "neutral": True, "conf": False, "site": ev["site"]})
    return rows


def run(schedule, tbd, results, brackets=BRACKETS):
    return ab.advance(copy.deepcopy(schedule), copy.deepcopy(tbd), copy.deepcopy(results), brackets, TEAMS)


class AdvanceBrackets(unittest.TestCase):
    def setUp(self):
        self.pe8 = BRACKETS["events"][0]
        self.sched = first_round_rows(BRACKETS["events"][0]) + first_round_rows(BRACKETS["events"][1])

    def games_on(self, schedule, date):
        return {frozenset((g["home"], g["away"])) for g in schedule if g["date"] == date}

    def test_nothing_played_adds_nothing_and_idempotent(self):
        s, t, rep = run(self.sched, [], [])
        self.assertEqual(s, self.sched)
        s2, t2, _ = run(s, t, [])
        self.assertEqual((s2, t2), (s, t))
        self.assertEqual(len(t), 16 + 32)  # 8 teams x 2 dates, 16 teams x 2 dates

    def test_semifinal_and_consolation_appear_after_first_round(self):
        res = [result("2026-11-17", "Houston", "Rutgers", 70, 60), result("2026-11-17", "Florida", "Notre Dame", 60, 70)]
        s, t, _ = run(self.sched, [], res)
        day = self.games_on(s, "2026-11-18")
        self.assertIn(frozenset(("Houston", "Notre Dame")), day)   # semifinal 1: winners
        self.assertIn(frozenset(("Rutgers", "Florida")), day)      # consolation 1: losers
        self.assertEqual(len(day), 2)                              # the other side is not decided yet
        # a team with a real Nov 18 game no longer has a placeholder that day
        left = {(x["team"], x["date"]) for x in t}
        self.assertNotIn(("Houston", "2026-11-18"), left)
        self.assertIn(("Houston", "2026-11-19"), left)
        self.assertIn(("Kansas", "2026-11-18"), left)

    def test_full_bracket_plays_out(self):
        for ev in BRACKETS["events"]:
            sched, tbd, res = first_round_rows(BRACKETS["events"][0]) + first_round_rows(BRACKETS["events"][1]), [], []
            played = set()
            for _ in range(10):  # play every game that exists, then see what the bracket adds
                sched, tbd, _ = run(sched, tbd, res)
                new = [g for g in sched if (g["date"], frozenset((g["home"], g["away"]))) not in played]
                if not new:
                    break
                for g in new:  # the first-listed team always wins by 5
                    played.add((g["date"], frozenset((g["home"], g["away"]))))
                    res.append(result(g["date"], g["home"], g["away"], 75, 70))
            n_games = len([g for g in ev["games"]])
            mine = [g for g in sched if g["date"] >= ev["games"][0]["date"] and g["date"] <= ev["games"][-1]["date"]
                    and (g["home"] in {s["team"] for x in ev["games"] for s in x["slots"] if "team" in s})]
            self.assertEqual(len(mine), n_games, ev["name"])
            self.assertEqual([t for t in tbd if t["event"] == ev["name"]], [], ev["name"])
            counts = {}
            for g in mine:
                for n in (g["home"], g["away"]):
                    counts[n] = counts.get(n, 0) + 1
            self.assertTrue(set(counts.values()) <= {3, 4}, counts)  # three guaranteed games, finalists play a fourth (16-team)
            self.assertEqual(len(counts), 8 if ev["name"] == "Players Era 8" else 16)

    def test_corrected_score_moves_the_unplayed_game(self):
        res = [result("2026-11-17", "Houston", "Rutgers", 70, 60), result("2026-11-17", "Florida", "Notre Dame", 60, 70)]
        s, t, _ = run(self.sched, [], res)
        self.assertIn(frozenset(("Houston", "Notre Dame")), self.games_on(s, "2026-11-18"))
        res[0] = result("2026-11-17", "Houston", "Rutgers", 60, 70)  # score fixed: Rutgers won
        s, t, rep = run(s, t, res)
        day = self.games_on(s, "2026-11-18")
        self.assertIn(frozenset(("Rutgers", "Notre Dame")), day)
        self.assertNotIn(frozenset(("Houston", "Notre Dame")), day)
        self.assertTrue(any(line.startswith("removed") for line in rep))

    def test_game_with_a_score_is_never_removed(self):
        res = [result("2026-11-17", "Houston", "Rutgers", 70, 60), result("2026-11-17", "Florida", "Notre Dame", 60, 70)]
        s, t, _ = run(self.sched, [], res)
        res.append(result("2026-11-18", "Houston", "Notre Dame", 80, 70))
        res[0] = result("2026-11-17", "Houston", "Rutgers", 60, 70)
        s, t, rep = run(s, t, res)
        self.assertIn(frozenset(("Houston", "Notre Dame")), self.games_on(s, "2026-11-18"))
        self.assertTrue(any(line.startswith("WARNING") for line in rep))

    def test_ties_and_unknown_results_are_ignored(self):
        res = [result("2026-11-17", "Houston", "Rutgers", 60, 60)]
        s, _, _ = run(self.sched, [], res)
        self.assertEqual(s, self.sched)

    def test_real_data_is_consistent(self):
        sched = json.loads((ROOT / "data/schedule.json").read_text())
        for ev in BRACKETS["events"]:
            ids = [g["id"] for g in ev["games"]]
            self.assertEqual(len(ids), len(set(ids)))
            seen = set()
            for g in ev["games"]:
                for s in g["slots"]:
                    if "team" in s:
                        self.assertIn(s["team"], KEY)
                    else:
                        self.assertIn(s.get("winner") or s.get("loser"), seen, f"{g['id']} depends on a later game")
                seen.add(g["id"])
            for g in ev["games"]:  # the fixed first-round games are already in the schedule
                if all("team" in s for s in g["slots"]):
                    pair = {s["team"] for s in g["slots"]}
                    self.assertTrue(any(r["date"] == g["date"] and {r["home"], r["away"]} == pair for r in sched), g["id"])


if __name__ == "__main__":
    unittest.main()
