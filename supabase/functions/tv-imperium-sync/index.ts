import { createClient } from 'npm:@supabase/supabase-js@2';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function sha256Hex(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
const clip=(v:unknown,n=1000)=>String(v??'').slice(0,n);
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
 const token=req.headers.get('x-technet-sync-token')||'',agentName=req.headers.get('x-technet-agent')||'CLAYVERTON-MDU';if(!token)return json(401,{ok:false,error:'missing_sync_token'});
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!service)return json(500,{ok:false,error:'server_not_configured'});
 const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),tokenHash=await sha256Hex(token);
 const {data:agent,error:agentErr}=await sb.from('tv_sync_agents').select('id,name,active,token_hash').eq('name',agentName).maybeSingle();if(agentErr||!agent||!agent.active)return json(401,{ok:false,error:'invalid_sync_agent'});
 if(!agent.token_hash){const {error}=await sb.from('tv_sync_agents').update({token_hash:tokenHash,last_seen_at:new Date().toISOString()}).eq('id',agent.id);if(error)return json(500,{ok:false,error:error.message});}else if(agent.token_hash!==tokenHash)return json(401,{ok:false,error:'invalid_sync_token'});else await sb.from('tv_sync_agents').update({last_seen_at:new Date().toISOString()}).eq('id',agent.id);
 let body:any;try{body=await req.json()}catch{return json(400,{ok:false,error:'invalid_json'})}
 if(body?.action==='ping')return json(200,{ok:true,agent:agent.name,submit_protocol:2});
 if(body?.action==='pending_auth'){
  const now=new Date().toISOString();await sb.from('tv_auth_requests').update({status:'expired'}).lt('expires_at',now).in('status',['pending','processing']);
  const {data,error}=await sb.from('tv_auth_requests').select('id,base_key,username,ciphertext,created_at').in('status',['pending','processing']).gt('expires_at',now).order('created_at',{ascending:true}).limit(20);if(error)return json(500,{ok:false,error:error.message});
  const rows=data||[];if(rows.length)await sb.from('tv_auth_requests').update({status:'processing'}).in('id',rows.map((r:any)=>r.id));return json(200,{ok:true,rows});
 }
 if(body?.action==='auth_result'){
  const id=String(body.id||''),ok=body.ok===true,result=body.result&&typeof body.result==='object'?body.result:{},message=String(body.error||'');if(!id)return json(400,{ok:false,error:'missing_id'});
  const patch:any={status:ok?'approved':'rejected',result:ok?result:{error:message||'Credencial Imperium inválida'},processed_at:new Date().toISOString()};const {error}=await sb.from('tv_auth_requests').update(patch).eq('id',id).in('status',['pending','processing']);if(error)return json(500,{ok:false,error:error.message});return json(200,{ok:true});
 }
 if(body?.action==='pending_geo'){
  const days=Math.max(1,Math.min(Number(body.days||90),3650)),limit=Math.max(1,Math.min(Number(body.limit||100),300)),since=new Date(Date.now()-days*86400000).toISOString();const {data,error}=await sb.from('tv_sales').select('source_key,imperium_base_key,imperium_sale_id,imperium_status,sold_at').eq('source','imperium').eq('geocode_status','pending').is('latitude',null).gte('sold_at',since).order('sold_at',{ascending:false}).limit(limit);if(error)return json(500,{ok:false,error:error.message});return json(200,{ok:true,rows:data||[]});
 }
 if(body?.action==='update_geo'){
  const rows=Array.isArray(body.rows)?body.rows:[];if(!rows.length||rows.length>100)return json(400,{ok:false,error:'invalid_geo_rows'});let updated=0;for(const r of rows){if(!r?.source_key)continue;const patch:any={};for(const k of ['street','street_number','complement','postal_code','neighborhood','city_name','state','latitude','longitude','geocode_status'])if(k in r)patch[k]=r[k];const {error}=await sb.from('tv_sales').update(patch).eq('source','imperium').eq('source_key',r.source_key);if(error)return json(500,{ok:false,error:error.message});updated++}return json(200,{ok:true,updated});
 }
 if(body?.action==='pending_push'){
  const limit=Math.max(1,Math.min(Number(body.limit||40),100));const {data:notifs,error}=await sb.from('tv_notifications').select('id,user_id,sale_id,title,body,kind,created_at').is('push_sent_at',null).order('created_at',{ascending:true}).limit(limit);if(error)return json(500,{ok:false,error:error.message});
  const ids=[...new Set((notifs||[]).map((n:any)=>n.user_id).filter(Boolean))];let subs:any[]=[];if(ids.length){const q=await sb.from('tv_push_subscriptions').select('id,user_id,endpoint,p256dh,auth').eq('active',true).in('user_id',ids);if(q.error)return json(500,{ok:false,error:q.error.message});subs=q.data||[]}
  const by:any={};for(const s of subs){(by[s.user_id]??=[]).push(s)}return json(200,{ok:true,rows:(notifs||[]).map((n:any)=>({...n,subscriptions:by[n.user_id]||[]}))});
 }
 if(body?.action==='push_result'){
  const id=Number(body.id||0);if(!id)return json(400,{ok:false,error:'missing_id'});const ok=body.ok===true;const patch:any=ok?{push_sent_at:new Date().toISOString(),push_error:null}:{push_error:clip(body.error||'push_failed',500)};const {error}=await sb.from('tv_notifications').update(patch).eq('id',id);if(error)return json(500,{ok:false,error:error.message});const bad=Array.isArray(body.disabled_endpoints)?body.disabled_endpoints:[];if(bad.length)await sb.from('tv_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).in('endpoint',bad);return json(200,{ok:true});
 }
 if(body?.action==='pending_viability'){
  const limit=Math.max(1,Math.min(Number(body.limit||20),50));const {data,error}=await sb.from('tv_viability_requests').select('*').eq('status','pending').order('created_at',{ascending:true}).limit(limit);if(error)return json(500,{ok:false,error:error.message});const rows=data||[];if(rows.length)await sb.from('tv_viability_requests').update({status:'processing'}).in('id',rows.map((r:any)=>r.id));return json(200,{ok:true,rows});
 }
 if(body?.action==='viability_result'){
  const id=String(body.id||''),status=String(body.status||'error');if(!id)return json(400,{ok:false,error:'missing_id'});const result=body.result&&typeof body.result==='object'?body.result:{};const {data:reqrow,error:re}=await sb.from('tv_viability_requests').update({status,result,error_message:body.error?clip(body.error,500):null,processed_at:new Date().toISOString()}).eq('id',id).select('sale_id').maybeSingle();if(re)return json(500,{ok:false,error:re.message});if(reqrow?.sale_id)await sb.from('tv_sales').update({viability_status:status,viability_message:String(result.message||body.error||'')}).eq('id',reqrow.sale_id);return json(200,{ok:true});
 }
 if(body?.action==='submit_dry_run'){
  const queueId=Number(body.id||0);let saleId=String(body.sale_id||'');if(queueId&&!saleId){const q=await sb.from('tv_imperium_submit_queue').select('sale_id').eq('id',queueId).maybeSingle();if(q.error)return json(500,{ok:false,error:q.error.message});saleId=String(q.data?.sale_id||'')}
  if(!saleId)return json(400,{ok:false,error:'missing_sale_id'});const pf=await sb.rpc('tv_backoffice_imperium_submission_bundle',{p_sale_id:saleId});if(pf.error)return json(500,{ok:false,error:pf.error.message});return json(200,{ok:true,dry_run:true,bundle:pf.data});
 }
 if(body?.action==='pending_submit'){
  const limit=Math.max(1,Math.min(Number(body.limit||10),30)),writerVersion=Number(body.writer_version||0),applyMode=String(body.mode||'').toLowerCase()==='apply'&&writerVersion>=2,now=new Date().toISOString();
  let q=sb.from('tv_imperium_submit_queue').select('id,sale_id,base_key,payload,result,attempts,max_attempts,created_at,next_attempt_at').eq('status','pending').lt('attempts',5).order('created_at',{ascending:true}).limit(limit);const {data,error}=await q;if(error)return json(500,{ok:false,error:error.message});
  const candidates=data||[],rows:any[]=[],blocked:any[]=[],readyPreview:any[]=[];
  for(const r of candidates){if(r.next_attempt_at&&new Date(r.next_attempt_at).getTime()>Date.now())continue;
    const pf=await sb.rpc('tv_backoffice_imperium_submission_bundle',{p_sale_id:r.sale_id});
    if(pf.error){const msg='preflight_error: '+clip(pf.error.message,700);await sb.from('tv_imperium_submit_queue').update({error_message:msg,updated_at:now}).eq('id',r.id);blocked.push({id:r.id,sale_id:r.sale_id,error:msg});continue}
    const bundle:any=pf.data||{},blockers=Array.isArray(bundle.blockers)?bundle.blockers:[];
    if(bundle.ready!==true){const msg=blockers.map((x:any)=>x?.message||x?.code).filter(Boolean).join(' | ').slice(0,1000)||'preflight_not_ready';await sb.from('tv_imperium_submit_queue').update({result:{...(r.result||{}),preflight:bundle},error_message:msg,updated_at:now}).eq('id',r.id);await sb.from('tv_sales').update({imperium_submit_status:'not_ready',imperium_submit_error:msg}).eq('id',r.sale_id);blocked.push({id:r.id,sale_id:r.sale_id,blockers,warnings:bundle.warnings||[]});continue}
    readyPreview.push({id:r.id,sale_id:r.sale_id,base_key:r.base_key,warnings:bundle.warnings||[],bundle_version:bundle.bundle_version||2});
    if(!applyMode)continue;
    const freshPayload={protocol_version:2,submission_key:String(r.sale_id),dry_run:false,bundle};
    const nextAttempts=Number(r.attempts||0)+1;const upd=await sb.from('tv_imperium_submit_queue').update({status:'processing',attempts:nextAttempts,last_attempt_at:now,payload:freshPayload,result:{...(r.result||{}),preflight:bundle},error_message:null,updated_at:now}).eq('id',r.id).eq('status','pending').select('id').maybeSingle();if(upd.error)return json(500,{ok:false,error:upd.error.message});if(!upd.data)continue;
    await sb.from('tv_sales').update({imperium_submit_status:'sending',imperium_submit_error:null}).eq('id',r.sale_id);
    rows.push({id:r.id,sale_id:r.sale_id,base_key:r.base_key,payload:freshPayload,attempts:nextAttempts,created_at:r.created_at});
  }
  return json(200,{ok:true,submit_protocol:2,apply_enabled:applyMode,rows,blocked,ready_preview:readyPreview});
 }
 if(body?.action==='submit_result'){
  const id=Number(body.id||0),ok=body.ok===true,result=body.result&&typeof body.result==='object'?body.result:{};if(!id)return json(400,{ok:false,error:'missing_id'});if(body.dry_run===true)return json(400,{ok:false,error:'dry_run_cannot_finalize'});
  const current=await sb.from('tv_imperium_submit_queue').select('id,sale_id,status,attempts,max_attempts').eq('id',id).maybeSingle();if(current.error)return json(500,{ok:false,error:current.error.message});if(!current.data)return json(404,{ok:false,error:'queue_item_not_found'});if(current.data.status!=='processing')return json(409,{ok:false,error:'queue_item_not_processing',status:current.data.status});
  const failMsg=clip(body.error||'submit_failed',1000),patchQ:any={status:ok?'sent':'failed',result,error_message:ok?null:failMsg,updated_at:new Date().toISOString(),last_error_at:ok?null:new Date().toISOString()};const {data:qrow,error:qe}=await sb.from('tv_imperium_submit_queue').update(patchQ).eq('id',id).eq('status','processing').select('sale_id').maybeSingle();if(qe)return json(500,{ok:false,error:qe.message});if(!qrow)return json(409,{ok:false,error:'queue_state_changed'});
  if(qrow.sale_id){const patch:any=ok?{status:'synced',imperium_submit_status:'sent',imperium_submit_error:null,synced_at:new Date().toISOString(),imperium_sale_id:result.imperium_sale_id??null,imperium_proposal:result.imperium_proposal??null,imperium_contract:result.imperium_contract??null,imperium_status:result.imperium_status??null}:{imperium_submit_status:'failed',imperium_submit_error:failMsg};await sb.from('tv_sales').update(patch).eq('id',qrow.sale_id)}return json(200,{ok:true});
 }
 if(body?.action!=='upsert_sales')return json(400,{ok:false,error:'invalid_action'});
 const rows=Array.isArray(body.rows)?body.rows:[];if(!rows.length||rows.length>750)return json(400,{ok:false,error:'invalid_rows'});for(const r of rows){r.source='imperium';if(!r.source_key||!r.customer_name||!r.imperium_base_key)return json(400,{ok:false,error:'invalid_sale_row'})}
 const {error}=await sb.from('tv_sales').upsert(rows,{onConflict:'source,source_key',ignoreDuplicates:false});if(error)return json(500,{ok:false,error:error.message});
 const seen=new Map<string,any>();for(const r of rows){if(r.imperium_consultant_id&&r.imperium_consultant_name){const k=`${r.imperium_base_key}:${r.imperium_consultant_id}`;seen.set(k,{base_key:r.imperium_base_key,imperium_person_id:r.imperium_consultant_id,display_name:r.imperium_consultant_name,imperium_team_id:r.imperium_team_id??null,team_name:r.imperium_team_name??null,last_seen_at:new Date().toISOString(),active:true})}}
 if(seen.size){const {error:ue}=await sb.from('tv_imperium_users').upsert([...seen.values()],{onConflict:'base_key,imperium_person_id'});if(ue)return json(500,{ok:false,error:ue.message});}
 return json(200,{ok:true,upserted:rows.length,users_seen:seen.size,agent:agent.name});
});