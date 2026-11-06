// Progressive enhancement: keep the native select as the data/event source.
export function enhanceSelects(root, logo = () => '') {
 root.querySelectorAll('select:not([data-enhanced])').forEach((select,index) => {
  select.dataset.enhanced='true';
  const wrapper=document.createElement('span'); wrapper.className='custom-select';
  const button=document.createElement('button'); button.type='button'; button.className='input select-trigger';
  button.id=select.id || `select-${select.dataset.select || index}`; select.removeAttribute('id');
  const label=select.getAttribute('aria-label') || select.closest('label')?.firstChild?.textContent?.trim() || 'Seleziona';
  button.setAttribute('aria-label',label); button.setAttribute('aria-haspopup','listbox'); button.setAttribute('aria-expanded','false'); button.disabled=select.disabled;
  const list=document.createElement('span'); list.className='select-options'; list.role='listbox'; list.id=button.id+'-options'; list.hidden=true; list.setAttribute('aria-label',label); button.setAttribute('aria-controls',list.id);
  const team=select.dataset.select==='teamFilter';
  const paint=(el,option)=> { el.innerHTML=(team && option.value ? logo(option.value) : '')+'<span></span>'; el.lastChild.textContent=option.textContent; el.querySelectorAll('img').forEach(img=>{img.alt='';img.setAttribute('aria-hidden','true');}); };
  paint(button,select.selectedOptions[0] || {textContent:'Nessuna opzione',value:''});
  const close=()=>{list.hidden=true;button.setAttribute('aria-expanded','false');};
  [...select.options].forEach(option=> {
   const item=document.createElement('button');item.type='button';item.role='option';item.tabIndex=-1;item.disabled=option.disabled;item.setAttribute('aria-selected',String(option.selected));paint(item,option);
   item.onclick=()=>{select.value=option.value;close();select.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById(button.id)?.focus();};list.append(item);
  });
  const open=()=>{list.hidden=false;button.setAttribute('aria-expanded','true');(list.querySelector('[aria-selected="true"]')||list.firstChild)?.focus();};
  button.onclick=()=>list.hidden?open():close();
  let search='', timer;
  wrapper.onkeydown=event=>{
   const items=[...list.querySelectorAll('button:not(:disabled)')];if(!items.length)return;
   const i=items.indexOf(document.activeElement);
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();button.focus();}
   if(event.key==='Tab')close();
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    event.preventDefault(); if(list.hidden){open();return;}
    items[event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
   } else if(event.key.length===1 && event.key!==' ' && !event.ctrlKey && !event.metaKey){
    clearTimeout(timer);search+=event.key.toLocaleLowerCase();timer=setTimeout(()=>search='',600);if(list.hidden)open();items.find(el=>el.textContent.toLocaleLowerCase().startsWith(search))?.focus();
   }
  };
  wrapper.onfocusout=e=>{if(!wrapper.contains(e.relatedTarget))close();};
  select.before(wrapper);wrapper.append(button,list,select);select.hidden=true;
 });
}
