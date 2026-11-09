// Sorting is presentational: never mutate source data or official positions.
export function enableTableSorting() {
  const choices = new Map();
  const views = new Map();
  const refreshViews = new WeakMap();
  const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });
  const missing = value => !value || /^(?:[–—-]|null|n\/a)$/i.test(value);
  function valueOf(cell) {
    const text = (cell?.dataset.sortValue ?? cell?.textContent ?? '').trim();
    if (missing(text)) return null;
    const number = text.replace(/[−–]/g, '-').replace(/[’']/g, '').replace(/\s/g, '').replace(/%$/, '').replace(',', '.');
    if (/^[+-]?\d+(?:\.\d+)?$/.test(number)) return Number(number);
    if (/^\d+:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(number)) return number.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
    return text;
  }
  function sort(table, index, direction) {
    const body = table.tBodies[0];
    if (!body) return;
    const rows = [...body.rows];
    rows.sort((a, b) => {
      const x = valueOf(a.cells[index]), y = valueOf(b.cells[index]);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      const comparison = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      return comparison * (direction === 'ascending' ? 1 : -1) || Number(a.dataset.originalOrder) - Number(b.dataset.originalOrder);
    });
    body.append(...rows);
    refreshViews.get(table)?.();
    [...table.tHead.rows[0].cells].forEach((th, i) => {
      th.setAttribute('aria-sort', i === index ? direction : 'none');
      const arrow = th.querySelector('.sort-indicator');
      if (arrow) arrow.textContent = i === index ? (direction === 'ascending' ? '↑' : '↓') : '↕';
    });
  }
  function prepare() {
    document.querySelectorAll('table.data-table:not([data-sort-ready]),table.mini-table:not([data-sort-ready])').forEach(table => {
      table.dataset.sortReady = 'true';
      const heads = [...(table.tHead?.rows[0]?.cells || [])];
      if (!heads.length || !table.tBodies[0]) return;
      const context = document.querySelector('#race-tabs .active,#game-tabs .active')?.textContent || '';
      const key = location.hash + '|' + context + '|' + heads.map(th => th.textContent.trim()).join('|');
      [...table.tBodies[0].rows].forEach((row, index) => {
        row.dataset.originalOrder = index;
        // Zone shading follows the official position even after sorting.
        if (table.closest('.standings-table')) {
          const rank = Number(row.cells[0]?.textContent);
          row.dataset.standingZone = rank <= 6 ? 'top' : rank >= 11 ? 'bottom' : 'middle';
        }
      });
      heads.forEach((th, index) => {
        const label = th.textContent.trim();
        if (!label || label === 'Segui' || th.hasAttribute('data-no-sort')) return;
        th.setAttribute('aria-sort', 'none');
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'table-sort';
        button.append(document.createTextNode(label));
        button.setAttribute('aria-label', 'Ordina per ' + (th.title || label));
        const arrow = document.createElement('span');
        arrow.className = 'sort-indicator'; arrow.textContent = '↕'; arrow.setAttribute('aria-hidden', 'true');
        button.append(arrow); th.replaceChildren(button);
        button.addEventListener('click', () => {
          const previous = choices.get(key);
          const direction = previous?.index === index && previous.direction === 'ascending' ? 'descending' : 'ascending';
          choices.set(key, { index, direction }); sort(table, index, direction);
        });
      });
      if (table.hasAttribute('data-table-tools')) {
        const view = views.get(key) || { query: '', size: table.dataset.defaultRows === 'all' ? 0 : 10, page: 0 };
        views.set(key, view);
        const toolbar = document.createElement('div'); toolbar.className = 'table-controls';
        const searchLabel = document.createElement('label'); searchLabel.className = 'field-label'; searchLabel.append('Ricerca');
        const input = document.createElement('input'); input.type = 'search'; input.className = 'input'; input.placeholder = table.dataset.tableTools; input.value = view.query;
        searchLabel.append(input);
        const sizeLabel = document.createElement('label'); sizeLabel.className = 'field-label'; sizeLabel.append('Righe');
        const select = document.createElement('select'); select.className = 'input';
        [10,25,50,0].forEach(size => { const option = new Option(size || 'Tutte',size); option.selected = size===view.size; select.add(option); }); sizeLabel.append(select);
        const previous = document.createElement('button'), next = document.createElement('button');
        previous.className = next.className = 'button'; previous.textContent = '←'; next.textContent = '→'; previous.setAttribute('aria-label','Pagina precedente'); next.setAttribute('aria-label','Pagina successiva');
        const count = document.createElement('span'); count.className = 'tiny'; count.setAttribute('aria-live','polite');
        toolbar.append(searchLabel,sizeLabel,previous,count,next);
        table.closest('.scroll-table').before(toolbar);
        const refresh = () => {
          const rows = [...table.tBodies[0].rows];
          const matching = rows.filter(row=>row.textContent.toLocaleLowerCase('it').includes(view.query.toLocaleLowerCase('it')));
          const size = view.size || Math.max(1,matching.length);
          view.page = Math.min(view.page,Math.max(0,Math.ceil(matching.length/size)-1));
          const start=view.page*size, visible=new Set(matching.slice(start,start+size));
          rows.forEach(row=>{row.hidden=!visible.has(row);});
          previous.disabled=view.page===0; next.disabled=start+size>=matching.length;
          count.textContent=matching.length ? `${start+1}–${Math.min(start+size,matching.length)} di ${matching.length}` : 'Nessun risultato';
        };
        refreshViews.set(table,refresh);
        input.addEventListener('input',()=>{view.query=input.value;view.page=0;refresh();});
        select.addEventListener('change',()=>{view.size=Number(select.value);view.page=0;refresh();});
        previous.addEventListener('click',()=>{view.page--;refresh();}); next.addEventListener('click',()=>{view.page++;refresh();});
        refresh();
      }
      const saved = choices.get(key);
      if (saved && saved.index < heads.length) sort(table, saved.index, saved.direction);
    });
  }
  prepare();
  new MutationObserver(prepare).observe(document.body, { childList: true, subtree: true });
}
