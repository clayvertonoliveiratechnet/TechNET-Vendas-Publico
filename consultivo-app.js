import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { renderNewSaleAdvanced } from './field-workflow-v48.js?v=56';

const SB_URL='https://zpapjeqjpthaxrefrcey.supabase.co';
const SB_KEY='sb_publishable_KPV38oWuqH3FjviS4WOGsA_hkNrt6Dd';
const AUTH_URL=SB_URL+'/functions/v1/tv-imperium-auth';
const REST_AUTH_URL=SB_URL+'/functions/v1/tv-imperium-rest-auth';
const DIRECT_AUTH_URL=SB_URL+'/functions/v1/tv-imperium-direct-auth';
const DEVICE_URL=SB_URL+'/functions/v1/tv-consultivo-device';
const sb=createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'technet-vendas-comercial-session'}});

const $=s=>document.querySelector(s);
const app=$('#cvApp'),content=$('#cvContent'),boot=$('#cvBoot');
let session=null,profile=null,team=null,map=null,teamMap=null,nativeSnapshotTimer=null,serverTrackingTimer=null,currentPosition=null,batteryLevel=null;
let serverTrackingLoading=false;
let loadedRouteKey='',loadedRoute=[];
let currentScreen='home',toastTimer=null,geoStatus='idle',geoErrorCode=null,deviceBindingPromise=null,salesViewMode='overview';
const HERO_MASCOTS={tracking:'/consultivo-mascot-male.webp?v=1',sales:'/consultivo-mascot-female.webp?v=1',team:'/consultivo-mascot-duo.webp?v=1',account:'/consultivo-cover-team.webp?v=1'};
const HOME_MASCOTS=['/consultivo-mascot-female.webp?v=1','/consultivo-mascot-male.webp?v=1','/consultivo-mascot-duo.webp?v=1'];
const todayKey=()=>{const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`};
const routeKey=()=>`cv_route_${session?.user?.id||'unknown'}_${todayKey()}`;
const pauseKey=()=>`cv_pause_${todayKey()}`;
const journeyStartKey=()=>`cv_start_${todayKey()}`;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('#cvToast');clearTimeout(toastTimer);el.textContent=String(msg||'');el.classList.add('show');toastTimer=setTimeout(()=>el.classList.remove('show'),3000)}
function fmtKm(m){return `${(Number(m||0)/1000).toFixed(1).replace('.',',')} km`}
function fmtDuration(sec){sec=Math.max(0,Math.round(Number(sec||0)));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60);return h?`${h}h ${m}min`:`${m}min`}
function fmtTime(v){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(v)}
function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d}
function consultantAccountName(){
  const profileName=String(profile?.full_name||'').trim();
  const metadataName=String(session?.user?.user_metadata?.full_name||session?.user?.user_metadata?.name||'').trim();
  const emailName=String(session?.user?.email||'').split('@')[0].replace(/[._-]+/g,' ').trim();
  return profileName||metadataName||emailName||'Consultor';
}
function consultantGreetingName(){
  const full=consultantAccountName();
  return full.split(/\s+/).filter(Boolean)[0]||'Consultor';
}
function getRoute(){const key=routeKey();if(loadedRouteKey!==key){loadedRouteKey=key;try{loadedRoute=JSON.parse(localStorage.getItem(key)||'[]')}catch{loadedRoute=[]}}return loadedRoute}
function setRoute(v){loadedRouteKey=routeKey();loadedRoute=v;try{localStorage.setItem(loadedRouteKey,JSON.stringify(v.slice(-1600)))}catch{}}
function isPaused(){return localStorage.getItem(pauseKey())==='1'}
function setPaused(v){localStorage.setItem(pauseKey(),v?'1':'0')}
function getJourneyStart(){const raw=localStorage.getItem(journeyStartKey());if(raw)return new Date(raw);const d=new Date();localStorage.setItem(journeyStartKey(),d.toISOString());return d}
function hav(a,b){const R=6371000,p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lng-a.lng)*p,aa=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa))}
function routeDistance(route=getRoute()){let d=0;for(let i=1;i<route.length;i++)d+=hav(route[i-1],route[i]);return d}
function routeMovementSeconds(route=getRoute()){let s=0;for(let i=1;i<route.length;i++){const dt=(route[i].t-route[i-1].t)/1000;if(dt>0&&dt<180&&hav(route[i-1],route[i])>3)s+=dt}return s}
function accuracyLabel(acc){if(!acc)return 'Aguardando';if(acc<=15)return 'Excelente';if(acc<=35)return 'Boa';return 'Regular'}
function uiIcon(name){
  const paths={
    sale:'<path d="M4 5h2l1.4 8.2a2 2 0 0 0 2 1.7h7.8a2 2 0 0 0 1.9-1.4L21 8H7.1M10 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
    map:'<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Zm5-2v14m6-12v14"/>',
    journey:'<path d="M5 19V9m7 10V4m7 15v-7"/>',
    pause:'<path d="M8 6v12M16 6v12"/>',
    play:'<path d="m9 6 9 6-9 6V6Z"/>',
    route:'<path d="M5 18c0-2.5 1.7-4 4-4h6c2.2 0 4-1.8 4-4s-1.8-4-4-4h-1M5 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm9-12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>',
    target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    team:'<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-1a3 3 0 1 0 0-6M2 21v-3a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v3m1-8a5 5 0 0 1 5 5v3"/>',
    calendar:'<path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-7 9 7 4 7-4M5 16l7 4 7-4"/>',
    nav:'<path d="m21 3-7 18-3-8-8-3 18-7Z"/>',
    walk:'<circle cx="13" cy="4" r="2"/><path d="m10 22 2-7-3-3 2-5 4 3 3 1M7 22l2-5m5-2 3 7"/>',
    battery:'<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M6 10h8"/>',
    signal:'<path d="M5 20v-4m5 4v-8m5 8V8m5 12V4"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    shield:'<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/>',
    logout:'<path d="M10 17l5-5-5-5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"/>',
    building:'<path d="M4 21V5l8-3v19M4 9h8m-5-1v2m0 3v2m0 3v2m5 1h8V9l-8-2m4 5v2m0 3v2"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    eyeOff:'<path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3 3.7M6.2 6.2C3.4 8.1 2 12 2 12s3.5 6 10 6a10.8 10.8 0 0 0 3.7-.7"/>',
    location:'<path d="M12 22s7-6.1 7-13A7 7 0 1 0 5 9c0 6.9 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>',
    gps:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>',
    salesTrend:'<path d="M5 20v-5m7 5V9m7 11V4"/><path d="m4 10 5-4 4 3 7-6"/>',
    chevronRight:'<path d="m9 5 7 7-7 7"/>',
    chevronDown:'<path d="m5 9 7 7 7-7"/>'
  };
  return '<svg class="cv-ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(paths[name]||paths.journey)+'</svg>';
}
function loadingMarkup(){
  return '<section class="cv-screen cv-loading-screen" aria-busy="true"><div class="cv-card cv-loading-hero"><span class="cv-skeleton wide"></span><span class="cv-skeleton medium"></span></div><div class="cv-loading-grid">'+Array.from({length:6},()=>'<div class="cv-card cv-loading-card"><span class="cv-skeleton icon"></span><span class="cv-skeleton medium"></span><span class="cv-skeleton short"></span></div>').join('')+'</div></section>';
}
function mobileMapOptions(){const mobile=window.matchMedia('(max-width: 820px)').matches;return {zoomControl:false,attributionControl:false,dragging:true,touchZoom:true,doubleClickZoom:true,scrollWheelZoom:false,boxZoom:!mobile,keyboard:!mobile}}
function setupFormScrollAssist(){if(window.__cvFormScrollAssist)return;window.__cvFormScrollAssist=true;document.addEventListener('focusin',event=>{const target=event.target;if(!target?.closest?.('.cv-sale-shell')||!['INPUT','SELECT','TEXTAREA'].includes(target.tagName))return;setTimeout(()=>target.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'}),260)})}
function setupResponsiveViewport(){
  if(window.__cvResponsiveViewport)return;
  window.__cvResponsiveViewport=true;
  const viewport=window.visualViewport;
  const sync=()=>{
    const visibleHeight=Math.round(viewport?.height||window.innerHeight||document.documentElement.clientHeight||0);
    const layoutHeight=Math.round(window.innerHeight||document.documentElement.clientHeight||visibleHeight);
    const keyboardOffset=Math.max(0,layoutHeight-visibleHeight);
    document.documentElement.style.setProperty('--cv-viewport-height',visibleHeight+'px');
    document.documentElement.style.setProperty('--cv-keyboard-offset',keyboardOffset+'px');
    document.body.classList.toggle('cv-keyboard-open',keyboardOffset>120);
  };
  sync();
  window.addEventListener('resize',sync,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(sync,180),{passive:true});
  viewport?.addEventListener('resize',sync,{passive:true});
  viewport?.addEventListener('scroll',sync,{passive:true});
}

function currentShellAssetVersion(){
  const src=document.querySelector('script[src*="consultivo-app.js"]')?.getAttribute('src')||'';
  const match=src.match(/[?&]v=(\d+)/);
  return Number(match?.[1]||0);
}
async function checkShellFreshness(){
  if(document.visibilityState==='hidden'||!navigator.onLine)return;
  try{
    const response=await fetch('/consultivo.html?cvFreshCheck='+Date.now(),{
      cache:'no-store',
      headers:{'cache-control':'no-cache, no-store','pragma':'no-cache'}
    });
    if(!response.ok)return;
    const html=await response.text();
    const match=html.match(/consultivo-app\.js\?v=(\d+)/);
    const remoteVersion=Number(match?.[1]||0),currentVersion=currentShellAssetVersion();
    if(!remoteVersion||remoteVersion<=currentVersion)return;
    if(currentScreen==='sales'){
      localStorage.setItem('cv_pending_shell_reload','1');
      toast('Atualização pronta. Ela será aplicada ao sair de Vendas.');
      return;
    }
    location.replace('/consultivo.html?updated='+Date.now());
  }catch(err){
    console.warn('consultivo shell freshness',err);
  }
}
function setupShellFreshness(){
  if(window.__cvShellFreshness)return;
  window.__cvShellFreshness=true;
  setInterval(checkShellFreshness,120000);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')setTimeout(checkShellFreshness,250);
  });
  window.addEventListener('online',()=>setTimeout(checkShellFreshness,250),{passive:true});
  setTimeout(checkShellFreshness,1500);
}

let imperiumKey=null;
const IMPERIUM_BASES=[
  ['natal','Natal / Parnamirim'],
  ['fortaleza','Fortaleza'],
  ['mossoro','Mossoró'],
  ['recife','Recife']
];
function imperiumBaseLabel(value){
  return IMPERIUM_BASES.find(([key])=>key===String(value||'').toLowerCase())?.[1]||String(value||'').trim()||'Base não informada';
}
function roleDisplay(role){
  return {consultant:'Consultor de Vendas',supervisor:'Supervisor',admin:'Administrador',backoffice:'BackOffice'}[role]||'Usuário TechNET';
}
async function encryptImperiumPassword(password){
  if(!imperiumKey){
    const jwk=await fetch('/imperium_public_key.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Chave de login indisponível');return r.json()});
    imperiumKey=await crypto.subtle.importKey('jwk',jwk,{name:'RSA-OAEP',hash:'SHA-1'},false,['encrypt']);
  }
  const enc=await crypto.subtle.encrypt({name:'RSA-OAEP'},imperiumKey,new TextEncoder().encode(password));
  return btoa(String.fromCharCode(...new Uint8Array(enc)));
}
async function authPost(body){
  const r=await fetch(AUTH_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const j=await r.json().catch(()=>({ok:false,error:'Falha de comunicação'}));
  if(!r.ok){const e=new Error(j.error||'Falha de autenticação');e.code=j.code||'auth_error';throw e}
  return j;
}
async function directAuthPost(body){
  const r=await fetch(DIRECT_AUTH_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const j=await r.json().catch(()=>({ok:false,error:'Falha de comunicação direta'}));
  if(!r.ok){const e=new Error(j.error||'Falha de autenticação');e.code=j.code||'direct_auth_error';throw e}
  return j;
}
async function restAuthPost(body){
  const r=await fetch(REST_AUTH_URL,{method:'POST',headers:{'content-type':'application/json','apikey':SB_KEY},body:JSON.stringify(body),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  const j=await r.json().catch(()=>({ok:false,error:'Falha de comunicação com o Imperium'}));
  if(!r.ok){const e=new Error(j.error||'Falha de autenticação');e.code=j.code||'rest_auth_error';throw e}
  return j;
}
async function waitImperiumLogin(req){
  for(let i=0;i<65;i++){
    const s=await authPost({action:'status',request_id:req.request_id,poll_token:req.poll_token});
    if(s.status==='approved')return s;
    if(s.status!=='processing')throw new Error(s.error||'Login não autorizado');
    await new Promise(r=>setTimeout(r,700));
  }
  throw new Error('O servidor comercial demorou para responder. Tente novamente.');
}
async function contingencyLogin(base,username,password){
  const ciphertext=await encryptImperiumPassword(password);
  const req=await authPost({action:'request',base,username,ciphertext});
  return await waitImperiumLogin(req);
}
async function imperiumLogin(base,username,password,onStatus=()=>{}){
  try{return {...await restAuthPost({base,username,password}),mode:'rest'}}
  catch(restError){
    if(['invalid_credentials','invalid_request'].includes(restError.code))throw restError;
    try{
      onStatus('API oficial indisponível. Ativando conexão direta segura...');
      return await directAuthPost({base,username,password});
    }catch(err){
      if(!['upstream_unavailable','fallback_required'].includes(err.code))throw err;
      onStatus('Conexão direta indisponível. Ativando contingência segura...');
      return await contingencyLogin(base,username,password);
    }
  }
}
function stopSensors(){
  if(nativeSnapshotTimer!=null)clearInterval(nativeSnapshotTimer);
  if(serverTrackingTimer!=null)clearInterval(serverTrackingTimer);
  serverTrackingTimer=null;
  nativeSnapshotTimer=null;currentPosition=null;batteryLevel=null;
  try{window.TechNETNativeTracking?.clear?.()}catch{}
}
async function loadAuthenticatedSession(sess){
  session=sess||null;
  if(!session){
    profile=null;team=null;stopSensors();
    boot.style.display='none';app.hidden=false;renderLoginNeeded();return;
  }
  const {data:p,error}=await sb.from('tv_profiles').select('*').eq('user_id',session.user.id).maybeSingle();
  if(error||!p?.active){
    profile=null;team=null;stopSensors();
    boot.style.display='none';app.hidden=false;
    renderLoginNeeded('Sua conta foi validada, mas o perfil ainda não está liberado para o Consultivo.');
    return;
  }
  profile=p;team=null;
  if(profile.team_id){const {data:t}=await sb.from('tv_teams').select('*').eq('id',profile.team_id).maybeSingle();team=t||null}
  document.body.classList.remove('cv-auth-active','cv-account-active');
  app.hidden=false;boot.style.display='none';
  wireNav();setupFormScrollAssist();setupResponsiveViewport();setupShellFreshness();startSensors();
  const restoredScreen=new URLSearchParams(location.search).get('screen')||sessionStorage.getItem('cv_last_screen');
  navigate(['home','tracking','team','account'].includes(restoredScreen)?restoredScreen:'home');
}
async function init(){
  const {data,error}=await sb.auth.getSession();
  if(error)console.warn('consultivo session',error);
  let restored=data?.session||null;
  if(restored&&localStorage.getItem('cv_remember_access')==='0'&&sessionStorage.getItem('cv_ephemeral_active')!=='1'){
    try{await sb.auth.signOut({scope:'local'})}catch{}
    restored=null;
  }
  await loadAuthenticatedSession(restored);
}
function resetAuthViewport(){
  const reset=()=>{
    document.documentElement.scrollLeft=0;
    document.body.scrollLeft=0;
    window.scrollTo({left:0,top:0,behavior:'auto'});
  };
  reset();
  requestAnimationFrame(reset);
  setTimeout(reset,120);
}
function renderLoginNeeded(message=''){
  document.body.classList.add('cv-auth-active');
  document.body.classList.remove('cv-account-active');
  currentScreen='login';
  content.dataset.screen='login';
  const savedBase=localStorage.getItem('tv_imp_base')||'natal';
  const remember=localStorage.getItem('cv_remember_access')!=='0';
  const savedUser=remember?(localStorage.getItem('tv_imp_user')||''):'';
  content.innerHTML=`<section class="cv-auth-screen">
    <div class="cv-auth-hero">
      <div class="cv-auth-wordmark"><b>TECHNET</b><span>CONSULTIVO</span></div>
      <div class="cv-auth-copy"><h1>Bem-vindo<br>de volta!</h1><p>Acesse sua conta para continuar sua jornada de resultados.</p></div>
      <img class="cv-auth-mascot" src="/consultivo-hero-mascot.webp?v=2" alt="" aria-hidden="true">
    </div>
    <div class="cv-auth-panel">
      <form id="cvLoginForm" class="cv-auth-form" novalidate>
        <div class="cv-auth-field">
          <span class="cv-auth-field-icon">${uiIcon('building')}</span>
          <label class="cv-auth-control" for="cvImpBase">
            <b>Base comercial</b>
            <select id="cvImpBase" aria-label="Base comercial">${IMPERIUM_BASES.map(([key,label])=>`<option value="${key}" ${key===savedBase?'selected':''}>${label}</option>`).join('')}</select>
          </label>
        </div>
        <div class="cv-auth-field">
          <span class="cv-auth-field-icon">${uiIcon('user')}</span>
          <label class="cv-auth-control" for="cvImpUser">
            <b>Usuário</b>
            <input id="cvImpUser" value="${esc(savedUser)}" placeholder="Digite seu usuário" autocomplete="username" autocapitalize="none" required>
          </label>
        </div>
        <div class="cv-auth-field">
          <span class="cv-auth-field-icon">${uiIcon('lock')}</span>
          <label class="cv-auth-control" for="cvImpPassword">
            <b>Senha</b>
            <input id="cvImpPassword" type="password" placeholder="Digite sua senha" autocomplete="current-password" required>
          </label>
          <button id="cvPasswordToggle" class="cv-auth-eye" type="button" aria-label="Mostrar senha">${uiIcon('eyeOff')}</button>
        </div>
        <div class="cv-auth-options">
          <label class="cv-auth-remember"><input id="cvRememberAccess" type="checkbox" ${remember?'checked':''}><span></span>Lembrar acesso</label>
          <button id="cvForgotPassword" type="button">Esqueci minha senha</button>
        </div>
        <button id="cvLoginBtn" class="cv-auth-submit" type="submit"><span>Entrar</span><b>→</b></button>
        <div id="cvLoginMessage" class="cv-auth-message" aria-live="polite">${esc(message)}</div>
      </form>
      <div class="cv-auth-divider"><span>ou</span></div>
      <button id="cvSupport" class="cv-auth-support" type="button"><span>${uiIcon('team')}</span><div><b>Precisa de ajuda?</b><small>Fale com o time de suporte</small></div><strong>${uiIcon('chevronRight')}</strong></button>
    </div>
  </section>`;
  setNav('');
  setupResponsiveViewport();
  setupShellFreshness();
  resetAuthViewport();
  const pass=$('#cvImpPassword'),toggle=$('#cvPasswordToggle');
  toggle.onclick=()=>{const visible=pass.type==='text';pass.type=visible?'password':'text';toggle.innerHTML=uiIcon(visible?'eyeOff':'eye');toggle.setAttribute('aria-label',visible?'Mostrar senha':'Ocultar senha');pass.focus()};
  $('#cvForgotPassword').onclick=()=>toast('A senha é a mesma do Imperium. Para recuperar o acesso, solicite a redefinição no suporte corporativo.');
  $('#cvSupport').onclick=()=>toast('Use o canal corporativo de suporte TechNET para recuperar ou liberar seu acesso.');
  $('#cvLoginForm').addEventListener('submit',handleConsultivoLogin);
}
async function handleConsultivoLogin(event){
  event.preventDefault();
  const base=$('#cvImpBase').value,username=$('#cvImpUser').value.trim(),pass=$('#cvImpPassword'),btn=$('#cvLoginBtn'),msg=$('#cvLoginMessage');
  let password=pass.value;
  const remember=$('#cvRememberAccess').checked;
  localStorage.setItem('tv_imp_base',base);
  localStorage.setItem('cv_remember_access',remember?'1':'0');
  if(remember){
    localStorage.setItem('tv_imp_user',username);
    sessionStorage.removeItem('cv_ephemeral_active');
  }else{
    localStorage.removeItem('tv_imp_user');
    sessionStorage.setItem('cv_ephemeral_active','1');
  }
  if(!username||!password){msg.textContent='Informe usuário e senha.';return}
  btn.disabled=true;btn.setAttribute('aria-busy','true');msg.textContent='Validando acesso no Imperium…';
  try{
    const done=await imperiumLogin(base,username,password,status=>msg.textContent=status);
    pass.value='';password='';
    const {error}=await sb.auth.verifyOtp({token_hash:done.token_hash,type:'email'});
    if(error)throw error;
    const {data}=await sb.auth.getSession();
    if(!data?.session)throw new Error('Não foi possível iniciar a sessão do aplicativo.');
    msg.textContent='Acesso confirmado.';
    await loadAuthenticatedSession(data.session);
  }catch(err){
    console.error('consultivo login',err);
    msg.textContent=err?.message||'Não foi possível validar sua conta.';
    toast(err?.message||'Login não autorizado');
  }finally{
    password='';pass.value='';btn.disabled=false;btn.removeAttribute('aria-busy');
  }
}
async function logoutConsultivo(){
  const btn=$('#cvLogout');
  if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true')}
  try{await sb.auth.signOut({scope:'local'})}catch(err){console.warn('consultivo logout',err)}
  finally{
    try{
      localStorage.removeItem('technet-vendas-comercial-session');
      localStorage.removeItem('tv_imperium_token');
      localStorage.removeItem('tv_imperium_auth');
      localStorage.removeItem('tv_imp_user');
      if(session?.user?.id)localStorage.removeItem('cv_device_token_'+session.user.id);
      sessionStorage.removeItem('cv_ephemeral_active');
      sessionStorage.removeItem('cv_last_screen');
    }catch{}
    session=null;profile=null;team=null;stopSensors();
    renderLoginNeeded('Sessão encerrada.');
  }
}
async function renderAccount(){
  const supervisor=await supervisorName();
  if(currentScreen!=='account')return;
  const base=session?.user?.app_metadata?.imperium_base||localStorage.getItem('tv_imp_base')||'';
  const username=session?.user?.app_metadata?.imperium_username||localStorage.getItem('tv_imp_user')||'';
  const teamLabel=teamName();
  const role=roleDisplay(profile?.role);
  content.innerHTML=`<section class="cv-screen cv-account-screen">
    <div class="cv-card cv-account-profile">
      <div class="cv-account-avatar"><img src="/consultivo-mascote.webp?v=1" alt=""></div>
      <div class="cv-account-person"><h2>${esc(profile?.full_name||consultantAccountName())}</h2><p>${esc(role)}</p><p>${esc(teamLabel)}</p></div>
      <span class="cv-account-online">● Online</span>
      <div class="cv-account-meta">
        <div><span>${uiIcon('building')}</span><p><b>${esc(imperiumBaseLabel(base))}</b><small>Base comercial</small></p></div>
        <div><span>${uiIcon('team')}</span><p><b>Supervisor</b><small>${esc(supervisor)}</small></p></div>
      </div>
    </div>
    <div class="cv-account-menu">
      <button type="button" data-account-action="profile"><span class="cv-account-menu-icon">${uiIcon('user')}</span><div><b>Meu perfil</b><small>${esc(username||'Conta corporativa')}</small></div><strong>${uiIcon('chevronRight')}</strong></button>
      <button type="button" data-account-action="notifications"><span class="cv-account-menu-icon">${uiIcon('bell')}</span><div><b>Notificações</b><small>Alertas do Consultivo</small></div><strong>${uiIcon('chevronRight')}</strong></button>
      <button type="button" data-account-action="theme"><span class="cv-account-menu-icon">${uiIcon('moon')}</span><div><b>Tema do app</b><small>Visual claro do Consultivo</small></div><strong>${uiIcon('chevronRight')}</strong></button>
      <button type="button" data-account-action="security"><span class="cv-account-menu-icon">${uiIcon('shield')}</span><div><b>Segurança</b><small>Conta Imperium e sessão protegida</small></div><strong>${uiIcon('chevronRight')}</strong></button>
    </div>
    <button id="cvLogout" class="cv-account-logout" type="button"><span>${uiIcon('logout')}</span><b>Sair da conta</b></button>
  </section>`;
  content.querySelector('[data-account-action="profile"]').onclick=()=>toast(`${profile?.full_name||consultantAccountName()} • ${role} • ${teamLabel}`);
  content.querySelector('[data-account-action="notifications"]').onclick=()=>toast('Os alertas do Consultivo usam a sua sessão e equipe atuais.');
  content.querySelector('[data-account-action="theme"]').onclick=()=>toast('O Consultivo está usando o tema claro aprovado para o aplicativo.');
  content.querySelector('[data-account-action="security"]').onclick=()=>toast(`Sessão autenticada pelo Imperium • ${imperiumBaseLabel(base)}`);
  $('#cvLogout').onclick=logoutConsultivo;
}
function setHero(screen){
  const copy={
    home:[`Olá, ${consultantGreetingName()}!`,'Bora pra mais um grande dia de resultados! 🚀'],
    tracking:['Rastreamento','Acompanhe sua jornada de hoje e suas próximas visitas.'],
    sales:[`Olá, ${consultantGreetingName()}!`,'Vamos registrar mais uma venda? 🚀'],
    team:['Equipe em campo','Acompanhe sua equipe em tempo real.'],
    account:['','']
  }[screen]||['TECHNET - CONSULTIVO','Operação comercial em campo'];
  const t=$('#cvHeroTitle'),s=$('#cvHeroSubtitle'),mascot=$('#cvHeroMascot');
  if(t)t.textContent=copy[0];if(s)s.textContent=copy[1];
  if(mascot){
    const daySeed=Number(todayKey().replaceAll('-',''))||0;
    mascot.src=screen==='home'?HOME_MASCOTS[daySeed%HOME_MASCOTS.length]:(HERO_MASCOTS[screen]||HOME_MASCOTS[0]);
  }
}

function wireNav(){
  document.querySelectorAll('.cv-bottom-nav [data-screen]').forEach(b=>b.onclick=()=>{if(b.dataset.screen==='sales')salesViewMode='overview';navigate(b.dataset.screen)});
  const bell=$('#cvHero .cv-bell');
  if(bell)bell.onclick=()=>toast('Notificações do Consultivo serão exibidas aqui.');
  const account=$('#cvAccountButton');
  if(account){
    account.setAttribute('aria-label',currentScreen==='account'?'Voltar ao início':'Abrir minha conta');
    account.onclick=()=>navigate(currentScreen==='account'?'home':'account');
  }
}
function setNav(screen){
  document.querySelectorAll('.cv-bottom-nav [data-screen]').forEach(b=>{const on=b.dataset.screen===screen;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
}
async function navigate(screen){
  if(screen!=='sales'&&localStorage.getItem('cv_pending_shell_reload')==='1'){
    localStorage.removeItem('cv_pending_shell_reload');
    location.replace('/consultivo.html?updated='+Date.now());
    return;
  }
  currentScreen=screen;
  if(['home','tracking','team','account'].includes(screen))sessionStorage.setItem('cv_last_screen',screen);
  document.body.classList.toggle('cv-account-active',screen==='account');
  document.body.classList.remove('cv-auth-active');
  setNav(screen);content.dataset.screen=screen;content.innerHTML=loadingMarkup();
  setHero(screen);wireNav();
  if(screen==='home')await renderHome()
  if(screen==='tracking')await renderTracking()
  if(screen==='sales')await renderSales()
  if(screen==='team')await renderTeam()
  if(screen==='account')await renderAccount()
  window.scrollTo({top:0,behavior:'smooth'});
}
function trackingInstallId(){
  const key='cv_install_id_v1';
  let value=localStorage.getItem(key);
  if(!value){value=crypto.randomUUID();localStorage.setItem(key,value)}
  return value;
}
function trackingDeviceTokenKey(){
  return session?.user?.id?'cv_device_token_'+session.user.id:'cv_device_token_unknown';
}
function nativeTrackingAvailable(){
  return Boolean(window.TechNETNativeTracking?.configure&&window.TechNETNativeTracking?.snapshot);
}
async function consultivoApiPost(url,body,deviceToken=''){
  if(!session?.access_token)throw new Error('missing_session');
  const headers={'content-type':'application/json','authorization':'Bearer '+session.access_token,'apikey':SB_KEY};
  if(deviceToken)headers['x-technet-device-token']=deviceToken;
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',credentials:'omit'});
  const payload=await response.json().catch(()=>({ok:false,code:'invalid_response'}));
  if(!response.ok){const error=new Error(payload.code||payload.error||'request_failed');error.code=payload.code||'request_failed';throw error}
  return payload;
}
async function ensureTrackingDevice(forceRenew=false){
  if(!session?.user?.id)return null;
  if(!forceRenew){
    const saved=localStorage.getItem(trackingDeviceTokenKey());
    if(saved)return saved;
  }
  if(deviceBindingPromise)return deviceBindingPromise;
  deviceBindingPromise=(async()=>{
    const installId=trackingInstallId();
    const body={action:forceRenew?'renew':'bind',install_id:installId,device_name:navigator.userAgent.slice(0,150),platform:'android',app_version:new URLSearchParams(location.search).get('nativeVersion')||'web'};
    try{
      const bound=await consultivoApiPost(DEVICE_URL,body);
      if(bound.device_token){localStorage.setItem(trackingDeviceTokenKey(),bound.device_token);return bound.device_token}
      return null;
    }catch(error){
      if(!forceRenew&&error.code==='device_already_bound'){
        const renewed=await consultivoApiPost(DEVICE_URL,{action:'renew',install_id:installId});
        if(renewed.device_token){
          localStorage.setItem(trackingDeviceTokenKey(),renewed.device_token);
          return renewed.device_token;
        }
        return null;
      }
      throw error;
    }
  })().finally(()=>deviceBindingPromise=null);
  return deviceBindingPromise;
}
function nativeTrackingSnapshot(){
  if(!nativeTrackingAvailable())return null;
  try{
    const raw=window.TechNETNativeTracking.snapshot();
    return raw?JSON.parse(raw):null;
  }catch(error){
    console.warn('consultivo native snapshot',error);
    return null;
  }
}
function syncNativeTrackingSnapshot(){
  const snapshot=nativeTrackingSnapshot();
  if(!snapshot)return;
  if(snapshot.location_permission===false){geoStatus='denied';updateGpsStatusUi();return}
  const position=snapshot?.last_position;
  if(!position){geoStatus='requesting';updateGpsStatusUi();return}
  if(position.latitude==null||position.longitude==null||!Number.isFinite(Number(position.latitude))||!Number.isFinite(Number(position.longitude)))return;
  currentPosition={
    lat:Number(position.latitude),
    lng:Number(position.longitude),
    accuracy:Number(position.accuracy)||null,
    speed:Number(position.speed)||0,
    heading:Number(position.heading)||null,
    t:Date.parse(position.recorded_at)
  };
  batteryLevel=Number.isFinite(Number(position.battery_level))?Number(position.battery_level):batteryLevel;
  const age=Date.now()-currentPosition.t;
  geoStatus=Number.isFinite(age)&&age>=-5000&&age<=120000?'active':'error';geoErrorCode=null;
  const route=getRoute(),last=route.at(-1);
  if(!last||currentPosition.t-last.t>12000||hav(last,currentPosition)>8){
    route.push(currentPosition);setRoute(route);
  }
  updateGpsStatusUi();
  if(currentScreen==='tracking')refreshTrackingMap();
}
async function loadServerTracking(){
  const userId=session?.user?.id;
  if(!userId||serverTrackingLoading)return;
  serverTrackingLoading=true;
  try{
    const start=startOfToday(),end=new Date(start);end.setDate(end.getDate()+1);
    const rows=[];
    for(let offset=0;;offset+=1000){
      const {data,error}=await sb.from('tv_consultivo_positions')
        .select('latitude,longitude,accuracy,speed,heading,battery_level,recorded_at')
        .eq('user_id',userId).gte('recorded_at',start.toISOString()).lt('recorded_at',end.toISOString())
        .order('recorded_at',{ascending:true}).range(offset,offset+999);
      if(error)throw error;
      rows.push(...(data||[]));
      if((data||[]).length<1000)break;
    }
    if(session?.user?.id!==userId)return;
    const route=rows.filter(p=>p.latitude!=null&&p.longitude!=null).map(p=>({
      lat:Number(p.latitude),lng:Number(p.longitude),accuracy:p.accuracy,speed:p.speed,
      heading:p.heading,t:Date.parse(p.recorded_at)
    })).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.t));
    if(nativeTrackingAvailable()&&currentPosition&&currentPosition.t>=start.getTime()&&currentPosition.t<end.getTime()&&(!route.length||currentPosition.t>route.at(-1).t))route.push(currentPosition);
    setRoute(route);
    if(!nativeTrackingAvailable()){
      currentPosition=route.at(-1)||null;
      batteryLevel=rows.at(-1)?.battery_level??null;
      geoStatus=currentPosition?(Date.now()-currentPosition.t<=120000?'active':'error'):'viewer';
    }
    updateGpsStatusUi();
    if(currentScreen==='tracking')refreshTrackingMap();
  }catch(error){
    console.warn('consultivo server tracking',error);
    if(!nativeTrackingAvailable()){geoStatus='error';updateGpsStatusUi()}
  }finally{serverTrackingLoading=false}
}
async function sendTrackingState(paused){
  if(!nativeTrackingAvailable())return;
  try{window.TechNETNativeTracking.setPaused(Boolean(paused))}
  catch(error){console.warn('consultivo native pause sync',error)}
}
function gpsStatusLabel(){
  if(geoStatus==='active')return 'Ativo';
  if(geoStatus==='requesting')return 'Buscando…';
  if(geoStatus==='viewer')return 'Sem posição';
  if(geoStatus==='denied')return 'Permissão';
  if(geoStatus==='unavailable')return 'Indisponível';
  if(geoStatus==='error')return 'Sem sinal';
  return 'Aguardando';
}
function updateGpsStatusUi(){
  const value=document.querySelector('[data-gps-status]');
  if(value)value.textContent=gpsStatusLabel();
  const badge=$('#cvGpsAccuracy');
  if(badge&&!currentPosition){
    badge.textContent=geoStatus==='viewer'?'Localização coletada somente pelo APK':geoStatus==='denied'?'Permita o GPS no aplicativo':geoStatus==='error'?'GPS sem sinal':'Buscando GPS…';
  }
}
function ensureNativeTrackingRunning(){
  if(!nativeTrackingAvailable()||!session?.user?.id)return;
  const token=localStorage.getItem(trackingDeviceTokenKey());
  if(!token)return;
  try{window.TechNETNativeTracking.configure(token,SB_KEY,isPaused())}
  catch(error){console.warn('consultivo native keepalive',error)}
}

function startSensors(){
  if(serverTrackingTimer==null){
    loadServerTracking();
    serverTrackingTimer=setInterval(()=>{
      if(document.hidden)return;
      ensureNativeTrackingRunning();
      if(currentScreen==='team')renderTeam();
      else loadServerTracking();
    },20000);
  }
  if(nativeSnapshotTimer!=null)return;
  if(!nativeTrackingAvailable()){
    geoStatus='viewer';geoErrorCode=null;currentPosition=null;batteryLevel=null;
    updateGpsStatusUi();
    return;
  }
  geoStatus='requesting';geoErrorCode=null;updateGpsStatusUi();
  const userId=session?.user?.id;
  ensureTrackingDevice().then(token=>{
    if(!token||session?.user?.id!==userId)return;
    const configured=window.TechNETNativeTracking.configure(token,SB_KEY,isPaused());
    if(!configured)throw new Error('native_tracking_config_failed');
    syncNativeTrackingSnapshot();
    nativeSnapshotTimer=setInterval(syncNativeTrackingSnapshot,5000);
  }).catch(error=>{
    geoStatus='error';geoErrorCode='native';
    console.warn('consultivo native tracking',error);
    updateGpsStatusUi();
  });
}
async function todaySalesCount(){
  const {count,error}=await sb.from('tv_sales').select('id',{count:'exact',head:true}).gte('created_at',startOfToday().toISOString());
  return error?0:Number(count||0);
}
async function dailySummary(){
  const {data}=await sb.from('tv_consultivo_daily_summaries').select('*').eq('day',todayKey()).eq('user_id',session.user.id).maybeSingle();
  if(data)return data;
  const route=getRoute();return{distance_meters:routeDistance(route),movement_seconds:routeMovementSeconds(route),stopped_seconds:0,gps_quality:accuracyLabel(currentPosition?.accuracy),first_position_at:new Date(getJourneyStart()).toISOString()}
}
function teamName(){return team?.name||profile?.team_name||'Minha equipe'}
async function supervisorName(){
  if(profile.supervisor_id){const {data}=await sb.from('tv_profiles').select('full_name').eq('user_id',profile.supervisor_id).maybeSingle();if(data?.full_name)return data.full_name}
  return profile.role==='supervisor'?profile.full_name:'—'
}
async function renderHome(){
  const [sales,summary,supervisor,commercial]=await Promise.all([todaySalesCount(),dailySummary(),supervisorName(),safeConsultivoSalesPageMonth({limit:3})]);
  if(currentScreen!=='home')return;
  const start=summary.first_position_at?new Date(summary.first_position_at):getJourneyStart();
  const paused=isPaused();
  content.innerHTML=`<section class="cv-screen">
    <div class="cv-card cv-journey">
      <div class="cv-pin">${uiIcon(paused?'pause':'location')}</div><div><h2>${paused?'Jornada pausada':'Em jornada'}</h2><p>${paused?'O rastreamento está temporariamente pausado.':'Acompanhe o deslocamento enviado pelo aplicativo CONSULTIVO.'}</p></div>
      <div class="cv-status"><span class="cv-pill">${paused?'Pausada':'Jornada ativa'}</span><small>Início hoje às</small><strong>${fmtTime(start)}</strong></div>
    </div>
    <div class="cv-metrics">
      ${metric(uiIcon('route'),'Distância hoje',fmtKm(summary.distance_meters))}
      ${metric(uiIcon('clock'),'Tempo em movimento',fmtDuration(summary.movement_seconds))}
      ${metric(uiIcon('gps'),'GPS','<span data-gps-status>'+gpsStatusLabel()+'</span>',true,true)}
      ${metric(uiIcon('battery'),'Bateria',batteryLevel==null?'—':batteryLevel+'%',true)}
      ${metric(uiIcon('salesTrend'),'Vendas hoje',String(sales))}
      ${metric(uiIcon('team'),'Sua equipe',teamName())}
    </div>
    <div class="cv-actions">
      <button class="cv-action primary" data-go="sales" data-sales-mode="new"><span class="cv-action-icon">${uiIcon('sale')}</span><b>Nova Venda</b><small>Registrar agora ›</small></button>
      <button class="cv-action dark" data-go="tracking"><span class="cv-action-icon">${uiIcon('map')}</span><b>Mapa do Dia</b><small>Ver roteiro ›</small></button>
      <button class="cv-action soft" data-go="tracking"><span class="cv-action-icon">${uiIcon('journey')}</span><b>Minha Jornada</b><small>Detalhes de hoje ›</small></button>
      <button class="cv-action soft" id="cvPauseHome"><span class="cv-action-icon">${uiIcon(paused?'play':'pause')}</span><b>${paused?'Retomar':'Pausar'}</b><small>${paused?'Continuar jornada':'Fazer uma pausa'} ›</small></button>
    </div>
    <div class="cv-section-title cv-home-commercial-title"><h3>Produção comercial</h3><button id="cvOpenSalesOverview" type="button">Ver vendas ›</button></div>
    <div class="cv-card cv-home-commercial">
      <div><small>Vendas no mês</small><strong>${Number(commercial.total||0)}</strong></div>
      <div><small>Aprovadas</small><strong>${Number(commercial.approved||0)}</strong></div>
      <div><small>Em análise</small><strong>${Number(commercial.analysis||0)}</strong></div>
      <p>${commercial.error?'Dados comerciais temporariamente indisponíveis.':'Sincronizado com TechNET Vendas e registros do Imperium visíveis para sua conta.'}</p>
    </div>
    <div class="cv-section-title"><h3>Equipe responsável</h3><span>Dados reais do perfil</span></div>
    <div class="cv-card cv-next"><div class="cv-next-row"><div class="cv-next-time">${esc(teamName())}</div><div class="cv-next-copy"><b>${esc(profile.full_name)}</b><small>Supervisor: ${esc(supervisor)}</small></div></div></div>
  </section>`;
  content.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{if(b.dataset.salesMode==='new')salesViewMode='new';navigate(b.dataset.go)});
  const gpsCard=content.querySelector('[data-gps-status]')?.closest('.cv-metric');
  if(gpsCard){
    gpsCard.classList.add('cv-metric-action');gpsCard.tabIndex=0;gpsCard.setAttribute('role','button');gpsCard.setAttribute('aria-label','Abrir status do GPS');
    gpsCard.onclick=()=>navigate('tracking');gpsCard.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();navigate('tracking')}};
  }
  $('#cvPauseHome').onclick=()=>togglePause();
  $('#cvOpenSalesOverview').onclick=()=>{salesViewMode='overview';navigate('sales')};
}
function metric(icon,label,value,green=false,rawValue=false){return `<div class="cv-card cv-metric ${green?'green':''}"><span class="cv-metric-icon">${icon}</span><small>${esc(label)}</small><strong class="${green?'cv-green':''}">${rawValue?value:esc(value)}</strong></div>`}

const trackingFilterState={period:'today'};
let trackingViewRoute=[],trackingViewPosition=null,trackingViewBattery=null;
function trackingPeriodRange(period=trackingFilterState.period){
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const start=new Date(today),end=new Date(today);
  end.setDate(end.getDate()+1);
  if(period==='yesterday'){
    start.setDate(start.getDate()-1);
    end.setTime(today.getTime());
  }else if(period==='week'){
    start.setDate(start.getDate()-6);
  }
  const last=new Date(end.getTime()-1);
  const shortFmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});
  const fullFmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  const label=period==='yesterday'?'Ontem':period==='week'?'7 dias':'Hoje';
  const detail=period==='week'?shortFmt.format(start)+' – '+shortFmt.format(last):fullFmt.format(start);
  const dayKey=date=>{const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return y+'-'+m+'-'+d};
  return {period,start,end,startDay:dayKey(start),endDay:dayKey(last),label,detail,historical:period!=='today'};
}
function trackingDisplayedRoute(){return trackingFilterState.period==='today'?getRoute():trackingViewRoute}
function trackingDisplayedPosition(){return trackingFilterState.period==='today'?currentPosition:trackingViewPosition}
function trackingDisplayedBattery(){return trackingFilterState.period==='today'?batteryLevel:trackingViewBattery}
async function loadTrackingPeriodView(){
  const range=trackingPeriodRange();
  if(!range.historical){
    trackingViewRoute=[];trackingViewPosition=null;trackingViewBattery=null;
    return {range,summary:await dailySummary()};
  }
  const userId=session?.user?.id;
  if(!userId)return {range,summary:{distance_meters:0,movement_seconds:0,stopped_seconds:0}};
  const rows=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await sb.from('tv_consultivo_positions')
      .select('latitude,longitude,accuracy,speed,heading,battery_level,recorded_at')
      .eq('user_id',userId).gte('recorded_at',range.start.toISOString()).lt('recorded_at',range.end.toISOString())
      .order('recorded_at',{ascending:true}).range(offset,offset+999);
    if(error)throw error;
    rows.push(...(data||[]));
    if((data||[]).length<1000)break;
  }
  if(session?.user?.id!==userId)return {range,summary:{distance_meters:0,movement_seconds:0,stopped_seconds:0}};
  trackingViewRoute=rows.filter(p=>p.latitude!=null&&p.longitude!=null).map(p=>({
    lat:Number(p.latitude),lng:Number(p.longitude),accuracy:Number(p.accuracy)||null,speed:Number(p.speed)||0,
    heading:Number(p.heading)||null,t:Date.parse(p.recorded_at)
  })).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.t));
  trackingViewPosition=trackingViewRoute.at(-1)||null;
  trackingViewBattery=rows.at(-1)?.battery_level??null;
  const {data:summaries,error:summaryError}=await sb.from('tv_consultivo_daily_summaries')
    .select('distance_meters,movement_seconds,stopped_seconds,position_count,last_position_at,day')
    .eq('user_id',userId).gte('day',range.startDay).lte('day',range.endDay).limit(20);
  if(summaryError)console.warn('consultivo tracking summary filter',summaryError);
  const summary=(summaries||[]).reduce((acc,row)=>({
    distance_meters:acc.distance_meters+Number(row.distance_meters||0),
    movement_seconds:acc.movement_seconds+Number(row.movement_seconds||0),
    stopped_seconds:acc.stopped_seconds+Number(row.stopped_seconds||0),
    position_count:acc.position_count+Number(row.position_count||0)
  }),{distance_meters:0,movement_seconds:0,stopped_seconds:0,position_count:0});
  if(!summary.position_count&&trackingViewRoute.length){
    summary.distance_meters=routeDistance(trackingViewRoute);
    summary.movement_seconds=routeMovementSeconds(trackingViewRoute);
  }
  return {range,summary};
}
async function renderTracking(){
  const [view,supervisor]=await Promise.all([loadTrackingPeriodView(),supervisorName()]);
  if(currentScreen!=='tracking')return;
  const {range,summary}=view,paused=isPaused(),historical=range.historical;
  const position=trackingDisplayedPosition(),viewBattery=trackingDisplayedBattery();
  const movingMode=position?.speed!=null&&position.speed>2.5?'Veículo':'A pé';
  if(map){try{map.remove()}catch{}map=null}
  content.innerHTML=`<section class="cv-screen cv-tracking-screen">
    <div class="cv-card cv-tracking-journey">
      <div class="cv-tracking-state">
        <div class="cv-pin">${historical?uiIcon('calendar'):paused?uiIcon('pause'):uiIcon('target')}</div>
        <div><h2>${historical?'Histórico de rastreamento':paused?'Rastreamento pausado':'Em jornada'}</h2><p>${historical?'Visualizando a rota registrada no período selecionado.':paused?'Toque em retomar para voltar a registrar sua rota.':'Acompanhe a rota registrada pelo aplicativo CONSULTIVO.'}</p></div>
      </div>
      <button class="cv-tracking-team" id="cvTrackingTeam" type="button" aria-label="Abrir equipe">
        <span class="cv-tracking-team-icon">${uiIcon('team')}</span>
        <div><strong>${esc(teamName())}</strong><small>Supervisor: ${esc(supervisor)}</small></div>
        <span class="cv-tracking-chevron">${uiIcon('chevronRight')}</span>
      </button>
    </div>
    <div class="cv-card cv-map-card cv-tracking-map-card">
      <div class="cv-tracking-map-wrap">
        <div id="cvMap"></div>
        <label class="cv-tracking-date" for="cvTrackingPeriod">${uiIcon('calendar')}<b>${esc(range.label)}, ${esc(range.detail)}</b><span>${uiIcon('chevronDown')}</span>
          <select id="cvTrackingPeriod" class="cv-tracking-period-select" aria-label="Filtrar período do rastreamento">
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="week">Últimos 7 dias</option>
          </select>
        </label>
        <div class="cv-tracking-map-controls">
          <button id="cvCenterMapFloat" type="button" aria-label="Centralizar no ponto selecionado">${uiIcon('target')}</button>
          <button id="cvToggleRoute" type="button" aria-label="Mostrar ou ocultar rota">${uiIcon('layers')}</button>
          <button id="cvFitRoute" type="button" aria-label="Ver rota completa">${uiIcon('nav')}</button>
        </div>
        <div id="cvGpsAccuracy" class="cv-tracking-gps-badge">${position?.accuracy?Math.round(position.accuracy)+' m'+(historical?' • histórico':''):historical?'Sem pontos no período':'Buscando GPS…'}</div>
      </div>
    </div>
    <div class="cv-metrics cv-tracking-metrics">
      ${metric(uiIcon('route'),historical?'Distância no período':'Distância de hoje',fmtKm(summary.distance_meters))}
      ${metric(uiIcon('clock'),'Tempo em movimento',fmtDuration(summary.movement_seconds))}
      ${metric(uiIcon('pause'),'Tempo parado',fmtDuration(summary.stopped_seconds||0))}
      ${metric(uiIcon('walk'),'Modo detectado',movingMode)}
      ${metric(uiIcon('battery'),historical?'Última bateria':'Bateria',viewBattery==null?'—':Math.round(viewBattery)+'%',true)}
      ${metric(uiIcon('signal'),historical?'Precisão do último ponto':'Qualidade do GPS',accuracyLabel(position?.accuracy),true)}
    </div>
    <div class="cv-map-actions cv-tracking-actions">
      <button class="cv-big-btn" id="cvPauseTracking"><span>${uiIcon(paused?'play':'pause')}</span>${paused?'Retomar rastreamento':'Pausar rastreamento'}</button>
      <button class="cv-big-btn primary" id="cvRouteComplete"><span>${uiIcon('route')}</span>Ver rota completa <b>${uiIcon('chevronRight')}</b></button>
    </div>
  </section>`;
  setupTrackingMap();
  const period=$('#cvTrackingPeriod');period.value=trackingFilterState.period;
  period.onchange=()=>{
    trackingFilterState.period=period.value;
    renderTracking().catch(error=>{console.error('consultivo tracking filter',error);toast('Não foi possível aplicar o período agora.')});
  };
  $('#cvTrackingTeam').onclick=()=>navigate('team');
  $('#cvPauseTracking').onclick=()=>togglePause();
  $('#cvCenterMapFloat').onclick=()=>centerTrackingMap();
  $('#cvToggleRoute').onclick=()=>toggleTrackingRoute();
  $('#cvFitRoute').onclick=()=>fitTrackingRoute();
  $('#cvRouteComplete').onclick=()=>fitTrackingRoute();
}
function setupTrackingMap(){
  if(!window.L)return;
  if(map){try{map.remove()}catch{}map=null}
  const position=trackingDisplayedPosition(),route=trackingDisplayedRoute(),center=position?[position.lat,position.lng]:(route[0]?[route[0].lat,route[0].lng]:[-5.7945,-35.211]);
  map=L.map('cvMap',mobileMapOptions()).setView(center,route.length?15:13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);refreshTrackingMap();
}
function refreshTrackingMap(){
  if(!map)return;
  if(map._cvLayers){map._cvLayers.forEach(x=>map.removeLayer(x))}
  const layers=[],route=trackingDisplayedRoute(),position=trackingDisplayedPosition(),showRoute=map._cvRouteVisible!==false;
  if(route.length>1&&showRoute){
    const line=L.polyline(route.map(p=>[p.lat,p.lng]),{color:'#ed0d1b',weight:5,opacity:.92,lineCap:'round',lineJoin:'round'}).addTo(map);layers.push(line);
    const milestoneCount=Math.min(5,Math.max(2,Math.floor(route.length/3)));
    const used=new Set();
    for(let n=1;n<=milestoneCount;n++){
      const idx=Math.min(route.length-1,Math.round((n/(milestoneCount+1))*(route.length-1)));
      if(used.has(idx))continue;used.add(idx);
      const p=route[idx];
      const marker=L.marker([p.lat,p.lng],{interactive:false,icon:L.divIcon({className:'cv-route-number-wrap',html:'<span class="cv-route-number">'+n+'</span>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(map);
      layers.push(marker);
    }
  }
  if(position){
    const acc=L.circle([position.lat,position.lng],{radius:position.accuracy||15,color:'#ed0d1b',weight:1,fillColor:'#ed0d1b',fillOpacity:.12}).addTo(map);
    const tooltip=trackingFilterState.period==='today'?'Você aqui':'Último ponto do período';
    const dot=L.circleMarker([position.lat,position.lng],{radius:10,color:'#fff',weight:4,fillColor:'#ed0d1b',fillOpacity:1}).addTo(map).bindTooltip(tooltip,{permanent:true,direction:'top',offset:[0,-13],className:'cv-you-here'});
    layers.push(acc,dot);
    const a=$('#cvGpsAccuracy');if(a)a.textContent=Math.round(position.accuracy||0)+' m'+(trackingFilterState.period==='today'?'':' • histórico')
  }
  map._cvLayers=layers;
}
function fitTrackingRoute(){
  if(!map)return;
  const route=trackingDisplayedRoute(),position=trackingDisplayedPosition();
  const pts=route.map(p=>[p.lat,p.lng]);
  if(!pts.length&&position)pts.push([position.lat,position.lng]);
  if(pts.length>1)map.fitBounds(L.latLngBounds(pts).pad(.18),{animate:true});
  else centerTrackingMap();
}
function toggleTrackingRoute(){
  if(!map)return;
  map._cvRouteVisible=map._cvRouteVisible===false;
  refreshTrackingMap();
  toast(map._cvRouteVisible?'Rota exibida.':'Rota ocultada.');
}
function centerTrackingMap(){
  const position=trackingDisplayedPosition();
  if(map&&position){map.setView([position.lat,position.lng],17);return}
  if(trackingFilterState.period!=='today'){toast('Nenhum ponto registrado neste período.');return}
  ensureNativeTrackingRunning();geoStatus='requesting';updateGpsStatusUi();toast('Reativando GPS e buscando sua localização.');
}

async function togglePause(){
  if(!nativeTrackingAvailable()){toast('Pause ou retome o rastreamento no aplicativo CONSULTIVO.');return}
  const paused=!isPaused();
  setPaused(paused);
  sendTrackingState(paused);
  toast(paused?'Rastreamento pausado.':'Rastreamento retomado.');
  navigate(currentScreen==='home'?'home':'tracking');
}

const salesViewState={month:'',limit:60};
function consultivoMonthKey(date=new Date()){return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')}
function consultivoMonthRange(value){
  const key=/^\d{4}-\d{2}$/.test(String(value||''))?String(value):consultivoMonthKey();
  const [year,month]=key.split('-').map(Number),next=new Date(year,month,1);
  return {key,start:key+'-01',end:next.getFullYear()+'-'+String(next.getMonth()+1).padStart(2,'0')+'-01'};
}
function consultivoMonthOptions(value){
  const selected=consultivoMonthRange(value).key,now=new Date(),fmt=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}),out=[];
  for(let i=0;i<12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=consultivoMonthKey(d),label=fmt.format(d).replace(/^./,c=>c.toUpperCase());
    out.push('<option value="'+key+'" '+(key===selected?'selected':'')+'>'+esc(label)+'</option>');
  }
  return out.join('');
}
async function consultivoSalesPageMonth({month=salesViewState.month||consultivoMonthKey(),limit=salesViewState.limit}={}){
  const range=consultivoMonthRange(month),args={p_month_start:range.start,p_month_end:range.end,p_city:null,p_status:null,p_query:null,p_consultant:null,p_team:null,p_leader:null,p_limit:Number(limit||60),p_offset:0};
  const {data,error}=await sb.rpc('tv_sales_page_month',args);
  if(error)throw error;
  return data||{items:[],total:0,approved:0,analysis:0,pending:0,cancelled:0,drafts:0};
}
async function safeConsultivoSalesPageMonth(opts={}){
  try{return await consultivoSalesPageMonth(opts)}catch(error){console.warn('consultivo sales overview',error);return {items:[],total:0,approved:0,analysis:0,pending:0,cancelled:0,drafts:0,error:true}}
}
function consultivoSaleStatus(status){
  return {draft:['Rascunho','draft'],submitted:['Enviada','sent'],under_review:['Em análise','analysis'],pending_correction:['Correção','warn'],approved:['Aprovada','ok'],sync_pending:['Enviando','analysis'],synced:['Sincronizada','ok'],cancelled:['Cancelada','bad']}[String(status||'')]||[String(status||'Sem status'),'neutral'];
}
function consultivoSaleDate(value){
  if(!value)return '—';
  const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'2-digit'}).format(d);
}
function consultivoSaleCard(sale){
  const status=consultivoSaleStatus(sale.status),ref=String(sale.imperium_proposal||sale.imperium_contract||sale.contract_number||'').trim();
  const product=String(sale.real_product_summary||sale.product_summary||'Produto não informado').trim();
  const source=sale.source==='imperium'?'Imperium':'TechNET';
  const impId=sale.imperium_sale_id?(' · ID '+sale.imperium_sale_id):'';
  return `<article class="cv-card cv-commercial-sale">
    <div class="cv-commercial-sale-head"><div><small>${esc(source)}${esc(impId)}</small><strong>${esc(sale.customer_name||'Cliente')}</strong></div><span class="cv-sale-status ${status[1]}">${esc(status[0])}</span></div>
    <div class="cv-commercial-sale-meta"><span>${consultivoSaleDate(sale.sold_at||sale.created_at)}</span><span>${esc(sale.city_name||'Cidade não informada')}</span></div>
    <div class="cv-commercial-sale-product">${esc(product)}</div>
    <div class="cv-commercial-sale-foot"><span>${ref?'Proposta/contrato '+esc(ref):'Sem referência Imperium'}</span><b>${esc(sale.consultant_name||sale.imperium_consultant_name||profile?.full_name||'')}</b></div>
  </article>`;
}
async function renderSalesForm(){
  salesViewMode='new';
  content.innerHTML=`<section class="cv-screen cv-sales-screen"><div class="cv-sales-form-head"><button id="cvBackSales" class="cv-sales-back" type="button">${uiIcon('chevronRight')}<span>Minhas vendas</span></button><div><strong>Nova venda</strong><small>Cadastro integrado ao TechNET Vendas e Imperium.</small></div></div><div class="cv-sale-shell"><div id="cvSaleHost"></div></div></section>`;
  $('#cvBackSales').onclick=()=>{salesViewMode='overview';renderSales()};
  const host=$('#cvSaleHost');
  try{
    await renderNewSaleAdvanced({sb,content:host,session,profile,toast,setTitle:()=>{},navigate:(page)=>{
      if(page==='new-sale')renderSalesForm();
      else if(page==='my-sales'){salesViewMode='overview';renderSales()}
      else if(page==='team')navigate('team');
      else navigate('home');
    }});
  }catch(error){
    console.error(error);
    host.innerHTML=`<div class="cv-empty">Não foi possível abrir o formulário de venda agora.<br>${esc(error.message)}</div>`;
  }
}
async function renderSales(){
  if(salesViewMode==='new')return renderSalesForm();
  const requestScreen=currentScreen;
  salesViewState.month=salesViewState.month||consultivoMonthKey();
  const pg=await consultivoSalesPageMonth({month:salesViewState.month});
  if(currentScreen!==requestScreen||currentScreen!=='sales')return;
  const rows=Array.isArray(pg.items)?pg.items:[],total=Number(pg.total||0),approved=Number(pg.approved||0),analysis=Number(pg.analysis||0),drafts=Number(pg.drafts||0);
  const roleCopy=profile?.role==='supervisor'?'Produção visível da equipe':'Suas vendas sincronizadas';
  content.innerHTML=`<section class="cv-screen cv-sales-screen">
    <div class="cv-card cv-commercial-hero">
      <div><span class="cv-commercial-kicker">TECHNET + IMPERIUM</span><h2>Produção comercial</h2><p>${esc(roleCopy)} no mesmo fluxo usado pelo painel comercial.</p></div>
      <button id="cvNewSale" class="cv-commercial-new" type="button">${uiIcon('sale')}<span>Nova venda</span></button>
    </div>
    <div class="cv-commercial-toolbar">
      <label class="cv-card cv-commercial-month" for="cvSalesMonth"><span>${uiIcon('calendar')}</span><div><small>Período</small><strong>${esc(new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(salesViewState.month+'-01T12:00:00')).replace(/^./,c=>c.toUpperCase()))}</strong></div>${uiIcon('chevronDown')}<select id="cvSalesMonth" aria-label="Filtrar vendas por mês">${consultivoMonthOptions(salesViewState.month)}</select></label>
      <button id="cvRefreshSales" class="cv-card cv-commercial-refresh" type="button" aria-label="Atualizar vendas">${uiIcon('target')}<span>Atualizar</span></button>
    </div>
    <div class="cv-commercial-kpis">
      <div class="cv-card"><small>Vendas</small><strong>${total}</strong><span>No mês</span></div>
      <div class="cv-card ok"><small>Aprovadas</small><strong>${approved}</strong><span>${total?Math.round(approved/total*100):0}% do total</span></div>
      <div class="cv-card analysis"><small>Em análise</small><strong>${analysis}</strong><span>BackOffice</span></div>
      <div class="cv-card"><small>Rascunhos</small><strong>${drafts}</strong><span>Em preenchimento</span></div>
    </div>
    <div class="cv-section-title cv-commercial-title"><div><h3>Vendas recentes</h3><span>${rows.length} de ${total} registro(s) · dados protegidos pelo mesmo acesso do site</span></div></div>
    <div class="cv-commercial-list">${rows.length?rows.map(consultivoSaleCard).join(''):'<div class="cv-card cv-empty">Nenhuma venda encontrada neste mês.</div>'}</div>
  </section>`;
  $('#cvNewSale').onclick=()=>{salesViewMode='new';renderSalesForm()};
  $('#cvRefreshSales').onclick=()=>renderSales().catch(error=>{console.error(error);toast('Não foi possível atualizar as vendas agora.')});
  const month=$('#cvSalesMonth');
  month.value=salesViewState.month;
  month.onchange=()=>{salesViewState.month=month.value;renderSales().catch(error=>{console.error('consultivo sales month',error);toast('Não foi possível carregar este mês.')})};
}


function teamPositionState(pos,paused=false){
  if(paused)return 'paused';
  if(!pos)return 'offline';
  const age=Date.now()-new Date(pos.recorded_at).getTime();
  return age<=20*60*1000?'active':'stale';
}
function teamActivityPercent(summary){
  const moving=Math.max(0,Number(summary?.movement_seconds||0));
  const stopped=Math.max(0,Number(summary?.stopped_seconds||0));
  const total=moving+stopped;
  return total?Math.max(0,Math.min(100,Math.round(moving/total*100))):0;
}
function teamInitials(name){
  return String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'?';
}

const teamFilterState={period:'today',status:'all',sort:'sales'};
function localDateKey(date=new Date()){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+d;
}
function teamPeriodRange(period=teamFilterState.period){
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const start=new Date(today),end=new Date(today);
  end.setDate(end.getDate()+1);
  if(period==='yesterday'){
    start.setDate(start.getDate()-1);
    end.setTime(today.getTime());
  }else if(period==='week'){
    start.setDate(start.getDate()-6);
  }
  const last=new Date(end.getTime()-1);
  const shortFmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'});
  const fullFmt=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'});
  const label=period==='yesterday'?'Ontem':period==='week'?'7 dias':'Hoje';
  const detail=period==='week'?shortFmt.format(start)+' – '+shortFmt.format(last):fullFmt.format(start);
  return {period,start,end,startDay:localDateKey(start),endDay:localDateKey(last),label,detail,historical:period!=='today'};
}
function teamStatusFilterLabel(value){
  return {all:'Todos',active:'Em jornada',paused:'Pausados',stale:'Posição antiga',offline:'Sem posição',unlinked:'Sem app'}[value]||'Todos';
}
function aggregateTeamSummaries(rows){
  const byUser=new Map();
  for(const row of rows||[]){
    if(!row?.user_id)continue;
    const current=byUser.get(row.user_id)||{user_id:row.user_id,distance_meters:0,movement_seconds:0,stopped_seconds:0,position_count:0,last_position_at:null};
    current.distance_meters+=Number(row.distance_meters||0);
    current.movement_seconds+=Number(row.movement_seconds||0);
    current.stopped_seconds+=Number(row.stopped_seconds||0);
    current.position_count+=Number(row.position_count||0);
    if(row.last_position_at&&(!current.last_position_at||new Date(row.last_position_at)>new Date(current.last_position_at)))current.last_position_at=row.last_position_at;
    byUser.set(row.user_id,current);
  }
  return byUser;
}
function teamStateForFilter(person,latest,pausedUsers,historical=false){
  if(person.hierarchy_only)return 'unlinked';
  if(historical)return latest.has(person.user_id)?'active':'offline';
  return teamPositionState(latest.get(person.user_id),pausedUsers.has(person.user_id));
}
function sortTeamRows(rows,saleCount,latest,summaryByUser){
  const byName=(a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR');
  const sorted=[...rows];
  if(teamFilterState.sort==='name')return sorted.sort(byName);
  if(teamFilterState.sort==='activity')return sorted.sort((a,b)=>teamActivityPercent(summaryByUser.get(b.user_id))-teamActivityPercent(summaryByUser.get(a.user_id))||byName(a,b));
  if(teamFilterState.sort==='battery')return sorted.sort((a,b)=>Number(latest.get(b.user_id)?.battery_level??-1)-Number(latest.get(a.user_id)?.battery_level??-1)||byName(a,b));
  return sorted.sort((a,b)=>saleCount(b)-saleCount(a)||byName(a,b));
}

async function renderTeam(){
  const userId=session?.user?.id,range=teamPeriodRange();
  const profilesQuery=sb.from('tv_profiles').select('user_id,full_name,role,team_id,supervisor_id,active').eq('active',true).in('role',['consultant','supervisor']);
  if(profile.role==='supervisor'&&profile.team_id)profilesQuery.eq('team_id',profile.team_id);
  if(profile.role==='consultant')profilesQuery.eq('user_id',profile.user_id);
  const hierarchyPromise=profile.role==='supervisor'
    ? sb.from('tv_commercial_hierarchy').select('leader,seller').eq('active',true).eq('leader',profile.full_name).order('seller')
    : Promise.resolve({data:[],error:null});
  const [{data:people,error:peopleError},{data:hierarchy,error:hierarchyError}]=await Promise.all([
    profilesQuery.limit(80),
    hierarchyPromise
  ]);
  if(peopleError)throw peopleError;
  if(hierarchyError)throw hierarchyError;
  const rows=[...(people||[])].filter(p=>p.role==='consultant');
  const normalizeName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const realNames=new Set(rows.map(p=>normalizeName(p.full_name)));
  const seenHierarchy=new Set();
  for(const item of hierarchy||[]){
    const seller=String(item.seller||'').trim(),key=normalizeName(seller);
    if(!key||realNames.has(key)||seenHierarchy.has(key))continue;
    seenHierarchy.add(key);
    rows.push({user_id:'hierarchy:'+key,full_name:seller,role:'consultant',team_id:profile.team_id||null,supervisor_id:profile.user_id,active:true,hierarchy_only:true});
  }
  const realUserIds=new Set(rows.filter(p=>!p.hierarchy_only).map(p=>p.user_id));
  const pausesPromise=range.historical
    ? Promise.resolve({data:[],error:null})
    : sb.from('tv_consultivo_pauses').select('user_id,started_at,ended_at').is('ended_at',null).limit(200);
  const [salesRes,positionsRes,pausesRes,summariesRes]=await Promise.all([
    sb.from('tv_sales').select('consultant_id,commercial_seller_name,imperium_consultant_name,created_at').gte('created_at',range.start.toISOString()).lt('created_at',range.end.toISOString()).limit(2000),
    sb.from('tv_consultivo_positions').select('user_id,latitude,longitude,recorded_at,battery_level').gte('recorded_at',range.start.toISOString()).lt('recorded_at',range.end.toISOString()).order('recorded_at',{ascending:false}).limit(range.period==='week'?4000:1800),
    pausesPromise,
    sb.from('tv_consultivo_daily_summaries').select('user_id,distance_meters,movement_seconds,stopped_seconds,position_count,last_position_at,day').gte('day',range.startDay).lte('day',range.endDay).limit(1000)
  ]);
  const sales=salesRes.error?[]:(salesRes.data||[]);
  const positions=positionsRes.error?[]:(positionsRes.data||[]);
  const pauses=pausesRes.error?[]:(pausesRes.data||[]);
  const summaries=summariesRes.error?[]:(summariesRes.data||[]);
  if(salesRes.error)console.warn('consultivo team sales',salesRes.error);
  if(positionsRes.error)console.warn('consultivo team positions',positionsRes.error);
  if(pausesRes.error)console.warn('consultivo team pauses',pausesRes.error);
  if(summariesRes.error)console.warn('consultivo team summaries',summariesRes.error);
  if(currentScreen!=='team'||session?.user?.id!==userId)return;
  const byName=new Map(),byUserId=new Map();
  const nameKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  for(const sale of sales){
    if(sale.consultant_id)byUserId.set(sale.consultant_id,(byUserId.get(sale.consultant_id)||0)+1);
    const seller=String(sale.commercial_seller_name||sale.imperium_consultant_name||'').trim();
    if(seller){const key=nameKey(seller);byName.set(key,(byName.get(key)||0)+1)}
  }
  const latest=new Map();
  for(const position of positions){if(realUserIds.has(position.user_id)&&!latest.has(position.user_id))latest.set(position.user_id,position)}
  const pausedUsers=new Set((pauses||[]).filter(p=>realUserIds.has(p.user_id)).map(p=>p.user_id));
  const summaryByUser=aggregateTeamSummaries((summaries||[]).filter(s=>realUserIds.has(s.user_id)));
  const saleCount=p=>(byUserId.get(p.user_id)||byName.get(nameKey(p.full_name))||0);
  const stateOf=p=>teamStateForFilter(p,latest,pausedUsers,range.historical);
  const filteredRows=rows.filter(p=>teamFilterState.status==='all'||stateOf(p)===teamFilterState.status);
  const sortedRows=sortTeamRows(filteredRows,saleCount,latest,summaryByUser);
  const activeCount=filteredRows.filter(p=>stateOf(p)==='active').length;
  const pausedCount=filteredRows.filter(p=>stateOf(p)==='paused').length;
  const teamDistance=filteredRows.reduce((sum,p)=>sum+Number(summaryByUser.get(p.user_id)?.distance_meters||0),0);
  const salesLabel=range.period==='today'?'Vendas hoje':'Vendas período';
  const mapCountLabel=range.historical?'com registro':'em campo';
  const statusLabel=teamStatusFilterLabel(teamFilterState.status);
  content.innerHTML=`<section class="cv-screen cv-team-screen">
    <div class="cv-team-filters">
      <label class="cv-card cv-team-filter" for="cvTeamStatus">
        <span class="cv-team-filter-icon">${uiIcon('team')}</span>
        <div><strong>${esc(teamName())}</strong><small>${esc(statusLabel)} · ${filteredRows.length}/${rows.length}</small></div>
        <span class="cv-team-filter-chevron">${uiIcon('chevronDown')}</span>
        <select id="cvTeamStatus" class="cv-team-filter-select" aria-label="Filtrar consultores por status">
          <option value="all">Todos os consultores</option>
          <option value="active">Em jornada / com registro</option>
          <option value="paused">Pausados</option>
          <option value="stale">Posição antiga</option>
          <option value="offline">Sem posição</option>
          <option value="unlinked">Sem app vinculado</option>
        </select>
      </label>
      <label class="cv-card cv-team-filter" for="cvTeamPeriod">
        <span class="cv-team-filter-icon red">${uiIcon('calendar')}</span>
        <div><strong>${esc(range.label)}</strong><small>${esc(range.detail)}</small></div>
        <span class="cv-team-filter-chevron">${uiIcon('chevronDown')}</span>
        <select id="cvTeamPeriod" class="cv-team-filter-select" aria-label="Filtrar período da equipe">
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="week">Últimos 7 dias</option>
        </select>
      </label>
    </div>
    <div class="cv-card cv-team-map-card">
      <div class="cv-team-map-wrap">
        <div id="cvTeamMap"></div>
        <div class="cv-team-map-count"><span>${uiIcon('team')}</span><div><b>${activeCount} consultor(es)</b><small>${mapCountLabel}</small></div></div>
        <div class="cv-team-map-controls">
          <button id="cvTeamFit" type="button" aria-label="Enquadrar equipe">${uiIcon('nav')}</button>
          <button id="cvTeamCenter" type="button" aria-label="Centralizar equipe">${uiIcon('target')}</button>
        </div>
      </div>
    </div>
    <div class="cv-metrics cv-team-summary">
      ${metric(uiIcon('team'),range.historical?'Com registro':'Em jornada',String(activeCount),true)}
      ${metric(uiIcon('pause'),'Pausado',String(pausedCount))}
      ${metric(uiIcon('route'),range.historical?'Distância no período':'Distância da equipe',fmtKm(teamDistance))}
    </div>
    <div class="cv-team-list-heading">
      <h3>Consultores da equipe</h3>
      <label class="cv-team-sort" for="cvTeamSort">Ordenar por
        <select id="cvTeamSort" aria-label="Ordenar consultores">
          <option value="sales">Vendas</option>
          <option value="activity">Atividade</option>
          <option value="battery">Bateria</option>
          <option value="name">Nome</option>
        </select>${uiIcon('chevronDown')}
      </label>
    </div>
    <div class="cv-team-list cv-team-ranking">${sortedRows.length?sortedRows.map((p,i)=>personRow(p,i,byName,latest,pausedUsers,summaryByUser,byUserId,{historical:range.historical,salesLabel})).join(''):'<div class="cv-empty">Nenhum consultor encontrado com estes filtros.</div>'}</div>
  </section>`;
  setupTeamMap(sortedRows,latest,pausedUsers);
  const fit=()=>fitTeamMap(sortedRows,latest);
  $('#cvTeamFit').onclick=fit;
  $('#cvTeamCenter').onclick=fit;
  const bindFilter=(selector,key)=>{
    const control=$(selector);
    if(!control)return;
    control.value=teamFilterState[key];
    control.onchange=()=>{
      teamFilterState[key]=control.value;
      renderTeam().catch(error=>{console.error('consultivo team filter',error);toast('Não foi possível aplicar o filtro agora.')});
    };
  };
  bindFilter('#cvTeamStatus','status');
  bindFilter('#cvTeamPeriod','period');
  bindFilter('#cvTeamSort','sort');
}

function personRow(p,i,byName,latest,pausedUsers,summaryByUser,byUserId=new Map(),options={}){
  const key=String(p.full_name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
  const count=byUserId.get(p.user_id)||byName.get(key)||0,pos=latest.get(p.user_id),battery=pos?.battery_level;
  const state=teamStateForFilter(p,latest,pausedUsers,Boolean(options.historical)),summary=summaryByUser.get(p.user_id),activity=teamActivityPercent(summary);
  const statusLabel=p.hierarchy_only?'Aguardando acesso ao app':options.historical?(pos?'Com registro no período':'Sem registro no período'):state==='paused'?'Pausado':state==='active'?'Em jornada':state==='stale'?'Posição antiga':'Sem posição hoje';
  const initials=teamInitials(p.full_name);
  return `<div class="cv-person cv-team-person state-${state}">
    <div class="cv-team-rank">${i+1}</div>
    <div class="cv-avatar cv-team-avatar">${esc(initials)}<i></i></div>
    <div class="cv-team-person-copy"><b>${esc(p.full_name)}</b><small>● ${esc(statusLabel)}</small></div>
    <div class="cv-person-stat sales"><strong>${count}</strong><span>${esc(options.salesLabel||'Vendas hoje')}</span></div>
    <div class="cv-person-stat battery"><strong>${battery==null?'—':Math.round(battery)+'%'}</strong><span>Bateria</span></div>
    <div class="cv-person-stat activity"><div class="cv-team-progress" style="--cv-team-pct:${activity}%"><i></i></div><strong>${activity}%</strong><span>Atividade</span></div>
    <div class="cv-team-row-chevron">${uiIcon('chevronRight')}</div>
  </div>`;
}

function setupTeamMap(rows,latest,pausedUsers){
  if(!window.L)return;
  if(teamMap){try{teamMap.remove()}catch{}teamMap=null}
  const pts=rows.map(p=>latest.get(p.user_id)).filter(Boolean);
  const center=pts[0]?[pts[0].latitude,pts[0].longitude]:(currentPosition?[currentPosition.lat,currentPosition.lng]:[-5.7945,-35.211]);
  teamMap=L.map('cvTeamMap',mobileMapOptions()).setView(center,pts.length?13:11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(teamMap);
  for(const p of rows){
    const pos=latest.get(p.user_id);if(!pos)continue;
    const state=teamPositionState(pos,pausedUsers.has(p.user_id)),initials=esc(teamInitials(p.full_name));
    const icon=L.divIcon({className:'cv-team-marker-wrap',html:`<div class="cv-team-map-avatar state-${state}">${initials}<i></i></div>`,iconSize:[46,46],iconAnchor:[23,23]});
    L.marker([pos.latitude,pos.longitude],{icon}).addTo(teamMap).bindTooltip(esc(p.full_name),{direction:'top',offset:[0,-20]});
  }
  fitTeamMap(rows,latest);
}
function fitTeamMap(rows,latest){
  if(!teamMap)return;
  const pts=rows.map(p=>latest.get(p.user_id)).filter(Boolean).map(p=>[p.latitude,p.longitude]);
  if(pts.length>1)teamMap.fitBounds(L.latLngBounds(pts).pad(.18),{animate:true});
  else if(pts.length===1)teamMap.setView(pts[0],15,{animate:true});
  else if(currentPosition)teamMap.setView([currentPosition.lat,currentPosition.lng],15,{animate:true});
}
window.addEventListener('beforeunload',()=>{if(nativeSnapshotTimer!=null)clearInterval(nativeSnapshotTimer);if(serverTrackingTimer!=null)clearInterval(serverTrackingTimer)});
init().catch(e=>{console.error(e);boot.style.display='none';app.hidden=false;content.innerHTML=`<section class="cv-screen"><div class="cv-card cv-empty">Falha ao iniciar o Consultivo.<br>${esc(e.message)}</div></section>`});
