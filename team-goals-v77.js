import {icon} from './ui-icons-v48.js?v=94';
const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const n=v=>Number(v||0);
const cap=v=>Math.max(0,Math.min(100,n(v)));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fallbackMoney=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function progress(value){
 return `<div class="tg77-progress"><i style="width:${cap(value)}%"></i></div>`;
}

function metric(label,done,target,pctValue,formatter){
 const configured=n(target)>0;
 const value=formatter(done),goal=configured?formatter(target):'Não definida';
 const remaining=configured?Math.max(0,n(target)-n(done)):0;
 return `<div class="tg77-metric"><div class="tg77-metric-head"><span>${label}</span><b>${value} <small>/ ${goal}</small></b></div>${progress(configured?pctValue:0)}<div class="tg77-metric-foot"><span>${configured?`${n(pctValue).toFixed(1).replace('.0','')}% realizado`:'Meta ainda não configurada'}</span><strong>${configured?`Falta ${formatter(remaining)}`:'—'}</strong></div></div>`;
}

function editor(team,money){
 return `<div class="tg77-editor"><label><span>Meta VIRTUA</span><input class="tg77-virtua-input" type="number" min="0" step="1" value="${n(team.virtua_target)}"></label><label><span>Meta receita</span><input class="tg77-revenue-input" type="number" min="0" step="0.01" value="${n(team.revenue_target).toFixed(2)}"></label><button type="button" class="primary tg77-save">Salvar meta</button></div>`;
}

function teamCard(team,editable,money){
 const fmtMoney=v=>money?money(n(v)):fallbackMoney(v);
 return `<article class="tg77-card" data-team-id="${esc(team.team_id)}"><header><div><span>Meta da equipe</span><h3>${esc(team.team_name)}</h3></div><small>${n(team.installed_sales)} instalada${n(team.installed_sales)===1?'':'s'}</small></header>${metric('VIRTUA',team.installed_virtua,team.virtua_target,team.virtua_pct,v=>Math.round(n(v)).toLocaleString('pt-BR'))}${metric('RECEITA',team.installed_revenue,team.revenue_target,team.revenue_pct,fmtMoney)}${editable?editor(team,money):''}</article>`;
}
export async function renderTeamGoalPanel(ctx){
 const {sb,host,profile,toast,money,month=null,year=null}=ctx||{};
 if(!host||!['supervisor','backoffice','admin'].includes(profile?.role))return;
 host.innerHTML='<section class="tg77-shell"><div class="tg77-loading">Carregando metas das equipes…</div></section>';
 const args={p_month:month?Number(month):null,p_year:year?Number(year):null};
 const {data,error}=await sb.rpc('tv_team_goal_dashboard',args);
 if(error){console.warn('team goals',error);host.innerHTML='<section class="tg77-shell"><div class="tg77-empty">Não foi possível carregar as metas das equipes agora.</div></section>';return}
 const teams=Array.isArray(data?.teams)?data.teams:[],editable=data?.editable===true;
 const p=data?.period||{},periodName=`${MONTHS[Math.max(0,n(p.month)-1)]||'Período'} / ${n(p.year)||''}`;
 const multiTeam=teams.length>1,storageKey='tvTeamGoalOpenTeam',storedTeam=multiTeam?sessionStorage.getItem(storageKey):'';
 const disclosure=(team,open=false)=>`<details class="tg77-disclosure" data-team-id="${esc(team.team_id)}" ${open?'open':''}><summary><span class="tg77-disclosure-title"><small>Meta da equipe</small><b>${esc(team.team_name)}</b></span><span class="tg77-disclosure-meta"><em>${n(team.installed_sales)} instalada${n(team.installed_sales)===1?'':'s'}</em><i class="tg77-disclosure-chevron" aria-hidden="true">${icon('chevronDown')}</i></span></summary><div class="tg77-disclosure-body">${teamCard(team,editable,money)}</div></details>`;
 const body=multiTeam?`<div class="tg77-accordion">${teams.map(t=>disclosure(t,String(t.team_id)===String(storedTeam))).join('')}</div>`:`<div class="tg77-grid">${teams[0]?teamCard(teams[0],editable,money):'<div class="tg77-empty">Nenhuma equipe disponível para este usuário.</div>'}</div>`;
 host.innerHTML=`<section class="tg77-shell"><div class="tg77-head"><div><span class="tg77-kicker">ACOMPANHAMENTO DE META</span><h2>${profile.role==='supervisor'?'Meta da equipe':'Metas das equipes'}</h2><p>VIRTUAs e receita instaladas no mês. ${multiTeam?'Toque em uma equipe para abrir o card completo.':editable?'Somente o admin pode alterar os objetivos.':'Metas definidas pelo administrador.'}</p></div><span class="tg77-period">${esc(periodName)}</span></div>${body}</section>`;
 if(multiTeam)host.querySelectorAll('.tg77-disclosure').forEach(item=>item.addEventListener('toggle',()=>{if(item.open){host.querySelectorAll('.tg77-disclosure[open]').forEach(other=>{if(other!==item)other.open=false});sessionStorage.setItem(storageKey,String(item.dataset.teamId||''))}else if(sessionStorage.getItem(storageKey)===String(item.dataset.teamId||''))sessionStorage.removeItem(storageKey)}));
 function wireEditor(){if(!editable)return;host.querySelectorAll('.tg77-card').forEach(card=>{
  const save=card.querySelector('.tg77-save');
  save.onclick=async()=>{
   const virtua=Number(card.querySelector('.tg77-virtua-input')?.value||0),revenue=Number(card.querySelector('.tg77-revenue-input')?.value||0);
   if(!Number.isInteger(virtua)||virtua<0||!Number.isFinite(revenue)||revenue<0){toast?.('Informe metas válidas.');return}
   save.disabled=true;save.textContent='Salvando…';
   const {error:saveError}=await sb.rpc('tv_admin_save_team_goal',{p_team_id:card.dataset.teamId,p_year:n(p.year),p_month:n(p.month),p_virtua_target:virtua,p_revenue_target:revenue});
   if(saveError){toast?.(saveError.message||'Não foi possível salvar a meta.');save.disabled=false;save.textContent='Salvar meta';return}
   toast?.('Meta da equipe atualizada.');
   await renderTeamGoalPanel(ctx);
  };
 });}
 wireEditor();
}
