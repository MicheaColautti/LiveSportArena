# Flussi dei dati

## Calendario sci → evento → abbonamento

Il feed FIS passa a `alpine.update`. `run_times` interpreta gli orari nella località della gara usando il riferimento UTC; `reconcile` mantiene gli UID e aggiorna le revisioni. Il browser mostra gli istanti in ora svizzera. `calendar` crea un VEVENT per manche. L’app calendario rilegge l’abbonamento con una frequenza propria; un file importato una volta non è un abbonamento.

## Apertura gara → lista → timing → avviso

`openRace` apre i dettagli, `startTiming` collega il feed pubblicato da FIS. `normalise` controlla data, categoria, disciplina e genere. `applyUpdate` applica partenze, intermedi e arrivi; `rowsForRun` separa le manche. Il live center mostra i primi tre e gli atleti in pista. Gli avvisi usano nazioni e atleti preferiti, oltre all’opzione svizzeri. Le partenze individuali sono stimate sul ritmo osservato: non sono orari ufficiali garantiti. In caso di errore si espone il problema e si aumenta l’intervallo dei tentativi.

## Hockey → classifica provvisoria

Il collector legge risultati e classifica ufficiale. Prima di proiettare i punti delle partite in corso, `live_projection` ricostruisce punti e numero di gare concluse e controlla che coincidano con la base ufficiale. Se non coincidono, non pubblica una proiezione: evita doppi conteggi e tabelle riferite a fasi diverse.

La proiezione assegna temporaneamente 3/0 punti al risultato nei tempi regolamentari, 2/1 ai supplementari con una squadra avanti e 1/1 alla parità, lasciando il punto del vincitore ancora da assegnare. A pari punti conserva l’ordine ufficiale iniziale; non pretende di risolvere gli spareggi definitivi. PG, vittorie, sconfitte e gol restano quelli ufficiali delle gare concluse. Punti e posizioni sono quindi chiaramente provvisori.

La frequenza resta quella del collector, circa venti minuti su GitHub. Non è ancora un canale hockey diretto aggiornato ogni pochi secondi. La consultazione della fonte SIHF durante questa modifica ha restituito temporaneamente un errore 503; non è stata verificata una nuova API live browser.

## Impostazioni → evidenziazioni

`saveSettings` conserva squadra, federazioni, singoli atleti e opzione stella sul dispositivo. I loghi sono associati agli ID SIHF. La mappa colori delle nazioni è in `preferences.js`. I preferiti evidenziano senza filtrare: i filtri del calendario sono indipendenti. Non è richiesto un account né c’è sincronizzazione fra dispositivi.

## Modelli e quote

Le previsioni della giornata successiva restano disattivate finché non viene collegato il modello. Un modello live e il confronto con la previsione pregara richiedono un contratto dati aggiuntivo: non sono simulati dalla pagina. Le quote Sporttip sono state valutate, ma non è stata individuata e collegata un’API di consultazione utilizzabile. Nessuna quota viene inventata o presentata come aggiornata.

Fonti consultate: [classifica ufficiale SIHF](https://www.sihf.ch/de/game-center/liga/tabelle/1-1), [informazioni Sporttip sulle quote](https://www.sporttip.ch/en/sporttip/information/help/sporttip-faq-wettanleitung.html).

## Verifiche

I test sono sospesi su richiesta dell’utente. In questa sessione non sono stati eseguiti test automatici, controlli in browser o prove durante una gara. I risultati dei test riportati nella guida originale riguardano la versione precedente.

[Schema generale e tecnico](ARCHITETTURA.md)

## Classifiche della Coppa del Mondo

`backend.alpine_standings.update` acquisisce le tabelle ufficiali WC della stagione per donne e uomini. Controlla i filtri della fonte e conserva lo snapshot precedente del singolo genere se l’acquisizione fallisce. Le specialità senza punti assegnati restano vuote. `backend.refresh --only alpine` aggiorna anche queste classifiche; il normale workflow le include automaticamente. La UI rilegge `site/data/alpine-standings.json` ogni minuto, mantenendo visibili la data della fonte e l’eventuale errore.

## Ultimo vincitore e statistiche

`raceResults` ammette classificazioni numeriche con tempi finali; per GS/SL verifica che prima e seconda manche sommino al totale. Questo impedisce di trattare la classifica della prima manche come risultato finale. `raceTime` ordina le gare secondo il programma dell’ultima manche, perché non è disponibile un timestamp ufficiale di conclusione per tutti gli eventi. Il widget apre il dettaglio della gara e conserva eventuali vincitori ex aequo.

`seasonMetrics` filtra per genere e conta vittorie, podi, top 10, nazioni sul podio e gare con distacchi più piccoli. La copertura indica quante gare concluse dispongono di risultati acquisiti. Le distribuzioni delle discipline e le località con più appuntamenti usano invece tutto il calendario pubblicato. Non sono statistiche storiche degli atleti o caratteristiche fisiche delle piste.
