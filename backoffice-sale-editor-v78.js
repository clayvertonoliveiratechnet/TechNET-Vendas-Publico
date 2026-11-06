(function(){
  const SB_URL='https://zpapjeqjpthaxrefrcey.supabase.co';
  const SB_KEY='sb_publishable_KPV38oWuqH3FjviS4WOGsA_hkNrt6Dd';
  const SESSION_KEY='technet-vendas-comercial-session';
  let activeSaleId='', cachedBundle=null, checking=false;

  const token=()=>{try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');return s?.access_token||s?.currentSession?.access_token||s?.session?.access_token||''}catch{return ''}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val=(root,id)=>root.querySelector('#'+id)?.value?.trim?.()||'';
  const digits=v=>String(v||'').replace(/\D/g,'');

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
    if(document.getElementById('backofficeSaleEditorV78Style'))return;
    const s=document.createElement('style');s.id='backofficeSaleEditorV78Style';s.textContent=`
      .bo-full-edit-v78{padding:0 20px 20px;display:grid;gap:16px;overflow:auto;max-height:calc(100dvh - 110px)}
      .bo-full-edit-v78 .bo-edit-note{padding:12px 14px;border-radius:12px;background:#fffaeb;color:#7a2e0e;border:1px solid #fef0c7;font-size:12px}
      .bo-full-edit-v78 .bo-edit-section{padding:16px;border:1px solid var(--line,#e4e7ec);border-radius:14px;background:var(--card,#fff)}
      .bo-full-edit-v78 .bo-edit-section h3{margin:0 0 12px;font-size:15px}.bo-full-edit-v78 .form-grid{align-items:end}
      .bo-full-edit-v78 textarea{min-height:86px}.bo-full-edit-products{display:grid;gap:7px}.bo-full-edit-products>div{padding:9px 11px;border-radius:10px;background:#f8fafc;border:1px solid #eef2f6}
      [data-theme="dark"] .bo-full-edit-v78 .bo-edit-note{background:#352a12;color:#ffd98a;border-color:#4b3b1c}[data-theme="dark"] .bo-full-edit-products>div{background:#171c23;border-color:#252d37}
      .bo-full-edit-actions-v78{position:sticky;bottom:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;padding:14px 20px calc(14px + env(safe-area-inset-bottom));background:var(--card,#fff);border-top:1px solid var(--line,#e4e7ec)}
      @media(max-width:720px){.bo-full-edit-v78{padding:0 12px 12px}.bo-full-edit-v78 .form-grid{grid-template-columns:1fr}.bo-full-edit-actions-v78{padding-inline:12px}.bo-full-edit-actions-v78 button{flex:1}}
    `;document.head.appendChild(s);
  }

  function editableButtonHost(){
    const dialog=document.querySelector('#boDialog[open]');
    return dialog?.querySelector('.bo-imperium-fix .actions')||dialog?.querySelector('.dialog-actions');
  }

  async function ensureEditButton(){
    const dialog=document.querySelector('#boDialog[open]'),host=editableButtonHost();
    if(!dialog||!host||!activeSaleId||checking||document.getElementById('boFullEditV78'))return;
    checking=true;
    try{
      const bundle=await rpc('tv_backoffice_sale_edit_bundle',{p_sale_id:activeSaleId});
      if(!document.querySelector('#boDialog[open]')||activeSaleId!==bundle?.sale?.id)return;
      cachedBundle=bundle;
      const b=document.createElement('button');b.type='button';b.className='ghost';b.id='boFullEditV78';b.textContent='Editar venda completa';
      host.prepend(b);
    }catch(e){
      cachedBundle=null;
    }finally{checking=false}
  }

  function selected(el,value){return String(el??'')===String(value??'')?'selected':''}
  function input(id,label,value='',attrs=''){return `<label>${label}<input id="${id}" value="${esc(value||'')}" ${attrs}></label>`}
  function select(id,label,options,value=''){return `<label>${label}<select id="${id}">${options.map(([v,t])=>`<option value="${esc(v)}" ${selected(v,value)}>${esc(t)}</option>`).join('')}</select></label>`}

  async function openEditor(){
    if(!activeSaleId)return;
    const dialog=document.querySelector('#boDialog[open]');if(!dialog)return;
    let bundle=cachedBundle;
    try{if(!bundle||bundle?.sale?.id!==activeSaleId)bundle=await rpc('tv_backoffice_sale_edit_bundle',{p_sale_id:activeSaleId})}
    catch(e){notify(e.message||'Venda não pode ser editada','error');return}
    cachedBundle=bundle;
    const s=bundle.sale||{},cities=bundle.cities||[],products=bundle.products||[];
    const cityOptions=[['','Selecione'],...cities.map(c=>[c.id,`${c.name} / ${c.state}`])];
    const profileOptions=[['CPF','CPF'],['CNPJ','CNPJ']];
    const paymentOptions=[['','Selecione'],['BOLETO','Boleto'],['DCC','DCC']];
    const dueOptions=[['','Selecione'],['5','Dia 5'],['10','Dia 10'],['SEM VENCIMENTO','Sem vencimento']];
    const contractOptions=[['','Selecione'],['ND','ND'],['UP','UP']];
    const periodOptions=[['','Selecione'],['08h/12h','08h/12h'],['12h/15h','12h/15h'],['15h/18h','15h/18h']];
    const priorityOptions=[['normal','Normal'],['high','Alta'],['critical','Crítica'],['low','Baixa']];
    dialog.innerHTML=`
      <div class="dialog-head"><div><div class="kicker">CORREÇÃO DIRETA</div><h2>Editar venda · ${esc(s.customer_name||'')}</h2><div class="dialog-sub"><span class="pill">${esc(s.status||'')}</span><span class="pill">${esc(String(s.imperium_base_key||'').toUpperCase())}</span></div></div><button type="button" class="ghost" id="boFullCloseV78">✕</button></div>
      <form id="boFullFormV78" class="bo-full-edit-v78">
        <div class="bo-edit-note"><b>Atenção:</b> ao salvar uma correção, as confirmações de cadastro, ativo e documentos serão reiniciadas. A venda precisará ser conferida novamente antes do envio ao Imperium.</div>
        <section class="bo-edit-section"><h3>Cliente</h3><div class="form-grid">
          ${select('boEProfile','Perfil',profileOptions,s.proposal_profile||'CPF')}
          ${input('boEName','Nome completo',s.customer_name,'required')}
          ${input('boEDoc','CPF/CNPJ',s.customer_document,'required inputmode="numeric"')}
          ${input('boERG','RG',s.customer_rg)}
          ${input('boEStateReg','Inscrição estadual',s.state_registration)}
          ${input('boEBirth','Nascimento',s.customer_birth_date,'type="date"')}
          ${input('boEMother','Nome da mãe',s.customer_mother_name)}
          ${input('boEPhone','Telefone principal',s.customer_phone,'required inputmode="tel"')}
          ${input('boEPhone2','Contato 2',s.secondary_phone,'inputmode="tel"')}
          ${select('boEPhone2Type','Tipo contato 2',[['','Selecione'],['CELULAR','Celular'],['RESIDENCIAL','Residencial']],s.secondary_phone_type)}
          ${input('boEEmail','E-mail',s.customer_email,'type="email"')}
          ${select('boEBko','DOC p/ BackOffice',[['','Selecione'],['ISABELA','ISABELA'],['ANNA','ANNA'],['PALOMA','PALOMA'],['JAMILA','JAMILA'],['RAFAELA','RAFAELA'],['EDYLANIA','EDYLANIA'],['ANNY YASMIN','ANNY YASMIN']],s.backoffice_recipient)}
        </div></section>
        <section class="bo-edit-section"><h3>Endereço</h3><div class="form-grid">
          ${input('boECep','CEP',s.postal_code,'required inputmode="numeric"')}
          ${input('boEStreet','Rua',s.street,'required')}
          ${input('boENumber','Número',s.street_number,'required')}
          ${input('boENeighborhood','Bairro',s.neighborhood,'required')}
          ${select('boECity','Cidade',cityOptions,s.city_id)}
          ${input('boEComplement','Complemento',s.complement)}
          <label class="full">Ponto de referência<input id="boEReference" value="${esc(s.reference_point||'')}"></label>
        </div></section>
        <section class="bo-edit-section"><h3>Contrato, Solar e agendamento</h3><div class="form-grid">
          ${select('boEContractType','Tipo contrato',contractOptions,s.contract_type)}
          ${select('boEPayment','Pagamento',paymentOptions,s.payment_method)}
          ${select('boEDue','Vencimento',dueOptions,s.payment_due)}
          ${input('boEContract','Nº contrato',s.contract_number)}
          ${select('boESolar','Gerado no Solar?',[['','Selecione'],['SIM','Sim'],['NÃO','Não']],s.solar_generated===true?'SIM':s.solar_generated===false?'NÃO':'')}
          ${input('boESolarContract','Contrato Solar',s.solar_contract)}
          ${input('boESolarLogin','Login Solar',s.solar_login)}
          ${input('boEScheduleDate','Data agendamento',s.scheduled_date,'type="date"')}
          ${select('boESchedulePeriod','Período',periodOptions,s.schedule_period)}
          ${select('boEPriority','Prioridade',priorityOptions,s.priority||'normal')}
        </div></section>
        <section class="bo-edit-section"><h3>Produtos</h3><div class="bo-full-edit-products">${products.length?products.map(p=>`<div><b>${esc(p.product_name||'Produto')}</b><small>${esc(p.product_group||'')} · qtd. ${Number(p.quantity||1)}</small></div>`).join(''):'<div>Nenhum produto cadastrado.</div>'}</div><p class="muted">A troca do produto oficial continua no bloco <b>Correções para o Imperium</b> da análise, garantindo o ID correto da base.</p></section>
        <section class="bo-edit-section"><h3>Observações</h3><div class="form-grid"><label class="full">Observação dos produtos<textarea id="boEProductNotes">${esc(s.product_notes||'')}</textarea></label><label class="full">Observações gerais<textarea id="boENotes">${esc(s.notes||'')}</textarea></label></div></section>
      </form>
      <div class="bo-full-edit-actions-v78"><button type="button" class="ghost" id="boFullBackV78">Voltar sem salvar</button><button type="submit" form="boFullFormV78" class="primary" id="boFullSaveV78">Salvar correções</button></div>`;
    const solar=dialog.querySelector('#boESolar'),toggleSolar=()=>{const on=solar.value==='SIM';for(const id of ['boESolarContract','boESolarLogin']){const el=dialog.querySelector('#'+id);el.disabled=!on;if(!on)el.value=''}};solar.onchange=toggleSolar;toggleSolar();
    dialog.querySelector('#boFullCloseV78').onclick=()=>dialog.close();
    dialog.querySelector('#boFullBackV78').onclick=()=>{dialog.close();setTimeout(()=>document.querySelector(`.bo-open[data-id="${CSS.escape(activeSaleId)}"]`)?.click(),60)};
    dialog.querySelector('#boFullFormV78').onsubmit=saveEditor;
  }

  async function saveEditor(e){
    e.preventDefault();const form=e.currentTarget,dialog=document.querySelector('#boDialog[open]'),btn=document.getElementById('boFullSaveV78');
    if(!dialog||!form.reportValidity())return;
    const phoneDigits=digits(val(dialog,'boEPhone')),cepDigits=digits(val(dialog,'boECep'));
    if(![10,11].includes(phoneDigits.length)){notify('Informe um telefone válido com DDD.','error');return}
    if(cepDigits.length!==8){notify('Informe um CEP válido com 8 dígitos.','error');return}
    if(btn){btn.disabled=true;btn.textContent='Salvando…'}
    const payload={
      proposal_profile:val(dialog,'boEProfile'),customer_name:val(dialog,'boEName'),customer_document:val(dialog,'boEDoc'),customer_rg:val(dialog,'boERG')||null,state_registration:val(dialog,'boEStateReg')||null,
      customer_birth_date:val(dialog,'boEBirth')||null,customer_mother_name:val(dialog,'boEMother')||null,customer_phone:val(dialog,'boEPhone'),secondary_phone:val(dialog,'boEPhone2')||null,secondary_phone_type:val(dialog,'boEPhone2Type')||null,customer_email:val(dialog,'boEEmail')||null,
      backoffice_recipient:val(dialog,'boEBko')||null,postal_code:cepDigits,street:val(dialog,'boEStreet'),street_number:val(dialog,'boENumber'),neighborhood:val(dialog,'boENeighborhood'),city_id:val(dialog,'boECity'),complement:val(dialog,'boEComplement')||null,reference_point:val(dialog,'boEReference')||null,
      contract_type:val(dialog,'boEContractType')||null,payment_method:val(dialog,'boEPayment')||null,payment_due:val(dialog,'boEDue')||null,contract_number:val(dialog,'boEContract')||null,solar_generated:val(dialog,'boESolar')==='SIM'?true:val(dialog,'boESolar')==='NÃO'?false:null,solar_contract:val(dialog,'boESolarContract')||null,solar_login:val(dialog,'boESolarLogin')||null,
      scheduled_date:val(dialog,'boEScheduleDate')||null,schedule_period:val(dialog,'boESchedulePeriod')||null,priority:val(dialog,'boEPriority')||'normal',product_notes:val(dialog,'boEProductNotes')||null,notes:val(dialog,'boENotes')||null
    };
    try{
      const result=await rpc('tv_backoffice_update_sale_fields',{p_sale_id:activeSaleId,p_payload:payload});
      const pre=result?.preflight||{};cachedBundle=null;
      notify(pre.ready?'Venda corrigida. Refaça as confirmações e ela ficará pronta para o Imperium.':'Venda corrigida. Ainda existem pendências para o Imperium.');
      dialog.close();setTimeout(()=>document.getElementById('boRefresh')?.click(),60);
    }catch(err){notify(err.message||'Não foi possível corrigir a venda.','error');if(btn){btn.disabled=false;btn.textContent='Salvar correções'}}
  }

  document.addEventListener('click',e=>{
    const open=e.target.closest?.('.bo-open');if(open?.dataset?.id){activeSaleId=open.dataset.id;cachedBundle=null;setTimeout(ensureEditButton,120)}
    if(e.target.closest?.('#boFullEditV78')){e.preventDefault();e.stopImmediatePropagation();openEditor()}
  },true);
  new MutationObserver(()=>{if(document.querySelector('#boDialog[open]'))setTimeout(ensureEditButton,40)}).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',styleOnce,{once:true});styleOnce();
})();
