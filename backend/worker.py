"""Long-running server process: live hockey scores plus the slower data refreshes.

The polling loop is the only writer of hockey-live.json. Slower refreshes run in one
background thread, so they never delay scores; the next poll picks up their hockey.json.
"""
import argparse
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from . import hockey_live
from .hockey import records
from .diagnostics import sihf_call
from .common import SITE, CACHE, read_json, write_json, stamp
from .diagnostics import logged_update, record
from .scheduled import finished_ids, refresh_alpine, refresh_hockey

STATE = CACHE / 'schedule-state.json'
CHECK_SECONDS = 30
STATISTICS_SECONDS = 3600
HOCKEY_RETRY_SECONDS = 300
ALPINE_SECONDS = 1800
ALPINE_RACE_SECONDS = 120
BEFORE_FIRST_RUN = timedelta(minutes=30)
AFTER_LAST_RUN = timedelta(hours=3)


def seconds_since(state, key, now):
    try:
        return (now - datetime.fromisoformat(state[key].replace('Z', '+00:00'))).total_seconds()
    except (KeyError, ValueError):
        return float('inf')


def alpine_interval(races, now):
    """FIS only flags a race as live on its page, so read it often around race time."""
    for race in races:
        if race.get('status') == 'live':
            return ALPINE_RACE_SECONDS
        if race.get('status') == 'cancelled':
            continue
        starts = [datetime.fromisoformat(run['start'].replace('Z', '+00:00'))
                  for run in race.get('runs', []) if run.get('start')]
        if starts and min(starts) - BEFORE_FIRST_RUN <= now <= max(starts) + AFTER_LAST_RUN:
            return ALPINE_RACE_SECONDS
    return ALPINE_SECONDS


def plan(state, games, races, now):
    """Return (refresh hockey, refresh alpine) for the current state."""
    changed = bool(games) and state.get('finished') != finished_ids(games)
    hourly = any(g['status'] == 'live' for g in games) and seconds_since(state, 'statistics', now) >= STATISTICS_SECONDS
    hockey_due = (changed or hourly) and seconds_since(state, 'hockeyAttempt', now) >= HOCKEY_RETRY_SECONDS
    return hockey_due, seconds_since(state, 'alpine', now) >= alpine_interval(races, now)


def refresh_lineups(games, season):
    from sportsdataverse.hockey import sihf
    from sportsdataverse.hockey.sihf import parse_sihf_game_lineups
    path = SITE / 'data/hockey.json'
    snapshot = read_json(path, {})
    if snapshot.get('season') != season:
        return
    changed = False
    for game in games:
        gid = game['id']
        try:
            report = sihf_call(sihf.sihf_game_info, game_id=int(gid), language='en', return_parsed=False)
            if str(report.get('gameId')) != gid:
                continue
            rows = records(parse_sihf_game_lineups(report, return_as_pandas=True))
            if not rows:
                continue
            scorers = sorted({str(tag['id']) for side in ('homeTeam', 'awayTeam')
                              for tag in ((report.get('lineUps') or {}).get(side) or {}).get('taggedPlayers', [])
                              if tag.get('type') == 'pftopscorer' and tag.get('id')})
            detail = snapshot.setdefault('details', {}).setdefault(gid, {})
            if rows != detail.get('lineups') or scorers != detail.get('topScorers'):
                detail.update(lineups=rows, topScorers=scorers, updatedAt=stamp())
                changed = True
                print(f'SIHF formazioni {gid}: {len(rows)} giocatori', flush=True)
        except Exception as exc:
            print(f'SIHF formazioni {gid}: {exc}', flush=True)
    if changed:
        snapshot['updatedAt'] = stamp()
        write_json(CACHE / 'hockey.json', snapshot)
        write_json(path, snapshot)


class SlowUpdates:
    def __init__(self):
        self.season = None
        self.thread = None

    def tick(self, season):
        """Called by the polling loop, so this thread only starts after it holds the lock."""
        self.season = season
        if not self.thread:
            self.thread = threading.Thread(target=self.loop, name='slow-updates')
            self.thread.start()

    def loop(self):
        while True:
            try:
                self.check()
            except Exception as exc:
                record('fallback', outcome='error', errorType=type(exc).__name__, error=str(exc))
                print(f'Slow update check failed: {exc}', flush=True)
            if hockey_live.STOP.wait(CHECK_SECONDS):
                return

    def check(self):
        state = read_json(STATE, {})
        games = read_json(SITE / 'data/hockey-live.json', {}).get('games', [])
        races = read_json(SITE / 'data/alpine.json', {}).get('races', [])
        hockey_due, alpine_due = plan(state, games, races, datetime.now(timezone.utc))
        now = datetime.now(timezone.utc)
        attempts = state.setdefault('lineupAttempts', {})
        pregame = []
        for game in games:
            if game['status'] != 'scheduled' or not game.get('start'):
                continue
            start = datetime.fromisoformat(game['start'].replace('Z', '+00:00'))
            if start.tzinfo is None:
                start = start.replace(tzinfo=ZoneInfo('Europe/Zurich'))
            if timedelta(0) <= start - now <= timedelta(minutes=105):
                if seconds_since(attempts, game['id'], now) >= 600:
                    pregame.append(game)
                    attempts[game['id']] = stamp()
        if pregame:
            write_json(STATE, state)
            refresh_lineups(pregame, self.season)
        if hockey_due or alpine_due:
            self.refresh(self.season, state, finished_ids(games), hockey_due, alpine_due)

    @logged_update('worker_refresh')
    def refresh(self, season, state, finished, hockey_due, alpine_due):
        try:
            if hockey_due:
                state['hockeyAttempt'] = stamp()
                try:
                    refresh_hockey(season, state, finished)
                except Exception as exc:
                    record('fallback', outcome='error', errorType=type(exc).__name__, error=str(exc))
                    print(f'Hockey update unavailable: {exc}', flush=True)
            if alpine_due:
                refresh_alpine(season, state)
        finally:
            write_json(STATE, state)

    def wait(self):
        if self.thread:
            self.thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int)
    slow = SlowUpdates()
    hockey_live.run(parser.parse_args().season, after_cycle=slow.tick)
    slow.wait()


if __name__ == '__main__':
    main()
