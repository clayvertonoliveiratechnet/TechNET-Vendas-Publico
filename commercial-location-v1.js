import {icon} from './ui-icons-v48.js?v=94';

let liveMap=null;
let markerLayer=null;
let routeLayer=null;
let refreshTimer=null;
let currentRoot=null;
let selectedUserId=null;
let cachedPeople=[];
let cachedTeams=[];

const REFRESH_MS=20000;
const ACTIVE_MS=2*60*1000;
const RECENT_MS=20*60*1000;

const roleLabel=role=>role==='supervisor'?'Supervisor':'Consultor';
const personKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();

function ageMs(value){
  const time=value?new Date(value).getTime():0;
  return time?Math.max(0,Date.now()-time):Number.POSITIVE_INFINITY;
}
function ageLabel(value){
  const age=ageMs(value);
  if(!Number.isFinite(age))return 'Sem posição';
  const sec=Math.floor(age/1000);
  if(sec<60)return 'agora';
  const min=Math.floor(sec/60);
  if(min<60)return min+' min atrás';
  const hours=Math.floor(min/60);
  if(hours<24)return hours+'h atrás';
  const days=Math.floor(hours/24);
  return days+'d atrás';
}
function formatTime(value){
  if(!value)return '—';
  return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'}).format(new Date(value));
}
function initials(name){
  return String(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x.charAt(0).toUpperCase()).join('')||'?';
}
function latestByUser(rows,dateKey='recorded_at'){
  const map=new Map();
  for(const row of rows||[]){
    const current=map.get(row.user_id);
    if(!current||new Date(row[dateKey]||0)>new Date(current[dateKey]||0))map.set(row.user_id,row);
  }
  return map;
}
function statusFor(person){
  if(person.hierarchy_only)return {key:'unlinked',label:'Sem app vinculado'};
  if(person.pause)return {key:'paused',label:'Pausado'};
  if(person.position){
    const age=ageMs(person.position.recorded_at);
    if(age<=ACTIVE_MS)return {key:'active',label:'Ao vivo'};
    if(age<=RECENT_MS)return {key:'recent',label:'Recente'};
    return {key:'offline',label:'Offline'};
  }
  if(person.device&&ageMs(person.device.last_seen_at)<=ACTIVE_MS)return {key:'nogps',label:'App online · sem GPS'};
  return {key:'offline',label:'Sem sinal'};
}
function speedLabel(speed){
  const n=Number(speed);
  if(!Number.isFinite(n)||n<0)return '—';
  return (n*3.6).toFixed(n*3.6>=10?0:1).replace('.',',')+' km/h';
}
function accuracyLabel(value){
  const n=Number(value);
  return Number.isFinite(n)&&n>=0?Math.round(n)+' m':'—';
}
function batteryLabel(person){
  const n=Number(person.position?.battery_level??person.device?.last_battery);
  return Number.isFinite(n)?Math.round(n)+'%':'—';
}
function visibleProfilesQuery(sb,profile){
  let query=sb.from('tv_profiles')
    .select('user_id,full_name,role,team_id,supervisor_id,active')
    .eq('active',true)
    .in('role',['supervisor','consultant'])
    .order('full_name');
  if(profile.role==='supervisor'&&profile.team_id)query=query.eq('team_id',profile.team_id);
  return query;
}
async function loadPeople(sb,profile){
  let hierarchyQuery=sb.from('tv_commercial_hierarchy').select('leader,seller').eq('active',true).order('leader').order('seller');
  if(profile.role==='supervisor')hierarchyQuery=hierarchyQuery.eq('leader',profile.full_name);
  const [profilesRes,teamsRes,positionsRes,pausesRes,devicesRes,hierarchyRes]=await Promise.all([
    visibleProfilesQuery(sb,profile),
    sb.from('tv_teams').select('id,name,city_id').order('name'),
    sb.rpc('tv_consultivo_latest_visible_positions'),
    sb.from('tv_consultivo_pauses').select('user_id,started_at,reason').is('ended_at',null),
    sb.from('tv_consultivo_devices').select('id,user_id,last_seen_at,last_battery,last_network_type,app_version,active').eq('active',true).order('last_seen_at',{ascending:false}),
    hierarchyQuery
  ]);
  for(const result of [profilesRes,teamsRes,positionsRes,pausesRes,devicesRes,hierarchyRes])if(result.error)throw result.error;
  const profiles=Array.isArray(profilesRes.data)?profilesRes.data:[];
  const teams=Array.isArray(teamsRes.data)?teamsRes.data:[];
  const hierarchy=Array.isArray(hierarchyRes.data)?hierarchyRes.data:[];
  const positions=latestByUser(Array.isArray(positionsRes.data)?positionsRes.data:[]);
  const pauses=latestByUser(Array.isArray(pausesRes.data)?pausesRes.data:[],'started_at');
  const devices=latestByUser(Array.isArray(devicesRes.data)?devicesRes.data:[],'last_seen_at');
  const names=new Map(profiles.map(p=>[p.user_id,p.full_name]));
  const profileByName=new Map(profiles.map(p=>[personKey(p.full_name),p]));
  const teamNames=new Map(teams.map(t=>[t.id,t.name]));
  const teamByName=new Map(teams.map(t=>[personKey(t.name),t]));
  const supervisorByName=new Map(profiles.filter(p=>p.role==='supervisor').map(p=>[personKey(p.full_name),p]));
  const people=profiles.map(p=>({...p,team_name:teamNames.get(p.team_id)||'Sem equipe',supervisor_name:p.role==='supervisor'?'—':(names.get(p.supervisor_id)||'Não definido'),position:positions.get(p.user_id)||null,pause:pauses.get(p.user_id)||null,device:devices.get(p.user_id)||null,hierarchy_only:false}));
  const seen=new Set();
  for(const row of hierarchy){
    const seller=String(row.seller||'').trim(),leader=String(row.leader||'').trim();
    const sk=personKey(seller),lk=personKey(leader);
    if(!sk||seen.has(sk)||profileByName.has(sk))continue;
    seen.add(sk);
    const team=teamByName.get(lk)||null,supervisor=supervisorByName.get(lk)||null;
    people.push({user_id:'hierarchy:'+sk,full_name:seller,role:'consultant',team_id:team?.id||null,supervisor_id:supervisor?.user_id||null,active:true,team_name:team?.name||leader||'Sem equipe',supervisor_name:leader||'Não definido',position:null,pause:null,device:null,hierarchy_only:true});
  }
  return {people,teams};
}
function currentFilters(){
  const root=currentRoot;
  return {
    search:String(root?.querySelector('#locationSearch')?.value||'').trim().toLocaleLowerCase('pt-BR'),
    team:String(root?.querySelector('#locationTeam')?.value||''),
    supervisor:String(root?.querySelector('#locationSupervisor')?.value||''),
    role:String(root?.querySelector('#locationRole')?.value||''),
    status:String(root?.querySelector('#locationStatus')?.value||'')
  };
}
function filteredPeople(){
  const f=currentFilters();
  return cachedPeople.filter(person=>{
    const status=statusFor(person).key;
    const searchHaystack=[person.full_name,person.team_name,person.supervisor_name,roleLabel(person.role)].join(' ').toLocaleLowerCase('pt-BR');
    if(f.search&&!searchHaystack.includes(f.search))return false;
    if(f.team&&person.team_id!==f.team)return false;
    if(f.supervisor&&person.user_id!==f.supervisor&&person.supervisor_id!==f.supervisor)return false;
    if(f.role&&person.role!==f.role)return false;
    if(f.status&&status!==f.status)return false;
    return true;
  }).sort((a,b)=>{
    if(a.role!==b.role)return a.role==='supervisor'?-1:1;
    return String(a.full_name||'').localeCompare(String(b.full_name||''),'pt-BR');
  });
}
function setSelectOptions(selector,options,currentValue){
  const select=currentRoot?.querySelector(selector);
  if(!select)return;
  select.innerHTML=options;
  if(currentValue&&[...select.options].some(o=>o.value===currentValue))select.value=currentValue;
}
function syncFilterOptions(escapeHtml){
  const teamValue=currentRoot?.querySelector('#locationTeam')?.value||'';
  const supervisorValue=currentRoot?.querySelector('#locationSupervisor')?.value||'';
  const visibleTeamIds=new Set(cachedPeople.map(p=>p.team_id).filter(Boolean));
  const teams=cachedTeams.filter(t=>visibleTeamIds.has(t.id));
  setSelectOptions('#locationTeam','<option value="">Todas as equipes</option>'+teams.map(t=>'<option value="'+escapeHtml(t.id)+'">'+escapeHtml(t.name)+'</option>').join(''),teamValue);
  const supervisors=cachedPeople.filter(p=>p.role==='supervisor');
  setSelectOptions('#locationSupervisor','<option value="">Todos os supervisores</option>'+supervisors.map(p=>'<option value="'+escapeHtml(p.user_id)+'">'+escapeHtml(p.full_name)+'</option>').join(''),supervisorValue);
}
function renderCounters(rows){
  const active=rows.filter(p=>statusFor(p).key==='active').length;
  const supervisors=rows.filter(p=>p.role==='supervisor').length;
  const consultants=rows.filter(p=>p.role==='consultant').length;
  const withoutGps=rows.filter(p=>!p.position).length;
  const target=currentRoot?.querySelector('#locationCounters');
  if(!target)return;
  target.innerHTML=[
    ['Ao vivo',active,'active'],
    ['Supervisores',supervisors,''],
    ['Consultores',consultants,''],
    ['Sem GPS',withoutGps,'muted']
  ].map(item=>'<div class="loc-kpi '+item[2]+'"><small>'+item[0]+'</small><strong>'+item[1]+'</strong></div>').join('');
}
function personCard(person,escapeHtml){
  const status=statusFor(person);
  const selected=selectedUserId===person.user_id?' selected':'';
  const disabled=person.position?'':' disabled';
  return '<article class="loc-person-card'+selected+'" data-user-id="'+escapeHtml(person.user_id)+'">'+
    '<div class="loc-person-head"><span class="loc-avatar role-'+person.role+'">'+escapeHtml(initials(person.full_name))+'</span>'+
      '<div class="loc-person-name"><b>'+escapeHtml(person.full_name||'Sem nome')+'</b><span>'+escapeHtml(roleLabel(person.role))+' · '+escapeHtml(person.team_name)+'</span></div>'+
      '<span class="loc-status status-'+status.key+'"><i></i>'+escapeHtml(status.label)+'</span></div>'+
    '<div class="loc-person-meta">'+
      '<span><small>Última posição</small><b>'+escapeHtml(ageLabel(person.position?.recorded_at))+'</b></span>'+
      '<span><small>Bateria</small><b>'+escapeHtml(batteryLabel(person))+'</b></span>'+
      '<span><small>Precisão</small><b>'+escapeHtml(accuracyLabel(person.position?.accuracy))+'</b></span>'+
      '<span><small>Velocidade</small><b>'+escapeHtml(speedLabel(person.position?.speed))+'</b></span>'+
    '</div>'+
    '<div class="loc-person-foot"><span>Supervisor: <b>'+escapeHtml(person.supervisor_name)+'</b></span>'+
      '<button type="button" class="ghost loc-route-btn" data-user-route="'+escapeHtml(person.user_id)+'"'+disabled+'>'+icon('map')+' Ver rota de hoje</button></div>'+
  '</article>';
}
function markerPopup(person,escapeHtml){
  const status=statusFor(person);
  return '<div class="loc-popup"><b>'+escapeHtml(person.full_name||'Sem nome')+'</b>'+
    '<span>'+escapeHtml(roleLabel(person.role))+' · '+escapeHtml(person.team_name)+'</span>'+
    '<small>'+escapeHtml(status.label)+' · '+escapeHtml(ageLabel(person.position?.recorded_at))+'</small>'+
    '<small>Bateria '+escapeHtml(batteryLabel(person))+' · precisão '+escapeHtml(accuracyLabel(person.position?.accuracy))+'</small></div>';
}
function ensureMap(){
  if(liveMap||!currentRoot)return;
  const node=currentRoot.querySelector('#commercialLocationMap');
  if(!node)return;
  if(!window.L){
    node.innerHTML='<div class="loc-map-error">Mapa indisponível no momento.</div>';
    return;
  }
  liveMap=window.L.map(node,{zoomControl:false,attributionControl:true});
  window.L.control.zoom({position:'bottomright'}).addTo(liveMap);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap'
  }).addTo(liveMap);
  markerLayer=window.L.layerGroup().addTo(liveMap);
  routeLayer=window.L.layerGroup().addTo(liveMap);
  liveMap.setView([-7.2,-37.2],6);
  setTimeout(()=>liveMap?.invalidateSize(),80);
}
function drawMarkers(rows,escapeHtml,{fit=true}={}){
  ensureMap();
  if(!liveMap||!markerLayer)return;
  markerLayer.clearLayers();
  const points=[];
  for(const person of rows){
    const pos=person.position;
    if(!pos)continue;
    const lat=Number(pos.latitude),lng=Number(pos.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;
    const status=statusFor(person);
    const html='<div class="loc-map-marker role-'+person.role+' status-'+status.key+'"><span>'+escapeHtml(initials(person.full_name))+'</span><i></i></div>';
    const marker=window.L.marker([lat,lng],{
      icon:window.L.divIcon({className:'loc-map-marker-wrap',html,iconSize:[46,46],iconAnchor:[23,23]})
    }).addTo(markerLayer);
    marker.bindPopup(markerPopup(person,escapeHtml));
    marker.on('click',()=>{selectedUserId=person.user_id;renderPeople(escapeHtml,{fit:false});});
    points.push([lat,lng]);
  }
  if(fit){
    if(points.length>1)liveMap.fitBounds(window.L.latLngBounds(points).pad(.18),{animate:true,maxZoom:16});
    else if(points.length===1)liveMap.setView(points[0],15,{animate:true});
  }
}
function renderPeople(escapeHtml,{fit=true}={}){
  const rows=filteredPeople();
  renderCounters(rows);
  const list=currentRoot?.querySelector('#locationPeople');
  const result=currentRoot?.querySelector('#locationResultCount');
  if(result)result.textContent=rows.length+' pessoa'+(rows.length===1?'':'s');
  if(list)list.innerHTML=rows.length?rows.map(p=>personCard(p,escapeHtml)).join(''):'<div class="loc-empty"><b>Nenhuma pessoa encontrada.</b><span>Ajuste os filtros para ampliar a visualização.</span></div>';
  drawMarkers(rows,escapeHtml,{fit});
  currentRoot?.querySelectorAll('[data-user-route]').forEach(button=>{
    button.addEventListener('click',async event=>{
      event.stopPropagation();
      const userId=button.dataset.userRoute;
      const person=cachedPeople.find(p=>p.user_id===userId);
      if(person)await selectPerson(person,escapeHtml);
    });
  });
  currentRoot?.querySelectorAll('.loc-person-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const person=cachedPeople.find(p=>p.user_id===card.dataset.userId);
      if(person?.position)focusPerson(person,escapeHtml);
    });
  });
}
function focusPerson(person,escapeHtml){
  selectedUserId=person.user_id;
  renderPeople(escapeHtml,{fit:false});
  if(liveMap&&person.position){
    liveMap.setView([Number(person.position.latitude),Number(person.position.longitude)],17,{animate:true});
    markerLayer?.eachLayer(layer=>{
      const ll=layer.getLatLng?.();
      if(ll&&Math.abs(ll.lat-Number(person.position.latitude))<0.000001&&Math.abs(ll.lng-Number(person.position.longitude))<0.000001)layer.openPopup?.();
    });
  }
}
async function selectPerson(person,escapeHtml){
  focusPerson(person,escapeHtml);
  if(!routeLayer||!liveMap)return;
  routeLayer.clearLayers();
  const start=new Date();
  start.setHours(0,0,0,0);
  const {data,error}=await currentRoot.__locationSb.from('tv_consultivo_positions')
    .select('recorded_at,latitude,longitude,accuracy')
    .eq('user_id',person.user_id)
    .gte('recorded_at',start.toISOString())
    .order('recorded_at',{ascending:true})
    .limit(3000);
  if(error)throw error;
  const points=(data||[]).map(p=>[Number(p.latitude),Number(p.longitude)]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
  const routeInfo=currentRoot?.querySelector('#locationRouteInfo');
  if(routeInfo)routeInfo.innerHTML='<b>'+escapeHtml(person.full_name)+'</b><span>'+points.length+' ponto'+(points.length===1?'':'s')+' na rota de hoje</span>';
  if(points.length>1){
    const polyline=window.L.polyline(points,{weight:5,opacity:.78,className:'loc-route-line'}).addTo(routeLayer);
    liveMap.fitBounds(polyline.getBounds().pad(.12),{animate:true,maxZoom:17});
  }else if(points.length===1){
    liveMap.setView(points[0],17,{animate:true});
  }
}
async function refreshData(sb,profile,escapeHtml,{fit=false}={}){
  const refreshButton=currentRoot?.querySelector('#locationRefresh');
  if(refreshButton){refreshButton.disabled=true;refreshButton.setAttribute('aria-busy','true');}
  try{
    const data=await loadPeople(sb,profile);
    cachedPeople=data.people;
    cachedTeams=data.teams;
    syncFilterOptions(escapeHtml);
    const rows=filteredPeople();
    renderCounters(rows);
    renderPeople(escapeHtml,{fit});
    const stamp=currentRoot?.querySelector('#locationUpdatedAt');
    if(stamp)stamp.textContent='Atualizado às '+new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  }finally{
    if(refreshButton){refreshButton.disabled=false;refreshButton.removeAttribute('aria-busy');}
  }
}
export function destroyCommercialLocation(){
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=null;
  selectedUserId=null;
  cachedPeople=[];
  cachedTeams=[];
  if(liveMap){try{liveMap.remove();}catch{}}
  liveMap=null;
  markerLayer=null;
  routeLayer=null;
  currentRoot=null;
}
export async function renderCommercialLocation({sb,content,profile,toast,setTitle,escapeHtml}){
  destroyCommercialLocation();
  if(!['admin','supervisor'].includes(profile?.role))throw new Error('Acesso à localização restrito à gestão comercial.');
  setTitle('Localização','Supervisores e consultores em campo');
  content.innerHTML='<section class="commercial-location" id="commercialLocationRoot">'+
    '<div class="loc-hero"><div><div class="kicker">OPERAÇÃO EM CAMPO</div><h2>Localização da equipe</h2><p>Acompanhe supervisores e consultores diretamente no TechNET Vendas, sem abrir o aplicativo Consultivo.</p></div>'+
    '<div class="loc-live"><span><i></i>Atualização automática</span><small id="locationUpdatedAt">Carregando…</small></div></div>'+
    '<div class="loc-toolbar">'+
      '<label class="loc-search">'+icon('search')+'<input id="locationSearch" placeholder="Buscar supervisor, consultor ou equipe" autocomplete="off"></label>'+
      '<select id="locationTeam" aria-label="Filtrar por equipe"><option value="">Todas as equipes</option></select>'+
      '<select id="locationSupervisor" aria-label="Filtrar por supervisor"><option value="">Todos os supervisores</option></select>'+
      '<select id="locationRole" aria-label="Filtrar por função"><option value="">Todas as funções</option><option value="supervisor">Supervisores</option><option value="consultant">Consultores</option></select>'+
      '<select id="locationStatus" aria-label="Filtrar por status"><option value="">Todos os status</option><option value="active">Ao vivo</option><option value="recent">Recente</option><option value="paused">Pausado</option><option value="nogps">App online · sem GPS</option><option value="offline">Offline</option><option value="unlinked">Sem app vinculado</option></select>'+
      '<button type="button" class="ghost" id="locationRefresh">'+icon('target')+' Atualizar</button>'+
    '</div>'+
    '<div class="loc-kpis" id="locationCounters"></div>'+
    '<div class="loc-layout">'+
      '<div class="loc-map-card"><div class="loc-map-head"><div><b>Mapa em tempo real</b><span id="locationRouteInfo">Selecione uma pessoa para ver a rota de hoje.</span></div><button type="button" class="ghost" id="locationFit">'+icon('map')+' Ver todos</button></div><div id="commercialLocationMap" class="loc-map"></div></div>'+
      '<aside class="loc-list-card"><div class="loc-list-head"><div><b>Equipe visível</b><span id="locationResultCount">0 pessoas</span></div></div><div id="locationPeople" class="loc-people"></div></aside>'+
    '</div>'+
  '</section>';
  currentRoot=content.querySelector('#commercialLocationRoot');
  currentRoot.__locationSb=sb;
  ensureMap();
  const rerender=()=>renderPeople(escapeHtml);
  ['#locationSearch','#locationTeam','#locationSupervisor','#locationRole','#locationStatus'].forEach(selector=>{
    const el=currentRoot.querySelector(selector);
    el?.addEventListener(el.tagName==='INPUT'?'input':'change',rerender);
  });
  currentRoot.querySelector('#locationRefresh')?.addEventListener('click',()=>refreshData(sb,profile,escapeHtml,{fit:false}).catch(error=>toast(error.message||error)));
  currentRoot.querySelector('#locationFit')?.addEventListener('click',()=>drawMarkers(filteredPeople(),escapeHtml,{fit:true}));
  await refreshData(sb,profile,escapeHtml,{fit:true});
  refreshTimer=setInterval(()=>{
    if(!currentRoot?.isConnected){destroyCommercialLocation();return;}
    if(document.visibilityState==='visible')refreshData(sb,profile,escapeHtml,{fit:false}).catch(console.warn);
  },REFRESH_MS);
}
