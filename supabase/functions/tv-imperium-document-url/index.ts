import { createClient } from 'npm:@supabase/supabase-js@2';
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function sha256Hex(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
 const token=req.headers.get('x-technet-sync-token')||'',agentName=req.headers.get('x-technet-agent')||'CLAYVERTON-MDU';
 if(!token)return json(401,{ok:false,error:'missing_sync_token'});
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!service)return json(500,{ok:false,error:'server_not_configured'});
 const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}}),tokenHash=await sha256Hex(token);
 const {data:agent,error:agentErr}=await sb.from('tv_sync_agents').select('id,active,token_hash').eq('name',agentName).maybeSingle();
 if(agentErr||!agent||!agent.active||!agent.token_hash||agent.token_hash!==tokenHash)return json(401,{ok:false,error:'invalid_sync_agent'});
 let body:any;try{body=await req.json()}catch{return json(400,{ok:false,error:'invalid_json'})}
 const documentId=String(body?.document_id||'');if(!documentId)return json(400,{ok:false,error:'missing_document_id'});
 const {data:doc,error}=await sb.from('tv_sale_documents').select('id,storage_path').eq('id',documentId).maybeSingle();
 if(error)return json(500,{ok:false,error:error.message});if(!doc)return json(404,{ok:false,error:'document_not_found'});
 const signed=await sb.storage.from('tv-sale-documents').createSignedUrl(doc.storage_path,300);
 if(signed.error||!signed.data?.signedUrl)return json(500,{ok:false,error:signed.error?.message||'signed_url_failed'});
 return json(200,{ok:true,url:signed.data.signedUrl,expires_in:300});
});