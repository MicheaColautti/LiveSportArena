import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from backend import hockey_live, worker

NOW = datetime(2026, 11, 11, 20, 0, tzinfo=timezone.utc)


def ago(seconds):
    return (NOW - timedelta(seconds=seconds)).isoformat().replace('+00:00', 'Z')


def game(gid, status):
    return dict(id=gid, status=status)


def race(*starts_ago, status='scheduled'):
    return dict(status=status, runs=[dict(start=ago(s) if s is not None else None) for s in starts_ago])


class PlanTest(unittest.TestCase):
    def test_nothing_due_when_recent_and_unchanged(self):
        state = dict(finished=['1'], statistics=ago(60), alpine=ago(60))
        self.assertEqual(worker.plan(state, [game('1', 'finished')], [], NOW), (False, False))

    def test_new_finished_game_refreshes_hockey(self):
        state = dict(finished=[], statistics=ago(60), alpine=ago(60))
        self.assertEqual(worker.plan(state, [game('1', 'finished')], [], NOW), (True, False))

    def test_live_game_refreshes_hourly_only(self):
        games = [game('1', 'live')]
        state = dict(finished=[], alpine=ago(60))
        self.assertFalse(worker.plan({**state, 'statistics': ago(3599)}, games, [], NOW)[0])
        self.assertTrue(worker.plan({**state, 'statistics': ago(3600)}, games, [], NOW)[0])

    def test_failed_hockey_refresh_waits_before_retry(self):
        games = [game('1', 'finished')]
        state = dict(finished=[], alpine=ago(60))
        self.assertFalse(worker.plan({**state, 'hockeyAttempt': ago(299)}, games, [], NOW)[0])
        self.assertTrue(worker.plan({**state, 'hockeyAttempt': ago(300)}, games, [], NOW)[0])

    def test_missing_live_data_does_not_refresh_hockey(self):
        self.assertFalse(worker.plan(dict(finished=['1']), [], [], NOW)[0])

    def test_alpine_interval_without_races(self):
        self.assertFalse(worker.plan(dict(alpine=ago(1799)), [], [], NOW)[1])
        self.assertTrue(worker.plan(dict(alpine=ago(1800)), [], [], NOW)[1])
        self.assertTrue(worker.plan({}, [], [], NOW)[1])

    def test_alpine_refreshes_often_around_a_race(self):
        races = [race(0)]
        self.assertFalse(worker.plan(dict(alpine=ago(119)), [], races, NOW)[1])
        self.assertTrue(worker.plan(dict(alpine=ago(120)), [], races, NOW)[1])


class AlpineIntervalTest(unittest.TestCase):
    def test_window_opens_thirty_minutes_before_first_run(self):
        self.assertEqual(worker.alpine_interval([race(-1800)], NOW), worker.ALPINE_RACE_SECONDS)
        self.assertEqual(worker.alpine_interval([race(-1801)], NOW), worker.ALPINE_SECONDS)

    def test_window_closes_three_hours_after_last_run(self):
        self.assertEqual(worker.alpine_interval([race(20000, 10800)], NOW), worker.ALPINE_RACE_SECONDS)
        self.assertEqual(worker.alpine_interval([race(20000, 10801)], NOW), worker.ALPINE_SECONDS)

    def test_window_covers_the_pause_between_runs(self):
        self.assertEqual(worker.alpine_interval([race(5000, -5000)], NOW), worker.ALPINE_RACE_SECONDS)

    def test_live_status_overrides_published_times(self):
        self.assertEqual(worker.alpine_interval([race(50000, status='live')], NOW), worker.ALPINE_RACE_SECONDS)

    def test_cancelled_race_and_missing_times_stay_slow(self):
        self.assertEqual(worker.alpine_interval([race(0, status='cancelled')], NOW), worker.ALPINE_SECONDS)
        self.assertEqual(worker.alpine_interval([race(None)], NOW), worker.ALPINE_SECONDS)


class RefreshTest(unittest.TestCase):
    def run_refresh(self, **patches):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'state.json'
            with patch.object(worker, 'STATE', path), patch.object(worker, 'record'), patch('builtins.print'), \
                    patch.multiple(worker, **patches):
                worker.SlowUpdates().refresh(2027, {}, ['1'], True, True)
            return json.loads(path.read_text())

    def test_hockey_failure_still_refreshes_alpine_and_keeps_game_pending(self):
        def alpine(season, state):
            state['alpine'] = 'done'
        def broken(*_):
            raise RuntimeError('source down')
        state = self.run_refresh(refresh_hockey=broken, refresh_alpine=alpine)
        self.assertEqual(state['alpine'], 'done')
        self.assertIn('hockeyAttempt', state)
        self.assertNotIn('finished', state)


class LoopTest(unittest.TestCase):
    def test_failed_check_does_not_stop_the_loop(self):
        hockey_live.STOP.clear()
        self.addCleanup(hockey_live.STOP.clear)
        slow = worker.SlowUpdates()
        calls = []
        def check():
            calls.append(1)
            if len(calls) == 2:
                hockey_live.STOP.set()
            raise RuntimeError('bad file')
        with patch.object(slow, 'check', check), patch.object(worker, 'CHECK_SECONDS', 0), \
                patch.object(worker, 'record'), patch('builtins.print'):
            slow.loop()
        self.assertEqual(len(calls), 2)

    def test_tick_starts_one_thread_and_tracks_season(self):
        slow = worker.SlowUpdates()
        with patch.object(worker.threading, 'Thread') as thread:
            slow.tick(2027)
            slow.tick(2028)
        thread.assert_called_once()
        self.assertEqual(slow.season, 2028)


class RunLoopTest(unittest.TestCase):
    def test_slow_updates_still_run_when_scores_fail(self):
        seasons = []
        def after(season):
            seasons.append(season)
            hockey_live.STOP.set()
        hockey_live.STOP.clear()
        self.addCleanup(hockey_live.STOP.clear)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            live = root / 'hockey-live.json'
            with patch.object(hockey_live, 'CACHE', root), patch.object(hockey_live, 'PATH', live), \
                    patch.object(hockey_live, 'collect', side_effect=RuntimeError('SIHF down')), \
                    patch('builtins.print'), patch('signal.signal'):
                hockey_live.run(2027, after_cycle=after)
            self.assertEqual(json.loads(live.read_text())['status'], 'stopped')
        self.assertEqual(seasons, [2027])


if __name__ == '__main__':
    unittest.main()
