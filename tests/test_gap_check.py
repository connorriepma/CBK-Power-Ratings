import sys, unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import cbk_ratings as cbk  # noqa: E402
import gap_check as gc  # noqa: E402
import ingest_scores as ing  # noqa: E402

NOW = datetime(2026, 11, 28, 17, 17, tzinfo=timezone.utc)
NAMES = ing.Names(cbk.load_json("teams.json"), cbk.load_json("ingest_aliases.json"))


def api(home, away, status="final", hp=70, ap=60, start="2026-11-27T23:00:00.000Z"):
    return {"homeTeam": home, "awayTeam": away, "homePoints": hp, "awayPoints": ap, "status": status,
            "startDate": start, "neutralSite": False, "season": ing.SEASON, "seasonLabel": ing.SEASON_LABEL}


class GapTests(unittest.TestCase):
    def run_gaps(self, games, schedule, results=(), postponed=()):
        return gc.find_gaps(games, NAMES, list(schedule), list(results), list(postponed), NOW)

    def test_missing_score_is_listed(self):
        s = [{"date": "2026-11-27", "home": "Navy", "away": "Army", "neutral": False, "conf": True}]
        no_score, _, _ = self.run_gaps([], s)
        self.assertEqual(len(no_score), 1)

    def test_postponed_pair_not_listed(self):
        s = [{"date": "2026-11-27", "home": "Navy", "away": "Army", "neutral": False, "conf": True}]
        no_score, _, _ = self.run_gaps([], s, postponed=[{"teams": ["Navy", "Army"]}])
        self.assertEqual(no_score, [])

    def test_today_and_future_ignored(self):
        s = [{"date": "2026-11-28", "home": "Navy", "away": "Army", "neutral": False, "conf": True}]
        self.assertEqual(self.run_gaps([], s)[0], [])

    def test_tbd_flagged(self):
        _, _, tbd = self.run_gaps([api("Georgetown", "TBD", status="in_progress")], [])
        self.assertEqual(len(tbd), 1)

    def test_unmatched_final_flagged(self):
        _, issues, _ = self.run_gaps([api("Navy", "Army")], [])
        self.assertEqual(len(issues), 1)

    def test_clean_day(self):
        self.assertEqual(self.run_gaps([], []), ([], [], []))


if __name__ == "__main__":
    unittest.main()
