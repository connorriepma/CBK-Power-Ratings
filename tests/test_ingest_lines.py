"""Tests for src/ingest_lines.py using fake API games. Run from the repo root: python -m unittest discover -s tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import cbk_ratings as cbk  # noqa: E402
import ingest_lines as il  # noqa: E402
import ingest_scores as ing  # noqa: E402

TEAMS = [{"team": "Duke", "key": "duke"}, {"team": "Vermont", "key": "vermont"}]
NAMES = ing.Names(TEAMS, {})
SCHED = [{"date": "2026-11-20", "home": "Duke", "away": "Vermont", "neutral": False}]
RES = [{"date": "2026-11-20", "home": "duke", "away": "vermont", "neutral": False, "homeScore": 90, "awayScore": 60, "line": -20.5}]


def game(home="Duke", away="Vermont", lines=None, **kw):
    g = {"season": 2027, "homeTeam": home, "awayTeam": away, "startDate": "2026-11-21T00:30:00.000Z",
         "lines": lines if lines is not None else [{"provider": "Caesars", "spread": -21.5, "spreadOpen": -20, "overUnder": 140.5}]}
    g.update(kw)
    return g


class Lines(unittest.TestCase):
    def test_saves_closing_line_for_finished_game(self):
        new, rows = il.match([game()], NAMES, SCHED, RES, {})
        self.assertEqual(rows[0]["status"], "NEW")
        e = new["2026-11-20_duke_vermont"]
        self.assertEqual(e["lines"]["Caesars"], {"spread": -21.5, "open": -20.0, "total": 140.5})
        self.assertEqual((e["home"], e["away"]), ("duke", "vermont"))

    def test_not_final_is_not_saved(self):
        new, rows = il.match([game()], NAMES, SCHED, [], {})
        self.assertEqual(new, {})
        self.assertEqual(rows[0]["status"], "NOT FINAL YET")

    def test_never_overwrites(self):
        new, rows = il.match([game()], NAMES, SCHED, RES, {"2026-11-20_duke_vermont": {"lines": {}}})
        self.assertEqual(new, {})
        self.assertEqual(rows[0]["status"], "ALREADY SAVED")

    def test_flips_sign_when_api_home_differs_from_schedule(self):
        new, _ = il.match([game(home="Vermont", away="Duke")], NAMES, SCHED, RES, {})
        self.assertEqual(new["2026-11-20_duke_vermont"]["lines"]["Caesars"]["spread"], 21.5)

    def test_skips_no_spread_other_season_non_d1(self):
        _, a = il.match([game(lines=[{"provider": "x", "spread": None}])], NAMES, SCHED, RES, {})
        _, b = il.match([game(season=2026)], NAMES, SCHED, RES, {})
        _, c = il.match([game(away="Some NAIA School")], NAMES, SCHED, RES, {})
        self.assertEqual([a[0]["status"], b[0]["status"], c[0]["status"]], ["NO LINE", "IGNORED", "IGNORED"])

    def test_sanity_warns_when_signs_flipped(self):
        new = {"2026-11-20_duke_vermont": {"lines": {"Caesars": {"spread": 21.5, "open": None, "total": None}}}}
        self.assertIn("WARNING", il.sanity(new, RES))
        ok = {"2026-11-20_duke_vermont": {"lines": {"Caesars": {"spread": -21.5, "open": None, "total": None}}}}
        self.assertNotIn("WARNING", il.sanity(ok, RES))


if __name__ == "__main__":
    unittest.main()
