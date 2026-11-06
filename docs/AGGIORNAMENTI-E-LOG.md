# Aggiornamenti e log

## In locale

Eseguire i comandi dalla radice di LiveSportArena. Il server web mostra i file già presenti: da solo non esegue i collettori Python.

Per preparare le dipendenze, se non sono già installate:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Per aggiornare una volta calendario, risultati e statistiche:

```sh
.venv/bin/python -m backend.refresh --season 2027
```

Per aggiornare soltanto lo sci o l’hockey, aggiungere rispettivamente `--only alpine` o `--only hockey`. La stagione 2027 identifica il 2026/27.

Per lasciare attivo il controllo locale dei punteggi hockey:

```sh
.venv/bin/python -m backend.hockey_live --season 2027
```

Interrompere con Ctrl+C. Questo processo aggiorna punteggi e classifica provvisoria; calendario e statistiche complete richiedono la sincronizzazione separata. Dopo modifiche al codice Python occorre riavviare un processo già aperto.

Per la stessa singola iterazione utilizzata dal workflow, con calendario sci ogni 20 minuti e statistiche hockey condizionate agli eventi:

```sh
.venv/bin/python -m backend.scheduled
```

Questo comando termina dopo un giro: non è un servizio continuo. Riutilizza lo stato conservato in `.cache/` e determina automaticamente la stagione.

Il sito si apre in un altro terminale con:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

## Log Python

Il file principale è `.cache/logs/updates.jsonl`. Ogni riga è un oggetto JSON. Sono conservati fino a quattro file precedenti (`.1` … `.4`), ciascuno da circa 2 MiB. Il limite complessivo è circa 10 MiB; le risposte sono limitate a 16.000 caratteri per registrazione.

```sh
tail -n 30 .cache/logs/updates.jsonl
tail -f .cache/logs/updates.jsonl
```

Campi principali:

- `timestamp`, `operation`, `operationId`, `parentOperationId`: orario e collegamento tra operazione e richieste.
- `kind`: inizio/fine aggiornamento, richiesta, risposta HTTP, risposta interpretata, errore di validazione o recupero degli ultimi dati.
- `source`, `endpoint`, `httpStatus`, `durationMs`: fonte, URL, codice restituito e durata.
- `outcome`: `started`, `ok`, `partial`, `error`, `cache` oppure `skipped`.
- `body`, `bodyTruncated`: estratto della risposta, ripulito e limitato. Le risposte HTML sono conservate come testo, senza script e moduli.
- `errorType`, `error`, `traceback`: dettagli dell’errore, quando presenti.

Le risposte SIHF vengono osservate nella sessione HTTP già utilizzata da sportsdataverse 0.2.0b1. Non vengono aggiunte richieste, modificati gli intervalli o disabilitati i tentativi della libreria. Le righe `parsed-response` contengono fino a 30 righe interpretate, soggette allo stesso limite di lunghezza. Un HTTP 200 può essere seguito da un errore di validazione: significa che il server ha risposto, ma i dati non sono utilizzabili.

Non vengono registrati gli header di autenticazione. Chiavi sensibili, credenziali negli URL ed email vengono oscurate. I log sono esclusi da Git tramite `.cache/` e non fanno parte della cartella pubblicata da Pages.

## GitHub Actions

Aprire **Actions → esecuzione del workflow → Artifacts → update-logs-…**. L’artefatto contiene i log disponibili anche quando un passaggio successivo fallisce. È conservato per 7 giorni. Se il workflow si ferma prima dell’avvio dei collettori, potrebbero non esserci nuovi log.

La coda o il fallimento di `deploy-pages` si consulta nel job **deploy**, separatamente dai log delle fonti. Un aggiornamento Python riuscito non implica che Pages abbia pubblicato i nuovi file.

Il workflow prevede punteggi e classifica hockey ogni 5 minuti, calendario sci ogni 20 minuti, statistiche complete ogni ora durante gli incontri e dopo nuove partite concluse. Gli avvii pianificati possono ritardare. I log indicano anche gli aggiornamenti saltati perché non ancora necessari.

## Diagnostica del browser

Il timing FIS è letto dal browser e quindi non compare nei log del collettore Python. Aprire gli strumenti sviluppatore:

- **Network / Rete**: richieste JSON del sito e XML FIS, codici HTTP e risposte.
- **Console**: digitare `window.liveSportArenaDiagnostics` per gli ultimi 150 eventi della sessione, con URL, fonte, stato HTTP, durata, errore ed estratto della risposta fino a 2.000 caratteri.

Il registro rimane soltanto in memoria sul dispositivo e si svuota ricaricando la pagina. Non viene inviato a un servizio esterno. Un errore di rete/CORS può non avere un codice HTTP leggibile dal browser. Le cancellazioni intenzionali del timing sono distinte dagli errori.

Il pulsante **Connesso** apre il riepilogo delle date di acquisizione. L’orario delle statistiche hockey riepilogativo è quello più vecchio fra le tabelle disponibili; il dettaglio espandibile riporta ciascuna tabella. Le date non vengono sostituite con l’ora di apertura della pagina.
