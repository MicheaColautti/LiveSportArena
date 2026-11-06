# Live Sport Arena

Un sito modulare per seguire la **Coppa del Mondo di sci alpino** e la **National League svizzera**. Interfaccia in italiano, adattata a computer, iPad e telefono. Tutti gli orari sono visualizzati nel fuso **Europe/Zurich**.

Il progetto è pronto da caricare in un repository. La pubblicazione su GitHub Pages è a cura tua.

## Provalo subito

Non serve installare dipendenze per vedere il sito: i dati iniziali sono già inclusi.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

Apri **http://127.0.0.1:4173**. In alternativa, con Node installato, usa `npm run dev`. Non aprire `index.html` con doppio clic: i moduli e i file dati richiedono un server HTTP.

Per una prova da iPad o telefono sulla stessa rete Wi-Fi:

```sh
python3 -m http.server 4173 --bind 0.0.0.0 --directory site
```

Sul dispositivo apri `http://INDIRIZZO-LOCALE-DEL-COMPUTER:4173`. Il server espone soltanto `site/`. Alcune funzioni del browser, come notifiche e copia negli appunti, richiedono HTTPS: saranno disponibili sul dominio GitHub Pages, se supportate dal dispositivo.

## Cosa contiene

- **Panoramica:** prossime gare, prossime partite, classifica hockey e accesso ai moduli.
- **Calendario:** stagione corrente, filtri per sport, data, località, disciplina e genere.
- **Sci alpino:** discesa libera, Super-G, gigante e slalom; donne e uomini; dettagli di ogni gara e orari distinti delle manche.
- **Live center:** collegamento diretto al timing FIS, classifica della manche scelta, distacchi, lista di partenza, stato degli atleti e messaggi ufficiali.
- **Preferiti sci:** selezione degli atleti dalla lista di partenza e opzione per seguire tutti gli svizzeri.
- **Hockey:** calendario completo pubblicato da SIHF, selezione delle squadre, risultati, classifica, marcatori e statistiche; dettagli con cronologia, formazioni e giocatori quando disponibili.
- **Previsioni hockey:** pagina predisposta per modelli Python; il modello rimane disattivato finché non lo configuri.
- **Calendario ICS:** un evento per manche, link di abbonamento, identificativi stabili e gestione delle variazioni.
- **CSV hockey:** raccolta e feature derivate dal notebook fornito, disponibili anche come file esportati.

Sono inclusi dati ufficiali acquisiti il **5 novembre 2026**: 83 gare di sci, 128 eventi per le singole partenze e 364 partite di regular season della National League. I nuovi incontri, comprese eventuali fasi successive pubblicate da SIHF, entrano con la sincronizzazione. Nessun punteggio o pronostico dimostrativo è presentato come reale.

## Pubblicazione su GitHub Pages

1. Crea un repository, per esempio `LiveSportArena`, con branch principale `main`.
2. Carica **il contenuto di questa cartella** nella radice del repository, comprese `.github/` e `site/.nojekyll`. Escludi `.cache/`, `.venv/` e le cartelle indicate in `.gitignore`.
3. In **Settings → Pages → Build and deployment**, seleziona **GitHub Actions** come sorgente.
4. In **Actions**, abilita i workflow se richiesto. Apri **Aggiorna e pubblica Live Sport Arena** e premi **Run workflow**.
5. L’indirizzo del sito comparirà nella sezione Pages e nel risultato del workflow: normalmente `https://ACCOUNT.github.io/LiveSportArena/`.

Il sito usa percorsi relativi: funziona anche sotto il nome del repository, senza cambiare URL nel codice. Il link al calendario in abbonamento viene costruito automaticamente dal dominio del sito.

Il workflow `.github/workflows/pages.yml`:

1. controlla il codice e i casi di calendario/timing;
2. esegue Python per aggiornare i dati ufficiali;
3. genera JSON, CSV e ICS;
4. conserva una cache degli eventi e dei dettagli;
5. pubblica esclusivamente la cartella `site/`.

Non modifica continuamente i file del repository: pubblica il risultato come artefatto Pages.

## Frequenza degli aggiornamenti

| Dati | Come vengono aggiornati |
| --- | --- |
| Timing sci e lista di partenza | Direttamente dal browser verso FIS, normalmente ogni 6 secondi. L’intervallo rispetta quello indicato dal feed, con minimo 6 secondi. |
| Stato già partito / in pista / arrivato | Dallo stato ufficiale della **singola manche**, senza dedurlo dal solo pettorale. |
| Messaggi di gara | Dal timing FIS: ritardi, interruzioni, variazioni, risultati ufficiali. Testo nella lingua originale. |
| Orari nella scheda gara durante il live | Il programma del timing FIS integra gli orari del calendario, convertiti nel fuso svizzero. |
| Calendario sci, ICS, risultati e dati hockey | Workflow programmato ai minuti 7, 27 e 47 di ogni ora. Puoi anche avviarlo manualmente. |
| Sito già aperto | Rilegge i JSON ogni minuto quando la pagina è visibile e quando torni alla scheda. |
| Calendario Apple / Google / Outlook | La tua app rilegge l’URL secondo la propria politica di aggiornamento. Il sito non può forzare l’aggiornamento dell’app. |

**GitHub Actions non è un servizio di cronometraggio:** le esecuzioni pianificate possono partire in ritardo. Per questo il timing sci usa un canale diretto, indipendente dal workflow. La National League utilizza invece gli aggiornamenti periodici, con l’ora dell’ultima sincronizzazione sempre visibile.

I workflow programmati devono essere sul branch predefinito. GitHub può disattivarli nei repository pubblici senza attività per 60 giorni: riattivali dalla scheda Actions. Il caricamento del sito da parte dei visitatori non sostituisce l’attività del repository.

Riferimento: [esecuzioni programmate di GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Calendario sci e fusi orari

Fonte configurata per la stagione 2026/27:

[Feed ufficiale FIS: DH, SL, GS, SG](https://www.fis-ski.com/DB/services/public/icalendar-feed-fis-events.html?seasoncode=2027&sectorcode=AL&categorycode=WC&disciplinecode=DH%2CSL%2CGS%2CSG)

Il feed originale contiene gli orari locali di prima e seconda manche nel campo `DESCRIPTION`. Il backend:

1. usa `DTSTART` come riferimento UTC;
2. recupera il fuso IANA della località dalla scheda ufficiale FIS;
3. verifica la coerenza del primo orario e interpreta la seconda manche nel fuso della gara;
4. genera due eventi distinti per GS/SL e un evento per DH/SG;
5. esporta istanti UTC, visualizzati correttamente in Svizzera anche al cambio di ora solare/legale.

Esempi verificati: Levi del 14 novembre, **10:00 e 13:00 svizzeri**; Killington del 28 novembre, **15:30 e 18:30 svizzeri**.

Il file pubblico è `calendars/alpine-world-cup.ics`. Per ricevere le modifiche, aggiungi l’URL come **abbonamento**, non come importazione singola. Il pulsante “Scarica ICS” produce invece una copia del momento.

Gli eventi mantengono lo stesso `UID` quando cambia l’orario. Le revisioni usano `SEQUENCE` e `LAST-MODIFIED`. Gli eventi rimossi dal feed vengono conservati come cancellazioni per aggiornare i calendari già abbonati. Se una fonte risponde in modo incompleto o incoerente, il progetto conserva gli ultimi dati validi e indica che l’aggiornamento non è riuscito.

Gli orari sconosciuti non vengono inventati: compaiono come **“Da confermare”** e, nell’ICS, come eventi senza un orario fino alla pubblicazione. Non viene inventato un orario di fine gara.

## Avvisi sugli atleti

1. Apri una gara, poi **Lista di partenza**.
2. Seleziona gli atleti con la stella oppure attiva gli svizzeri.
3. Attiva gli avvisi. Dal pulsante a forma di campanella puoi scegliere l’anticipo desiderato e consentire le notifiche del browser.

Il tempo prima della partenza viene **stimato** sulla cadenza osservata delle partenze. Se mancano osservazioni sufficienti, l’avviso dice che l’atleta è tra i prossimi tre in lista, senza inventare un minuto preciso. I messaggi ufficiali di sospensione bloccano gli avvisi. Gli atleti già partiti hanno righe attenuate; chi è in pista è evidenziato.

Gli avvisi funzionano mentre il sito è aperto, per le gare di oggi con feed disponibile. I browser possono limitare audio, notifiche o aggiornamenti di una scheda in background, soprattutto su iPhone/iPad. Il messaggio dentro il sito rimane il meccanismo di base. **Email, notifiche a sito chiuso e relativo servizio sono lasciati in sospeso**, come richiesto.

## Backend Python e notebook hockey

Requisiti per aggiornare i dati: **Python 3.10 o successivo**. La libreria SIHF è fissata alla versione `sportsdataverse==0.2.0b1`, la stessa del notebook fornito.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m backend.refresh --season 2027
```

Per aggiornare un solo modulo:

```sh
python -m backend.refresh --only alpine --season 2027
python -m backend.refresh --only hockey --season 2027 --details 6
```

Senza `--season`, viene selezionata la stagione corrente in base alla data svizzera: luglio–giugno, con l’anno finale come codice FIS/SIHF. I dettagli di tutte le partite del giorno e della prossima data sono cercati; `--details` aggiunge le ultime partite concluse. La cache evita di scaricare di nuovo dettagli conclusi e invariati. Le statistiche dettagliate di partite più vecchie non ancora scaricate hanno un collegamento alla fonte ufficiale.

La conversione di `DownlaodAndUpdate.ipynb` è in **`backend/hockey_csv.py`**. Include gli import mancanti dal blocco originario, argomenti da riga di comando e recupero indipendente delle statistiche dei giocatori. Il notebook originale non è stato modificato.

Per generare anche lo storico utilizzabile dai modelli:

```sh
python -m backend.hockey_csv --start-season 2022 --end-season 2027 --max-details 100 --players --out national_league_data
```

Output: `matches.csv`, `game_stats.csv`, `player_stats.csv`, `team_features.csv` e `ml_dataset.csv`.

Il normale aggiornamento del sito esporta gli stessi cinque file per la **sola stagione corrente** in `site/data/csv/`. I dati mancanti restano mancanti. Le medie dei tiri delle ultime cinque gare richiedono cinque osservazioni valide. Le statistiche postpartita non vanno passate direttamente come predittori di quella stessa partita.

## Collegare i modelli di previsione

Il modello trovato nel notebook è conservato in `models/hockey/reference_model.py`, senza data fissa, percorsi personali o esecuzione automatica all’importazione. **È inattivo di default**. `reference_adapter.py` traduce le sue uscite nel formato del sito.

Il modello di riferimento richiede almeno cinque stagioni per la validazione temporale. Lo storico di training è distinto dalla stagione mostrata sul sito.

Per provarlo intenzionalmente:

```sh
python -m pip install -r requirements-models.txt
python -m backend.hockey_csv --start-season 2022 --end-season 2027 --max-details 0 --out national_league_data
```

Poi imposta `enabled: true` in `models/hockey/config.json` ed esegui `python -m backend.refresh`. Per automatizzarlo su GitHub dovrai aggiungere al workflow l’installazione delle dipendenze dei modelli e il caricamento/aggiornamento dello storico: il workflow base non addestra modelli costosi a ogni sincronizzazione.

Un modello alternativo espone questa interfaccia:

```python
def predict(context):
    # context: targetDate, fixtures, history (solo gare precedenti concluse),
    # dataDirectory. Ogni fixture ha un id stabile.
    return [
        {
            "gameId": "ID_DELLA_PARTITA",
            "homeProbability": 0.55,
            "awayProbability": 0.45,
            "score": "3-2",  # facoltativo, indicativo
        }
    ]
```

Questo è soltanto un esempio di formato, non una previsione reale. Le probabilità riguardano il **vincitore finale, compresi supplementari e rigori**, e devono sommare a uno. La probabilità di vittoria non è la probabilità dello score esatto.

Il modulo `backend/predictions.py`:

- considera come giornata le partite della stessa **data svizzera**, perché il calendario hockey distribuisce le gare su più giorni;
- attende che tutte le gare della precedente data siano terminate;
- non genera pronostici quando le gare da prevedere sono già iniziate o i dati sono segnalati come obsoleti;
- verifica identificativi, completezza e probabilità prima di pubblicare;
- riusa un’elaborazione già prodotta se gli input e la versione del modello non cambiano.

## Struttura del progetto

```text
.github/workflows/pages.yml    Aggiornamento e pubblicazione
backend/
  alpine.py                   Feed FIS, orari, revisioni e ICS
  hockey.py                   SIHF, dettagli e CSV della stagione
  hockey_csv.py               Collector e feature dal notebook
  predictions.py              Condizioni di esecuzione e validazione
  refresh.py                  Comando principale di aggiornamento
  common.py, htmltree.py       Cache, salvataggio e lettura pagine FIS
  fis_wire.py                 Lettura del formato dati FIS in Python
models/hockey/
  config.json                 Modello spento di default
  reference_model.py          Modello conservato dal notebook
  reference_adapter.py        Adattatore delle previsioni
site/
  index.html                  Applicazione statica
  assets/app.js               Navigazione, moduli, schede e preferenze
  assets/fis-live.js           Timing diretto FIS e aggiornamenti incrementali
  assets/modules.js           Registro dei moduli sportivi
  assets/style.css            Layout computer, tablet e telefono
  data/                       Snapshot JSON e CSV ufficiali
  calendars/                  Calendario ICS con manche separate
tests/                        Controlli su fusi orari, revisioni e timing
```

Per un nuovo sport aggiungi un provider nel backend, un modulo al registro `site/assets/modules.js` e la relativa vista. Mantieni gli identificativi della fonte stabili e usa ISO 8601 con fuso orario per le partenze.

## Costi e limiti concreti

Il progetto non richiede chiavi API a pagamento, database ospitati o servizi email. Per la configurazione gratuita prevista, usa **un repository pubblico e i runner standard Ubuntu**. GitHub indica che i runner standard dei repository pubblici sono gratuiti; repository privati e runner maggiorati seguono regole diverse. Non è configurato alcun servizio che addebiti in base al numero di visitatori.

- [GitHub Pages e workflow personalizzati](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Regole di fatturazione GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

Il feed live FIS è pubblico e al momento permette richieste dal browser. È un formato non contrattualizzato per questo progetto: se cambia, l’adattatore potrebbe dover essere aggiornato. Il sito mostra errori di collegamento e conserva i link ufficiali. La data, il genere e la disciplina del timing vengono verificati prima di mostrare gli atleti, perché i codici live possono essere riutilizzati.

Le prove automatiche usano una registrazione ufficiale della gara maschile di Sölden del 25 ottobre 2026. Sono verificati conversione oraria, ora legale, eventi separati, revisioni, classifica, stato di partenza, sospensione degli avvisi e rifiuto di feed riferiti a un’altra gara. La prova durante una gara effettivamente in corso e la verifica visiva sui tuoi dispositivi restano da fare.

```sh
npm run check
```

Fonti: [FIS](https://www.fis-ski.com/), [SIHF](https://www.sihf.ch/de/game-center/liga/1-1), [SportsDataverse Python](https://github.com/sportsdataverse/sportsdataverse-py). Il sito è indipendente, senza affiliazione alle federazioni.

## Revisione interfaccia del 6 novembre 2026

La Home ora collega i moduli; le impostazioni sono accessibili dall’icona utente. I preferiti sono distinti dai filtri. Previsioni è una sottosezione espandibile di Hockey. Loghi e banner sono caricati dalla cartella assets; i watermark dei banner forniti restano presenti.

La tabella hockey supporta una proiezione provvisoria dei punti basata sui risultati raccolti, con controllo di coerenza della base ufficiale; frequenza circa 20 minuti. Dettagli e limiti sono in [Flussi](docs/FLUSSI.md).

La descrizione dei controlli superati sopra riguarda la versione precedente. I test della revisione sono sospesi su richiesta dell’utente.

## Icone delle discipline

Gli asset RacesIcons sono tavole di quattro simboli. La UI seleziona la porzione corrispondente tramite CSS, senza modificare i PNG: DH prima, SL seconda, GS terza (file SG.png), Super-G quarta (file SP.png). I fondi sono azzurro, verde, lilla e pesca. Il nome pubblico è Live Sport Arena; gli UID del calendario rimangono stabili per preservare gli abbonamenti. Test ancora sospesi.

## Classifiche e statistiche sci

`backend/alpine_standings.py` legge le due tabelle ufficiali FIS WC della stagione, una per genere, includendo generale e specialità. Controlla i filtri ufficiali e mantiene l’ultimo snapshot per genere in caso di errore. `backend.refresh` lo esegue con il modulo sci; il browser carica `alpine-standings.json` ogni minuto insieme agli altri snapshot. Le specialità senza punti restano vuote.

`site/assets/alpine-insights.js` elabora solo risultati acquisiti e segnala la copertura. Le località sono raggruppate per nome e nazione, non identificate come piste. Distacchi calcolati dai tempi finali; vittorie, podi e top 10 da posizioni numeriche. Il widget Ultimo vincitore usa l’ultima gara con risultati disponibili, ordinata per data/partenza dell’ultima manche. Gli ex aequo vengono conservati.

Le sezioni sci e hockey hanno frecce e sottomenu animati, disattivati per chi richiede movimento ridotto. Nessun test eseguito per questa revisione, come richiesto.

## Revisione prossimi passi

Pagine evento: `#game/ID` e `#race/ID`, utilizzabili come link diretti su GitHub Pages. Le anteprime restano disponibili e rimandano ai dettagli. Le squadre preferite sono ora una selezione multipla. La pagina hockey presenta conteggio partite, prossima giornata e prossime partite per ciascuna preferita, oltre alla capolista. Risultati ordinati dal più recente e lista con scorrimento interno.

`backend/hockey_statistics.py` acquisisce 24 tabelle stagionali SIHF supportate dalla libreria; cache di un’ora per tabella e conservazione dei dati precedenti in caso di errore. `#hockey-stats` espone tutti i campi disponibili con legenda. I dati della partita includono statistiche squadre, giocatori e formazioni se pubblicate, grafici e ultime cinque partite precedenti. Nessuna posizione dei tiri sul ghiaccio viene simulata quando non disponibile.

`course-map.js` è il renderer geografico locale per geometrie e POI verificati. L’archivio iniziale comprende 23 schede ma nessuna geometria completa. [Copertura e manutenzione](docs/TRACCIATI.md).

Il timing FIS ora rispetta un minimo di 6 secondi; il feed può richiedere intervalli maggiori e gli errori attivano un rallentamento. Lo User-Agent Python è stato sostituito con una stringa browser standard su richiesta; questo non garantisce anonimato o invisibilità delle richieste.

Banner sci: è usato esclusivamente `Ski banner.jpg`, mantenendo la versione aggiornata dall’utente. I test restano sospesi.


## Punteggi hockey rapidi sul Mac

Con il server del sito già aperto, avviare in un secondo terminale, dalla cartella del progetto:

```sh
/opt/homebrew/anaconda3/envs/sports_analytics/bin/python -m backend.hockey_live
```

Su altri computer usare `python -m backend.hockey_live` nell’ambiente con le dipendenze di requirements.txt. Il comando non esegue test. Arresto con Ctrl+C; un blocco impedisce due processi live contemporanei nella stessa cartella.

Il processo legge la sola tabella dei risultati SIHF della stagione: punteggi, stato ufficiale, parziali dei periodi. Controlla ogni 20 secondi durante le partite e nei 15 minuti prima dell’inizio; fuori partita ogni 5 minuti (ogni minuto per incontri di oggi senza orario). Non inventa il cronometro di gioco. La cadenza è una scelta del progetto, non una garanzia di servizio SIHF; in caso di errori rallenta fino a 15 minuti. La latenza effettiva comprende quella della fonte.

Scrive atomicamente `site/data/hockey-live.json`, separato dai dati completi: non entra in conflitto con `backend.refresh`. Il browser rilegge questo piccolo file ogni 5 secondi durante le partite e ogni 15 secondi altrimenti; riprende quando la scheda torna visibile. Le statistiche dettagliate, i marcatori, i CSV e i calendari restano sul processo di aggiornamento completo. La schermata distingue le due date. Se il processo si ferma, il sito conserva i punteggi acquisiti ma segnala l’interruzione e disattiva la proiezione live della classifica.

Il processo deve restare attivo sul Mac, con rete e senza sospensione. GitHub Pages non esegue Python continuamente: senza un servizio esterno, l’online conserva la cadenza del workflow. Questo cambiamento non promette un live rapido su Pages da solo. Snapshot live escluso da Git. Test e verifica in gara reale non eseguiti.
