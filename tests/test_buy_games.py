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
