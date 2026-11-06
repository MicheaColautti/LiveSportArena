# Interfaccia e logging — 6 novembre 2026

Implementazione dei requisiti forniti in `Personal/LiveSportArena_Requisiti_UI_e_Logging.md` nella repo LiveSportArena. Questo documento descrive la versione corrente e supera le descrizioni delle card e dei Top Scorer nel precedente `UI-2026-11-06.md`.

## Implementato

- Hockey e Sci si aprono nella scheda **Stagione**, con **Risultati | Prossime** e Risultati preselezionato. Per Hockey l’elenco parte dall’ultima giornata disputata e permette di risalire alle precedenti.
- Breadcrumb cliccabili, titoli principali più grandi e maiuscoli, selettore data senza etichetta visiva e con nome accessibile.
- Home con un solo elenco cronologico dei prossimi 12 eventi; calendario completo raggiungibile dal collegamento. Rimossi classifiche, blocchi separati e widget aggiuntivi dalla Home.
- Calendario e Diretta con selezione multipla degli sport. L’opzione globale è alternativa alla scelta personalizzata. Tornando a “Tutti gli sport” i filtri specifici vengono nascosti e non restringono la lista. Con più sport scelti, i gruppi di filtri sono disposti verticalmente.
- Hockey: squadra insieme ai controlli superiori; card compatte con punteggio fra i loghi e conclusione RG/OT/SO quando presente nella fonte. Rimossa la notifica verde sulla frequenza dei controlli.
- Dettagli hockey: **Cronaca**, **Previsione** collegata alle previsioni esistenti, nessuna scheda Grafici; arbitri principali quando pubblicati; formazioni divise per squadra, portieri, linee e assenti. Le linee raggruppano lo stesso slot nelle liste dei ruoli SIHF: non rappresentano la posizione in tempo reale sul ghiaccio. Utilizzata la variante a elenco prevista nei requisiti.
- Top Scorer: un giocatore per squadra, nessun filtro squadra o ricerca nella scheda. Punti e CHF continuano a seguire la logica esistente; nessun modello o dato dimostrativo aggiunto. Se manca il giocatore di una squadra, la riga ne segnala l’indisponibilità.
- Sci: discipline multiselezione con colori coerenti con le icone; località a tendina; Statistiche con Uomini/Donne esclusivi.
- **Connesso** cliccabile: ultime acquisizioni per calendari, risultati, classifiche, statistiche e previsioni; dettaglio delle singole tabelle hockey.
- Log dei collettori e delle risposte FIS/SIHF, errori e operazioni saltate; estratti limitati, oscuramento dei dati sensibili e rotazione. Artefatto diagnostico conservato dal workflow per 7 giorni.
- Registro in memoria del browser per JSON e timing FIS; nessun invio esterno dei log.

## Stato della consegna

Modifiche nei file della repo locale. Nessuna pubblicazione o push eseguito in questa sessione. La nuova interfaccia richiede una ricarica della pagina; i collettori già aperti devono essere riavviati per caricare il logging.

Test e prove con eventi reali non eseguiti, secondo la richiesta dell’utente. Eseguita soltanto la verifica statica della sintassi e del diff. La revisione visiva su computer, iPad e telefono resta all’utente.

Consultare [Aggiornamenti e log](AGGIORNAMENTI-E-LOG.md) per i percorsi e i comandi.
