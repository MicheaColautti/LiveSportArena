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
