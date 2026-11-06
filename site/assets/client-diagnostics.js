// Session-only diagnostics: bounded, redacted, and never sent to a server.
const entries=[];
const secret=/token|secret|password|authorization|cookie|credential|api.?key|session.?id|email/i;
function redact(value) {
 if(Array.isArray(value)) return value.map(redact);
 if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,secret.test(k)?'[REDACTED]':redact(v)]));
 if(typeof value!=='string') return value;
 return value.replace(/\b(Bearer|Basic)\s+[\w.+/=~-]+/gi,'$1 [REDACTED]').replace(/((?:token|secret|password|authorization|cookie|api[_-]?key)[\w-]*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&<>]+)/gi,'$1[REDACTED]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[REDACTED]');
}
function endpoint(url) {
 const value=new URL(url,location.href);value.username='';value.password='';value.hash='';
 for(const key of [...value.searchParams.keys()]) if(secret.test(key)) value.searchParams.set(key,'[REDACTED]');
 return value.href;
}
export function recordClient(value) {
 const entry=redact({timestamp:new Date().toISOString(),...value});
 entries.push(entry);if(entries.length>150)entries.shift();
}
if(typeof window!=='undefined') Object.defineProperty(window,'liveSportArenaDiagnostics',{configurable:true,get:()=>entries.map(entry=>({...entry}))});
export async function readSource(url,options={},source='site',format='json') {
 const started=performance.now();let status=null,body='';
 try {
  const response=await fetch(url,options);status=response.status;
  body=await response.text();
  if(!response.ok)throw new Error(`HTTP ${status}`);
  const value=format==='json'?JSON.parse(body):body;
  const safe=format==='json'?JSON.stringify(redact(value)):redact(body);
  recordClient({source,endpoint:endpoint(url),outcome:'ok',httpStatus:status,durationMs:Math.round(performance.now()-started),body:safe.slice(0,2000),bodyTruncated:safe.length>2000});
  return value;
 } catch(error) {
  recordClient({source,endpoint:endpoint(url),outcome:error.name==='AbortError'?'cancelled':'error',httpStatus:status,durationMs:Math.round(performance.now()-started),error:error.message,body:redact(body).slice(0,2000),bodyTruncated:body.length>2000});
  throw error;
 }
}
