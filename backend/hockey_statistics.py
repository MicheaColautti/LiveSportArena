from .common import SITE, CACHE, read_json, write_json, stamp
from datetime import datetime, timezone
TABLES = {
 "team_goals":"Squadre · Gol", "team_goals_by_position":"Squadre · Gol per ruolo", "team_shots":"Squadre · Tiri", "team_power_play":"Squadre · Power play", "team_penalty_kill":"Squadre · Box play", "team_penalties":"Squadre · Penalità", "team_shootouts":"Squadre · Rigori", "team_faceoffs":"Squadre · Ingaggi", "team_faceoffs_by_zone":"Squadre · Ingaggi per zona", "team_faceoffs_by_zone_per_game":"Squadre · Ingaggi per zona e gara", "team_attendance":"Squadre · Pubblico",
 "player_stats":"Giocatori · Punti", "player_goals_assists":"Giocatori · Gol e assist", "player_shots":"Giocatori · Tiri", "player_penalties":"Giocatori · Penalità", "player_shootouts":"Giocatori · Rigori", "player_faceoffs":"Giocatori · Ingaggi", "player_faceoffs_by_zone":"Giocatori · Ingaggi per zona", "player_faceoffs_by_zone_per_game":"Giocatori · Ingaggi per zona e gara", "player_time_on_ice":"Giocatori · Tempo sul ghiaccio", "goalie_stats":"Portieri · Statistiche", "goalie_shots":"Portieri · Parate", "goalie_wins":"Portieri · Vittorie", "goalie_shootouts":"Portieri · Rigori"}
def update(season):
 from sportsdataverse.hockey import sihf
 from .hockey import records
 old=read_json(CACHE/'hockey-statistics.json',read_json(SITE/'data/hockey-statistics.json',{}))
 if old.get('season')!=season: old={}
 tables={}
 now=datetime.now(timezone.utc)
 for key,label in TABLES.items():
  prior=old.get('tables',{}).get(key,{})
  try:
   age=(now-datetime.fromisoformat(prior.get('updatedAt','').replace('Z','+00:00'))).total_seconds()
  except ValueError: age=99999
  if age<3600 and prior.get('status')=='ok': tables[key]=prior; continue
  try:
   rows=records(getattr(sihf,'sihf_'+key)(season=season,league_id=1,language='en',return_as_pandas=True))
   tables[key]={'label':label,'status':'ok','updatedAt':stamp(),'rows':rows}
  except Exception as exc:
   print(f'SIHF statistics {key}: {exc}',flush=True)
   tables[key]={**prior,'label':label,'status':'stale','rows':prior.get('rows',[])}
  print('SIHF statistics: '+key,flush=True)
 data={'season':season,'tables':tables,'checkedAt':stamp()}
 write_json(SITE/'data/hockey-statistics.json',data);write_json(CACHE/'hockey-statistics.json',data)
 return data
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--season',type=int,required=True);update(p.parse_args().season)
