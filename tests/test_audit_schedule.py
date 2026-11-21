"""Tests for src/audit_schedule.py plan()/apply() using fake API games."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import audit_schedule as aud  # noqa: E402
import cbk_ratings as cbk  # noqa: E402
import ingest_scores as ing  # noqa: E402

NAMES = ing.Names(cbk.load_json("teams.json"), cbk.load_json("ingest_aliases.json"))
BRACKETS = {"events": [{"name": "E", "games": [{"id": "g1", "slots": [{"team": "Duke"}, {"team": "Army"}]}]}]}


def api(home, away, start, status="scheduled", neutral=False):
    return {"season": 2027, "seasonLabel": "20262027", "status": status, "homeTeam": home, "awayTeam": away,
            "startDate": start, "neutralSite": neutral}


def row(date, home, away, neutral=False, **kw):
    return {"date": date, "home": home, "away": away, "neutral": neutral, "conf": False, **kw}


def plan(games, schedule, results=None):
    return aud.plan(games, NAMES, schedule, results or [], BRACKETS)


class AuditTests(unittest.TestCase):
    def test_game_date_convention(self):
        self.assertEqual(aud.game_date("2027-01-07T00:00:00.000Z"), "2027-01-06")   # 7 pm ET
        self.assertEqual(aud.game_date("2027-01-07T04:59:00.000Z"), "2027-01-07")   # placeholder stamp
        self.assertEqual(aud.game_date("2027-01-07T05:00:00.000Z"), "2027-01-07")
        self.assertEqual(aud.game_date("2027-01-07T18:00:00.000Z"), "2027-01-07")

    def test_same_game_same_date_no_change(self):
        ch, _ = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z")], [row("2027-01-06", "Kentucky", "Florida")])
        self.assertEqual(ch, [])

    def test_date_moves_to_closest_meeting(self):
        sched = [row("2027-01-05", "Kentucky", "Florida"), row("2027-02-09", "Kentucky", "Florida")]
        ch, _ = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z"), api("Kentucky", "Florida", "2027-02-10T00:00:00.000Z")], sched)
        self.assertEqual([(c["row"]["date"], c["to"]) for c in ch], [("2027-01-05", "2027-01-06")])   # Feb game already matches

    def test_missing_game_is_added_and_non_d1_resolves(self):
        ch, _ = plan([api("Pepperdine", "West Coast Baptist", "2026-11-21T01:00:00.000Z")], [])
        self.assertEqual(ch[0]["type"], "add")
        self.assertEqual((ch[0]["row"]["home"], ch[0]["row"]["away"], ch[0]["row"]["date"]), ("Pepperdine", ing.NON_D1, "2026-11-20"))

    def test_row_with_result_is_never_changed(self):
        sched = [row("2027-01-05", "Kentucky", "Florida")]
        res = [{"date": "2027-01-05", "home": "kentucky", "away": "florida"}]
        ch, notes = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z")], sched, res)
        self.assertEqual(ch, [])
        self.assertTrue(any("not changed" in n for n in notes))

    def test_site_row_is_protected(self):
        sched = [row("2027-01-05", "Kentucky", "Florida", site="Somewhere")]
        ch, _ = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z")], sched)
        self.assertEqual(ch, [])

    def test_neutral_rules(self):
        d = "2027-01-07T00:00:00.000Z"
        ch, _ = plan([api("Kentucky", "Florida", d, neutral=True)], [row("2027-01-06", "Kentucky", "Florida")])
        self.assertEqual([c["type"] for c in ch], ["neutral"])
        ch, notes = plan([api("Kentucky", "Florida", d, neutral=False)], [row("2027-01-06", "Kentucky", "Florida", True)])
        self.assertEqual(ch, [])
        self.assertTrue(any("kept your neutral" in n for n in notes))

    def test_postponed_is_removed_and_listed(self):
        sched = [row("2027-01-06", "Kentucky", "Florida")]
        ch, _ = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z", status="postponed")], sched)
        new, post = aud.apply(ch, sched, [])
        self.assertEqual((new, post[0]["teams"]), ([], ["Kentucky", "Florida"]))

    def test_bracket_pair_is_left_alone(self):
        ch, notes = plan([api("Duke", "Army", "2026-11-25T05:00:00.000Z", neutral=True)], [])
        self.assertEqual(ch, [])
        self.assertTrue(any("bracket" in n for n in notes))

    def test_double_booking_is_reported_not_made(self):
        sched = [row("2027-01-05", "Kentucky", "Florida"), row("2027-01-06", "Florida", "Tennessee")]
        ch, notes = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z"), api("Florida", "Tennessee", "2027-01-07T00:00:00.000Z")], sched)
        self.assertEqual(ch, [])
        self.assertTrue(any("CONFLICT" in n for n in notes))

    def test_apply_date_and_add(self):
        sched = [row("2027-01-05", "Kentucky", "Florida")]
        ch, _ = plan([api("Kentucky", "Florida", "2027-01-07T00:00:00.000Z"), api("Pepperdine", "West Coast Baptist", "2026-11-21T01:00:00.000Z")], sched)
        new, _ = aud.apply(ch, sched, [])
        self.assertEqual(sorted((s["date"], s["home"]) for s in new), [("2026-11-20", "Pepperdine"), ("2027-01-06", "Kentucky")])


if __name__ == "__main__":
    unittest.main()
