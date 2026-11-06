"""One bounded update per Actions run, with persisted data between deployments."""
from .diagnostics import logged_update, record
import shutil
from datetime import datetime, timezone
from .common import SITE, CACHE, read_json, write_json, stamp
from . import hockey_live, hockey, hockey_statistics, hockey_calendar, predictions, alpine, alpine_standings


@logged_update("scheduled")
def main():
    archive = CACHE / 'published'
    for name in ('data', 'calendars'):
        if (archive/name).exists():
            shutil.copytree(archive/name, SITE/name, dirs_exist_ok=True)
    now = datetime.now(timezone.utc)
    season = now.year + (now.month >= 7)
    state = read_json(CACHE/'schedule-state.json', {})
    def due(key, seconds):
        try:
            return (now-datetime.fromisoformat(state[key].replace('Z','+00:00'))).total_seconds() >= seconds
        except (KeyError, ValueError):
            return True
    try:
        hockey_live.collect(season, scheduled=True)
        live = read_json(SITE/'data/hockey-live.json', {})
        games = live.get('games', [])
        finished = sorted(g['id'] for g in games if g['status']=='finished')
        active = any(g['status']=='live' for g in games)
        # Once after a newly completed game; hourly while playing; otherwise unchanged.
        if state.get('finished') != finished or (active and due('statistics', 3600)):
            snapshot = hockey.update(season, detail_limit=8)
            hockey_statistics.update(season)
            hockey_calendar.update(snapshot)
            predictions.update(snapshot)
            state.update(finished=finished, statistics=stamp())
            # Align the overlay's standings baseline with the newly published snapshot.
            live.update(baseUpdatedAt=snapshot['updatedAt'], standings=snapshot['standings'],
                        liveStandings=snapshot['liveStandings'])
            write_json(SITE/'data/hockey-live.json', live)
        else:
            record('update', operation='hockey_statistics', outcome='skipped', reason='no-new-finished-games-or-not-due')
    except Exception as exc:
        record('fallback', outcome='error', errorType=type(exc).__name__, error=str(exc))
        print(f'::warning::Hockey update unavailable: {exc}', flush=True)
        live = read_json(SITE/'data/hockey-live.json', {})
        live.update(status='stale', checkedAt=stamp())
        write_json(SITE/'data/hockey-live.json', live)
    if due('alpine', 1200):
        try:
            alpine.update(season)
            alpine_standings.update(season)
            state['alpine'] = stamp()
        except Exception as exc:
            record('fallback', outcome='error', errorType=type(exc).__name__, error=str(exc))
            source = getattr(exc, 'url', '')
            print(f'::warning::Alpine update unavailable: {exc}' + (f' ({source})' if source else ''), flush=True)
            # Keep the last verified calendar and record the failed source check.
            previous = read_json(SITE/'data/alpine.json', {})
            previous.update(status='stale', lastAttemptAt=stamp())
            write_json(SITE/'data/alpine.json', previous)
            state['alpine'] = stamp()
    else:
        record('update', operation='alpine', outcome='skipped', reason='not-due')
    write_json(CACHE/'schedule-state.json', state)
    for name in ('data','calendars'):
        shutil.copytree(SITE/name, archive/name, dirs_exist_ok=True)


if __name__ == '__main__':
    main()
