# Archivio tracciati

23 schede informative; **nessuna mappa geografica completa** nella raccolta iniziale. Non sono state trovate geometrie verificate sufficienti per ricostruire i percorsi e i POI. Le planimetrie PDF degli organizzatori non sono automaticamente coordinate geografiche.

## Copertura

| Tracciato | Località | Specialità | Genere | Geometria | Fonte |
| --- | --- | --- | --- | --- | --- |
| Streif | Kitzbühel, Kitzbuehel | DH | M | Mancante | [Fonte](https://hahnenkamm.com/rennstrecken/die-streif-abfahrt/) |
| Lauberhorn | Wengen | DH | M | Mancante | [Fonte](https://www.lauberhorn.ch/rennen/abfahrt/) |
| Stelvio | Bormio | DH | M | Mancante | [Fonte](https://www.bormioski.eu/pista-stelvio/) |
| Saslong | Val Gardena-Groeden Südtirol, Val Gardena | DH | M | Mancante | [Fonte](https://www.saslong.org/en/news/detail/saslong-course-and-key-sections/) |
| Gran Risa | Alta Badia | GS | M | Mancante | [Fonte](https://www.altabadia.org/en/poi/what-to-do-in-alta-badia/detail/poi/the-gran-risa-slope) |
| Erta | Kronplatz | GS | W | Mancante | [Fonte](https://alplanevents.it/en/piste) |
| Olympia delle Tofane | Cortina d'Ampezzo | DH, SG | W | Mancante | [Fonte](https://www.cortinaskiworldcup.com/la-pista/) |
| Rettenbach | Soelden, Sölden | GS | ALL | Mancante | [Fonte](https://www.soelden.com/de/veranstaltungen-freizeittipps/events/audi-fis-skiweltcup-opening/weltcup-piste) |
| Chuenisbärgli | Adelboden | GS | M | Mancante | [Fonte](https://medias4.fis-ski.com/pdf/2026/AL/0022/2026AL0022.pdf) |
| Levi Black | Levi | SL | ALL | Mancante | [Fonte](https://www.levi.fi/en/ski/slopes-and-lifts/west-slopes/) |
| Kirchenkar | Gurgl | SL | ALL | Mancante | [Fonte](https://www.gurgl.com/local/gurgl_skiweltcup_mediakit_24_EN.pdf) |
| Planai | Schladming | SL, GS | M | Mancante | [Fonte](https://www.schladming-dachstein.at/de/schladming-dachstein-entdecken/winterberge/planai) |
| Mont Lachaux | Crans-Montana | DH, SG | W | Mancante | [Fonte](https://www.cransmontana2027.ch/competition/pistes/piste-mont-lachaux/) |
| Birds of Prey | Beaver Creek | DH, SG, GS | ALL | Mancante | [Fonte](https://bcworldcup.com/fis-alpine-ski-racing-101/) |
| Kandahar | Garmisch-Partenkirchen | DH | M | Mancante | [Fonte](https://zugspitze.de/de/Unsere-Bergwelten/Highlights/Kandahar-Abfahrt) |
| Canalone Miramonti | Madonna di Campiglio | SL | M | Mancante | [Fonte](https://www.3trecampiglio.it/en/experience-3tre/buy-your-ticket) |
| Face de Bellevarde | Val d'Isere, Val d’Isère, Val d'Isère | GS, SL | M | Mancante | [Fonte](https://www.worldcup-valdisere.com/les-pistes/) |
| Luková – Koliesko | Jasna, Jasná | GS | W | Mancante | [Fonte](https://www.worldcupjasna.sk/) |
| Podkoren | Kranjska Gora | SL, GS | ALL | Mancante | [Fonte](https://kranjska-gora.si/en/activities/through-stan-to-podkoren) |
| Hermann Maier Weltcupstrecke | Flachau | SL | W | Mancante | [Fonte](https://www.flachau.com/de/anlagen.html) |
| La Verte des Houches | Chamonix, Les Houches | DH | M | Mancante | [Fonte](https://chamonixworldcup.com/en/the-course/the-piste) |
| Bald Mountain – Greyhawk | Sun Valley | DH, SG, GS, SL | ALL | Mancante | [Fonte](https://www.sunvalley.com/events/audi-fis-ski-world-cup/grandstand-seating/) |
| Superstar | Killington | GS, SL | W | Mancante | [Fonte](https://killington.com/the-killington-cup?category=Experiences) |

ALL indica entrambi i generi. Le misure riferite a una configurazione storica o a una pista di riferimento sono etichettate; non sostituiscono la scheda FIS della singola gara. L’associazione usa località, disciplina e genere per evitare di mostrare il profilo di una discesa su uno slalom diverso.

## Organizzazione e aggiornamento stagionale

`site/data/tracks.json` contiene ID stabile, località alternative, discipline, genere, data di verifica, caratteristiche con fonte, storia e punti d’interesse. `geometry: null` e `coordinates: null` indicano dati mancanti.

A inizio stagione: aprire ogni fonte ufficiale, confrontare le specifiche, aggiornare solo i campi modificati e la data di verifica; distinguere pista permanente e configurazione del giorno. L’attività avviene durante una sessione di sviluppo: nessuna API GPT viene chiamata dal sito.

Per attivare una mappa: aggiungere `geometry: {"type":"LineString","coordinates":[[longitudine,latitudine],...],"source":"https://..."}` con una fonte autorevole del percorso; aggiungere coordinate effettive e fonte ai POI. Il renderer locale `course-map.js` offre zoom, scorrimento, indicatori di partenza/arrivo e POI con fumetto e navigazione precedente/successivo. Nessuna vegetazione o rilievo sintetico viene presentato come dato geografico.

## Alternative valutate

| Approccio | Vantaggio | Limite |
| --- | --- | --- |
| Lettura esterna all’apertura | Dati potenzialmente recenti | Latenza, blocchi browser, formato variabile, assenza di un’unica fonte completa |
| JSON locale scelto | Nessun costo per visita, fonti controllabili, riuso fra stagioni | Manutenzione stagionale e raccolta manuale delle geometrie |
| Aggiornamento assistito durante lo sviluppo | Aiuta ricerca e confronto senza API a consumo nel sito | Ogni dato e coordinata va comunque verificato |

L’approccio locale segue il file dedicato **Implementazione tracciati.md**, che specifica questa soluzione dopo la richiesta generale di discussione.

## Limiti e verifiche

Le pagine National League indicate come riferimento non erano accessibili durante la consultazione; i dettagli sono costruiti dai dati SIHF effettivamente disponibili. Le statistiche di dettaglio esistono solo per le partite già acquisite. Le tabelle stagionali sono raccolte ogni ora; punteggi e dettagli seguono il workflow. Una tabella portieri è stata rifiutata perché la fonte annuncia 30 righe ma ne restituisce 31. Nessun test eseguito, come richiesto.
