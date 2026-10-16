"""Tests for src/ingest_scores.py using fake API games. Run from the repo root:

    python -m unittest discover -s tests
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402

TEAMS = cbk.load_json("teams.json")
SCHEDULE = cbk.load_json("schedule.json")
NAMES = ing.Names(TEAMS, cbk.load_json("ingest_aliases.json"))
NOW = "2026-11-03T08:00:00.000Z"


def api(home, away, hp, ap, start="2026-11-03T00:30:00.000Z", **kw):
    g = {"season": 2027, "seasonLabel": "20262027", "status": "final", "homeTeam": home, "awayTeam": away,
         "homePoints": hp, "awayPoints": ap, "startDate": start, "neutralSite": False}
    g.update(kw)
    return g


def run(games, results=None):
    return ing.classify(games, NAMES, SCHEDULE, results or [], NOW)


class IngestTests(unittest.TestCase):
    def test_new_game_matches_manual_entry_format(self):
        rows, new = run([api("Duke", "Army", 90, 55)])      # 00:30Z Nov 3 = Nov 2 evening in the US
        self.assertEqual(rows[0]["status"], "NEW")
        self.assertEqual(new, [{"date": "2026-11-02", "home": "duke", "away": "army", "neutral": False,
                                "homeScore": 90, "awayScore": 55, "line": -38.5, "ts": NOW}])

    def test_serialize_matches_site_format(self):
        text = ing.serialize([{"date": "2026-11-02", "home": "duke", "away": "army", "neutral": False,
                               "homeScore": 90, "awayScore": 55, "line": -38.5, "ts": "2026-11-03T05:12:10.000Z"}])
        self.assertEqual(text, '[\n{"date":"2026-11-02","home":"duke","away":"army","neutral":false,'
                               '"homeScore":90,"awayScore":55,"line":-38.5,"ts":"2026-11-03T05:12:10.000Z"}\n]\n')
        self.assertEqual(ing.serialize([]), "[]\n")

    def test_scores_follow_the_team_not_the_api_home_slot(self):
        # Schedule has Duke as home vs Michigan St at a neutral site; the API lists them the other way round.
        rows, new = run([api("Michigan State", "Duke", 70, 80, start="2026-11-11T01:00:00.000Z", neutralSite=True)])
        self.assertEqual(rows[0]["status"], "NEW")
        self.assertEqual((new[0]["home"], new[0]["homeScore"], new[0]["awayScore"]), ("duke", 80, 70))
        self.assertTrue(new[0]["neutral"])

    def test_non_d1_opponent(self):
        rows, new = run([api("California", "Some Small College", 88, 40)])
        self.assertEqual(rows[0]["status"], "NEW")
        self.assertEqual((new[0]["away"], new[0]["line"]), ("non-d1-opponent", None))

    def test_wrong_season_is_ignored(self):
        rows, new = run([api("Duke", "Army", 90, 55, season=2026, seasonLabel="20252026")])
        self.assertEqual((rows[0]["status"], new), ("IGNORED", []))

    def test_not_final_is_skipped(self):
        rows, new = run([api("Duke", "Army", None, None, status="scheduled")])
        self.assertEqual((rows[0]["status"], new), ("SKIPPED", []))

    def test_existing_result_is_never_overwritten(self):
        mine = [{"date": "2026-11-02", "home": "duke", "away": "army", "neutral": False,
                 "homeScore": 91, "awayScore": 55, "line": -38.5, "ts": "x"}]
        rows, new = run([api("Duke", "Army", 90, 55)], mine)
        self.assertEqual((rows[0]["status"], new), ("DIFFERS FROM YOURS", []))
        rows, new = run([api("Duke", "Army", 91, 55)], mine)
        self.assertEqual((rows[0]["status"], new), ("MATCHES YOURS", []))

    def test_unknown_name_is_reported_not_guessed(self):
        rows, new = run([api("Duke", "Armee Academy", 90, 55)])
        self.assertEqual((rows[0]["status"], new), ("UNMATCHED", []))
        self.assertIn("Armee Academy", rows[0]["note"])

    def test_game_not_on_schedule_is_not_saved(self):
        rows, new = run([api("Duke", "Army", 90, 55, start="2026-12-20T00:30:00.000Z")])
        self.assertEqual((rows[0]["status"], new), ("UNMATCHED", []))

    def test_last_season_game_cannot_slip_in(self):
        # Same teams, a date that exists on this year's schedule, but stamped as last season.
        rows, new = run([api("Duke", "Army", 90, 55, season=2026, seasonLabel="20252026")])
        self.assertEqual(new, [])

    def test_aliases_all_point_to_real_teams(self):
        for api_name, team in cbk.load_json("ingest_aliases.json").items():
            self.assertIn(team, NAMES.by_name, api_name)
        self.assertEqual(NAMES.resolve("Michigan State"), "Michigan St")
        self.assertEqual(NAMES.resolve("App State"), "Appalachian St")
        self.assertIsNone(NAMES.resolve("Allegheny"))


if __name__ == "__main__":
    unittest.main()
