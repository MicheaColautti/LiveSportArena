# Live Sport Arena

**I tuoi sport. Un’unica arena.**

Calendari, risultati e preferiti in uno spazio pensato per computer, tablet e telefono. Sci alpino di Coppa del Mondo e National League svizzera, con orari svizzeri e moduli pronti ad accogliere altri sport.

## Esplora

- **Home**: accesso agli sport, prossimi eventi e classifica.
- **Calendario**: tutti gli sport ordinati per giorno, con le manche dello sci separate nei dettagli e nell’abbonamento ICS.
- **In diretta**: timing FIS, podio provvisorio, atleta in pista e partite in corso.
- **Sci alpino**: programma, ultimo vincitore, classifiche ufficiali della generale e delle specialità per donne e uomini; statistiche su vittorie, podi, distacchi e località.
- **Hockey**: squadre, risultati, statistiche e previsioni quando sarà collegato un modello.
- **Impostazioni**: squadra, federazioni e atleti preferiti, evidenziati nelle viste.

## Usa il sito o scarica il progetto

Per usare la versione pubblicata, apri il collegamento **GitHub Pages** nella sezione **Deployments → github-pages** di questo repository. L’indirizzo sarà disponibile dopo la prima pubblicazione. Questa copia locale non contiene ancora un collegamento al repository: il link pubblico verrà aggiunto quando sarà noto.

Puoi anche scaricare il progetto con **Code → Download ZIP**, estrarlo e avviarlo dalla sua cartella:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

Apri [Live Sport Arena in locale](http://127.0.0.1:4173/).

## Come arrivano i dati

Lo sci legge il timing ufficiale FIS direttamente dal browser. Calendari, ICS e dati hockey vengono aggiornati dal workflow GitHub. L’ora dell’ultima sincronizzazione rimane visibile: il segnale LIVE identifica un evento in corso, non garantisce una trasmissione istantanea. Gli avvisi richiedono il sito aperto.

I modelli previsionali sono predisposti ma disattivati. Non sono pubblicate quote Sporttip o previsioni live inventate: servono una fonte quote collegata e un modello appropriato.

[Installazione, pubblicazione e dettagli tecnici](GUIDA-TECNICA.md) · [Architettura e flussi](docs/ARCHITETTURA.md)

Progetto indipendente, non affiliato a FIS, SIHF o National League. Loghi e immagini forniti dall’utente; i banner originali includono watermark, conservati senza modifiche.

## Pagine evento e tracciati

Le anteprime di gare e partite includono il collegamento **Dettagli** a una pagina completa con URL condivisibile. La National League dispone di una pagina statistica dedicata, con tabelle di squadre, giocatori e portieri.

L’archivio locale contiene 23 schede di tracciati con fonti e dati mancanti dichiarati. Le mappe interattive richiedono geometrie georeferenziate verificate: nessun tracciato viene disegnato da coordinate inventate. Consulta [copertura e aggiornamento dei tracciati](docs/TRACCIATI.md).
