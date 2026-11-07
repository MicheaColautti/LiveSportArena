from .diagnostics import logged_update, sihf_call, record
from .common import SITE, CACHE, read_json, write_json, stamp
from datetime import datetime, timezone
TABLES = {
 "team_goals":"Squadre · Gol", "team_goals_by_position":"Squadre · Gol per ruolo", "team_shots":"Squadre · Tiri", "team_power_play":"Squadre · Power play", "team_penalty_kill":"Squadre · Box play", "team_penalties":"Squadre · Penalità", "team_shootouts":"Squadre · Rigori", "team_faceoffs":"Squadre · Ingaggi", "team_faceoffs_by_zone":"Squadre · Ingaggi per zona", "team_faceoffs_by_zone_per_game":"Squadre · Ingaggi per zona e gara", "team_attendance":"Squadre · Pubblico",
 "player_stats":"Giocatori · Punti", "player_goals_assists":"Giocatori · Gol e assist", "player_shots":"Giocatori · Tiri", "player_penalties":"Giocatori · Penalità", "player_shootouts":"Giocatori · Rigori", "player_faceoffs":"Giocatori · Ingaggi", "player_faceoffs_by_zone":"Giocatori · Ingaggi per zona", "player_faceoffs_by_zone_per_game":"Giocatori · Ingaggi per zona e gara", "player_time_on_ice":"Giocatori · Tempo sul ghiaccio", "goalie_stats":"Portieri · Statistiche", "goalie_shots":"Portieri · Parate", "goalie_wins":"Portieri · Vittorie", "goalie_shootouts":"Portieri · Rigori"}


def parse_goalie_shots(raw, season, return_as_pandas=True):
    """SIHF sometimes excludes its explicitly marked league average from `pages`."""
    from sportsdataverse.hockey.sihf.sihf_api_web_parsers import parse_sihf_table

    alias = 'goalkeeperShotDetail'
    if not isinstance(raw, dict) or raw.get('alias') != alias or raw.get('stub') or raw.get('action') == 'Redirect':
        raise ValueError('Unexpected SIHF goalie shots response')
    filters = {f.get('alias'): str(f.get('selected')) for f in raw.get('filters', [])}
    if filters.get('Season') != str(season):
        raise ValueError('SIHF goalie shots season mismatch')
    header = [col['alias'] for col in raw['header']]
    rows, count = raw['data'], raw['pages']
    if not {'player', 'team', 'sogaSog'}.issubset(header) or not isinstance(rows, list) or type(count) is not int or count < 0:
        raise ValueError('Missing goalie shots columns or row count')
    if any(not isinstance(row, list) or len(row) != len(header) for row in rows):
        raise ValueError('Incomplete goalie shots row')
    if len(rows) != count:
        team = header.index('team')
        average = [i for i, row in enumerate(rows, 1) if isinstance(row[team], dict) and str(row[team].get('id')) == '100000']
        marked = [i for group in raw.get('highlightedPositions', []) if group.get('style') == 'average' for i in group.get('rows', [])]
        if len(rows) != count + 1 or len(average) != 1 or average != marked:
            raise ValueError(f'SIHF goalie shots: expected {count} rows, received {len(rows)} without one verified league average')
    # The normal SIHF parser identifies the summary; hockey.records excludes it.
    return parse_sihf_table(raw, return_as_pandas=return_as_pandas)


def goalie_shots(*, season, league_id, language, return_as_pandas):
    from sportsdataverse.hockey.euro_hockey_runtime import _get

    params = {'alias': 'goalkeeperShotDetail', 'searchQuery': f'1//{league_id}', 'language': language,
              'filterBy': 'Season', 'filterQuery': str(season)}
    raw = _get('https://data.sihf.ch/statistic/api/cms/table', params)
    return parse_goalie_shots(raw, season, return_as_pandas)


@logged_update("hockey_statistics")
def update(season, only=None):
 from sportsdataverse.hockey import sihf
 from .hockey import records
 old=read_json(CACHE/'hockey-statistics.json',read_json(SITE/'data/hockey-statistics.json',{}))
 if old.get('season')!=season: old={}
 tables={}
 now=datetime.now(timezone.utc)
 for key,label in TABLES.items():
  prior=old.get('tables',{}).get(key,{})
  if only is not None and key not in only:
   if prior: tables[key]=prior
   continue
  try:
   age=(now-datetime.fromisoformat(prior.get('updatedAt','').replace('Z','+00:00'))).total_seconds()
  except ValueError: age=99999
  if age<3600 and prior.get('status')=='ok':
   record('update', operation='hockey_statistics.'+key, outcome='skipped', reason='fresh-cache', updatedAt=prior.get('updatedAt'))
   tables[key]=prior; continue
  try:
   fetch=goalie_shots if key=='goalie_shots' else getattr(sihf,'sihf_'+key)
   rows=records(sihf_call(fetch,season=season,league_id=1,language='en',return_as_pandas=True))
   tables[key]={'label':label,'status':'ok','updatedAt':stamp(),'rows':rows}
  except Exception as exc:
   print(f'SIHF statistics {key}: {exc}',flush=True)
   tables[key]={**prior,'label':label,'status':'stale','lastAttemptAt':stamp(),'rows':prior.get('rows',[])}
  print('SIHF statistics: '+key,flush=True)
 data={'season':season,'tables':tables,'checkedAt':stamp()}
 write_json(SITE/'data/hockey-statistics.json',data);write_json(CACHE/'hockey-statistics.json',data)
 return data
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--season',type=int,required=True);update(p.parse_args().season)
