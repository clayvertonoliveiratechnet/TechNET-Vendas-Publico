const VERSION='46';
const seen=new Map();
function scrub(v){return String(v??'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted-email]').replace(/\b\d{8,}\b/g,'[redacted-number]').replace(/eyJ[A-Za-z0-9._-]{20,}/g,'[redacted-token]').slice(0,1200)}
function cleanContext(ctx={}){const out={};for(const [k,v] of Object.entries(ctx||{})){if(['customer','cpf','document','phone','email','password','token','payload','form'].some(x=>k.toLowerCase().includes(x)))continue;if(v==null||['string','number','boolean'].includes(typeof v))out[k]=typeof v==='string'?scrub(v):v}return out}
export function setupObservability({sb,sessionProvider,profileProvider,pageProvider}){
 const report=async(eventType,error={},severity='error',context={})=>{try{const session=sessionProvider?.(),userId=session?.user?.id;if(!userId)return;const message=scrub(error?.message||error||eventType),page=scrub(context?.page||pageProvider?.()||location.pathname),sig=`${eventType}|${page}|${message}`;const now=Date.now();if(now-(seen.get(sig)||0)<60000)return;seen.set(sig,now);await sb.from('tv_client_events').insert({user_id:userId,event_type:eventType,severity,page,message,stack:scrub(error?.stack||''),context:{...cleanContext(context),role:profileProvider?.()?.role||null},app_version:VERSION,user_agent:navigator.userAgent.slice(0,500)})}catch(e){console.warn('observability',e)}};
 const onError=e=>report('window_error',e.error||new Error(e.message||'Erro de interface'),'error',{source:e.filename?String(e.filename).split('/').pop():'',line:e.lineno||0,column:e.colno||0});
 const onReject=e=>report('unhandled_rejection',e.reason instanceof Error?e.reason:new Error(String(e.reason||'Promise rejeitada')),'error');
 const onResource=e=>{const t=e.target;if(t&&t!==window&&['SCRIPT','LINK','IMG'].includes(t.tagName))report('resource_error',new Error(`Falha ao carregar ${t.tagName}`),'warning',{resource:String(t.src||t.href||'').split('?')[0].split('/').pop()})};
 window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onReject);window.addEventListener('error',onResource,true);
 window.addEventListener('load',()=>{setTimeout(()=>{const nav=performance.getEntriesByType?.('navigation')?.[0];if(nav)report('navigation_timing',`Página carregada em ${Math.round(nav.duration)}ms`,'info',{duration_ms:Math.round(nav.duration),dom_ms:Math.round(nav.domContentLoadedEventEnd),transfer_kb:Math.round((nav.transferSize||0)/1024)})},1200)},{once:true});
 return {report};
}
