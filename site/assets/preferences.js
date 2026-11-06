export const TEAM_LOGOS = { '101150':'HCL','103140':'Ginevra','101060':'Rapperswill','101149':'Kloten','101151':'HCD','102127':'Langnau','102128':'Bienne','103138':'Friborgo','103141':'Losanna','101144':'EVZ','101139':'ZSC','102126':'Bern','103144':'Ajoie','101152':'HCAP' };
export const NATIONS = {
 SUI:{name:'Svizzera',color:'#bd343d'}, ITA:{name:'Italia',color:'#2487ba'}, USA:{name:'Stati Uniti',color:'#344b88'}, AUT:{name:'Austria',color:'#aa4652'}, FRA:{name:'Francia',color:'#5866a1'}, NOR:{name:'Norvegia',color:'#ad535c'}, SWE:{name:'Svezia',color:'#b19328'}, GER:{name:'Germania',color:'#81703d'}, CAN:{name:'Canada',color:'#b64848'}, SLO:{name:'Slovenia',color:'#538060'}, SVK:{name:'Slovacchia',color:'#697caf'}, FIN:{name:'Finlandia',color:'#6793aa'}, CRO:{name:'Croazia',color:'#af665b'}, GBR:{name:'Regno Unito',color:'#846ca7'}, BRA:{name:'Brasile',color:'#528654'}, NZL:{name:'Nuova Zelanda',color:'#646f77'}, AND:{name:'Andorra',color:'#ab9560'}, CZE:{name:'Cechia',color:'#7b73a2'}, POL:{name:'Polonia',color:'#b86879'}, ESP:{name:'Spagna',color:'#b37842'}, BEL:{name:'Belgio',color:'#9b864b'}
};
export function projectedStandings(hockey) {
 const rows = (hockey.standings || []).map(r => ({...r}));
 // Projection supplied by the collector from a consistent regular-season snapshot.
 if (hockey.liveStandings?.length && hockey.status === 'ok') return {rows:hockey.liveStandings,live:true};
 return {rows,live:false};
}
