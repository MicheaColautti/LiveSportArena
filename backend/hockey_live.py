"""Lightweight SIHF score polling; run beside the local static server."""
from .diagnostics import logged_update, sihf_call
import argparse
import fcntl
from math import ceil
import signal
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
from .common import SITE, CACHE, read_json, write_json, stamp
from .hockey import records, live_projection

STOP = threading.Event()
PATH = SITE / 'data/hockey-live.json'


def interval(games):
    now = datetime.now(ZoneInfo('Europe/Zurich'))
    if any(g['status'] == 'live' for g in games):
        return 60
    delay = 300
    for game in games:
        if game['status'] != 'scheduled':
            continue
        if game.get('start'):
            start = datetime.fromisoformat(game['start'].replace('Z', '+00:00'))
            if start.tzinfo is None:
                start = start.replace(tzinfo=ZoneInfo('Europe/Zurich'))
            remaining = (start - now).total_seconds()
            if -14400 <= remaining <= 300:
                return 60
            if remaining > 300:
                delay = min(delay, ceil(remaining - 300))
    return delay


@logged_update("hockey_live")
def collect(season, scheduled=False):
    from sportsdataverse.hockey import sihf
    raw = records(sihf_call(sihf.sihf_results, season=season, league_id=1, language='en',
                                  return_as_pandas=True))
    if any(int(m['season']) != season for m in raw):
        raise ValueError('SIHF season mismatch')
    old = read_json(PATH, {})
    patches = {g['id']: g for g in old.get('games', [])} if old.get('season') == season else {}
    checked = stamp()
    for m in raw:
        sid = m.get('status_id')
        if sid is None:
            raise ValueError('SIHF status missing')
        status = 'cancelled' if m.get('status_canceled') else 'finished' if sid == 12 else 'scheduled' if sid == 0 else 'live'
        start = m.get('start_date_time')
        if not start and m.get('time'):
            start = datetime.fromisoformat(m['date'][:10]+'T'+m['time']).replace(tzinfo=ZoneInfo('Europe/Zurich')).isoformat()
        gid = str(m['game_id'])
        patch = dict(id=gid, date=m['date'][:10], start=start,
                     home=str(m['home_team_id']), away=str(m['away_team_id']),
                     homeScore=m.get('score_home'), awayScore=m.get('score_away'),
                     homePeriods=m.get('score_per_period_home'), awayPeriods=m.get('score_per_period_away'),
                     status=status, statusId=sid, statusText=m.get('status_name'), decision=m.get('decision'),
                     sourceUpdatedAt=m.get('update_date_time'), scoreCheckedAt=checked,
                     sourceUrl=f'https://www.sihf.ch/de/game-center/game/{gid}')
        previous = patches.get(gid)
        if previous and previous.get('sourceUpdatedAt') and patch.get('sourceUpdatedAt') and patch['sourceUpdatedAt'] < previous['sourceUpdatedAt']:
            continue
        patches[gid] = patch
    baseline = read_json(SITE / 'data/hockey.json', {})
    games = [{**g, **patches.get(g['id'], {})} for g in baseline.get('games', [])]
    if scheduled:
        standings = records(sihf_call(sihf.sihf_standings, season=season, league_id=1, language='en', return_as_pandas=True))
        baseline['standings'] = standings
    delay = 300 if scheduled else interval(games)
    result = dict(season=season, status='ok', mode='github-actions' if scheduled else 'local-worker', checkedAt=checked,
                  updatedAt=checked, nextPollSeconds=delay, games=list(patches.values()),
                  baseUpdatedAt=baseline.get('updatedAt'), standings=baseline.get('standings', []),
                  liveStandings=live_projection(baseline.get('standings', []), games))
    write_json(PATH, result)
    print(f"SIHF punteggi: {len(raw)} incontri letti; prossimo controllo tra {delay}s", flush=True)
    return delay


def run(fixed_season=None, after_cycle=None):
    """Poll until stopped; after_cycle(season) also runs when the SIHF read failed."""
    CACHE.mkdir(parents=True, exist_ok=True)
    with (CACHE / 'hockey-live.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Aggiornamento hockey già attivo per questo progetto.')
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: STOP.set())
        failures = 0
        while not STOP.is_set():
            now = datetime.now(ZoneInfo('Europe/Zurich'))
            season = fixed_season or int(read_json(SITE / 'data/hockey.json', {}).get('season') or now.year + (now.month >= 7))
            try:
                delay = collect(season)
                failures = 0
            except Exception as exc:
                failures += 1
                delay = min(900, 60 * 2 ** min(failures-1, 4))
                if any(code in str(exc) for code in ('429', '403')):
                    delay = 900
                old = read_json(PATH, {})
                old.update(status='stale', checkedAt=stamp(), nextPollSeconds=delay,
                           error='Aggiornamento punteggi non disponibile; conservati gli ultimi dati.')
                write_json(PATH, old)
                print(f'SIHF: {exc}. Nuovo tentativo tra {delay}s', flush=True)
            if after_cycle:
                after_cycle(season)
            STOP.wait(delay)
        old = read_json(PATH, {})
        old.update(status='stopped', checkedAt=stamp())
        write_json(PATH, old)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int)
    run(parser.parse_args().season)


if __name__ == '__main__':
    main()
