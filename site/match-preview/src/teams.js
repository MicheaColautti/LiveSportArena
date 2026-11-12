// Squadre della National League: colori usati per tifosi, bandiere, maglie, LED e panchine.
// primary = colore dominante, secondary = secondo colore, accent = terzo colore (dettagli, bandiere).
// flags = stili di bandiera della curva (vedi flagAtlas in engine.js): h2, v2, diag, check, stripes, logo, name, name2.
// Niente tricolori o croci: con certi colori sembrerebbero bandiere nazionali.
// founded = anno di fondazione mostrato nell'intro (da verificare: HCL 1941, GSHC 1905 ed EHCK 1934 sono confermati dai siti dei club).

export const TEAMS = {
  HCAP: { name: 'HC Ambrì-Piotta', founded: 1937, short: 'HCAP', city: 'Ambrì', logo: 'HCAP', primary: '#0b56ad', secondary: '#ffffff', accent: '#0a2f6b', curve: 'Curva Sud', chant: 'Forza Ambrì', flags: ['h2', 'v2', 'diag', 'logo', 'stripes', 'name', 'name2'] },
  HCL:  { name: 'HC Lugano', founded: 1941, short: 'HCL', city: 'Lugano', logo: 'HCL', primary: '#15202b', secondary: '#ffffff', accent: '#f2c500', curve: 'Curva Nord', chant: 'Forza Lugano', flags: ['name2', 'stripes', 'logo', 'diag', 'name', 'check', 'h2'] },
  HCA:  { name: 'HC Ajoie', founded: 1973, short: 'HCA', city: 'Porrentruy', logo: 'Ajoie', primary: '#f0a800', secondary: '#111111', accent: '#ffffff', curve: 'Kop Jurassien', chant: 'Allez Ajoie', flags: ['h2', 'check', 'logo', 'v2', 'diag', 'name', 'name2', 'stripes'] },
  SCB:  { name: 'SC Bern', founded: 1931, short: 'SCB', city: 'Berna', logo: 'Bern', primary: '#d3172a', secondary: '#ffd200', accent: '#111111', curve: 'Stehrampe', chant: 'Hopp SCB', flags: ['stripes', 'name2', 'logo', 'diag', 'name', 'h2'] },
  EHCB: { name: 'EHC Biel-Bienne', founded: 1939, short: 'EHCB', city: 'Bienne', logo: 'Bienne', primary: '#e30613', secondary: '#ffcc00', accent: '#111111', curve: 'Fankurve', chant: 'Allez Bienne', flags: ['h2', 'v2', 'logo', 'diag', 'name', 'check', 'name2', 'stripes'] },
  HCD:  { name: 'HC Davos', founded: 1921, short: 'HCD', city: 'Davos', logo: 'HCD', primary: '#0a3a8c', secondary: '#f2bd00', accent: '#ffffff', curve: 'Fankurve', chant: 'Hopp HCD', flags: ['h2', 'diag', 'logo', 'v2', 'name', 'stripes', 'name2'] },
  HCFG: { name: 'HC Fribourg-Gottéron', founded: 1938, short: 'HCFG', city: 'Friburgo', logo: 'Friborgo', primary: '#111111', secondary: '#ffffff', accent: '#1f5aa8', extra: '#c8102e', curve: 'Kop', chant: 'Allez Gottéron', flags: ['v2', 'check', 'logo', 'h2', 'diag', 'name', 'name2', 'stripes'] },
  GSHC: { name: 'Genève-Servette HC', founded: 1905, short: 'GSHC', city: 'Ginevra', logo: 'Ginevra', primary: '#8a1538', secondary: '#ffffff', accent: '#f2c230', curve: 'Kop', chant: 'Allez Servette', flags: ['h2', 'name2', 'logo', 'diag', 'name', 'stripes'] },
  EHCK: { name: 'EHC Kloten', founded: 1934, short: 'EHCK', city: 'Kloten', logo: 'Kloten', primary: '#c9162b', secondary: '#ffffff', accent: '#0d2c6c', curve: 'Fankurve', chant: 'Hopp Chlote', flags: ['stripes', 'v2', 'logo', 'diag', 'name', 'name2'] },
  SCLT: { name: 'SCL Tigers', founded: 1946, short: 'SCLT', city: 'Langnau', logo: 'Langnau', primary: '#f6c400', secondary: '#d0202e', accent: '#ffffff', curve: 'Fankurve', chant: 'Hopp Tigers', flags: ['h2', 'diag', 'logo', 'name2', 'name', 'check', 'stripes'] },
  LHC:  { name: 'Lausanne HC', founded: 1922, short: 'LHC', city: 'Losanna', logo: 'Losanna', primary: '#c8102e', secondary: '#ffffff', accent: '#003a70', curve: 'Kop', chant: 'Allez Lausanne', flags: ['stripes', 'v2', 'logo', 'diag', 'name', 'h2', 'name2'] },
  SCRJ: { name: 'SC Rapperswil-Jona Lakers', founded: 1945, short: 'SCRJ', city: 'Rapperswil-Jona', logo: 'Rapperswill', primary: '#d0102a', secondary: '#ffffff', accent: '#00549f', curve: 'Fankurve', chant: 'Hopp Lakers', flags: ['h2', 'name2', 'logo', 'diag', 'name', 'check', 'stripes'] },
  ZSC:  { name: 'ZSC Lions', founded: 1930, short: 'ZSC', city: 'Zurigo', logo: 'ZSC', primary: '#123a7d', secondary: '#ffffff', accent: '#d50032', curve: 'Fankurve', chant: 'Hopp ZSC', flags: ['stripes', 'name2', 'logo', 'diag', 'name', 'h2'] },
  EVZ:  { name: 'EV Zug', founded: 1967, short: 'EVZ', city: 'Zugo', logo: 'EVZ', primary: '#0a67ad', secondary: '#ffffff', accent: '#0b2545', curve: 'Fankurve', chant: 'Hopp Zug', flags: ['h2', 'v2', 'logo', 'diag', 'name', 'stripes', 'name2'] },
};

export const TEAM_IDS = Object.keys(TEAMS);
export const LOGO_DIR = 'assets/teams/'; // relativo alla pagina (index.html)
