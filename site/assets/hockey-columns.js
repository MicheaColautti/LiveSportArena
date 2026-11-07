// Use the same labels for sorting, tooltips and the table's legend.
const columns = {
  rank:['#','Posizione'], player:['Giocatore','Giocatore'], player_name:['Giocatore','Giocatore'],
  player_number:['N°','Numero di maglia'], team_name:['Squadra','Squadra'], team_acronym:['Squadra','Squadra'],
  position:['Ruolo','Ruolo'], player_position:['Ruolo','Ruolo'], nationality:['Naz.','Nazionalità'],
  team_side:['Lato','Casa o trasferta'], games_played:['PG','Partite giocate'], home_games:['PG casa','Partite in casa'],
  goals:['G','Goal'], assists:['A','Assist'], assists1:['A1','Assist primari'], assists2:['A2','Assist secondari'],
  points:['PT','Punti'], plus_minus:['+/−','Bilancio sul ghiaccio'], pim_total:['PIM','Minuti di penalità'],
  pim2:['2′','Penalità minori'], pim5:['5′','Penalità maggiori'], pim10:['10′','Penalità da dieci minuti'],
  game_misconducts:['GM','Penalità di partita per cattiva condotta'], match_penalties:['MP','Penalità di partita'],
  goals_for:['GF','Goal segnati'], goals_against:['GS','Goal subiti'], goals_against_average:['GAA','Media goal subiti per 60 minuti'],
  goals_for_fw_df:['GF ATT+DIF','Goal di attaccanti e difensori'], goals_for_fw:['GF ATT','Goal degli attaccanti'],
  goals_for_df:['GF DIF','Goal dei difensori'], goals_for_im:['GF IM','Goal IM secondo SIHF'],
  even_goals_for:['GF EQ','Goal segnati in parità numerica'], even_goals_against:['GS EQ','Goal subiti in parità numerica'],
  eq_goals:['G EQ','Goal in parità numerica'], eq_assists:['A EQ','Assist in parità numerica'],
  pp_goals_for:['GF PP','Goal segnati in superiorità numerica'], pp_goals_against:['GS PP','Goal subiti in superiorità numerica'],
  pp_goals:['G PP','Goal in superiorità numerica'], pp_assists:['A PP','Assist in superiorità numerica'],
  pk_goals:['G PK','Goal in inferiorità numerica'], pk_assists:['A PK','Assist in inferiorità numerica'],
  sh_goals:['SHG','Goal in inferiorità numerica'], pk_goals_against:['GS PK','Goal subiti in inferiorità numerica'],
  pp_opportunities:['PP','Occasioni in superiorità numerica'], pp_percent:['PP%','Efficienza in superiorità numerica'],
  pk_situations:['PK','Situazioni di inferiorità numerica'], pk_percent:['PK%','Efficienza in inferiorità numerica'],
  power_play_time:['TOI PP','Tempo in superiorità numerica'], penalty_kill_time:['TOI PK','Tempo in inferiorità numerica'],
  game_winning_goals:['GWG','Goal decisivi'], overtime_goals:['G OT','Goal ai supplementari'], hattricks:['HT','Triplette'],
  time_on_ice:['TOI','Tempo sul ghiaccio'], time_on_ice_eq:['TOI EQ','Tempo sul ghiaccio in parità numerica'],
  time_on_ice_pp:['TOI PP','Tempo sul ghiaccio in superiorità numerica'], time_on_ice_pk:['TOI PK','Tempo sul ghiaccio in inferiorità numerica'],
  shifts:['Cambi','Cambi'], time_on_ice_per_shift:['TOI/C','Tempo medio per cambio'],
  shots_on_goal:['SOG','Tiri in porta'], sog_sog:['SOG','Tiri in porta'], sog_sog_slot:['SOG slot','Tiri in porta dallo slot'],
  sog_missed:['Miss','Tiri fuori bersaglio'], sog_post:['Pali','Tiri sul palo'], blockings:['BLK','Tiri bloccati'],
  soga_sog:['SA','Tiri in porta subiti'], shots_against:['SA','Tiri in porta subiti'], soga_sog_slot:['SA slot','Tiri subiti dallo slot'],
  soga_missed:['Miss avv.','Tiri avversari fuori bersaglio'], soga_post:['Pali avv.','Pali degli avversari'],
  first_keeper:['Tit.','Partite da titolare'], saves:['SV','Parate'], saves_percentage:['SV%','Percentuale di parate'],
  saves_slot_percentage:['SV% slot','Percentuale di parate su tiri dallo slot'], seconds_played:['TOI','Tempo giocato'],
  penalty_in_minutes:['PIM','Minuti di penalità'], shutout:['SO','Partite senza subire goal'],
  wins:['V','Vittorie'], wins_intime:['V REG','Vittorie nei tempi regolamentari'], wins_overtime:['V OT','Vittorie ai supplementari'],
  wins_penalty:['V SO','Vittorie ai rigori'], games_won_penalty:['V SO','Vittorie ai rigori'], losses:['P','Sconfitte'],
  losses_intime:['P REG','Sconfitte nei tempi regolamentari'], losses_overtime:['P OT','Sconfitte ai supplementari'],
  losses_penalty:['P SO','Sconfitte ai rigori'], games_lost_penalty:['P SO','Sconfitte ai rigori'],
  pen_shots:['Rig.','Rigori tirati'], pen_shot_goals:['G rig.','Rigori realizzati'], pen_shots_missed:['Err. rig.','Rigori falliti'],
  pen_shots_percent:['Rig.%','Percentuale di rigori realizzati'], pen_shots_against:['Rig. avv.','Rigori avversari'],
  pen_shot_goals_against:['GS rig.','Goal subiti ai rigori'], pen_shot_saves:['SV rig.','Rigori parati'],
  pen_shot_saves_percent:['SV% rig.','Percentuale di rigori parati'], pen_shot_winning_goals:['GW rig.','Rigori decisivi realizzati'],
  sow_goals_for:['GF SO','Goal segnati nello shootout'], sow_goals_against:['GS SO','Goal subiti nello shootout'],
  faceoffs:['FO','Ingaggi'], faceoffs_won:['FOW','Ingaggi vinti'], faceoffs_lost:['FOL','Ingaggi persi'],
  faceoffs_percent:['FO%','Percentuale di ingaggi vinti'], spectators:['Spett.','Spettatori'],
  stadium_capacity_quotient:['Cap.','Capienza media'], stadium_capacity_percent:['Occ.%','Occupazione della pista'],
  spectators_quotient:['Spett./PG','Spettatori medi per partita in casa']
};

export function hockeyColumn(key) {
  if (columns[key]) return columns[key];
  const modifiers = [
    ['_per_game','/PG',' per partita'], ['_quotient','/PG',' per partita'], ['_percent','%',' (percentuale)'],
    ['_offensive',' OFF',' in zona offensiva'], ['_neutral',' NEU',' in zona neutra'], ['_defensive',' DIF',' in zona difensiva']
  ];
  for (const [suffix, short, long] of modifiers) {
    if (!key.endsWith(suffix)) continue;
    const [label, description] = hockeyColumn(key.slice(0,-suffix.length));
    return [label + short, description + long];
  }
  const label = key.replaceAll('_',' ');
  return [label,label];
}

