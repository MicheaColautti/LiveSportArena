"""Lightweight SIHF score polling; run beside the local static server."""
from .diagnostics import logged_update, sihf_call
import argparse
import fcntl
from math import ceil
import signal
import os
from time import monotonic
from .diagnostics import record
import threading
from datetime import datetime
from zoneinfo import ZoneInfo
from .common import SITE, CACHE, read_json, write_json, stamp
from .hockey import records, live_projection, enrich_goal_strength

STOP = threading.Event()
PATH = SITE / 'data/hockey-live.json'


def interval(games):
    now = datetime.now(ZoneInfo('Europe/Zurich'))
    if any(g['status'] == 'live' for g in games):
        return max(20, int(os.environ.get('HOCKEY_LIVE_SECONDS', '20')))
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


def event_snapshot(game, previous, fetch, parse):
    gid = game['id']
    item = dict(previous, checkedAt=stamp())
    started = monotonic()
    try:
        report = sihf_call(fetch, game_id=int(gid), language='en', return_parsed=False)
        if str(report.get('gameId')) != gid:
            raise ValueError('Unexpected SIHF game ID')
        periods = (report.get('summary') or {}).get('periods')
        revision = report.get('updateDateTime')
        if revision and previous.get('sourceUpdatedAt') and revision < previous['sourceUpdatedAt']:
            raise ValueError('Older SIHF report')
        if not periods:
            item['status'] = 'stale' if previous.get('fetchedAt') else 'unpublished'
        else:
            if not isinstance(periods, list) or not all(isinstance(p, dict) and
                    isinstance(p.get('goals'), list) and isinstance(p.get('fouls'), list) for p in periods):
                raise ValueError('Incomplete SIHF periods')
            events = records(parse(report, return_as_pandas=True))
            enrich_goal_strength(events, report)
            result = report.get('result') or {}
            score = [result.get('homeTeam'), result.get('awayTeam')]
            item['score'] = [int(n) for n in score] if all(str(n).isdigit() for n in score) else None
            latest = next((e for e in reversed(events) if e.get('event_type') == 'goal'
                           and e.get('score_home') is not None and e.get('score_away') is not None), None)
            if latest and item['score'] in (None, [0, 0]):
                item['score'] = [int(latest['score_home']), int(latest['score_away'])]
            item.update(events=events, status='ok', fetchedAt=stamp(), sourceUpdatedAt=revision)
    except Exception as exc:
        item['status'] = 'stale'
        record('hockey_events_error', gameId=gid, error=str(exc))
    record('hockey_events', gameId=gid, status=item['status'], count=len(item.get('events', [])),
           durationMs=round((monotonic()-started)*1000))
    return item


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
        if previous and previous.get('status') == 'live' and status == 'scheduled':
            continue
        if previous and status == previous.get('status') == 'live':
            incomplete = None in (patch['homeScore'], patch['awayScore'])
            reset = (patch['homeScore'], patch['awayScore']) == (0, 0)
            if incomplete or reset:
                patch.update(homeScore=previous.get('homeScore'), awayScore=previous.get('awayScore'))
        patches[gid] = patch
    baseline = read_json(SITE / 'data/hockey.json', {})
    games = [{**g, **patches.get(g['id'], {})} for g in baseline.get('games', [])]
    if scheduled:
        standings = records(sihf_call(sihf.sihf_standings, season=season, league_id=1, language='en', return_as_pandas=True))
        baseline['standings'] = standings
    previous = old.get('eventsByGame', {}) if old.get('season') == season else {}
    events = {}
    for g in games:
        gid = g['id']
        prior = previous.get(gid, {})
        if g['status'] == 'live' or (g['status'] == 'finished' and prior and not prior.get('final')):
            item = event_snapshot(g, prior, sihf.sihf_game_info, sihf.parse_sihf_pbp)
            item['final'] = g['status'] == 'finished' and item['status'] == 'ok'
            if item.get('status') == 'ok' and item.get('score') and g['status'] == 'live':
                # A newer results feed can already include the next goal.
                revision = item.get('sourceUpdatedAt')
                if not revision or not g.get('sourceUpdatedAt') or revision >= g['sourceUpdatedAt']:
                    g['homeScore'], g['awayScore'] = item['score']
                    patches[gid] = dict(g, scoreCheckedAt=item['fetchedAt'],
                                        sourceUpdatedAt=revision or g.get('sourceUpdatedAt'))
            events[gid] = item
        elif prior.get('final') and (baseline.get('details', {}).get(gid, {}).get('updatedAt') or '') < prior['fetchedAt']:
            events[gid] = prior
    delay = 300 if scheduled else interval(games)
    result = dict(season=season, status='ok', mode='github-actions' if scheduled else 'local-worker', checkedAt=checked,
                  updatedAt=checked, eventsByGame=events, nextPollSeconds=delay, games=list(patches.values()),
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
