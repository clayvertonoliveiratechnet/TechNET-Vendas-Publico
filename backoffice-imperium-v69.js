(function(){
  const SB_URL='https://zpapjeqjpthaxrefrcey.supabase.co';
  const SB_KEY='sb_publishable_KPV38oWuqH3FjviS4WOGsA_hkNrt6Dd';
  const SESSION_KEY='technet-vendas-comercial-session';
  let activeSaleId='', seq=0, timer=0;

  const token=()=>{try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');return s?.access_token||s?.currentSession?.access_token||s?.session?.access_token||''}catch{return ''}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const fmt=v=>{if(!v)return '—';try{return new Date(v).toLocaleString('pt-BR')}catch{return String(v)}};
  const baseLabel=v=>({natal:'Natal',fortaleza:'Fortaleza',mossoro:'Mossoró',recife:'Recife'})[String(v||'').toLowerCase()]||String(v||'—');

  async function rpc(name,body){
    const access=token();if(!access)throw new Error('Sessão expirada. Entre novamente.');
    const r=await fetch(`${SB_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${access}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store'});
    let data=null;try{data=await r.json()}catch{}
    if(!r.ok)throw new Error(data?.message||data?.error||`HTTP ${r.status}`);
    return data;
  }

  function notify(message,kind='ok'){
    const t=document.getElementById('toast');if(!t)return;
    t.textContent=message;t.dataset.kind=kind;t.classList.add('show');
    clearTimeout(notify._t);notify._t=setTimeout(()=>t.classList.remove('show'),4200);
  }

  function styleOnce(){
    if(document.getElementById('backofficeImperiumV69Style'))return;
    const s=document.createElement('style');s.id='backofficeImperiumV69Style';s.textContent=`
      .bo-imp-v69{margin:16px 0 0;padding:16px;border:1px solid #e4e7ec;border-radius:14px;background:#fff;box-shadow:0 6px 18px rgba(16,24,40,.05)}
      [data-theme="dark"] .bo-imp-v69{background:#11151b;border-color:#2a313b}
      .bo-imp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .bo-imp-head h3{margin:2px 0 0;font-size:15px}.bo-imp-head small{display:block;color:#667085;font-size:11px;font-weight:700;letter-spacing:.04em}
      .bo-imp-state{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}
      .bo-imp-state.ok{background:#ecfdf3;color:#027a48}.bo-imp-state.wait{background:#eff8ff;color:#175cd3}.bo-imp-state.warn{background:#fffaeb;color:#b54708}.bo-imp-state.err{background:#fef3f2;color:#b42318}.bo-imp-state.idle{background:#f2f4f7;color:#475467}
      .bo-imp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}
      .bo-imp-grid>div{padding:10px;border-radius:10px;background:#f8fafc;border:1px solid #eef2f6;min-width:0}
      [data-theme="dark"] .bo-imp-grid>div{background:#171c23;border-color:#252d37}
      .bo-imp-grid small{display:block;color:#667085;font-size:10px;font-weight:700;text-transform:uppercase}.bo-imp-grid b{display:block;margin-top:3px;font-size:12px;overflow-wrap:anywhere}
      .bo-imp-box{margin-top:10px;padding:11px 12px;border-radius:10px;font-size:12px}.bo-imp-box b{display:block;margin-bottom:5px}.bo-imp-box ul{margin:0;padding-left:18px}.bo-imp-box li+li{margin-top:4px}
      .bo-imp-box.err{background:#fef3f2;color:#912018}.bo-imp-box.warn{background:#fffaeb;color:#7a2e0e}.bo-imp-box.ok{background:#ecfdf3;color:#05603a}
      .bo-imp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.bo-imp-actions button{min-height:36px}
      .bo-imp-meta{margin-top:8px;color:#667085;font-size:11px}
      @media(max-width:720px){.bo-imp-head{display:block}.bo-imp-state{margin-top:8px}.bo-imp-grid{grid-template-columns:1fr 1fr}.bo-imp-v69{padding:13px}.bo-imp-actions button{flex:1 1 140px}}
    `;document.head.appendChild(s);
  }

  function stateOf(st){
    const submit=String(st?.submit_status||'').toLowerCase(),queue=String(st?.queue_status||'').toLowerCase();
    if(submit==='sent'||queue==='sent'||st?.imperium_sale_id)return {label:'Enviado ao Imperium ✓',cls:'ok',key:'sent'};
    if(submit==='sending'||queue==='processing')return {label:'Enviando ao Imperium…',cls:'wait',key:'sending'};
    if(submit==='failed'||queue==='failed')return {label:'Erro no envio',cls:'err',key:'failed'};
    if(submit==='not_ready')return {label:'Pendências para envio',cls:'warn',key:'not_ready'};
    if(['queued','ready'].includes(submit)||queue==='pending')return {label:'Aguardando envio',cls:'wait',key:'queued'};
    return {label:'Ainda não enviado',cls:'idle',key:'idle'};
  }

  function setApproveButton(st){
    const b=document.getElementById('approveSend');if(!b)return;
    const state=stateOf(st),pre=st?.preflight||{};
    b.dataset.imperiumState=state.key;
    if(state.key==='sent'){b.textContent='Enviado ao Imperium ✓';b.disabled=true;return}
    if(state.key==='sending'){b.textContent='Enviando ao Imperium…';b.disabled=true;return}
    if(state.key==='queued'){b.textContent='Aguardando envio ao Imperium';b.disabled=true;return}
    if(state.key==='failed'){b.textContent='Erro no envio — use Tentar novamente';b.disabled=true;return}
    if(pre.ready===false){b.textContent='Corrija as pendências antes de aprovar';b.disabled=true;return}
    b.textContent='Aprovar venda e enviar ao Imperium';b.disabled=false;
  }

  function renderPanel(host,st){
    const state=stateOf(st),pre=st?.preflight||{},blockers=Array.isArray(pre.blockers)?pre.blockers:[],warnings=Array.isArray(pre.warnings)?pre.warnings:[];
    const err=st?.queue_error||st?.submit_error||'';
    const flow=pre?.approval_flow||{};
    host.innerHTML=`
      <div class="bo-imp-head"><div><small>INTEGRAÇÃO IMPERIUM</small><h3>Validação para aprovação do BackOffice</h3></div><span class="bo-imp-state ${state.cls}">${esc(state.label)}</span></div>
      <div class="bo-imp-grid">
        <div><small>Base</small><b>${esc(baseLabel(st?.base_key))}</b></div>
        <div><small>Produtos validados</small><b>${Number(flow.products_total||0)-Number(flow.products_unvalidated||0)} / ${Number(flow.products_total||0)}</b></div>
        <div><small>ID Venda</small><b>${esc(st?.imperium_sale_id||'—')}</b></div>
        <div><small>Contrato</small><b>${esc(st?.imperium_contract||'—')}</b></div>
      </div>
      ${st?.imperium_proposal?`<div class="bo-imp-meta"><b>Proposta:</b> ${esc(st.imperium_proposal)}</div>`:''}
      ${blockers.length?`<div class="bo-imp-box err"><b>Pendências antes da aprovação</b><ul>${blockers.map(x=>`<li>${esc(x?.message||x?.code||'Pendência')}</li>`).join('')}</ul></div>`:''}
      ${!blockers.length&&pre.ready===true&&state.key!=='sent'?`<div class="bo-imp-box ok"><b>✓ Venda pronta para aprovação</b>Cadastro, ativo e produtos validados. O BackOffice pode aprovar e liberar o envio ao Imperium.</div>`:''}
      ${warnings.length?`<div class="bo-imp-box warn"><b>Avisos para conferência</b><ul>${warnings.slice(0,4).map(x=>`<li>${esc(x?.message||x?.code||'Aviso')}</li>`).join('')}${warnings.length>4?`<li>+ ${warnings.length-4} aviso(s)</li>`:''}</ul></div>`:''}
      ${err&&state.key==='failed'?`<div class="bo-imp-box err"><b>Retorno do último envio</b>${esc(err)}</div>`:''}
      <div class="bo-imp-actions">
        <button type="button" class="ghost" id="boImpRefreshV69">↻ Revalidar</button>
        ${state.key==='failed'?'<button type="button" class="primary" id="boImpRetryV69">Tentar novamente</button>':''}
      </div>
      <div class="bo-imp-meta">${st?.last_attempt_at?`Última tentativa: ${esc(fmt(st.last_attempt_at))}`:st?.queued_at?`Na fila desde: ${esc(fmt(st.queued_at))}`:'A venda só será enviada ao Imperium depois da aprovação final do BackOffice.'}</div>`;
    setApproveButton(st);
  }

  async function loadPanel(force=false){
    const dialog=document.querySelector('#boDialog[open]');if(!dialog||!activeSaleId)return;
    styleOnce();
    let host=dialog.querySelector('#boImperiumPanelV69');
    if(!host){host=document.createElement('section');host.id='boImperiumPanelV69';host.className='bo-imp-v69';const actions=dialog.querySelector('.dialog-actions');actions?.insertAdjacentElement('beforebegin',host)}
    if(!host||(!force&&host.dataset.saleId===activeSaleId&&host.dataset.loaded==='1'))return;
    const my=++seq;host.dataset.saleId=activeSaleId;host.dataset.loaded='0';host.innerHTML='<div class="bo-imp-head"><div><small>INTEGRAÇÃO IMPERIUM</small><h3>Validando venda…</h3></div><span class="bo-imp-state wait">Consultando</span></div>';
    try{
      const st=await rpc('tv_backoffice_imperium_status',{p_sale_id:activeSaleId});if(my!==seq||!document.body.contains(host))return;
      host.dataset.loaded='1';renderPanel(host,st||{});
    }catch(e){if(my!==seq)return;host.innerHTML=`<div class="bo-imp-head"><div><small>INTEGRAÇÃO IMPERIUM</small><h3>Não foi possível consultar</h3></div><span class="bo-imp-state err">Erro</span></div><div class="bo-imp-box err">${esc(e.message||e)}</div><div class="bo-imp-actions"><button type="button" class="ghost" id="boImpRefreshV69">Tentar novamente</button></div>`}
  }

  async function retry(){
    if(!activeSaleId)return;
    const b=document.getElementById('boImpRetryV69');if(b){b.disabled=true;b.textContent='Revalidando…'}
    try{await rpc('tv_backoffice_retry_imperium',{p_sale_id:activeSaleId});notify('Venda revalidada e recolocada na fila do Imperium.');await loadPanel(true)}
    catch(e){notify(e.message||'Não foi possível reenviar','error');await loadPanel(true)}
  }

  async function confirmRegistration(){
    if(!activeSaleId)return;
    const b=document.getElementById('confirmRegistration');if(b){b.disabled=true;b.textContent='Confirmando cadastro…'}
    try{
      await rpc('tv_backoffice_confirm_registration',{p_sale_id:activeSaleId});
      if(b){b.textContent='✓ Cadastro conferido';b.disabled=true}
      notify('Cadastro confirmado. A venda continua aberta para concluir a análise.');
      await loadPanel(true);
    }catch(e){if(b){b.disabled=false;b.textContent='Confirmar cadastro'}notify(e.message||'Não foi possível confirmar o cadastro','error')}
  }

  async function confirmActive(){
    if(!activeSaleId)return;
    if(!window.confirm('Confirma que o ativo foi realizado com o assinante e está correto?'))return;
    const b=document.getElementById('confirmActive');if(b){b.disabled=true;b.textContent='Confirmando ativo…'}
    try{
      await rpc('tv_backoffice_confirm_active',{p_sale_id:activeSaleId});
      if(b){b.textContent='✓ Ativo confirmado';b.disabled=true}
      notify('Ativo confirmado. A venda continua aberta para concluir a análise.');
      await loadPanel(true);
    }catch(e){if(b){b.disabled=false;b.textContent='Confirmar ativo'}notify(e.message||'Não foi possível confirmar o ativo','error')}
  }

  async function approveSale(){
    if(!activeSaleId)return;
    const b=document.getElementById('approveSend');if(b){b.disabled=true;b.textContent='Aprovando venda…'}
    try{
      await rpc('tv_backoffice_approve_sale_for_imperium',{p_sale_id:activeSaleId});
      notify('Venda aprovada pelo BackOffice e adicionada à fila de envio do Imperium.');
      document.querySelector('#boDialog[open]')?.close();
      setTimeout(()=>document.getElementById('boRefresh')?.click(),60);
    }catch(e){notify(e.message||'Não foi possível aprovar a venda','error');await loadPanel(true)}
  }

  function normalizeUi(){
    const dialog=document.querySelector('#boDialog[open]');
    if(dialog&&activeSaleId){clearTimeout(timer);timer=setTimeout(()=>loadPanel(false),50)}
    const toast=document.getElementById('toast');if(toast?.textContent?.trim()==='Venda finalizada e enviada para o Imperium')toast.textContent='Venda aprovada e adicionada à fila de envio do Imperium.';
  }

  document.addEventListener('click',async e=>{
    const open=e.target.closest?.('.bo-open');if(open?.dataset?.id){activeSaleId=open.dataset.id;setTimeout(()=>loadPanel(true),60)}
    if(e.target.closest?.('#boImpRefreshV69')){e.preventDefault();loadPanel(true);return}
    if(e.target.closest?.('#boImpRetryV69')){e.preventDefault();retry();return}
    if(e.target.closest?.('#confirmRegistration')){e.preventDefault();e.stopImmediatePropagation();await confirmRegistration();return}
    if(e.target.closest?.('#confirmActive')){e.preventDefault();e.stopImmediatePropagation();await confirmActive();return}
    if(e.target.closest?.('#approveSend')){e.preventDefault();e.stopImmediatePropagation();await approveSale();return}
  },true);

  new MutationObserver(normalizeUi).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener('DOMContentLoaded',()=>{styleOnce();normalizeUi()},{once:true});
  styleOnce();
})();