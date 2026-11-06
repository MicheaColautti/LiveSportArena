// Render only source-backed geographic coordinates. No illustrative routes.
const svgNS='http://www.w3.org/2000/svg';
const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<85;
export function mountCourseMaps(courses) {
 for(const host of document.querySelectorAll('[data-course-map]')) {
  const c=courses.find(c=>c.id===host.dataset.courseMap);
  const coords=c?.geometry?.coordinates;
  if(c?.geometry?.type!=='LineString'||!c.geometry.source||!Array.isArray(coords)||coords.length<2||!coords.every(valid)) continue;
  const xy=p=>[p[0]*Math.PI/180,Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))];
  const points=coords.map(xy),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxY=Math.max(...ys),rangeX=Math.max(...xs)-minX,rangeY=maxY-Math.min(...ys),ratio=720/Math.max(rangeX,rangeY,1e-9);
  const project=p=>{const v=xy(p);return [70+(v[0]-minX)*ratio,70+(maxY-v[1])*ratio];};
  const node=(tag,attrs)=>{const el=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs||{}))el.setAttribute(k,String(v));return el;};
  const view=document.createElement('div');view.className='course-map-viewport';
  const stage=document.createElement('div');stage.className='course-map-stage';
  const svg=node('svg',{viewBox:'0 0 860 860',role:'img','aria-label':'Mappa geografica di '+c.name});
  const path=node('polyline',{points:coords.map(p=>project(p).join(',')).join(' '),fill:'none',stroke:'#558974','stroke-width':5,'stroke-linecap':'round','stroke-linejoin':'round'});svg.append(path);
  for(const [p,label] of [[coords[0],'Partenza'],[coords.at(-1),'Arrivo']]){const [x,y]=project(p);svg.append(node('circle',{cx:x,cy:y,r:7,fill:'#243f37'}));const t=node('text',{x:x+12,y:y+4,'font-size':14});t.textContent=label;svg.append(t);}
  const pois=(c.pois||[]).filter(p=>valid(p.coordinates)&&p.source), markers=[];
  let scale=1,index=0;
  const bubble=document.createElement('div');bubble.className='course-map-bubble';bubble.hidden=true;
  const open=i=>{index=(i+pois.length)%pois.length;const p=pois[index];bubble.replaceChildren();const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label','Chiudi');close.onclick=()=>bubble.hidden=true;const name=document.createElement('strong');name.textContent=p.name;const text=document.createElement('p');text.textContent=p.category+' · '+p.description;const source=document.createElement('a');source.textContent='Fonte ↗';try{const u=new URL(p.source);if(u.protocol==='https:'){source.href=u.href;source.target='_blank';source.rel='noopener noreferrer';}}catch{}bubble.append(close,name,text,source);bubble.hidden=false;markers.forEach((m,j)=>m.setAttribute('fill',j===index?'#ba7852':'#355e50'));const [x,y]=project(p.coordinates);bubble.style.left=Math.min(x*scale,860*scale-260)+'px';bubble.style.top=Math.min(y*scale+15,860*scale-150)+'px';view.scrollTo({left:Math.max(0,x*scale-view.clientWidth/2),top:Math.max(0,y*scale-view.clientHeight/2),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});};
  pois.forEach((p,i)=>{const [x,y]=project(p.coordinates),g=node('g',{tabindex:0,role:'button','aria-label':p.name});const dot=node('circle',{cx:x,cy:y,r:9,fill:'#355e50',stroke:'white','stroke-width':3});g.append(dot);g.onclick=()=>open(i);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(i);}};svg.append(g);markers.push(dot);});
  const tools=document.createElement('div');tools.className='course-map-tools';
  const button=(label,action)=>{const b=document.createElement('button');b.className='button';b.textContent=label;b.onclick=action;tools.append(b);};
  const zoom=next=>{const old=scale;scale=Math.max(.5,Math.min(3,next));const cx=(view.scrollLeft+view.clientWidth/2)/old,cy=(view.scrollTop+view.clientHeight/2)/old;stage.style.width=stage.style.height=860*scale+'px';bubble.hidden=true;view.scrollLeft=cx*scale-view.clientWidth/2;view.scrollTop=cy*scale-view.clientHeight/2;};
  button('−',()=>zoom(scale-.25));button('+',()=>zoom(scale+.25));if(pois.length){button('Punto precedente',()=>open(index-1));button('Punto successivo',()=>open(index+1));}
  stage.append(svg,bubble);stage.style.width=stage.style.height='860px';view.append(stage);host.replaceChildren(tools,view);
  let drag;
  view.onpointerdown=e=>{if(e.target.closest('[role=button],button,a'))return;drag={x:e.clientX,y:e.clientY,left:view.scrollLeft,top:view.scrollTop};view.setPointerCapture(e.pointerId);};view.onpointermove=e=>{if(drag){view.scrollLeft=drag.left+drag.x-e.clientX;view.scrollTop=drag.top+drag.y-e.clientY;}};view.onpointerup=view.onpointercancel=()=>drag=null;
 }
}
