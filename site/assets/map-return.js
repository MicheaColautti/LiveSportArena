const back = document.querySelector('.back');
const race = new URLSearchParams(location.search).get('race');
if (race) {
  back.href = '../index.html#race/' + encodeURIComponent(race);
  back.title = 'Torna alla gara';
  back.setAttribute('aria-label', back.title);
}

const app = new URL('../', location.href);
const previous = document.referrer && new URL(document.referrer);
if (previous && previous.origin === app.origin &&
    [app.pathname, app.pathname + 'index.html'].includes(previous.pathname) && history.length > 1) {
  back.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    history.back();
  });
}

const note = document.createElement('p');
note.className = 'map-note';
note.setAttribute('role', 'note');
note.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9.2v4.3M10 6.4v.1"/></svg>Modello puramente rappresentativo, per vedere i punti cardine della pista';
document.querySelector('#app').append(note);
