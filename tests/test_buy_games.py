"""Buy-game adjustments move published lines only, never ratings. Run: python -m unittest discover -s tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402

RATINGS = {"a": 90.0, "b": 60.0}
HC = {"a": 3.0, "b": 3.0}
BUY = {cbk.game_id("2026-11-05", "a", "b"): ("a", 4.0)}


class BuyGames(unittest.TestCase):
    def test_margin_adds_toward_home_favorite(self):
        self.assertEqual(cbk.buy_adjusted_margin(30.0, "2026-11-05", "a", "b", BUY), 34.0)

    def test_margin_adds_toward_away_favorite(self):
        buy = {cbk.game_id("2026-11-05", "a", "b"): ("b", 4.0)}
        self.assertEqual(cbk.buy_adjusted_margin(-20.0, "2026-11-05", "a", "b", buy), -24.0)

    def test_other_games_and_no_data_untouched(self):
        self.assertEqual(cbk.buy_adjusted_margin(30.0, "2026-11-06", "a", "b", BUY), 30.0)
        self.assertEqual(cbk.buy_adjusted_margin(30.0, "2026-11-05", "a", "b", None), 30.0)
        self.assertEqual(cbk.buy_adjusted_margin(30.0, "2026-11-05", "a", "b", {}), 30.0)

    def test_ingest_locks_the_adjusted_line(self):
        base = ing.current_line("a", "b", False, "2026-11-05", RATINGS, HC, {})
        adj = ing.current_line("a", "b", False, "2026-11-05", RATINGS, HC, {}, BUY)
        self.assertEqual(base, -33.0)
        self.assertEqual(adj, -37.0)

    def test_ratings_do_not_depend_on_the_locked_line(self):
        # The locked (buy-adjusted) line is only used for ATS; the replay must give identical ratings either way.
        cfg = cbk.Config.from_dict(cbk.load_json("rating_config.json"))
        mk = lambda line: [{"date": "2026-11-05", "home": "a", "away": "b", "homeScore": 100, "awayScore": 60, "neutral": False, "line": line}]
        r1, _ = cbk.replay(dict(RATINGS), HC, mk(-33), cfg, {})
        r2, _ = cbk.replay(dict(RATINGS), HC, mk(-37), cfg, {})
        self.assertEqual(r1, r2)


if __name__ == "__main__":
    unittest.main()


class AutoBuy(unittest.TestCase):
    BA = cbk.BuyAdjust(14, 20, 4, "2026-11-16", frozenset({"ACC"}), ("A10",))
    CONF = {"a": "ACC", "b": "ACC", "c": "Sun Belt", "d": "A10", "e": "A10", "f": "Sun Belt"}
    UP = {"a", "b", "d"}

    def go(self, home, away, margin, date="2026-11-20"):
        return cbk.auto_buy(date, home, away, margin, self.CONF, self.UP, self.BA)

    def test_ramp(self):
        self.assertIsNone(self.go("a", "c", 14))
        self.assertEqual(self.go("a", "c", 17), ("a", 2.0))
        self.assertEqual(self.go("a", "c", 25), ("a", 4.0))
        self.assertEqual(self.go("c", "a", -17), ("a", 2.0))      # away favorite

    def test_exemptions(self):
        self.assertIsNone(self.go("a", "b", 25))                    # same conference
        self.assertIsNone(self.go("a", "d", 25))                    # both upper-level
        self.assertEqual(self.go("a", "e", 25), ("a", 4.0))         # e is lower half of A10

    def test_not_before_start_date(self):
        self.assertIsNone(self.go("a", "c", 25, "2026-11-15"))

    def test_override_wins(self):
        ov = {cbk.game_id("2026-11-20", "a", "c"): ("a", 1.0)}
        self.assertEqual(cbk.buy_for_game("2026-11-20", "a", "c", 25, ov, self.CONF, self.UP, self.BA), ("a", 1.0))

    def test_upper_teams_top_half(self):
        conf = {"x1": "A10", "x2": "A10", "x3": "A10", "x4": "A10", "y": "ACC"}
        r = {"x1": 80, "x2": 70, "x3": 60, "x4": 50, "y": 70}
        self.assertEqual(cbk.upper_teams(r, conf, self.BA), {"y", "x1", "x2"})

    def test_ingest_locks_line_and_bonus(self):
        auto = ({"a": "ACC", "b": "Sun Belt"}, {"a"}, self.BA)
        line, bonus = ing.current_line_and_buy("a", "b", False, "2026-11-20", RATINGS, HC, {}, None, auto)
        base = ing.current_line("a", "b", False, "2026-11-20", RATINGS, HC, {})
        self.assertEqual(bonus, 4.0)
        self.assertLess(line, base)                                  # more negative = bigger home favorite


if __name__ == "__main__":
    pass
