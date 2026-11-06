# Consegna delle modifiche richieste

## Completato

- Home più ampia e hover su tutta la riga del menu, freccia compresa.
- Timing FIS con intervallo minimo di 6 secondi; fonte e gestione errori conservate.
- Hockey: tre widget, più squadre preferite, risultati recenti e lista interna scorrevole su desktop.
- Pagine complete con link diretti per gare e partite, raggiungibili dalle anteprime.
- Partite: riepilogo, statistiche squadre e giocatori, formazioni se presenti, grafici e stato di forma con legende.
- Pagina National League con 24 categorie stagionali: 23 acquisite, una indisponibile per incongruenza della fonte.
- Layout delle previsioni più ampio e punteggio indicativo sotto ciascuna squadra.
- Banner sci aggiornato dall’utente conservato.
- Archivio locale con 23 schede di tracciati, fonti e misure di riferimento dichiarate.
- Renderer SVG predisposto per coordinate verificate: zoom, scorrimento, POI con fumetto.

## Rimasto incompleto

- Mappe geografiche complete: nessuna attivata, perché mancano geometrie e coordinate POI verificabili. La ricerca non ha individuato un archivio ufficiale unico e completo dei percorsi.
- Copertura dei tracciati: 23 profili, non tutti i tracciati della Coppa del Mondo; consultare docs/TRACCIATI.md. Alcune schede hanno solo identificazione e contesto verificato, senza dati tecnici o POI.
- La tabella SIHF goalie_shots è rifiutata dal provider per numero di righe incoerente; nessun dato parziale viene presentato come completo.
- Il dettaglio delle vecchie partite non ancora acquisito rimane vuoto con collegamento alla fonte; nessun grafico di posizione dei tiri viene inventato.
- Hockey resta legato al workflow periodico, non ha un nuovo canale a pochi secondi.
- Test e prove in browser non eseguiti, su richiesta dell’utente.

## Statistiche acquisite

| Categoria | Stato | Righe |
| --- | --- | --- |
| Squadre · Gol | ok | 14 |
| Squadre · Gol per ruolo | ok | 14 |
| Squadre · Tiri | ok | 14 |
| Squadre · Power play | ok | 14 |
| Squadre · Box play | ok | 14 |
| Squadre · Penalità | ok | 14 |
| Squadre · Rigori | ok | 14 |
| Squadre · Ingaggi | ok | 14 |
| Squadre · Ingaggi per zona | ok | 14 |
| Squadre · Ingaggi per zona e gara | ok | 14 |
| Squadre · Pubblico | ok | 14 |
| Giocatori · Punti | ok | 370 |
| Giocatori · Gol e assist | ok | 370 |
| Giocatori · Tiri | ok | 370 |
| Giocatori · Penalità | ok | 370 |
| Giocatori · Rigori | ok | 370 |
| Giocatori · Ingaggi | ok | 370 |
| Giocatori · Ingaggi per zona | ok | 372 |
| Giocatori · Ingaggi per zona e gara | ok | 372 |
| Giocatori · Tempo sul ghiaccio | ok | 370 |
| Portieri · Statistiche | ok | 30 |
| Portieri · Parate | stale | 0 |
| Portieri · Vittorie | ok | 30 |
| Portieri · Rigori | ok | 30 |


## Revisione interfaccia hockey e tabelle — 6 novembre 2026

- Banner National League ripristinato alle dimensioni del banner sci, sopra ai widget.
- Rimosso il layout desktop bloccato a un’altezza fissa che comprimeva la pagina; elenco partite con scorrimento proprio, date opache e non sovrapposte ai contenuti.
- Scheda unica “Risultati e stagione” al posto di Risultati e Tutta la stagione: gare concluse dalla più recente, poi incontri futuri in ordine cronologico. Resta il filtro Prossime.
- Ultime cinque partite ordinate esplicitamente dalla più recente e visualizzate con pallini V/P, date, punteggi e dettagli accessibili.
- Collegamento Dettagli sci allineato a Pagina ufficiale FIS.
- Tabelle dati e classifiche ordinabili cliccando le intestazioni, crescente/decrescente; valori mancanti in fondo. La scelta resta attiva durante gli aggiornamenti della pagina.
- Cronologia hockey ordinata per periodo e tempo; prossime partite ordinate per data; classifiche sci ordinate per posizione.
- Icona a barre per le voci Statistiche.

Modifiche nei file locali; nessun commit, push o pubblicazione. Test e verifiche nel browser ancora sospesi su richiesta. Lo ZIP precedente non include questa revisione.


## Filtri, Top Scorer e calendario hockey

Filtri calendario separati per sport: squadra disponibile anche in Tutti gli sport e ricerca località limitata allo sci. Selettore squadra condiviso con la lista PostFinance Top Scorer, icona fiamma e spazio dedicato al collegamento statistiche. Ricerca nelle tabelle e paginazione a 10/25/50 righe o tutte; ordinamento applicato all’intero insieme prima della paginazione. Stessi controlli nelle tabelle statistiche dettagliate.

Risultati e stagione: ordine cronologico, apertura sull’ultima giornata disputata e possibilità di scorrere verso l’alto per le precedenti. Rimossi i punti finali dai titoli delle pagine. Pulsante hockey Aggiungi al calendario: ICS di tutta la lega oppure della squadra filtrata, URL stabili, revisioni e cancellazioni; rigenerazione nel processo di aggiornamento hockey. Download statico distinto dall’abbonamento.

Test ancora sospesi. File modificati direttamente nel progetto locale; archivio ZIP precedente non aggiornato.


## Aggiornamento rapido hockey locale

Aggiunto `backend.hockey_live`: punteggi SIHF ogni 20 secondi durante gli incontri, 5 minuti fuori partita, rallentamento in caso di errori e conservazione dell’ultimo dato. Una sola tabella di risultati, senza richieste di statistiche dettagliate; un solo processo per cartella. Frontend collegato a snapshot separato, con controllo di stagione/squadre/date, riapplicazione dopo aggiornamenti completi e distinzione tra punteggi e statistiche. Nessun cronometro o evento di gioco inventato. Su GitHub Pages resta necessaria un’infrastruttura esterna per la stessa cadenza. Test sospesi; gara live reale ancora da osservare.


## Top Scorer da statistiche SIHF

Su richiesta, la sezione seleziona il primo giocatore per punti di ciascuna squadra dalle statistiche già raccolte. A parità mantiene l’ordine SIHF, e nella classifica fra squadre assegna lo stesso posto agli ex aequo. Importi calcolati con la regola fornita dall’utente: punti × CHF 300; chiaramente distinti da un conteggio PostFinance verificato. Totale relativo alle squadre mostrate, filtro squadra, loghi, ricerca, paginazione e ordinamento mantenuti. I dati si aggiornano insieme alle statistiche complete, non con il solo polling dei punteggi live. Nessun nome o risultato inserito manualmente; nessun nuovo endpoint necessario.


## Pianificazione GitHub automatica

Workflow ogni 5 minuti: risultati SIHF e classifica ufficiale/proiezione provvisoria. Statistiche complete ogni ora durante le partite e al primo controllo dopo nuove conclusioni; ferme senza incontri e senza nuove conclusioni. Primo avvio inizializza lo stato. Calendario sci ogni 20 minuti. Dati pubblicati e stato recuperati dalla cache tra esecuzioni; errori conservano l’ultima versione disponibile. Pianificazione non garantisce puntualità, ed esecuzione/pubblicazione aggiungono latenza. Test automatici rimossi dal workflow perché sospesi su richiesta. Modifiche locali, non ancora pubblicate su GitHub.
