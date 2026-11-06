import { createClient } from 'npm:@supabase/supabase-js@2';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8'}});
async function sha256Hex(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
 const token=req.headers.get('x-technet-sync-token')||'',agentName=req.headers.get('x-technet-agent')||'CLAYVERTON-MDU';if(!token)return json(401,{ok:false,error:'missing_sync_token'});
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!service)return json(500,{ok:false,error:'server_not_configured'});
 const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),tokenHash=await sha256Hex(token);
 const {data:agent,error:ae}=await sb.from('tv_sync_agents').select('id,name,active,token_hash').eq('name',agentName).maybeSingle();if(ae||!agent||!agent.active||agent.token_hash!==tokenHash)return json(401,{ok:false,error:'invalid_sync_agent'});
 let body:any;try{body=await req.json()}catch{return json(400,{ok:false,error:'invalid_json'})}
 if(body?.action==='ping')return json(200,{ok:true,agent:agent.name});
 if(body?.action==='pending_commercial'){
  const days=Math.max(1,Math.min(Number(body.days||90),3650)),limit=Math.max(1,Math.min(Number(body.limit||60),150)),since=new Date(Date.now()-days*86400000).toISOString();
  const {data,error}=await sb.from('tv_sales').select('source_key,imperium_base_key,imperium_sale_id,imperium_status,sold_at,commercial_enrich_attempts,commercial_enrich_last_attempt_at,total_value').eq('source','imperium').gte('sold_at',since).or('commercial_enriched_at.is.null,and(total_value.eq.0,commercial_enrich_attempts.lt.5)').not('imperium_sale_id','is',null).order('commercial_enrich_last_attempt_at',{ascending:true,nullsFirst:true}).order('sold_at',{ascending:false}).limit(limit);if(error)return json(500,{ok:false,error:error.message});return json(200,{ok:true,rows:data||[]});
 }
 if(body?.action!=='update_commercial')return json(400,{ok:false,error:'invalid_action'});
 const rows=Array.isArray(body.rows)?body.rows:[];if(!rows.length||rows.length>100)return json(400,{ok:false,error:'invalid_rows'});
 let updated=0,itemsSaved=0;
 for(const r of rows){
  const sourceKey=String(r?.source_key||'');if(!sourceKey)continue;
  const {data:sale,error:se}=await sb.from('tv_sales').select('id,imperium_base_key,commercial_enrich_attempts,total_value').eq('source','imperium').eq('source_key',sourceKey).maybeSingle();if(se)return json(500,{ok:false,error:se.message});if(!sale)continue;
  const items=(Array.isArray(r.products)?r.products:[]).map((x:any)=>({product_name:String(x?.product_name||'').trim(),product_group:String(x?.product_group||'').trim(),monthly_value:Number(x?.monthly_value||0),quantity:Math.max(1,Number(x?.quantity||1))})).filter((x:any)=>x.product_name&&Number.isFinite(x.monthly_value)&&x.monthly_value>=0);
  const total=items.reduce((a:number,x:any)=>a+x.monthly_value*x.quantity,0),summary=items.map((x:any)=>x.product_name).join(' + ').slice(0,2000),groups=[...new Set(items.map((x:any)=>x.product_group).filter(Boolean))].join(' + ').slice(0,1000);
  const now=new Date().toISOString(),attempts=Number(sale.commercial_enrich_attempts||0)+1,patch=items.length?{real_product_summary:summary||null,product_group_summary:groups||null,total_value:Number.isFinite(total)?total:Number(sale.total_value||0),commercial_enriched_at:now,commercial_enrich_attempts:attempts,commercial_enrich_last_attempt_at:now,commercial_enrich_status:'ok'}:{commercial_enrich_attempts:attempts,commercial_enrich_last_attempt_at:now,commercial_enrich_status:'empty'};
  const {error:ue}=await sb.from('tv_sales').update(patch).eq('id',sale.id);if(ue)return json(500,{ok:false,error:ue.message});
  if(items.length){await sb.from('tv_sale_products').delete().eq('sale_id',sale.id).eq('source','imperium');const payload=items.map((x:any)=>({sale_id:sale.id,product_name:x.product_name,product_group:x.product_group,monthly_value:x.monthly_value,quantity:x.quantity,source:'imperium',updated_at:new Date().toISOString()}));const {error:ie}=await sb.from('tv_sale_products').insert(payload);if(ie)return json(500,{ok:false,error:ie.message});itemsSaved+=items.length;
   for(const x of items){const base=String(sale.imperium_base_key||'');const {data:old}=await sb.from('tv_imperium_products').select('id,min_value,max_value,sales_seen').eq('base_key',base).eq('product_name',x.product_name).eq('product_group',x.product_group).maybeSingle();if(old){await sb.from('tv_imperium_products').update({latest_value:x.monthly_value,min_value:Math.min(Number(old.min_value||x.monthly_value),x.monthly_value),max_value:Math.max(Number(old.max_value||x.monthly_value),x.monthly_value),sales_seen:Number(old.sales_seen||0)+1,last_seen_at:new Date().toISOString(),active:true}).eq('id',old.id)}else{await sb.from('tv_imperium_products').insert({base_key:base,product_name:x.product_name,product_group:x.product_group,latest_value:x.monthly_value,min_value:x.monthly_value,max_value:x.monthly_value,sales_seen:1,active:true})}}
  }
  updated++;
 }
 return json(200,{ok:true,updated,items:itemsSaved});
});