"""Static, subscribable National League calendars, refreshed with SIHF data."""
from datetime import datetime, timezone
from .common import SITE, read_json, write_json, stamp
from .alpine import escape, folded


def update(data):
    if not data.get('games'):
        return
    path = SITE / 'data/hockey-calendar.json'
    old = {e['id']: e for e in read_json(path, {}).get('events', [])}
    teams = {str(t['id']): t['name'] for t in data.get('teams', [])}
    events = []
    now = stamp()
    revision = int((datetime.now(timezone.utc) - datetime(2020, 1, 1, tzinfo=timezone.utc)).total_seconds())
    for game in data['games']:
        home, away = str(game['home']), str(game['away'])
        event = dict(id=str(game['id']), home=home, away=away,
                     title=f"{teams.get(home, home)} – {teams.get(away, away)}",
                     start=game.get('start'), date=game['date'],
                     status='cancelled' if game.get('status') == 'cancelled' else 'confirmed',
                     sourceUrl=game.get('sourceUrl', ''))
        previous = old.pop(event['id'], None)
        changed = not previous or any(previous.get(k) != v for k, v in event.items())
        event['modified'] = now if changed else previous['modified']
        event['sequence'] = max(revision, previous.get('sequence', 0) + 1 if previous else 0) if changed else previous['sequence']
        events.append(event)
    # Preserve removed fixtures as cancellations, so subscriptions can reconcile them.
    for event in old.values():
        if event['status'] != 'cancelled':
            event.update(status='cancelled', modified=now, sequence=max(revision, event['sequence']+1))
        events.append(event)
    write_json(path, {'events': events})
    folder = SITE / 'calendars'
    folder.mkdir(parents=True, exist_ok=True)
    for team_id in [None, *teams]:
        lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
                 'PRODID:-//Live Sport Arena//National League//IT',
                 'X-WR-CALNAME:' + escape('Live Sport Arena · ' + (teams[team_id] if team_id else 'National League')),
                 'X-WR-TIMEZONE:Europe/Zurich', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H']
        for event in events:
            if team_id and team_id not in [event['home'], event['away']]:
                continue
            modified = datetime.fromisoformat(event['modified'].replace('Z', '+00:00')).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            lines += ['BEGIN:VEVENT', 'UID:hockey-' + event['id'] + '@sportarenalive',
                      'SEQUENCE:' + str(event['sequence']), 'DTSTAMP:' + modified, 'LAST-MODIFIED:' + modified]
            if event['start']:
                start = datetime.fromisoformat(event['start'].replace('Z', '+00:00')).astimezone(timezone.utc)
                lines.append('DTSTART:' + start.strftime('%Y%m%dT%H%M%SZ'))
            else:
                lines.append('DTSTART;VALUE=DATE:' + event['date'].replace('-', ''))
            description = 'National League · Ora svizzera.' if event['start'] else 'Orario da confermare; il calendario verrà aggiornato.'
            lines += ['SUMMARY:' + escape(event['title']), 'DESCRIPTION:' + escape(description),
                      'URL:' + event['sourceUrl'], 'STATUS:' + event['status'].upper(), 'TRANSP:TRANSPARENT', 'END:VEVENT']
        lines += ['END:VCALENDAR', '']
        (folder / f"hockey-{team_id or 'national-league'}.ics").write_bytes('\r\n'.join(folded(line) for line in lines).encode('utf-8'))


if __name__ == '__main__':
    update(read_json(SITE / 'data/hockey.json', {}))
