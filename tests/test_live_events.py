import unittest
from unittest.mock import patch
from backend.hockey_live import event_snapshot
from backend.hockey import live_projection


class HockeyLiveTest(unittest.TestCase):
    @patch('backend.hockey_live.record')
    @patch('backend.hockey_live.records', side_effect=lambda rows: rows)
    @patch('backend.hockey_live.sihf_call')
    def test_report_corrections_and_failure(self, fetch, records, log):
        game = {'id': '7'}
        report = {'gameId': '7', 'summary': {'periods': [{'goals': [], 'fouls': []}]}}
        fetch.return_value = report
        previous = {}
        for rows in ([], [{'event_type': 'goal'}], [{'event_type': 'revoked_goal'}], []):
            previous = event_snapshot(game, previous, None, lambda *a, **kw: rows)
            self.assertEqual(previous['events'], rows)
            self.assertEqual(previous['status'], 'ok')
        for bad in ({'gameId': '8'}, {'gameId': '7'}, {'gameId': '7', 'summary': {'periods': [{}]}}):
            fetch.return_value = bad
            result = event_snapshot(game, previous, None, None)
            self.assertEqual(result['status'], 'stale')
            self.assertEqual(result['fetchedAt'], previous['fetchedAt'])

    def test_multiple_matches_and_score_revision(self):
        rows = [dict(team_id=t, games_played=1, points=1, rank=i, goals_for=0,
                     goals_against=0) for i, t in enumerate('abcd', 1)]
        games = [dict(home=h, away=a, homeScore=1, awayScore=0, status='live',
                      homePeriods=[1, None, None]) for h, a in [('a','b'), ('c','d')]]
        self.assertEqual([r['points'] for r in live_projection(rows,games)], [3,3,0,0])
        games[0]['homeScore'] = 0
        self.assertEqual([r['points'] for r in live_projection(rows,games)], [3,1,1,0])
        self.assertEqual(rows[0]['points'], 1)
