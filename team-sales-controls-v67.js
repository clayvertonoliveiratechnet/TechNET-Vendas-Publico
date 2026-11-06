(function(){
  const SB_URL='https://zpapjeqjpthaxrefrcey.supabase.co';
  const SB_KEY='sb_publishable_KPV38oWuqH3FjviS4WOGsA_hkNrt6Dd';
  const SESSION_KEY='technet-vendas-comercial-session';
  const CONSULT_KEY='tv_sales_consultant_team';
  const TAB_PREFIX='tv_sales_view_';
  const nativeFetch=window.fetch.bind(window);
  const nativeSet=Storage.prototype.setItem;
  const nativeRemove=Storage.prototype.removeItem;
  let seq=0,timer=0;

  const page=()=>document.querySelector('.nav-btn.active')?.dataset.page||'';
  const isSalesPage=()=>['team','my-sales'].includes(page());
  const selectedTab=()=>localStorage.getItem(TAB_PREFIX+page())==='draft'?'draft':'non_draft';
  const selectedConsultant=()=>String(localStorage.getItem(CONSULT_KEY)||'').trim();
  const sessionToken=()=>{try{const s=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');return s?.access_token||s?.currentSession?.access_token||s?.session?.access_token||''}catch{return ''}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function patchBody(body){
    if(!isSalesPage())return body;
    const out={...(body||{})};
    out.p_status=selectedTab();
    if(page()==='team')out.p_consultant=selectedConsultant()||null;
    return out;
  }

  window.fetch=async function(input,init){
    const url=input instanceof Request?input.url:String(input);
    if(!url.includes('/rest/v1/rpc/tv_sales_page_month'))return nativeFetch(input,init);
    try{
      if(input instanceof Request){
        const req=input.clone(),text=await req.text(),body=patchBody(text?JSON.parse(text):{});
        return nativeFetch(req.url,{method:req.method,headers:new Headers(req.headers),body:JSON.stringify(body),credentials:req.credentials,cache:req.cache,redirect:req.redirect,referrer:req.referrer,referrerPolicy:req.referrerPolicy,mode:req.mode,signal:req.signal});
      }
      const cfg={...(init||{})},body=patchBody(typeof cfg.body==='string'&&cfg.body?JSON.parse(cfg.body):{});cfg.body=JSON.stringify(body);return nativeFetch(input,cfg);
    }catch(e){console.warn('Filtros extras de vendas: fallback',e);return nativeFetch(input,init)}
  };

  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&String(key).startsWith('tv_sales_team_')) nativeRemove.call(localStorage,CONSULT_KEY);
    return nativeSet.call(this,key,value);
  };
  Storage.prototype.removeItem=function(key){
    if(this===localStorage&&String(key).startsWith('tv_sales_team_')) nativeRemove.call(localStorage,CONSULT_KEY);
    return nativeRemove.call(this,key);
  };

  function monthRange(value){
    const m=String(value||'').match(/^(\d{4})-(\d{2})$/);if(!m)return null;
    const y=Number(m[1]),mo=Number(m[2]),start=`${m[1]}-${m[2]}-01`,next=new Date(Date.UTC(y,mo,1));
    return {start,end:`${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-01`};
  }
  function refreshSales(){const el=document.getElementById('salesMonthFilter');if(el)el.dispatchEvent(new Event('change',{bubbles:true}))}

  function styleOnce(){if(document.getElementById('teamSalesControlsV67Style'))return;const s=document.createElement('style');s.id='teamSalesControlsV67Style';s.textContent=`
    .team-sales-tabs-v67{display:flex;gap:6px;align-items:center;margin:0 0 10px;padding:5px;width:max-content;max-width:100%;border:1px solid #e4e7ec;border-radius:11px;background:#f7f8fa}
    .team-sales-tabs-v67 button{height:34px;padding:0 14px;border:0;border-radius:8px;background:transparent;color:#667085;font-size:11px;font-weight:800;cursor:pointer}
    .team-sales-tabs-v67 button.active{background:#111827;color:#fff;box-shadow:0 4px 10px rgba(17,24,39,.13)}
    .team-sales-tabs-v67 button[data-view="draft"].active{background:#d9232b;color:#fff}
    #salesConsultantFilter{min-width:205px}
    @media(max-width:820px){.team-sales-tabs-v67{width:100%;display:grid;grid-template-columns:1fr 1fr}.team-sales-tabs-v67 button{width:100%}#salesConsultantFilter{width:100%;min-width:0}}
  `;document.head.appendChild(s)}

  async function loadConsultants(select){
    const team=document.getElementById('salesTeamFilter')?.value||'';
    if(!team){select.remove();nativeRemove.call(localStorage,CONSULT_KEY);return}
    const range=monthRange(document.getElementById('salesMonthFilter')?.value);if(!range)return;
    const token=sessionToken();if(!token)return;
    const body={p_month_start:range.start,p_month_end:range.end,p_city:document.getElementById('salesCityFilter')?.value||null,p_team:team,p_status:selectedTab()};
    const current=selectedConsultant(),mySeq=++seq;
    select.disabled=true;select.innerHTML='<option>Carregando consultores…</option>';
    try{
      const r=await nativeFetch(`${SB_URL}/rest/v1/rpc/tv_sales_consultant_options_month`,{method:'POST',headers:{apikey:SB_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);const rows=await r.json();if(mySeq!==seq||!document.body.contains(select))return;
      const found=(rows||[]).some(x=>String(x.consultant_name||'')===current);
      select.innerHTML=`<option value="">Todos os consultores</option>${(rows||[]).map(x=>`<option value="${esc(x.consultant_name)}" ${String(x.consultant_name||'')===current?'selected':''}>${esc(x.consultant_name)} · ${Number(x.sales_count||0)} venda${Number(x.sales_count||0)===1?'':'s'}${selectedTab()==='draft'?` · ${Number(x.draft_count||0)} rascunho${Number(x.draft_count||0)===1?'':'s'}`:` · ${Number(x.installed_count||0)} instalada${Number(x.installed_count||0)===1?'':'s'}`}</option>`).join('')}${current&&!found?`<option value="${esc(current)}" selected>${esc(current)} · sem vendas neste filtro</option>`:''}`;
      select.disabled=false;
    }catch(e){select.innerHTML='<option value="">Consultores indisponíveis</option>';select.disabled=true;console.warn('consultant options',e)}
  }

  function drawTabs(host){
    let tabs=document.getElementById('teamSalesTabsV67');if(!tabs){tabs=document.createElement('div');tabs.id='teamSalesTabsV67';tabs.className='team-sales-tabs-v67';host.insertAdjacentElement('beforebegin',tabs)}
    const view=selectedTab();tabs.innerHTML=`<button type="button" data-view="non_draft" class="${view==='non_draft'?'active':''}">Vendas</button><button type="button" data-view="draft" class="${view==='draft'?'active':''}">Rascunhos</button>`;
    tabs.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{const next=b.dataset.view==='draft'?'draft':'non_draft';nativeSet.call(localStorage,TAB_PREFIX+page(),next);nativeRemove.call(localStorage,CONSULT_KEY);drawTabs(host);schedule();refreshSales()});
  }

  async function enhance(){
    styleOnce();const p=page(),bar=document.querySelector('.sales-filterbar');
    if(!['team','my-sales'].includes(p)||!bar){document.getElementById('teamSalesTabsV67')?.remove();document.getElementById('salesConsultantFilter')?.remove();return}
    drawTabs(bar);
    if(p!=='team'){document.getElementById('salesConsultantFilter')?.remove();return}
    const teamEl=document.getElementById('salesTeamFilter');if(!teamEl||!teamEl.value){document.getElementById('salesConsultantFilter')?.remove();nativeRemove.call(localStorage,CONSULT_KEY);return}
    let sel=document.getElementById('salesConsultantFilter');const scope=[document.getElementById('salesMonthFilter')?.value,document.getElementById('salesCityFilter')?.value,teamEl.value,selectedTab()].join('|');
    if(!sel){sel=document.createElement('select');sel.id='salesConsultantFilter';sel.setAttribute('aria-label','Filtrar vendas por consultor');teamEl.insertAdjacentElement('afterend',sel)}
    if(sel.dataset.scope===scope)return;sel.dataset.scope=scope;sel.onchange=()=>{if(sel.value)nativeSet.call(localStorage,CONSULT_KEY,sel.value);else nativeRemove.call(localStorage,CONSULT_KEY);refreshSales()};await loadConsultants(sel);
  }

  function schedule(){clearTimeout(timer);timer=setTimeout(enhance,70)}
  document.addEventListener('change',e=>{const id=e.target?.id;if(id==='salesTeamFilter'){nativeRemove.call(localStorage,CONSULT_KEY);setTimeout(schedule,0)}else if(id==='salesCityFilter'||id==='salesMonthFilter')setTimeout(schedule,0)},true);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',schedule,{once:true});schedule();
})();
