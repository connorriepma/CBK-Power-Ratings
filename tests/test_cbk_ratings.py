"""Tests for the rating engine. Run from the repo root:

    python -m unittest discover -s tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import cbk_ratings as cbk  # noqa: E402

CFG = cbk.Config.from_dict(
    {
        "kTiers": [
            {"upTo": 8, "k": 0.08},
            {"upTo": 18, "k": 0.05},
            {"upTo": None, "k": 0.03},
        ],
        "mismatchSpread": 25,
        "missCap": {"normal": 30, "mismatch": 25},
    }
)


def game(date, home, away, hs, as_, neutral=False):
    return {"date": date, "home": home, "away": away, "neutral": neutral,
            "homeScore": hs, "awayScore": as_}


class KTiers(unittest.TestCase):
    def test_tier_boundaries(self):
        self.assertEqual(cbk.k_for(0, CFG), 0.08)   # game 1
        self.assertEqual(cbk.k_for(7, CFG), 0.08)   # game 8
        self.assertEqual(cbk.k_for(8, CFG), 0.05)   # game 9
        self.assertEqual(cbk.k_for(17, CFG), 0.05)  # game 18
        self.assertEqual(cbk.k_for(18, CFG), 0.03)  # game 19
        self.assertEqual(cbk.k_for(40, CFG), 0.03)


class Replay(unittest.TestCase):
    def setUp(self):
        self.start = {"utah-st": 90.79, "denver": 79.30}
        self.hca = {"utah-st": 4.0, "denver": 3.5}

    def test_no_results_returns_preseason(self):
        ratings, played = cbk.replay(self.start, self.hca, [], CFG)
        self.assertEqual(ratings, self.start)
        self.assertEqual(played, {"utah-st": 0, "denver": 0})

    def test_methodology_example(self):
        # Utah State hosts Denver in game 1 for both teams and wins 86-76.
        results = [game("2026-11-02", "utah-st", "denver", 86, 76)]
        ratings, played = cbk.replay(self.start, self.hca, results, CFG)
        self.assertAlmostEqual(ratings["utah-st"], 90.35, places=2)
        self.assertAlmostEqual(ratings["denver"], 79.74, places=2)
        self.assertEqual(played, {"utah-st": 1, "denver": 1})

    def test_win_below_spread_lowers_winner(self):
        results = [game("2026-11-02", "utah-st", "denver", 86, 76)]
        ratings, _ = cbk.replay(self.start, self.hca, results, CFG)
        self.assertLess(ratings["utah-st"], self.start["utah-st"])

    def test_rating_changes_sum_to_zero_with_equal_k(self):
        results = [game("2026-11-02", "utah-st", "denver", 60, 70)]
        ratings, _ = cbk.replay(self.start, self.hca, results, CFG)
        total = (ratings["utah-st"] - self.start["utah-st"]) + (
            ratings["denver"] - self.start["denver"]
        )
        self.assertAlmostEqual(total, 0.0, places=9)

    def test_neutral_site_ignores_home_court(self):
        neutral = [game("2026-11-02", "utah-st", "denver", 86, 76, neutral=True)]
        ratings, _ = cbk.replay(self.start, self.hca, neutral, CFG)
        # predicted margin 11.49, miss -1.49, change 0.08 * -1.49
        self.assertAlmostEqual(ratings["utah-st"], 90.79 + 0.08 * (10 - 11.49), places=6)

    def test_modified_hca_home_and_away_slot(self):
        # boosted team in the home slot: margin gets +pts; in the away slot: margin gets -pts
        g = game("2026-11-02", "utah-st", "denver", 86, 76, neutral=True)
        mods = {cbk.game_id("2026-11-02", "utah-st", "denver"): [("utah-st", 2.0)]}
        self.assertEqual(cbk.home_bonus(mods, g), 2.0)
        self.assertEqual(cbk.home_bonus({cbk.game_id("2026-11-02", "utah-st", "denver"): [("denver", 2.0)]}, g), -2.0)
        self.assertEqual(cbk.home_bonus(mods, game("2026-11-03", "utah-st", "denver", 1, 0)), 0.0)
        ratings, _ = cbk.replay(self.start, self.hca, [g], CFG, mods)
        self.assertAlmostEqual(ratings["utah-st"], 90.79 + 0.08 * (10 - 13.49), places=6)

    def test_build_game_mods(self):
        teams = [{"key": "a-team", "team": "A Team", "home_court": 4}, {"key": "b", "team": "B", "home_court": 3}]
        sched = [{"date": "2026-12-01", "home": "B", "away": "A Team", "hcaMod": {"team": "A Team", "pct": 0.75}}]
        self.assertEqual(cbk.build_game_mods(sched, teams), {"2026-12-01_a-team_b": [("a-team", 3.0)]})
        both = [dict(sched[0], hcaMod=[{"team": "A Team", "pct": 0.75}, {"team": "B", "pct": 0.5}])]
        m = cbk.build_game_mods(both, teams)
        g = {"date": "2026-12-01", "home": "b", "away": "a-team"}
        self.assertAlmostEqual(cbk.home_bonus(m, g), 1.5 - 3.0)  # B is home slot +1.5, A Team away -3.0

    def test_non_d1_opponent_is_skipped(self):
        results = [game("2026-11-02", "utah-st", "some-non-d1-school", 100, 40)]
        ratings, played = cbk.replay(self.start, self.hca, results, CFG)
        self.assertEqual(ratings, self.start)
        self.assertEqual(played["utah-st"], 0)

    def test_miss_is_capped(self):
        start = {"a": 80.0, "b": 80.0}
        hca = {"a": 0.0, "b": 0.0}
        ratings, _ = cbk.replay(start, hca, [game("2026-11-02", "a", "b", 130, 50)], CFG)
        # miss would be 80, capped at 30: change = 0.08 * 30
        self.assertAlmostEqual(ratings["a"], 80 + 0.08 * 30, places=9)

    def test_mismatch_uses_smaller_cap(self):
        start = {"a": 100.0, "b": 70.0}
        hca = {"a": 0.0, "b": 0.0}
        # predicted margin 30 (>= 25), so the cap is 25; actual margin -60, miss -90 -> -25
        ratings, _ = cbk.replay(start, hca, [game("2026-11-02", "a", "b", 40, 100)], CFG)
        self.assertAlmostEqual(ratings["a"], 100 - 0.08 * 25, places=9)

    def test_k_drops_with_games_played(self):
        start = {"a": 80.0, "b": 80.0}
        hca = {"a": 0.0, "b": 0.0}
        # Nine identical games: the ninth should use K = 0.05, not 0.08.
        results = [game(f"2026-11-{d:02d}", "a", "b", 80, 70) for d in range(1, 10)]
        _, played = cbk.replay(start, hca, results, CFG)
        self.assertEqual(played["a"], 9)
        self.assertEqual(cbk.k_for(played["a"] - 1, CFG), 0.05)

    def test_input_order_does_not_matter(self):
        g1 = game("2026-11-02", "utah-st", "denver", 86, 76)
        g2 = game("2026-11-09", "denver", "utah-st", 70, 72)
        forward, _ = cbk.replay(self.start, self.hca, [g1, g2], CFG)
        backward, _ = cbk.replay(self.start, self.hca, [g2, g1], CFG)
        self.assertEqual(forward, backward)


class Display(unittest.TestCase):
    def test_round_half(self):
        self.assertEqual(cbk.round_half(90.79), 91.0)
        self.assertEqual(cbk.round_half(93.25), 93.5)
        self.assertEqual(cbk.round_half(77.5), 77.5)
        self.assertEqual(cbk.round_half(86.76), 87.0)

    def test_spread_rounds_away_from_zero_on_ties(self):
        self.assertEqual(cbk.spread(15.49), 15.5)
        self.assertEqual(cbk.spread(-15.49), -15.5)
        self.assertEqual(cbk.spread(6.25), 6.5)
        self.assertEqual(cbk.spread(-6.25), -6.5)

    def test_win_probability(self):
        self.assertAlmostEqual(cbk.win_probability(0.0), 0.5)
        self.assertGreater(cbk.win_probability(10.0), 0.5)
        self.assertAlmostEqual(
            cbk.win_probability(7.0) + cbk.win_probability(-7.0), 1.0, places=9
        )


class RealData(unittest.TestCase):
    def test_preseason_when_no_results(self):
        rows = cbk.build_current_ratings([])
        self.assertEqual(len(rows), 365)
        self.assertTrue(all(r["change"] == 0 and r["games"] == 0 for r in rows))
        self.assertEqual(rows[0]["team"], "Duke")


if __name__ == "__main__":
    unittest.main()
