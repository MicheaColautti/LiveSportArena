# Arena 3D: le 14 arene della National League

Demo: `site/arena-3d/index.html`. Con `npm run dev`: http://127.0.0.1:4173/arena-3d/
Link diretto: `?arena=HCAP&away=HCL&line=2&mode=tour` (`mode` = `intro`, `lineup`, `tour`, `explore`).

Serve un browser con WebGL attivo. Se non parte, la pagina lo dice al posto di "Costruisco l'arena…". Le mappe delle piste di sci usano invece un canvas 2D, quindi funzionano anche senza WebGL.

## Le quattro regie

| Regia | Cosa fa |
| --- | --- |
| Intro | Vista aerea dell'esterno e dei dintorni, scheda con arena e squadra di casa. Dopo 14 secondi, o con "Entra nell'arena", la telecamera entra dal tetto e parte il tour. |
| Formazioni | Telecamera fissa, niente cubo. Le due squadre sono separate (casa a sinistra, ospiti a destra) e guardano la telecamera. In basso la tabella della linea con il selettore 1ª–4ª. |
| Tour | La telecamera gira dentro l'arena e le linee cambiano da sole ogni 9 secondi. Ogni 7 secondi compare una tabella: arena, ultimi incontri, head to head, squadre a confronto, top scorer. |
| Esplora | Telecamera libera; dall'alto l'arena si vede in sezione. |

## File

| File | Ruolo |
| --- | --- |
| `arenas.js` | Le 14 arene: tribune lato per lato, angoli, curva di casa, settori in piedi, settore ospiti, LED, tetto, cubo, colori, esterno |
| `teams.js` | Colori, nome della curva, coro, anno di fondazione, stili delle bandiere |
| `lineups.js` | Formazioni segnaposto e forma dei dati |
| `stats.js` | Statistiche **finte** per il tour, nella stessa forma che avranno quelle vere |
| `layout.js` | Planimetria: profili delle tribune, sezioni, angoli che seguono la balaustra, zone del pubblico |
| `exterior.js` | Involucro, tetto, insegna e dintorni per l'intro |
| `engine.js` | La vista: costruzione della scena, regie, telecamere, giocatori |
| `common.js`, `textures.js`, `players.js` | Utilità, texture disegnate su canvas, giocatori |
| `index.html` | Pagina demo |

Three.js arriva da `cdn.jsdelivr.net`, versione fissata 0.160.0. Gli import tra i moduli portano `?v=N`: va aumentato a ogni modifica, così il browser non usa file vecchi.

## Come si descrive un'arena

Lati: `north` = lato lungo lontano, `south` = lato lungo delle panchine, `west`/`east` = lati corti. La squadra di casa difende la porta ovest. Lungo un lato `t` va da 0 a 1 (da ovest a est sui lati lunghi, da nord a sud sui lati corti).

- `stands.<lato>`: `base` (muretto davanti alla prima fila) e `tiers` (anelli): `rows`, `rise`, `depth`, `standing`, `gap` tra gli anelli, `fascia` (`led`, `suites`, `team`, `plain`).
- `corners`: `false` (aperti), `true`, oppure `{ west: 'end' }` se la curva avvolge gli angoli.
- `home`: dove sta la curva di casa (`side`, `from`, `to`, `tier`). Non è sempre dietro una porta: a Berna è un lato lungo.
- `standing`: altri settori in piedi di casa (es. Curva San Salvatore a Lugano).
- `guest`: settore ospiti. Può stare sulla stessa curva della squadra di casa (Kloten, Rapperswil).
- `exterior`: forma (`rect`, `octagon`, `rounded`), facciata, tetto (`flat`, `shed`, `barrel`, `pyramid`, `star`), dintorni (`rail`, `road`, `motorway`, `river`, `runway`, `parking`, `pitch`, `stadium`, `pool`, `hall`, `rink2`, `garage`, `city`, `gardens`), alberi e montagne.
- `verify`: cosa resta da verificare sul posto.

Il rilievo con le fonti è in [ARENE-RILIEVO.md](ARENE-RILIEVO.md). Settore ospiti ancora da verificare: Berna, Ginevra, Losanna, Zurigo, Zugo, Ajoie.

## Dati veri

- **Formazioni**: `arenaView.setLineups({ HCAP: { team, goalies: [{ number, name }], lines: [{ LW, C, RW, LD, RD }, …] } })`. Le linee SIHF già usate dal prototipo della pista 3D hanno questa informazione.
- **Statistiche del tour**: calcolare da `site/data/hockey.json` gli stessi campi prodotti da `makeStats()` e passarli alla pagina.
- **Anni di fondazione** in `teams.js`: confermati dai siti dei club solo Lugano, Ginevra e Kloten.
