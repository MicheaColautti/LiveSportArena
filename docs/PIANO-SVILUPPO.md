# Piano di sviluppo di LiveSportArena

Stato al 9 novembre 2026. Il lavoro non è ancora iniziato: questo documento descrive dove arrivare e in che ordine.

**Obiettivo:** passare da un sito cresciuto a pezzi a una struttura ordinata con modelli e viste separati, un backend a strati e, quando servirà, database e API.

## Punto di partenza

| Area | Situazione attuale |
|---|---|
| **Frontend** | `site/assets/app.js` pesa 124 KB, con circa 75 funzioni e 64 costanti e variabili globali che mescolano dati, pagine ed eventi. `style.css` pesa 81 KB, ha una riga da oltre 21'000 caratteri e regole ripetute |
| **Moduli già separati** | `game-timeline.js`, `race-preview.js`, `fis-live.js`, `hockey-columns.js`, `alpine-insights.js`, `maps-3d.js` |
| **Backend** | 15 file Python nella stessa cartella, dove scaricare, elaborare e salvare i dati sono spesso mescolati |
| **Dati** | JSON senza schema dichiarato. `hockey-statistics.json` arriva a 2,2 MB e il browser lo ricontrolla ogni minuto |
| **Test** | Coprono worker, classifiche, timing e moduli nuovi, ma non le pagine |
| **Deploy** | Lo script è in `Personal/`, fuori da git. `deploy/` contiene solo il servizio del worker |
| **Documenti** | `docs/ARCHITETTURA.md` descrive ancora GitHub Pages e GitHub Actions |

Valutazione: l'architettura generale (sito statico, JSON e worker) è adatta al progetto. Il problema è l'organizzazione del codice, non la scelta tecnica.

## Struttura finale

```text
frontend/
  index.html
  src/
    main.js            avvio
    router.js          indirizzo → pagina
    state.js           stato dell'app e preferenze
    models/            hockey, ski, tracks, predictions, live
    views/             pagine: home, calendar, hockey, ski, live, settings
    components/        tabelle, card, dialog, filtri
    controllers/       collegano dati, viste ed eventi
  styles/              base, layout, componenti, hockey, sci
  maps-3d/
backend/
  providers/           SIHF, FIS: solo scaricare e leggere
  services/            calcoli, classifiche, previsioni
  repositories/        salvare e leggere: prima JSON, poi database
  api/                 FastAPI
  workers/             aggiornamenti programmati e live
  schemas/             forma ufficiale dei dati
deploy/
tests/
docs/
```

### Come si applica il modello MVC

| Ruolo | Cosa fa | Dove |
|---|---|---|
| **Model** | Recupera i dati e li espone | `models/` |
| **View** | Trasforma i dati in HTML, senza logica di caricamento | `views/`, `components/` |
| **Controller** | Gestisce indirizzi e clic | `router.js`, `controllers/` |

Niente MVC lato server: il sito resta un frontend che chiede dati. **Le pagine non devono sapere da dove arrivano i dati.** Così, quando arriverà il database, cambieranno solo i Model:

```js
// models/tracks.js
export async function getCourse(id) {
  // oggi
  const { courses } = await fetchJson('data/tracks.json');
  return courses.find(course => course.id === id);
  // domani: return fetchJson(`/api/courses/${id}`);
}
```

## Fasi

Dimensioni indicative: piccola, media, grande. Sono relative tra loro e non stime di tempo.

### Fase 0: rete di sicurezza · piccola

- Creare il branch di lavoro.
- Aggiornare `docs/ARCHITETTURA.md` allo stato reale del VPS.
- Aggiungere test automatici nel browser sulle pagine principali: home, calendario, partita, gara, classifiche, impostazioni.
- Congelare un campione di dati, così i test non dipendono dai dati del giorno.
- Portare in `deploy/` lo script di deploy, senza segreti. Deve escludere `data/` tranne `tracks.json` e `calendars/`, e riavviare il worker.

**Fatta quando:** i test passano sul sito attuale e il deploy si lancia con un solo comando.

### Fase 1: Model del frontend · media

- Spostare `loadData`, gli aggiornamenti hockey e il timing in `models/`.
- Le pagine chiedono i dati ai Model, ad esempio `getRace(id)`, e non leggono più la variabile `data`.
- Il sito continua a leggere gli stessi JSON.

**Fatta quando:** nessuna pagina fa `fetch` né conosce il percorso di un file.

### Fase 2: stato e navigazione · media

- Portare `state` e preferenze in `state.js`, e `readRoute` e `render` in `router.js`.
- Spezzare il grande gestore dei clic: ogni pagina gestisce i propri eventi.
- Ridurre le costanti e variabili globali di `app.js`.

**Fatta quando:** aggiungere una pagina richiede un file nuovo e una riga nel router.

### Fase 3: View · grande

- Spostare una pagina alla volta, dalla più semplice: impostazioni, previsioni, classifiche, calendario, hockey, sci, live, e per ultimi i dettagli di partita e gara.
- Spezzare le righe lunghissime e creare componenti comuni per tabelle, card e dialog.

**Fatta quando:** `app.js` non esiste più o è solo l'avvio, e ogni pagina è testata.

### Fase 4: CSS · media, delicata

- Separare le regole per area, sciogliendo la riga da 21'000 caratteri.
- Eliminare i doppioni, come `.chip` e `.team-mark`, e centralizzare colori e misure.
- Confrontare ogni pagina con screenshot prima e dopo.

**Fatta quando:** ogni regola ha un posto chiaro e il sito è identico a prima.

### Fase 5: backend a strati · media

- Dividere i file nelle cartelle `providers`, `services`, `repositories`, `workers`.
- I `providers` non scrivono file e i `services` non scaricano nulla.
- Tutti i salvataggi passano da un solo `repository`, che per ora scrive gli stessi JSON.
- Aggiornare il servizio `livesportarena-worker`, facendo il passaggio sul server fuori dagli orari di gara.

**Fatta quando:** i JSON prodotti sono identici a prima e il worker gira sul server senza errori.

### Fase 6: contratti dei dati · piccola

- Definire in `schemas/` la forma ufficiale di gara, partita, atleta, pista ed evento, distinguendo i dati comuni da quelli specifici di ogni sport.
- Validare i dati prima di salvarli, così un errore della fonte non arriva sul sito.
- Ripulire i problemi noti: testi tedeschi, sigle, `period_number` inaffidabile, PIM per periodo sempre a zero, formati dei numeri.
- Valutare come alleggerire `hockey-statistics.json`.

**Fatta quando:** ogni file pubblicato rispetta uno schema controllato dai test.

### Fase 7: database · grande

- Aggiungere uno swap da 2 GB sul VPS, come assicurazione.
- Usare PostgreSQL sul VPS, con migrazioni versionate e backup inclusi nel sistema attuale.
- Creare le tabelle descritte più sotto e importare lo storico e `tracks.json`.
- Il worker scrive nel database, e i JSON vengono generati da lì come copia di sicurezza.

**Fatta quando:** database e JSON coincidono per almeno una settimana con gare reali.

### Fase 8: API · media

- FastAPI dietro Caddy, con endpoint come `/api/races`, `/api/games/{id}` e `/api/courses/{id}`.
- Passare i Model del frontend all'API uno alla volta, con ritorno automatico ai JSON se l'API non risponde.
- Valutare la diretta con aggiornamenti spinti dal server invece del polling.

**Fatta quando:** il sito usa l'API e, se questa cade, resta online.

### Fase 9: dopo l'API · facoltativa

- Account e preferenze sincronizzate tra dispositivi.
- Notifiche lato server.
- Statistiche storiche su più stagioni.
- 3DSkiTracks che legge i dati delle piste dal database.
- Nuovi sport.

## Regole per tutto il lavoro

- **Niente framework e niente build:** JavaScript nativo e moduli bastano. Si può rivalutare in futuro.
- **Nessun cambiamento visibile fino alla fase 4:** riordino e nuove funzioni restano separati.
- **Piccoli passi:** un commit per ogni pagina o modulo, così è facile tornare indietro.
- **Sul server solo a fasi concluse:** si carica fuori dagli orari di gara, e non prima del 14 novembre 2026, per non interferire con le prime prove reali del worker (hockey l'11, sci il 14).
- **Dati sul server:** il deploy non deve sovrascrivere i dati generati, e il backend gira come utente `webapps`.

## Dove ci si può fermare

**Dopo la fase 6** il sito è già ordinato e testato, e funziona ancora con i JSON. Database e API conviene farli quando servono davvero, ad esempio per account o storico. La fase 6 si può anticipare, ma non le fasi 1 e 5: sono quelle che rendono semplice il passaggio al database.

## Modello di Claude consigliato

| Fasi | Modello |
|---|---|
| 0, 1, 2, 5, 7 | Opus: struttura e scelte delicate |
| 3, 4, 6, 8 | Sonnet per le parti ripetitive, Opus per i dettagli di partita e gara e per il CSS più delicato |

Haiku va bene solo per compiti molto semplici. Fable non è necessario per questo lavoro.

## Note sul database

**Un solo database per tutti gli sport**, con una parte comune e una specifica per ogni sport, separate in schemi PostgreSQL distinti (`core`, `hockey`, `ski`).

```text
core                 hockey                    ski
  sports               hockey_games              ski_races
  competitions         hockey_game_events        ski_runs
  seasons              hockey_lineups            ski_results
  events               hockey_player_stats       ski_standings
  participants         hockey_standings          ski_courses
  sources
```

- **Parte comune:** rende semplici calendario unico, home, notifiche e preferiti.
- **Parte specifica:** rispetta le differenze. Una partita ha due squadre, un punteggio e dei periodi, una gara ha decine di atleti, manche e tempi.
- **Fonti:** ogni dato delle piste conserva la fonte e la data di verifica, come già in `tracks.json`.
- **Mappe 3D:** i diorami restano file generati da 3DSkiTracks. Nel database vanno i loro dati, non la grafica.
- **Copia statica:** i JSON generati dal database restano come cache, così se l'API cade il sito continua a funzionare.

### Aggiungere uno sport

1. Una riga in `sports` e una in `competitions`.
2. Le tabelle dello sport, tramite una migrazione.
3. Un provider nel backend per la fonte dati.
4. Model e View nel frontend.

Gli sport esistenti non si toccano, e il calendario comune mostra subito i nuovi eventi. Si generalizza solo quando arriva davvero un secondo sport simile.

### Cosa evitare

- **Una tabella universale con colonne per tutti gli sport:** si riempie di campi vuoti e diventa difficile da capire.
- **Tutto come JSON generico nel database:** va usato solo per dettagli secondari o dati grezzi della fonte.
- **Un database per sport:** complica calendario, preferiti e backup senza vantaggi.

## Capacità del server

Misure del 9 novembre 2026 sul VPS MikCenter (Ubuntu 24.04), lette dal server.

| Risorsa | Totale | Situazione |
|---|---|---|
| **Disco** | 58 GB | 4,5 GB usati, 53 GB liberi. `/srv/livesportarena` occupa 1,4 GB, di cui 1,3 GB di ambiente Python |
| **RAM** | 3,8 GB | Circa 3 GB disponibili |
| **CPU** | 2 core virtuali | Carico a 0 al momento della misura |
| **Swap** | Nessuno | Da aggiungere prima della fase 7 |

| Servizio | Memoria | Picco dall'ultimo avvio |
|---|---|---|
| Worker | circa 255 MB | circa 256 MB |
| Caddy | circa 37 MB | circa 54 MB |
| PostgreSQL 16 | circa 21 MB | circa 29 MB |

- **RAM:** non è un limite. Le pagine si aggiornano nel browser dei visitatori, e il timing dello sci è letto dal browser direttamente dalla FIS.
- **Da verificare:** le misure non includono ancora una partita in diretta. La prima prova reale è l'11 novembre 2026.
- **Stima con il piano completo** (non misurata): 150-300 MB per l'API e 200-500 MB per PostgreSQL con dati reali, per un totale intorno a 1 GB.
- **PostgreSQL:** è già installato e attivo, con il solo database predefinito vuoto (circa 7,5 MB). Si può lasciare così fino alla fase 7.
- **Volume dei dati:** una stagione ha circa 400 partite di hockey e circa 80 gare di sci. Anche con più sport e stagioni si resta nell'ordine dei GB.

## Idee per nuovi sport

Valutazione basata su conoscenze generali, senza una ricerca aggiornata. Disponibilità, live e condizioni d'uso vanno verificati prima di costruire.

| Sport | Dati disponibili | Accesso |
|---|---|---|
| **Formula 1** | Telemetria di ogni auto, tempi, gomme, meteo | Ottimo: FastF1, gratuita ma ufficiosa |
| **Baseball (MLB)** | Ogni lancio e battuta | Ottimo: Statcast, gratuito |
| **NBA** | Ogni tiro con posizione, lineup, statistiche avanzate | Buono: API non ufficiale |
| **Hockey NHL** | Ogni evento con posizione, velocità | Buono: API pubblica, ufficiosa |
| **Biathlon** | Tempi per settore, ogni serie al poligono | Buono: dati IBU pubblici |
| **Calcio** | Enorme, ma il meglio è a pagamento | Medio: gratis solo in parte |
| **Ciclismo** | Profili, classifiche, spesso GPS | Medio: fonti sparse |
| **Tennis** | Storico partite, in parte punto per punto | Medio: spesso non commerciale |

**Ordine consigliato:**
1. **Formula 1:** riusa il motore dei percorsi 3D e i dati sono spettacolari.
2. **Hockey NHL:** riusa modello, Cronaca e previsioni, e aggiunge la mappa dei tiri.
3. **Biathlon o ciclismo:** adatti se si resta su sport invernali e percorsi, con meno concorrenza.

**Avvertenze:**
- Il dato gratuito spesso non è in diretta.
- Se il sito diventa commerciale, le licenze vanno ricontrollate. F1 e calcio sono le più protette, anche per nomi e immagini.
