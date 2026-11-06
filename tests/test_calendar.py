import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.alpine import run_times, calendar, reconcile, parse_ical
from backend.predictions import validate_predictions


def event(start, first, second=None):
    return {"UID": "AL123", "DTSTART": start, "DESCRIPTION": f"Run 1 loc: {first}" + (f"\\nRun 2 loc: {second}" if second else "")}


class CalendarTests(unittest.TestCase):
    def test_levi_local_time_is_not_swiss_time(self):
        _, starts, _ = run_times(event("20261114T090000Z", "11:00", "14:00"), "Europe/Helsinki")
        self.assertEqual(starts, {1: "2026-11-14T09:00:00Z", 2: "2026-11-14T12:00:00Z"})
        swiss = datetime.fromisoformat(starts[2].replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Zurich"))
        self.assertEqual(swiss.strftime("%H:%M"), "13:00")

    def test_american_race_is_converted_from_venue_timezone(self):
        _, starts, _ = run_times(event("20261128T143000Z", "09:30", "12:30"), "America/New_York")
        swiss = datetime.fromisoformat(starts[2].replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Zurich"))
        self.assertEqual(swiss.strftime("%H:%M"), "18:30")

    def test_dst_between_two_runs_uses_local_clock(self):
        _, starts, _ = run_times(event("20270328T003000Z", "01:30", "03:30"), "Europe/Zurich")
        self.assertEqual(starts[2], "2027-03-28T01:30:00Z")

    def test_unknown_time_is_not_fabricated(self):
        _, starts, _ = run_times(event("20261114T000000Z", "TBC"), "Europe/Helsinki")
        self.assertEqual(starts, {})

    def test_inconsistent_timezone_rejected(self):
        with self.assertRaises(ValueError):
            run_times(event("20261114T090000Z", "11:00"), "Europe/Zurich")

    def test_updated_start_keeps_uid_and_increases_sequence(self):
        old = dict(id="fis-al-123-run-1", start="2026-11-14T09:00:00Z", date="2026-11-14", title="Levi", venue="Levi", country="FIN", status="scheduled", sequence=2, modified="2026-11-05T10:00:00Z")
        changed = {**old, "start": "2026-11-14T10:00:00Z"}
        output = reconcile([changed], [old])[0]
        self.assertEqual(output["id"], old["id"])
        self.assertGreater(output["sequence"], 2)
        removed = reconcile([], [old])[0]
        self.assertEqual(removed["status"], "removed")
        self.assertGreater(removed["sequence"], 2)

    def test_utf8_line_folding_and_distinct_runs(self):
        base = dict(date="2026-11-14", title="Sölden, "+"è"*80, venue="Sölden", country="AUT", sourceUrl="https://www.fis-ski.com/", status="scheduled", sequence=0, modified="2026-11-05T10:00:00Z")
        text = calendar([{**base, "id": "fis-al-123-run-1", "start": "2026-11-14T09:00:00Z"}, {**base, "id": "fis-al-123-run-2", "start": "2026-11-14T12:00:00Z"}])
        self.assertTrue(all(len(line.encode()) <= 75 for line in text.split("\r\n")))
        parsed = parse_ical(text)
        self.assertEqual(len({x["UID"] for x in parsed}), 2)
        self.assertEqual(parsed[1]["DTSTART"], "20261114T120000Z")

    def test_invalid_model_output_cannot_be_published(self):
        with self.assertRaises(ValueError):
            validate_predictions([{"gameId": "1", "homeProbability": .8, "awayProbability": .6}], [{"id": "1"}])
        with self.assertRaises(ValueError):
            validate_predictions([{"gameId": "old-game", "homeProbability": .5, "awayProbability": .5}], [{"id": "1"}])


if __name__ == "__main__":
    unittest.main()
