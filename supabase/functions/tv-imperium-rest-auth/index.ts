import {createClient} from 'npm:@supabase/supabase-js@2.57.4';

const API_BASE='https://www.sistemaimperium.com.br/technet';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS'};
const json=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(value:unknown,max=180)=>String(value??'').replace(/[\r\n\0]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const normalized=(value:unknown)=>clean(value).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();
const header=(headers:Headers,name:string)=>{for(const [key,value] of headers)if(key.toLowerCase()===name.toLowerCase())return clean(value);return ''};
const timeoutSignal=(ms=12000)=>{const controller=new AbortController();setTimeout(()=>controller.abort(),ms);return controller.signal};
function bearer(response:Response,payload:any){const auth=header(response.headers,'authorization');if(/^bearer\s+/i.test(auth))return auth.replace(/^bearer\s+/i,'').trim();return clean(payload?.token||payload?.access_token||payload?.bearerToken||payload?.bearer_token,8000)}
function statusError(status:number){if(status===401||status===403)return json(401,{ok:false,code:'invalid_credentials',error:'Usuário ou senha inválidos.'});if(status===429)return json(503,{ok:false,code:'upstream_unavailable',error:'O Imperium está temporariamente ocupado. Tente novamente.'});return json(502,{ok:false,code:'upstream_unavailable',error:'Não foi possível validar sua conta no Imperium agora.'})}
async function findExistingUser(sb:any,base:string,username:string){const identity=await sb.from('tv_imperium_rest_identities').select('user_id').eq('base_key',base).eq('imperium_username_norm',normalized(username)).maybeSingle();if(identity.data?.user_id){const found=await sb.auth.admin.getUserById(identity.data.user_id);if(found.error)throw found.error;if(found.data?.user)return found.data.user}for(let page=1;page<=10;page++){const listed=await sb.auth.admin.listUsers({page,perPage:100});if(listed.error)throw listed.error;const users=listed.data?.users||[],match=users.find((u:any)=>normalized(u.app_metadata?.imperium_username)===normalized(username)&&String(u.app_metadata?.imperium_base||'')===base);if(match)return match;if(users.length<100)break}return null}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json(405,{ok:false,code:'method_not_allowed',error:'Método não permitido.'});
 let body:any;try{body=await req.json()}catch{return json(400,{ok:false,code:'invalid_request',error:'Dados de acesso inválidos.'})}
 const base=clean(body?.base,32).toLowerCase(),username=clean(body?.username,120),password=String(body?.password??'');
 if(!['natal','fortaleza','mossoro','recife'].includes(base)||!username||!password||password.length>300)return json(400,{ok:false,code:'invalid_request',error:'Informe base, usuário e senha.'});
 const supabaseUrl=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!supabaseUrl||!serviceKey)return json(500,{ok:false,code:'server_not_configured',error:'Serviço de autenticação indisponível.'});
 const sb=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const login=await fetch(`${API_BASE}/login?rememberme=true`,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({jwtusername:username,jwtpassword:password}),signal:timeoutSignal()});
  let loginPayload:any={};try{loginPayload=await login.json()}catch{}
  if(!login.ok)return statusError(login.status);
  const token=bearer(login,loginPayload);if(!token)return json(502,{ok:false,code:'upstream_invalid',error:'O Imperium não retornou uma sessão válida.'});
  const identityResponse=await fetch(`${API_BASE}/usuario-logado`,{headers:{authorization:`Bearer ${token}`,'accept':'application/json'},signal:timeoutSignal()});
  let identityPayload:any={};try{identityPayload=await identityResponse.json()}catch{}
  if(!identityResponse.ok)return statusError(identityResponse.status);
  const imperiumUserId=clean(header(login.headers,'Id-Usuario')||header(identityResponse.headers,'Id-Usuario')||identityPayload?.idUsuario||identityPayload?.id,80);
  const imperiumUsername=clean(header(login.headers,'Usuario')||header(identityResponse.headers,'Usuario')||identityPayload?.usuario||identityPayload?.username||username,120);
  const group=clean(header(login.headers,'Grupo-Usuario')||header(identityResponse.headers,'Grupo-Usuario')||identityPayload?.grupoUsuario||identityPayload?.grupo,120);
  if(!imperiumUserId||normalized(imperiumUsername)!==normalized(username))return json(502,{ok:false,code:'identity_mismatch',error:'Não foi possível confirmar a identidade retornada pelo Imperium.'});
  let authUser=await findExistingUser(sb,base,imperiumUsername);const generatedEmail=`imperium.${base}.${imperiumUserId.replace(/[^a-zA-Z0-9_-]/g,'_')}@auth.technet.local`;
  if(!authUser){const created=await sb.auth.admin.createUser({email:generatedEmail,email_confirm:true,app_metadata:{imperium_base:base,imperium_username:imperiumUsername,imperium_user_id:imperiumUserId,imperium_group:group},user_metadata:{full_name:clean(identityPayload?.nome||identityPayload?.name||imperiumUsername,160)}});if(created.error||!created.data.user)throw created.error||new Error('user_create_failed');authUser=created.data.user}else{const updated=await sb.auth.admin.updateUserById(authUser.id,{app_metadata:{imperium_base:base,imperium_username:imperiumUsername,imperium_user_id:imperiumUserId,imperium_group:group}});if(updated.error)throw updated.error;authUser=updated.data.user||authUser}
  const linked=await sb.from('tv_imperium_rest_identities').upsert({user_id:authUser.id,base_key:base,imperium_user_id:imperiumUserId,imperium_username:imperiumUsername,imperium_username_norm:normalized(imperiumUsername),imperium_group:group,last_verified_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'base_key,imperium_user_id'});if(linked.error)throw linked.error;
  const email=authUser.email||generatedEmail,link=await sb.auth.admin.generateLink({type:'magiclink',email});if(link.error||!link.data?.properties?.hashed_token)throw link.error||new Error('session_link_failed');
  return json(200,{ok:true,token_hash:link.data.properties.hashed_token,identity:{user_id:imperiumUserId,username:imperiumUsername,group}});
 }catch(error){const timeout=error instanceof DOMException&&error.name==='AbortError';console.error('imperium_rest_auth',timeout?'timeout':'request_failed');return json(503,{ok:false,code:'upstream_unavailable',error:timeout?'O Imperium demorou para responder. Tente novamente.':'Não foi possível validar sua conta no Imperium agora.'})}
});
