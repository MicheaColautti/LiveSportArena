export function raceTime(race) {
 const last = race.runs?.at(-1)?.start || race.runs?.[0]?.start;
 return new Date(last || race.date + 'T00:00:00Z').getTime();
}
export function raceResults(race) {
 if (race.status !== 'finished') return [];
 const rows = (race.results || []).filter(row => {
   if (!/^\d+$/.test(String(row.rank)) || Number(row.rank) < 1) return false;
   const first = timeSeconds(row.values?.[0]);
   if (first == null) return false;
   if (race.runs.length < 2) return true;
   const second = timeSeconds(row.values?.[1]);
   const total = timeSeconds(row.values?.[2]);
   // A first-run classification must not be treated as a completed two-run race.
   return second != null && total != null && Math.abs(first + second - total) < .03;
 });
 return rows.some(row => Number(row.rank) === 1) ? rows : [];
}
export function timeSeconds(value) {
 if (typeof value !== 'string' || !/^(?:\d+:)?\d+\.\d+$/.test(value)) return null;
 const parts = value.split(':').map(Number);
 return parts.length === 2 ? parts[0]*60+parts[1] : parts[0];
}
export function seasonMetrics(races, gender = 'all') {
 const selected = races.filter(r => gender === 'all' || r.gender === gender);
 const covered = selected.filter(r => raceResults(r).length);
 const athletes = new Map(), venues = new Map(), disciplines = new Map(), nations = new Map();
 const closeRaces = [];
 for (const race of selected) {
   const key = race.venue+'|'+race.country;
   if (!venues.has(key)) venues.set(key,{venue:race.venue,country:race.country,total:0,finished:0});
   venues.get(key).total++;
   if (race.status === 'finished') venues.get(key).finished++;
   disciplines.set(race.discipline,(disciplines.get(race.discipline)||0)+1);
 }
 for (const race of covered) {
   const rows = raceResults(race);
   for (const row of rows) {
     const id = String(row.fisCode || row.athleteUrl || row.name);
     if (!athletes.has(id)) athletes.set(id,{id,name:row.name,country:row.country,gender:race.gender,wins:0,podiums:0,top10:0,finishes:0});
     const a=athletes.get(id), rank=Number(row.rank);
     a.finishes++; a.wins+=Number(rank===1); a.podiums+=Number(rank<=3); a.top10+=Number(rank<=10);
     if (rank<=3) { const n=nations.get(row.country)||{country:row.country,wins:0,podiums:0}; n.podiums++; n.wins+=Number(rank===1); nations.set(row.country,n); }
   }
   const sorted=[...rows].sort((a,b)=>Number(a.rank)-Number(b.rank));
   const first=timeSeconds(sorted[0]?.values?.[race.runs.length>1 ? 2 : 0]);
   const second=timeSeconds(sorted[1]?.values?.[race.runs.length>1 ? 2 : 0]);
   if (first!=null && second!=null && second>=first) closeRaces.push({race,gap:Math.round((second-first)*100)/100,winner:sorted[0]});
 }
 return {races:selected,covered:covered.length,finished:selected.filter(r=>r.status==='finished').length,
 athletes:[...athletes.values()].sort((a,b)=>b.wins-a.wins||b.podiums-a.podiums||b.top10-a.top10||a.name.localeCompare(b.name)),
 venues:[...venues.values()].sort((a,b)=>b.total-a.total||a.venue.localeCompare(b.venue)), disciplines:[...disciplines],
 nations:[...nations.values()].sort((a,b)=>b.podiums-a.podiums||b.wins-a.wins), closeRaces:closeRaces.sort((a,b)=>a.gap-b.gap)};
}
